function printPlan() {
  window.print();
}

const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const data = await response.json();
      if (data && data.message) {
        message = data.message;
      }
    } catch (error) {
      // ignore parse errors
    }
    throw new Error(message);
  }

  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

const formatDateTime = (value) => {
  if (!value) return '';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const iso = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
};

const formatStatusLabel = (value) => {
  if (!value) return '';
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const setFeedback = (element, message, type = 'info') => {
  if (!element) return;
  element.textContent = message || '';
  if (!message) {
    delete element.dataset.state;
  } else {
    element.dataset.state = type;
  }
};

const renderEmptyState = (container, message) => {
  if (!container) return;
  container.innerHTML = `<tr><td colspan="99" class="muted">${message}</td></tr>`;
};

const resetFormState = (form, submitButton, cancelButton, defaultLabel) => {
  if (!form) return;
  form.reset();
  form.removeAttribute('data-editing');
  if (submitButton) {
    submitButton.textContent = defaultLabel;
  }
  if (cancelButton) {
    cancelButton.hidden = true;
  }
};

const initContactsPage = () => {
  const form = document.querySelector('#contact-form');
  const submitButton = document.querySelector('#contact-submit');
  const cancelButton = document.querySelector('#contact-cancel');
  const feedback = document.querySelector('#contact-feedback');
  const tableBody = document.querySelector('#contacts-table tbody');

  const loadContacts = async () => {
    try {
      const contacts = await fetchJSON('/api/contacts');
      if (!contacts || contacts.length === 0) {
        renderEmptyState(tableBody, 'No contacts yet. Add your first one with the form.');
        return;
      }

      tableBody.innerHTML = contacts
        .map(
          (contact) => `
            <tr data-id="${contact.id}">
              <td>
                <strong>${contact.name}</strong>
                <div class="muted">${contact.organization || '—'}</div>
              </td>
              <td>${contact.phone || '—'}</td>
              <td>${contact.email || '—'}</td>
              <td>
                <div class="table-actions">
                  <button type="button" class="btn" data-action="edit">Edit</button>
                  <button type="button" class="btn btn--danger" data-action="delete">Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('');
    } catch (error) {
      renderEmptyState(tableBody, error.message || 'Unable to load contacts.');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFeedback(feedback, 'Saving contact...', 'info');
      const formData = new FormData(form);
      const payload = {
        name: formData.get('name') || '',
        organization: formData.get('organization') || '',
        phone: formData.get('phone') || '',
        email: formData.get('email') || '',
      };

      const editingId = form.dataset.editing;
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/contacts/${editingId}` : '/api/contacts';

      try {
        await fetchJSON(url, {
          method,
          body: JSON.stringify(payload),
        });
        setFeedback(feedback, 'Contact saved successfully.', 'success');
        resetFormState(form, submitButton, cancelButton, 'Save contact');
        await loadContacts();
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      resetFormState(form, submitButton, cancelButton, 'Save contact');
      setFeedback(feedback, 'Edit cancelled.', 'info');
    });
  }

  if (tableBody) {
    tableBody.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;

      if (button.dataset.action === 'edit') {
        try {
          const match = await fetchJSON(`/api/contacts/${id}`);
          form.dataset.editing = match.id;
          form.elements.name.value = match.name || '';
          form.elements.organization.value = match.organization || '';
          form.elements.phone.value = match.phone || '';
          form.elements.email.value = match.email || '';
          submitButton.textContent = 'Update contact';
          cancelButton.hidden = false;
          setFeedback(feedback, 'Editing contact. Make changes and save.', 'info');
        } catch (error) {
          setFeedback(feedback, error.message, 'error');
        }
      } else if (button.dataset.action === 'delete') {
        if (!confirm('Delete this contact? Any linked properties will also be removed.')) {
          return;
        }
        try {
          await fetchJSON(`/api/contacts/${id}`, { method: 'DELETE' });
          setFeedback(feedback, 'Contact deleted.', 'success');
          if (form.dataset.editing === id) {
            resetFormState(form, submitButton, cancelButton, 'Save contact');
          }
          await loadContacts();
        } catch (error) {
          setFeedback(feedback, error.message, 'error');
        }
      }
    });
  }

  loadContacts();
};

