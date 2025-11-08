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

const store = {
  customers: [
    {
      id: "cust-greenfields",
      name: "Green Fields HOA",
      email: "board@greenfields-hoa.com",
      phone: "501-555-1212",
    },
    {
      id: "cust-oakandivy",
      name: "Oak & Ivy Property Group",
      email: "service@oakivygroup.com",
      phone: "501-555-8899",
    },
  ],
  properties: [
    {
      id: "prop-meadow",
      customerId: "cust-greenfields",
      name: "Main Entrance",
      address: "291 State Park Rd, Hot Springs, AR 71913",
      notes: "Seasonal color beds along frontage. Ensure drip zones have pressure reducers.",
    },
    {
      id: "prop-lakeside",
      customerId: "cust-greenfields",
      name: "Lakeside Cabins",
      address: "540 Lakeside Loop, Hot Springs, AR 71913",
      notes: "Cabins 1-4 share irrigation main. Monitor for lake draw restrictions mid-summer.",
    },
    {
      id: "prop-oakridge",
      customerId: "cust-oakandivy",
      name: "Oak Ridge Retail Center",
      address: "1180 Malvern Ave, Hot Springs, AR 71901",
      notes: "Median turf watered overnight. Report recurring zone 5 head damage to tenant.",
    },
  ],
  clocks: [
    {
      id: "clock-meadow-front",
      propertyId: "prop-meadow",
      make: "Rain Bird",
      model: "ESP-Me",
      zoneCount: 12,
      inspections: [
        {
          date: "2024-03-14",
          status: "Passed",
          notes: "Reprogrammed seasonal adjustment to 85%. Replaced zone 7 spray nozzle.",
        },
        {
          date: "2023-11-01",
          status: "Needs Follow-up",
          notes: "Master valve slow to close. Monitor after winterization.",
        },
      ],
    },
    {
      id: "clock-lakeside-cabins",
      propertyId: "prop-lakeside",
      make: "Hunter",
      model: "Pro-C",
      zoneCount: 8,
      inspections: [
        {
          date: "2024-04-02",
          status: "Passed",
          notes: "Cabin 3 drip flushed and emitters cleared.",
        },
      ],
    },
    {
      id: "clock-oakridge-north",
      propertyId: "prop-oakridge",
      make: "Hydro-Rain",
      model: "HRX Hybrid",
      zoneCount: 18,
      inspections: [
        {
          date: "2024-02-21",
          status: "Needs Repair",
          notes: "Zone 5 valve coil failed continuity. Parts ordered.",
        },
      ],
    },
  ],
};

const state = {
  selectedCustomerId: null,
};

const customerListEl = document.getElementById("customerList");
const customerDetailEl = document.getElementById("customerDetail");

function init() {
  if (!customerListEl || !customerDetailEl) {
    return;
  }

  renderCustomers();
  if (store.customers.length) {
    selectCustomer(store.customers[0].id);
  }
  bindEvents();
}

function bindEvents() {
  if (!customerListEl) {
    return;
  }

  customerListEl.addEventListener("click", (event) => {
    const button = event.target.closest("button.customer-item");
    if (!button) return;
    selectCustomer(button.dataset.id);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const { action } = form.dataset;
    if (!action) return;

    event.preventDefault();

    switch (action) {
      case "add-customer":
        handleAddCustomer(form);
        break;
      case "add-property":
        handleAddProperty(form);
        break;
      case "add-clock":
        handleAddClock(form);
        break;
      case "add-inspection":
        handleAddInspection(form);
        break;
      default:
        break;
    }
  });
}

function renderCustomers() {
  const items = store.customers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((customer) => {
      const propertyCount = store.properties.filter((p) => p.customerId === customer.id).length;
      const isActive = customer.id === state.selectedCustomerId;
      return `
        <li>
          <button class="customer-item ${isActive ? "is-active" : ""}" data-id="${customer.id}">
            <strong>${customer.name}</strong>
            <span class="customer-meta">${propertyCount} ${propertyCount === 1 ? "property" : "properties"}</span>
            <span class="customer-meta">${customer.phone}</span>
          </button>
        </li>
      `;
    })
    .join("");

  customerListEl.innerHTML = items || "<li class=\"muted\">No customers yet.</li>";
}

