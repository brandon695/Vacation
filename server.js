const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'app.db');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    inspection_date TEXT NOT NULL,
    summary TEXT,
    status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
  );
`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const getCustomerById = db.prepare('SELECT id FROM customers WHERE id = ?');
const getPropertyById = db.prepare('SELECT id FROM properties WHERE id = ?');

app.get('/api/customers', (req, res) => {
  const customers = db
    .prepare(
      `SELECT id, name, phone, email, created_at FROM customers ORDER BY datetime(created_at) DESC`
    )
    .all();

  const propertyCounts = db
    .prepare('SELECT customer_id, COUNT(*) AS propertyCount FROM properties GROUP BY customer_id')
    .all()
    .reduce((acc, row) => ({ ...acc, [row.customer_id]: row.propertyCount }), {});

  res.json(
    customers.map((customer) => ({
      ...customer,
      propertyCount: propertyCounts[customer.id] || 0,
    }))
  );
});

app.post('/api/customers', (req, res) => {
  const { name, phone = '', email = '' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Customer name is required.' });
  }

  const insert = db.prepare(
    'INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)'
  );

  const info = insert.run(name.trim(), phone.trim(), email.trim());
  const created = db
    .prepare('SELECT id, name, phone, email, created_at FROM customers WHERE id = ?')
    .get(info.lastInsertRowid);

  res.status(201).json(created);
});

app.get('/api/properties', (req, res) => {
  const properties = db
    .prepare(
      `SELECT p.id, p.name, p.address, p.notes, p.created_at, p.customer_id, c.name AS customerName
       FROM properties p
       LEFT JOIN customers c ON c.id = p.customer_id
       ORDER BY datetime(p.created_at) DESC`
    )
    .all();

  const inspectionCounts = db
    .prepare('SELECT property_id, COUNT(*) AS inspectionCount FROM inspections GROUP BY property_id')
    .all()
    .reduce((acc, row) => ({ ...acc, [row.property_id]: row.inspectionCount }), {});

  res.json(
    properties.map((property) => ({
      ...property,
      inspectionCount: inspectionCounts[property.id] || 0,
    }))
  );
});

app.post('/api/properties', (req, res) => {
  const { customerId, name, address = '', notes = '' } = req.body;
  if (!customerId) {
    return res.status(400).json({ message: 'A customer is required for each property.' });
  }
  const customer = getCustomerById.get(customerId);
  if (!customer) {
    return res.status(400).json({ message: 'Selected customer does not exist.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Property name is required.' });
  }

  const insert = db.prepare(
    'INSERT INTO properties (customer_id, name, address, notes) VALUES (?, ?, ?, ?)'
  );

  const info = insert.run(customerId, name.trim(), address.trim(), notes.trim());
  const created = db
    .prepare(
      `SELECT p.id, p.name, p.address, p.notes, p.created_at, p.customer_id, c.name AS customerName
       FROM properties p
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ?`
    )
    .get(info.lastInsertRowid);

  created.inspectionCount = 0;
  res.status(201).json(created);
});

app.get('/api/inspections', (req, res) => {
  const inspections = db
    .prepare(
      `SELECT i.id, i.property_id, i.inspection_date, i.summary, i.status, i.created_at,
              p.name AS propertyName, c.name AS customerName
       FROM inspections i
       LEFT JOIN properties p ON p.id = i.property_id
       LEFT JOIN customers c ON c.id = p.customer_id
       ORDER BY datetime(i.inspection_date) DESC, datetime(i.created_at) DESC`
    )
    .all();

  res.json(inspections);
});

app.post('/api/inspections', (req, res) => {
  const { propertyId, inspectionDate, summary = '', status = '' } = req.body;
  if (!propertyId) {
    return res.status(400).json({ message: 'A property is required for each inspection.' });
  }
  const property = getPropertyById.get(propertyId);
  if (!property) {
    return res.status(400).json({ message: 'Selected property does not exist.' });
  }
  if (!inspectionDate) {
    return res.status(400).json({ message: 'Inspection date is required.' });
  }

  const insert = db.prepare(
    'INSERT INTO inspections (property_id, inspection_date, summary, status) VALUES (?, ?, ?, ?)'
  );

  const info = insert.run(propertyId, inspectionDate, summary.trim(), status.trim());
  const created = db
    .prepare(
      `SELECT i.id, i.property_id, i.inspection_date, i.summary, i.status, i.created_at,
              p.name AS propertyName, c.name AS customerName
       FROM inspections i
       LEFT JOIN properties p ON p.id = i.property_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE i.id = ?`
    )
    .get(info.lastInsertRowid);

  res.status(201).json(created);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Irrigation inspection manager running on http://localhost:${PORT}`);
});