const initPropertiesPage = () => {
  const form = document.querySelector('#property-form');
  const submitButton = document.querySelector('#property-submit');
  const cancelButton = document.querySelector('#property-cancel');
  const feedback = document.querySelector('#property-feedback');
  const contactSelect = document.querySelector('#property-contact');
  const tableBody = document.querySelector('#property-table tbody');

  const loadContactsForSelect = async () => {
    if (!contactSelect) return;
    try {
      const contacts = await fetchJSON('/api/contacts');
      if (!contacts || contacts.length === 0) {
        contactSelect.innerHTML = '<option value="">Add a contact first</option>';
        contactSelect.disabled = true;
        return;
      }
      contactSelect.disabled = false;
      contactSelect.innerHTML = '<option value="">Select a contact</option>' +
        contacts
          .map((contact) => `<option value="${contact.id}">${contact.name}</option>`)
          .join('');
    } catch (error) {
      contactSelect.innerHTML = `<option value="">${error.message}</option>`;
      contactSelect.disabled = true;
    }
  };

  const loadProperties = async () => {
    try {
      const properties = await fetchJSON('/api/properties');
      if (!properties || properties.length === 0) {
        renderEmptyState(tableBody, 'No properties yet. Add one with the form.');
        return;
      }

      tableBody.innerHTML = properties
        .map(
          (property) => `
            <tr data-id="${property.id}">
              <td>
                <strong>${property.name}</strong>
                <div class="muted">${property.address}</div>
              </td>
              <td>
                ${property.contactName || '—'}
                <div class="muted">${property.contactEmail || ''}</div>
              </td>
              <td>${property.city || '—'}, ${property.state || '—'} ${property.postal_code || ''}</td>
              <td>${property.notes ? property.notes : '<span class="muted">No site notes</span>'}</td>
              <td>
                <div class="table-actions">
                  <button type="button" class="btn" data-action="edit">Edit</button>
                  <button type="button" class="btn btn--danger" data-action="delete">Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('');
    } catch (error) {
      renderEmptyState(tableBody, error.message || 'Unable to load properties.');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFeedback(feedback, 'Saving property...', 'info');
      const formData = new FormData(form);
      const payload = {
        contactId: formData.get('contactId'),
        name: formData.get('name') || '',
        address: formData.get('address') || '',
        city: formData.get('city') || '',
        state: formData.get('state') || '',
        postalCode: formData.get('postalCode') || '',
        notes: formData.get('notes') || '',
      };

      const editingId = form.dataset.editing;
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/properties/${editingId}` : '/api/properties';

      try {
        await fetchJSON(url, {
          method,
          body: JSON.stringify(payload),
        });
        setFeedback(feedback, 'Property saved successfully.', 'success');
        resetFormState(form, submitButton, cancelButton, 'Save property');
        await Promise.all([loadProperties(), loadContactsForSelect()]);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      resetFormState(form, submitButton, cancelButton, 'Save property');
      setFeedback(feedback, 'Edit cancelled.', 'info');
    });
  }

  if (tableBody) {
    tableBody.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;

      if (button.dataset.action === 'edit') {
        try {
          const match = await fetchJSON(`/api/properties/${id}`);
          if (!match) {
            setFeedback(feedback, 'Unable to load that property.', 'error');
            return;
          }
          if (
            contactSelect &&
            !Array.from(contactSelect.options).some((option) => option.value === String(match.contact_id))
          ) {
            await loadContactsForSelect();
          }
          form.dataset.editing = match.id;
          form.elements.contactId.value = String(match.contact_id);
          form.elements.name.value = match.name || '';
          form.elements.address.value = match.address || '';
          form.elements.city.value = match.city || '';
          form.elements.state.value = match.state || '';
          form.elements.postalCode.value = match.postal_code || '';
          form.elements.notes.value = match.notes || '';
          submitButton.textContent = 'Update property';
          cancelButton.hidden = false;
          setFeedback(feedback, 'Editing property. Make changes and save.', 'info');
        } catch (error) {
          setFeedback(feedback, error.message, 'error');
        }
      } else if (button.dataset.action === 'delete') {
        if (!confirm('Delete this property and all linked clocks?')) {
          return;
        }
        try {
          await fetchJSON(`/api/properties/${id}`, { method: 'DELETE' });
          setFeedback(feedback, 'Property deleted.', 'success');
          if (form.dataset.editing === id) {
            resetFormState(form, submitButton, cancelButton, 'Save property');
          }
          await loadProperties();
        } catch (error) {
          setFeedback(feedback, error.message, 'error');
        }
      }
    });
  }

  loadContactsForSelect();
  loadProperties();
};