function renderCustomerDetail() {
  const customer = store.customers.find((c) => c.id === state.selectedCustomerId);
  if (!customer) {
    customerDetailEl.innerHTML = `
      <div class="empty-state">
        <h2>Get started</h2>
        <p>Add a customer or pick one from the list to see their properties, controller clocks, and inspection notes.</p>
      </div>
    `;
    return;
  }

  const properties = store.properties.filter((property) => property.customerId === customer.id);
  const propertiesMarkup = properties.length
    ? properties.map(renderPropertyCard).join("")
    : `<div class="empty-state"><p>No properties added yet. Use the form below to add the first property for ${customer.name}.</p></div>`;

  customerDetailEl.innerHTML = `
    <article class="customer-card">
      <header>
        <div>
          <h2>${customer.name}</h2>
          <div class="contact-group">
            <span><strong>Email:</strong> <a href="mailto:${customer.email}">${customer.email}</a></span>
            <span><strong>Phone:</strong> <a href="tel:${customer.phone}">${customer.phone}</a></span>
          </div>
        </div>
      </header>
      <section class="properties">
        <h3 class="property-title">Properties</h3>
        ${propertiesMarkup}
      </section>
      <details class="inline-form" open>
        <summary>Add a property</summary>
        <form class="form" data-action="add-property" data-customer-id="${customer.id}">
          <label>
            <span>Property name (optional)</span>
            <input type="text" name="name" placeholder="West Entrance">
          </label>
          <label>
            <span>Address</span>
            <input type="text" name="address" required placeholder="123 Main St, City, ST">
          </label>
          <label>
            <span>Notes</span>
            <textarea name="notes" rows="3" placeholder="Include access instructions, watering restrictions, etc."></textarea>
          </label>
          <button type="submit" class="btn primary">Save property</button>
        </form>
      </details>
    </article>
  `;
}

function renderPropertyCard(property) {
  const clocks = store.clocks.filter((clock) => clock.propertyId === property.id);
  const clockMarkup = clocks.length
    ? clocks.map(renderClockCard).join("")
    : `<p class="muted">No clocks recorded yet. Use the form below to add the first controller.</p>`;

  return `
    <article class="property-card" data-property-id="${property.id}">
      <header>
        <div>
          <h4 class="property-title">${property.name || property.address}</h4>
          <div class="property-address">${property.address}</div>
        </div>
        <span class="tag">${clocks.length} ${clocks.length === 1 ? "clock" : "clocks"}</span>
      </header>
      ${property.notes ? `<div class="property-notes"><strong>Notes:</strong> ${property.notes}</div>` : ""}
      <section class="clock-section">
        <h4>Clocks & inspections</h4>
        <div class="clock-list">
          ${clockMarkup}
        </div>
      </section>
      <details class="inline-form">
        <summary>Add a clock</summary>
        <form class="form" data-action="add-clock" data-property-id="${property.id}">
          <div class="two-col">
            <label>
              <span>Make</span>
              <input type="text" name="make" required placeholder="Rain Bird">
            </label>
            <label>
              <span>Model</span>
              <input type="text" name="model" required placeholder="ESP-Me">
            </label>
            <label>
              <span>Zone count</span>
              <input type="number" name="zoneCount" min="1" required placeholder="12">
            </label>
          </div>
          <button type="submit" class="btn primary">Save clock</button>
        </form>
      </details>
    </article>
  `;
}

