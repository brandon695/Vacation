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

const setFeedback = (element, message, type = 'info') => {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = type;
  if (!message) {
    delete element.dataset.state;
  }
};

const renderEmptyState = (container, message) => {
  if (!container) return;
  container.innerHTML = `<tr><td colspan="99" class="muted">${message}</td></tr>`;
};

const initCustomersPage = () => {
  const form = document.querySelector('#customer-form');
  const feedback = document.querySelector('#customer-feedback');
  const tableBody = document.querySelector('#customer-table tbody');

  const loadCustomers = async () => {
    try {
      const customers = await fetchJSON('/api/customers');
      if (!customers || customers.length === 0) {
        renderEmptyState(tableBody, 'No customers yet. Add your first one with the form on the left.');
        return;
      }
      tableBody.innerHTML = customers
        .map(
          (customer) => `
            <tr>
              <td><strong>${customer.name}</strong><div class="muted">${customer.email || '—'}</div></td>
              <td>
                ${customer.phone || '—'}
              </td>
              <td>
                ${customer.propertyCount} linked ${customer.propertyCount === 1 ? 'property' : 'properties'}
                <div class="muted">Added ${formatDateTime(customer.created_at)}</div>
              </td>
            </tr>
          `
        )
        .join('');
    } catch (error) {
      renderEmptyState(tableBody, error.message || 'Unable to load customers.');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFeedback(feedback, 'Saving customer...', 'info');
      const formData = new FormData(form);
      const payload = {
        name: formData.get('name') || '',
        phone: formData.get('phone') || '',
        email: formData.get('email') || '',
      };

      try {
        await fetchJSON('/api/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        setFeedback(feedback, 'Customer saved successfully.', 'success');
        await loadCustomers();
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  loadCustomers();
};

const initPropertiesPage = () => {
  const form = document.querySelector('#property-form');
  const feedback = document.querySelector('#property-feedback');
  const customerSelect = document.querySelector('#property-customer');
  const tableBody = document.querySelector('#property-table tbody');

  const populateCustomers = async () => {
    if (!customerSelect) return;
    try {
      const customers = await fetchJSON('/api/customers');
      if (!customers || customers.length === 0) {
        customerSelect.innerHTML = '<option value="">Add a customer first</option>';
        customerSelect.disabled = true;
        return;
      }
      customerSelect.disabled = false;
      customerSelect.innerHTML = '<option value="">Select a customer</option>' +
        customers
          .map((customer) => `<option value="${customer.id}">${customer.name}</option>`)
          .join('');
    } catch (error) {
      customerSelect.innerHTML = `<option value="">${error.message}</option>`;
      customerSelect.disabled = true;
    }
  };

  const loadProperties = async () => {
    try {
      const properties = await fetchJSON('/api/properties');
      if (!properties || properties.length === 0) {
        renderEmptyState(tableBody, 'No properties captured yet. Add your first property with the form on the left.');
        return;
      }
      tableBody.innerHTML = properties
        .map(
          (property) => `
            <tr>
              <td>
                <strong>${property.name}</strong>
                <div class="muted">${property.address || 'Address not provided'}</div>
              </td>
              <td>
                ${property.customerName || 'Unknown customer'}
                <div class="muted">${property.inspectionCount} inspections logged</div>
              </td>
              <td>
                ${property.notes ? property.notes : '<span class="muted">No site notes</span>'}
                <div class="muted">Added ${formatDateTime(property.created_at)}</div>
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
        customerId: formData.get('customerId'),
        name: formData.get('name') || '',
        address: formData.get('address') || '',
        notes: formData.get('notes') || '',
      };

      try {
        await fetchJSON('/api/properties', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        setFeedback(feedback, 'Property saved successfully.', 'success');
        await Promise.all([loadProperties(), populateCustomers()]);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  populateCustomers();
  loadProperties();
};

const initInspectionsPage = () => {
  const form = document.querySelector('#inspection-form');
  const feedback = document.querySelector('#inspection-feedback');
  const propertySelect = document.querySelector('#inspection-property');
  const tableBody = document.querySelector('#inspection-table tbody');

  const populateProperties = async () => {
    if (!propertySelect) return;
    try {
      const properties = await fetchJSON('/api/properties');
      if (!properties || properties.length === 0) {
        propertySelect.innerHTML = '<option value="">Add a property first</option>';
        propertySelect.disabled = true;
        return;
      }
      propertySelect.disabled = false;
      propertySelect.innerHTML = '<option value="">Select a property</option>' +
        properties
          .map((property) => `<option value="${property.id}">${property.name} • ${property.customerName || 'Customer unknown'}</option>`)
          .join('');
    } catch (error) {
      propertySelect.innerHTML = `<option value="">${error.message}</option>`;
      propertySelect.disabled = true;
    }
  };

  const loadInspections = async () => {
    try {
      const inspections = await fetchJSON('/api/inspections');
      if (!inspections || inspections.length === 0) {
        renderEmptyState(tableBody, 'No inspections logged yet. Schedule one with the form on the left.');
        return;
      }
      tableBody.innerHTML = inspections
        .map(
          (inspection) => `
            <tr>
              <td>
                <strong>${inspection.propertyName || 'Unknown property'}</strong>
                <div class="muted">${inspection.customerName || 'Customer not linked'}</div>
              </td>
              <td>
                ${formatDate(inspection.inspection_date)}
                <div class="status-badge">${inspection.status || 'No status set'}</div>
              </td>
              <td>
                ${inspection.summary ? inspection.summary : '<span class="muted">No summary provided</span>'}
                <div class="muted">Logged ${formatDateTime(inspection.created_at)}</div>
              </td>
            </tr>
          `
        )
        .join('');
    } catch (error) {
      renderEmptyState(tableBody, error.message || 'Unable to load inspections.');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFeedback(feedback, 'Saving inspection...', 'info');
      const formData = new FormData(form);
      const payload = {
        propertyId: formData.get('propertyId'),
        inspectionDate: formData.get('inspectionDate'),
        status: formData.get('status') || '',
        summary: formData.get('summary') || '',
      };

      try {
        await fetchJSON('/api/inspections', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        form.reset();
        setFeedback(feedback, 'Inspection logged successfully.', 'success');
        await Promise.all([loadInspections(), populateProperties()]);
      } catch (error) {
        setFeedback(feedback, error.message, 'error');
      }
    });
  }

  populateProperties();
  loadInspections();
};

const initPage = () => {
  const page = document.body.dataset.page;
  if (page === 'customers') {
    initCustomersPage();
  } else if (page === 'properties') {
    initPropertiesPage();
  } else if (page === 'inspections') {
    initInspectionsPage();
  }
};

document.addEventListener('DOMContentLoaded', initPage);