const initClocksPage = () => {
  const form = document.querySelector('#clock-form');
  const submitButton = document.querySelector('#clock-submit');
  const cancelButton = document.querySelector('#clock-cancel');
  const feedback = document.querySelector('#clock-feedback');
  const propertySelect = document.querySelector('#clock-property');
  const filterSelect = document.querySelector('#clock-filter');
  const tableBody = document.querySelector('#clock-table tbody');

  let allProperties = [];

  const loadProperties = async () => {
    try {
      const previousFormSelection = propertySelect ? propertySelect.value : '';
      const previousFilterSelection = filterSelect ? filterSelect.value : '';
      allProperties = await fetchJSON('/api/properties');
      if (!Array.isArray(allProperties) || allProperties.length === 0) {
        propertySelect.innerHTML = '<option value="">Add a property first</option>';
        propertySelect.disabled = true;
        if (filterSelect) {
          filterSelect.innerHTML = '<option value="">All properties</option>';
          filterSelect.disabled = true;
        }
        return;
      }

      propertySelect.disabled = false;
      propertySelect.innerHTML = '<option value="">Select a property</option>' +
        allProperties.map((property) => `<option value="${property.id}">${property.name}</option>`).join('');
      if (previousFormSelection) {
        const match = Array.from(propertySelect.options).some((option) => option.value === previousFormSelection);
        if (match) {
          propertySelect.value = previousFormSelection;
        }
      }

      if (filterSelect) {
        filterSelect.disabled = false;
        filterSelect.innerHTML = '<option value="">All properties</option>' +
          allProperties.map((property) => `<option value="${property.id}">${property.name}</option>`).join('');
        if (previousFilterSelection) {
          const filterMatch = Array.from(filterSelect.options).some((option) => option.value === previousFilterSelection);
          if (filterMatch) {
            filterSelect.value = previousFilterSelection;
          }
        }
      }
    } catch (error) {
      propertySelect.innerHTML = `<option value="">${error.message}</option>`;
      propertySelect.disabled = true;
      if (filterSelect) {
        filterSelect.innerHTML = `<option value="">${error.message}</option>`;
        filterSelect.disabled = true;
      }
    }
  };

  const loadClocks = async () => {
    const propertyId = filterSelect ? filterSelect.value : '';
    const url = propertyId ? `/api/clocks?propertyId=${propertyId}` : '/api/clocks';
    try {
      const clocks = await fetchJSON(url);
      if (!clocks || clocks.length === 0) {
        renderEmptyState(tableBody, 'No clocks yet. Add one with the form.');
        return;
      }

      tableBody.innerHTML = clocks
        .map((clock) => `
          <tr data-id="${clock.id}">
            <td>
              <strong>${clock.label}</strong>
              <div class="muted">${clock.manufacturer || '—'} ${clock.model || ''}</div>
            </td>
            <td>
              ${clock.propertyName || '—'}
              <div class="muted">${clock.propertyAddress || ''}</div>
            </td>
            <td>${clock.station_count}</td>
            <td>${clock.location || '—'}</td>
            <td>
              <div class="table-actions">
                <button type="button" class="btn" data-action="edit">Edit</button>
                <button type="button" class="btn btn--danger" data-action="delete">Delete</button>
              </div>
            </td>
          </tr>
        `)
        .join('');
    } catch (error) {
      renderEmptyState(tableBody, error.message || 'Unable to load clocks.');
    }
  };

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      loadClocks();
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFeedback(feedback, 'Saving clock...', 'info');
      const formData = new FormData(form);
      const payload = {
        propertyId: formData.get('propertyId'),
        label: formData.get('label') || '',
        manufacturer: formData.get('manufacturer') || '',
        model: formData.get('model') || '',
        stationCount: formData.get('stationCount') || '',
        location: formData.get('location') || '',
        notes: formData.get('notes') || '',
      };

      const editingId = form.dataset.editing;
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/clocks/${editingId}` : '/api/clocks';

      try {
        await fetchJSON(url, {
          method,
          body: JSON.stringify(payload),
        });
        setFeedback(feedback, 'Clock saved successfully.', 'success');
        resetFormState(form, submitButton, cancelButton, 'Save clock');
        await Promise.all([loadClocks(), loadProperties()]);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      resetFormState(form, submitButton, cancelButton, 'Save clock');
      setFeedback(feedback, 'Edit cancelled.', 'info');
    });
  }

  if (tableBody) {
    tableBody.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;

      if (button.dataset.action === 'edit') {
        try {
          const match = await fetchJSON(`/api/clocks/${id}`);
          if (!match) {
            setFeedback(feedback, 'Unable to load that clock.', 'error');
            return;
          }
          if (
            propertySelect &&
            !Array.from(propertySelect.options).some((option) => option.value === String(match.property_id))
          ) {
            await loadProperties();
          }
          form.dataset.editing = match.id;
          form.elements.propertyId.value = String(match.property_id);
          form.elements.label.value = match.label || '';
          form.elements.manufacturer.value = match.manufacturer || '';
          form.elements.model.value = match.model || '';
          form.elements.stationCount.value = match.station_count || '';
          form.elements.location.value = match.location || '';
          form.elements.notes.value = match.notes || '';
          submitButton.textContent = 'Update clock';
          cancelButton.hidden = false;
          setFeedback(feedback, 'Editing clock. Make changes and save.', 'info');
        } catch (error) {
          setFeedback(feedback, error.message, 'error');
        }
      } else if (button.dataset.action === 'delete') {
        if (!confirm('Delete this clock and its inspection history?')) {
          return;
        }
        try {
          await fetchJSON(`/api/clocks/${id}`, { method: 'DELETE' });
          setFeedback(feedback, 'Clock deleted.', 'success');
          if (form.dataset.editing === id) {
            resetFormState(form, submitButton, cancelButton, 'Save clock');
          }
          await loadClocks();
        } catch (error) {
          setFeedback(feedback, error.message, 'error');
        }
      }
    });
  }

  loadProperties().then(loadClocks);
};

const initInspectionsPage = () => {
  const propertySelect = document.querySelector('#inspection-property');
  const clockSelect = document.querySelector('#inspection-clock');
  const newButton = document.querySelector('#inspection-new');
  const resumeButton = document.querySelector('#inspection-resume');
  const feedback = document.querySelector('#inspection-feedback');
  const detailContainer = document.querySelector('#inspection-detail-content');
  const form = document.querySelector('#inspection-form');
  const historyBody = document.querySelector('#inspection-history tbody');

  let currentClockId = null;
  let currentInProgress = null;

  const resetDetail = () => {
    if (form) {
      form.classList.add('hidden');
      form.reset();
      delete form.dataset.id;
    }
    if (detailContainer) {
      detailContainer.innerHTML = '<p class="muted">Select a property and clock to view inspection details.</p>';
    }
    if (historyBody) {
      historyBody.innerHTML = '<tr><td colspan="4" class="muted">No inspection history yet.</td></tr>';
    }
    currentInProgress = null;
    if (resumeButton) resumeButton.disabled = true;
    if (newButton) newButton.disabled = true;
  };

  const populateProperties = async () => {
    if (!propertySelect) return;
    try {
      const properties = await fetchJSON('/api/properties');
      if (!properties || properties.length === 0) {
        propertySelect.innerHTML = '<option value="">Add a property first</option>';
        propertySelect.disabled = true;
        if (clockSelect) {
          clockSelect.innerHTML = '<option value="">Select a property first</option>';
          clockSelect.disabled = true;
        }
        resetDetail();
        return;
      }
      propertySelect.disabled = false;
      propertySelect.innerHTML = '<option value="">Select a property</option>' +
        properties.map((property) => `<option value="${property.id}">${property.name}</option>`).join('');
    } catch (error) {
      propertySelect.innerHTML = `<option value="">${error.message}</option>`;
      propertySelect.disabled = true;
    }
  };

  const populateClocks = async (propertyId) => {
    if (!clockSelect) return;
    if (!propertyId) {
      clockSelect.innerHTML = '<option value="">Select a property first</option>';
      clockSelect.disabled = true;
      resetDetail();
      return;
    }
    try {
      const clocks = await fetchJSON(`/api/clocks?propertyId=${propertyId}`);
      if (!clocks || clocks.length === 0) {
        clockSelect.innerHTML = '<option value="">Add a clock for this property</option>';
        clockSelect.disabled = true;
        resetDetail();
        return;
      }
      clockSelect.disabled = false;
      clockSelect.innerHTML = '<option value="">Select a clock</option>' +
        clocks.map((clock) => `<option value="${clock.id}">${clock.label}</option>`).join('');
    } catch (error) {
      clockSelect.innerHTML = `<option value="">${error.message}</option>`;
      clockSelect.disabled = true;
      resetDetail();
    }
  };

  const renderHistory = (inspections) => {
    if (!historyBody) return;
    const past = inspections.filter((inspection) => inspection.status !== 'in_progress');
    if (past.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="4" class="muted">No completed inspections yet.</td></tr>';
      return;
    }
    historyBody.innerHTML = past
      .map(
        (inspection) => `
          <tr data-id="${inspection.id}" class="inspection-row">
            <td>${formatDate(inspection.started_at)}</td>
            <td>${formatStatusLabel(inspection.status)}</td>
            <td>${inspection.summary ? inspection.summary : '<span class="muted">No summary</span>'}</td>
            <td>${inspection.completed_at ? formatDateTime(inspection.completed_at) : '—'}</td>
          </tr>
        `
      )
      .join('');
  };

  const showInspectionDetail = (inspection, { editable } = { editable: false }) => {
    if (!detailContainer || !form) return;
    const startedDate = inspection.started_at ? inspection.started_at.slice(0, 10) : '';
    const completedDate = inspection.completed_at ? inspection.completed_at.slice(0, 10) : '';
    if (editable) {
      form.classList.remove('hidden');
      form.dataset.id = inspection.id;
      form.elements.status.value = inspection.status;
      form.elements.summary.value = inspection.summary || '';
      form.elements.notes.value = inspection.notes || '';
      form.elements.startedAt.value = startedDate;
      form.elements.completedAt.value = completedDate;
      detailContainer.innerHTML = `
        <div>
          <h3>Inspection in progress</h3>
          <p class="muted">Started ${formatDateTime(inspection.started_at)} on ${inspection.clockLabel} at ${inspection.propertyName}.</p>
        </div>
      `;
    } else {
      form.classList.add('hidden');
      delete form.dataset.id;
      detailContainer.innerHTML = `
        <div class="card__snapshot">
          <h3>${inspection.clockLabel}</h3>
          <p class="muted">${inspection.propertyName}</p>
          <p><strong>Status:</strong> ${formatStatusLabel(inspection.status)}</p>
          <p><strong>Started:</strong> ${formatDateTime(inspection.started_at)}</p>
          <p><strong>Completed:</strong> ${inspection.completed_at ? formatDateTime(inspection.completed_at) : '—'}</p>
          <p><strong>Summary:</strong> ${inspection.summary || '—'}</p>
          <p><strong>Notes:</strong> ${inspection.notes || '—'}</p>
        </div>
      `;
    }
  };

  const loadInspectionState = async (clockId) => {
    if (!clockId) {
      resetDetail();
      return;
    }
    try {
      const inspections = await fetchJSON(`/api/inspections?clockId=${clockId}`);
      if (!inspections) {
        resetDetail();
        return;
      }
      renderHistory(inspections);
      currentInProgress = inspections.find((inspection) => inspection.status === 'in_progress');
      if (currentInProgress) {
        showInspectionDetail(currentInProgress, { editable: true });
        if (resumeButton) resumeButton.disabled = false;
        if (newButton) newButton.disabled = true;
      } else {
        if (form) {
          form.classList.add('hidden');
          delete form.dataset.id;
        }
        if (detailContainer) {
          detailContainer.innerHTML = '<p class="muted">Ready for a new inspection. Use the buttons to get started.</p>';
        }
        if (resumeButton) resumeButton.disabled = true;
        if (newButton) newButton.disabled = false;
      }
    } catch (error) {
      resetDetail();
      setFeedback(feedback, error.message, 'error');
    }
  };

  if (propertySelect) {
    propertySelect.addEventListener('change', (event) => {
      const propertyId = event.target.value;
      currentClockId = null;
      if (newButton) newButton.disabled = true;
      if (resumeButton) resumeButton.disabled = true;
      populateClocks(propertyId);
    });
  }

  if (clockSelect) {
    clockSelect.addEventListener('change', (event) => {
      const clockId = event.target.value;
      currentClockId = clockId || null;
      if (!clockId) {
        resetDetail();
        return;
      }
      loadInspectionState(clockId);
    });
  }

  if (newButton) {
    newButton.addEventListener('click', async () => {
      if (!currentClockId) return;
      setFeedback(feedback, 'Creating inspection...', 'info');
      try {
        await fetchJSON('/api/inspections', {
          method: 'POST',
          body: JSON.stringify({ clockId: currentClockId }),
        });
        setFeedback(feedback, 'Inspection started. Add notes and complete when ready.', 'success');
        await loadInspectionState(currentClockId);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  if (resumeButton) {
    resumeButton.addEventListener('click', () => {
      if (!currentInProgress || !form) return;
      showInspectionDetail(currentInProgress, { editable: true });
      form.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.dataset.id) return;
      setFeedback(feedback, 'Saving inspection progress...', 'info');
      const formData = new FormData(form);
      const payload = {
        status: formData.get('status') || 'in_progress',
        summary: formData.get('summary') || '',
        notes: formData.get('notes') || '',
        startedAt: formData.get('startedAt') || '',
        completedAt: formData.get('completedAt') || '',
      };
      try {
        const updated = await fetchJSON(`/api/inspections/${form.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback(feedback, 'Inspection updated.', 'success');
        currentInProgress = updated.status === 'in_progress' ? updated : null;
        await loadInspectionState(currentClockId);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });

    form.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button || !form.dataset.id) return;
      event.preventDefault();
      const action = button.dataset.action;
      const now = new Date().toISOString();
      try {
        if (action === 'complete') {
          setFeedback(feedback, 'Completing inspection...', 'info');
          await fetchJSON(`/api/inspections/${form.dataset.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'completed',
              completedAt: now,
            }),
          });
          setFeedback(feedback, 'Inspection completed.', 'success');
        } else if (action === 'archive') {
          if (!confirm('Archive this inspection?')) {
            return;
          }
          setFeedback(feedback, 'Archiving inspection...', 'info');
          await fetchJSON(`/api/inspections/${form.dataset.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'archived' }),
          });
          setFeedback(feedback, 'Inspection archived.', 'success');
        } else if (action === 'delete') {
          if (!confirm('Delete this inspection permanently?')) {
            return;
          }
          setFeedback(feedback, 'Deleting inspection...', 'info');
          await fetchJSON(`/api/inspections/${form.dataset.id}`, {
            method: 'DELETE',
          });
          setFeedback(feedback, 'Inspection deleted.', 'success');
        }
        await loadInspectionState(currentClockId);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  if (historyBody) {
    historyBody.addEventListener('click', async (event) => {
      const row = event.target.closest('tr[data-id]');
      if (!row) return;
      try {
        const inspection = await fetchJSON(`/api/inspections/${row.dataset.id}`);
        showInspectionDetail(inspection, { editable: false });
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  populateProperties();
};

const initPage = () => {
  const page = document.body.dataset.page;
  if (page === 'contacts') {
    initContactsPage();
  } else if (page === 'properties') {
    initPropertiesPage();
  } else if (page === 'clocks') {
    initClocksPage();
  } else if (page === 'inspections') {
    initInspectionsPage();
  }
};

document.addEventListener('DOMContentLoaded', initPage);