function renderClockCard(clock) {
  const inspections = clock.inspections ?? [];
  const inspectionMarkup = inspections.length
    ? inspections
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
          (inspection) => `
            <div class="inspection-entry">
              <strong>${formatDate(inspection.date)} &middot; ${inspection.status}</strong>
              ${inspection.notes ? `<span>${inspection.notes}</span>` : ""}
            </div>
          `,
        )
        .join("")
    : `<p class="muted">No inspections logged yet.</p>`;

  return `
    <div class="clock-card" data-clock-id="${clock.id}">
      <div>
        <strong>${clock.make} &ndash; ${clock.model}</strong>
        <div class="clock-meta">Zones: ${clock.zoneCount}</div>
      </div>
      <section class="inspection-list">
        ${inspectionMarkup}
      </section>
      <details class="inline-form">
        <summary>Log inspection</summary>
        <form class="form" data-action="add-inspection" data-clock-id="${clock.id}">
          <div class="two-col">
            <label>
              <span>Date</span>
              <input type="date" name="date" required>
            </label>
            <label>
              <span>Status</span>
              <select name="status" required>
                <option value="">Select status</option>
                <option value="Passed">Passed</option>
                <option value="Needs Follow-up">Needs Follow-up</option>
                <option value="Needs Repair">Needs Repair</option>
              </select>
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea name="notes" rows="2" placeholder="Document pressure checks, parts replaced, scheduling updates, etc."></textarea>
          </label>
          <button type="submit" class="btn primary">Save inspection</button>
        </form>
      </details>
    </div>
  `;
}

function handleAddCustomer(form) {
  const formData = new FormData(form);
  const customer = {
    id: createId("cust"),
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    phone: formData.get("phone").trim(),
  };

  if (!customer.name || !customer.email || !customer.phone) {
    alert("Please fill in name, email, and phone for the customer.");
    return;
  }

  store.customers.push(customer);
  form.reset();
  closeDetails(form);
  renderCustomers();
  selectCustomer(customer.id);
}

function handleAddProperty(form) {
  const formData = new FormData(form);
  const property = {
    id: createId("prop"),
    customerId: form.dataset.customerId,
    name: formData.get("name").trim(),
    address: formData.get("address").trim(),
    notes: formData.get("notes").trim(),
  };

  if (!property.address) {
    alert("Please provide an address for the property.");
    return;
  }

  store.properties.push(property);
  form.reset();
  closeDetails(form);
  renderCustomers();
  renderCustomerDetail();
}

function handleAddClock(form) {
  const formData = new FormData(form);
  const zoneCountRaw = formData.get("zoneCount");
  const zoneCount = Number.parseInt(zoneCountRaw, 10);
  const clock = {
    id: createId("clock"),
    propertyId: form.dataset.propertyId,
    make: formData.get("make").trim(),
    model: formData.get("model").trim(),
    zoneCount: Number.isNaN(zoneCount) ? 0 : zoneCount,
    inspections: [],
  };

  if (!clock.make || !clock.model || !zoneCount) {
    alert("Make, model, and zone count are required for a clock.");
    return;
  }

  store.clocks.push(clock);
  form.reset();
  closeDetails(form);
  renderCustomerDetail();
}

function handleAddInspection(form) {
  const formData = new FormData(form);
  const inspection = {
    date: formData.get("date"),
    status: formData.get("status"),
    notes: formData.get("notes").trim(),
  };

  if (!inspection.date || !inspection.status) {
    alert("Inspection date and status are required.");
    return;
  }

  const clock = store.clocks.find((c) => c.id === form.dataset.clockId);
  if (!clock) return;

  clock.inspections = clock.inspections || [];
  clock.inspections.push(inspection);
  form.reset();
  closeDetails(form);
  renderCustomerDetail();
}

function selectCustomer(customerId) {
  state.selectedCustomerId = customerId;
  renderCustomers();
  renderCustomerDetail();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

function closeDetails(form) {
  const details = form.closest("details");
  if (details) {
    details.open = false;
  }
}

document.addEventListener("DOMContentLoaded", init);
