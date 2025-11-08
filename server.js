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

// Basic migration from the original demo schema
const legacyProperties = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='properties'")
  .get();
if (legacyProperties && legacyProperties.sql && legacyProperties.sql.includes('customer_id')) {
  db.exec(`DROP TABLE IF EXISTS inspections; DROP TABLE IF EXISTS properties;`);
}

db.exec(`DROP TABLE IF EXISTS customers;`);

const legacyInspections = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inspections'")
  .get();
if (legacyInspections && legacyInspections.sql && !legacyInspections.sql.includes('clock_id')) {
  db.exec('DROP TABLE IF EXISTS inspections;');
}

const legacyClocks = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='clocks'")
  .get();
if (legacyClocks && legacyClocks.sql && !legacyClocks.sql.includes('property_id')) {
  db.exec('DROP TABLE IF EXISTS clocks;');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    organization TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS clocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    station_count INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clock_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    summary TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (clock_id) REFERENCES clocks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_properties_contact_id ON properties(contact_id);
  CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(address);
  CREATE INDEX IF NOT EXISTS idx_clocks_property_id ON clocks(property_id);
  CREATE INDEX IF NOT EXISTS idx_inspections_clock_id ON inspections(clock_id);
  CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const contactFields = `id, name, phone, email, organization, created_at, updated_at`;
const propertyFields = `
  p.id, p.name, p.address, p.city, p.state, p.postal_code, p.notes,
  p.contact_id, p.created_at, p.updated_at,
  c.name AS contactName, c.phone AS contactPhone, c.email AS contactEmail, c.organization AS contactOrganization
`;
const clockFields = `
  cl.id, cl.label, cl.manufacturer, cl.model, cl.station_count, cl.location, cl.notes,
  cl.property_id, cl.created_at, cl.updated_at,
  p.name AS propertyName, p.address AS propertyAddress,
  c.name AS contactName
`;
const inspectionFields = `
  i.id, i.clock_id, i.status, i.started_at, i.completed_at, i.summary, i.notes,
  i.created_at, i.updated_at,
  cl.label AS clockLabel, cl.property_id,
  p.name AS propertyName, p.address AS propertyAddress,
  c.name AS contactName
`;

const getContactById = db.prepare(`SELECT ${contactFields} FROM contacts WHERE id = ?`);
const getPropertyById = db.prepare(`SELECT ${propertyFields} FROM properties p LEFT JOIN contacts c ON c.id = p.contact_id WHERE p.id = ?`);
const getClockById = db.prepare(`SELECT ${clockFields} FROM clocks cl LEFT JOIN properties p ON p.id = cl.property_id LEFT JOIN contacts c ON c.id = p.contact_id WHERE cl.id = ?`);
const getInspectionById = db.prepare(`SELECT ${inspectionFields} FROM inspections i LEFT JOIN clocks cl ON cl.id = i.clock_id LEFT JOIN properties p ON p.id = cl.property_id LEFT JOIN contacts c ON c.id = p.contact_id WHERE i.id = ?`);

app.get('/api/contacts', (req, res) => {
  const contacts = db
    .prepare(`SELECT ${contactFields} FROM contacts ORDER BY name COLLATE NOCASE`)
    .all();
  res.json(contacts);
});

app.get('/api/contacts/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid contact id.' });
  }

  const contact = getContactById.get(id);
  if (!contact) {
    return res.status(404).json({ message: 'Contact not found.' });
  }

  res.json(contact);
});

app.post('/api/contacts', (req, res) => {
  const { name, phone = '', email = '', organization = '' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Contact name is required.' });
  }

  const insert = db.prepare(
    'INSERT INTO contacts (name, phone, email, organization) VALUES (?, ?, ?, ?)'
  );

  const info = insert.run(name.trim(), phone.trim(), email.trim(), organization.trim());
  const created = getContactById.get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/contacts/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid contact id.' });
  }

  const existing = getContactById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Contact not found.' });
  }

  const { name, phone = '', email = '', organization = '' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Contact name is required.' });
  }

  const update = db.prepare(
    'UPDATE contacts SET name = ?, phone = ?, email = ?, organization = ?, updated_at = datetime(\'now\') WHERE id = ?'
  );

  update.run(name.trim(), phone.trim(), email.trim(), organization.trim(), id);
  const updated = getContactById.get(id);
  res.json(updated);
});

app.delete('/api/contacts/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid contact id.' });
  }

  const existing = getContactById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Contact not found.' });
  }

  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  res.status(204).end();
});

app.get('/api/properties', (req, res) => {
  const { contactId } = req.query;
  let properties;
  if (contactId) {
    properties = db
      .prepare(
        `SELECT ${propertyFields}
         FROM properties p
         LEFT JOIN contacts c ON c.id = p.contact_id
         WHERE p.contact_id = ?
         ORDER BY p.name COLLATE NOCASE`
      )
      .all(contactId);
  } else {
    properties = db
      .prepare(
        `SELECT ${propertyFields}
         FROM properties p
         LEFT JOIN contacts c ON c.id = p.contact_id
         ORDER BY p.name COLLATE NOCASE`
      )
      .all();
  }
  res.json(properties);
});

app.get('/api/properties/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid property id.' });
  }

  const property = getPropertyById.get(id);
  if (!property) {
    return res.status(404).json({ message: 'Property not found.' });
  }

  res.json(property);
});

app.post('/api/properties', (req, res) => {
  const contactId = Number.parseInt(req.body.contactId, 10);
  if (!Number.isInteger(contactId)) {
    return res.status(400).json({ message: 'A valid contact is required for each property.' });
  }
  const contact = getContactById.get(contactId);
  if (!contact) {
    return res.status(400).json({ message: 'Selected contact does not exist.' });
  }

  const name = (req.body.name || '').trim();
  const address = (req.body.address || '').trim();
  const city = (req.body.city || '').trim();
  const state = (req.body.state || '').trim();
  const postalCode = (req.body.postalCode || '').trim();
  const notes = (req.body.notes || '').trim();

  if (!name) {
    return res.status(400).json({ message: 'Property name is required.' });
  }
  if (!address) {
    return res.status(400).json({ message: 'Property address is required.' });
  }

  try {
    const insert = db.prepare(
      'INSERT INTO properties (contact_id, name, address, city, state, postal_code, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const info = insert.run(contactId, name, address, city, state, postalCode, notes);
    const created = getPropertyById.get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Another property already uses that address.' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Unable to save property.' });
  }
});

app.put('/api/properties/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid property id.' });
  }

  const existing = getPropertyById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Property not found.' });
  }

  const contactId = Number.parseInt(req.body.contactId, 10);
  if (!Number.isInteger(contactId)) {
    return res.status(400).json({ message: 'A valid contact is required for each property.' });
  }
  const contact = getContactById.get(contactId);
  if (!contact) {
    return res.status(400).json({ message: 'Selected contact does not exist.' });
  }

  const name = (req.body.name || '').trim();
  const address = (req.body.address || '').trim();
  const city = (req.body.city || '').trim();
  const state = (req.body.state || '').trim();
  const postalCode = (req.body.postalCode || '').trim();
  const notes = (req.body.notes || '').trim();

  if (!name) {
    return res.status(400).json({ message: 'Property name is required.' });
  }
  if (!address) {
    return res.status(400).json({ message: 'Property address is required.' });
  }

  try {
    const update = db.prepare(
      `UPDATE properties
       SET contact_id = ?, name = ?, address = ?, city = ?, state = ?, postal_code = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    );
    update.run(contactId, name, address, city, state, postalCode, notes, id);
    const updated = getPropertyById.get(id);
    res.json(updated);
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Another property already uses that address.' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Unable to update property.' });
  }
});

app.delete('/api/properties/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid property id.' });
  }

  const existing = getPropertyById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Property not found.' });
  }

  db.prepare('DELETE FROM properties WHERE id = ?').run(id);
  res.status(204).end();
});

app.get('/api/clocks', (req, res) => {
  const { propertyId } = req.query;
  let clocks;
  if (propertyId) {
    clocks = db
      .prepare(
        `SELECT ${clockFields}
         FROM clocks cl
         LEFT JOIN properties p ON p.id = cl.property_id
         LEFT JOIN contacts c ON c.id = p.contact_id
         WHERE cl.property_id = ?
         ORDER BY cl.label COLLATE NOCASE`
      )
      .all(propertyId);
  } else {
    clocks = db
      .prepare(
        `SELECT ${clockFields}
         FROM clocks cl
         LEFT JOIN properties p ON p.id = cl.property_id
         LEFT JOIN contacts c ON c.id = p.contact_id
         ORDER BY cl.label COLLATE NOCASE`
      )
      .all();
  }
  res.json(clocks);
});

app.get('/api/clocks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid clock id.' });
  }

  const clock = getClockById.get(id);
  if (!clock) {
    return res.status(404).json({ message: 'Clock not found.' });
  }

  res.json(clock);
});

app.post('/api/clocks', (req, res) => {
  const propertyId = Number.parseInt(req.body.propertyId, 10);
  if (!Number.isInteger(propertyId)) {
    return res.status(400).json({ message: 'A valid property is required for each clock.' });
  }
  const property = getPropertyById.get(propertyId);
  if (!property) {
    return res.status(400).json({ message: 'Selected property does not exist.' });
  }

  const label = (req.body.label || '').trim();
  const manufacturer = (req.body.manufacturer || '').trim();
  const model = (req.body.model || '').trim();
  const stationCountRaw = Number.parseInt(req.body.stationCount, 10);
  const stationCount = Number.isNaN(stationCountRaw) ? 0 : stationCountRaw;
  const location = (req.body.location || '').trim();
  const notes = (req.body.notes || '').trim();

  if (!label) {
    return res.status(400).json({ message: 'Clock label is required.' });
  }
  if (stationCount <= 0) {
    return res.status(400).json({ message: 'Station count must be a positive number.' });
  }

  const insert = db.prepare(
    'INSERT INTO clocks (property_id, label, manufacturer, model, station_count, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const info = insert.run(propertyId, label, manufacturer, model, stationCount, location, notes);
  const created = getClockById.get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/clocks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid clock id.' });
  }

  const existing = getClockById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Clock not found.' });
  }

  const propertyId = Number.parseInt(req.body.propertyId, 10);
  if (!Number.isInteger(propertyId)) {
    return res.status(400).json({ message: 'A valid property is required for each clock.' });
  }
  const property = getPropertyById.get(propertyId);
  if (!property) {
    return res.status(400).json({ message: 'Selected property does not exist.' });
  }

  const label = (req.body.label || '').trim();
  const manufacturer = (req.body.manufacturer || '').trim();
  const model = (req.body.model || '').trim();
  const stationCountRaw = Number.parseInt(req.body.stationCount, 10);
  const stationCount = Number.isNaN(stationCountRaw) ? 0 : stationCountRaw;
  const location = (req.body.location || '').trim();
  const notes = (req.body.notes || '').trim();

  if (!label) {
    return res.status(400).json({ message: 'Clock label is required.' });
  }
  if (stationCount <= 0) {
    return res.status(400).json({ message: 'Station count must be a positive number.' });
  }

  const update = db.prepare(
    `UPDATE clocks
     SET property_id = ?, label = ?, manufacturer = ?, model = ?, station_count = ?, location = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  update.run(propertyId, label, manufacturer, model, stationCount, location, notes, id);
  const updated = getClockById.get(id);
  res.json(updated);
});

app.delete('/api/clocks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid clock id.' });
  }

  const existing = getClockById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Clock not found.' });
  }

  db.prepare('DELETE FROM clocks WHERE id = ?').run(id);
  res.status(204).end();
});

app.get('/api/inspections', (req, res) => {
  const { clockId, status } = req.query;
  const filters = [];
  const params = [];

  if (clockId) {
    filters.push('i.clock_id = ?');
    params.push(clockId);
  }
  if (status) {
    filters.push('i.status = ?');
    params.push(status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const inspections = db
    .prepare(
      `SELECT ${inspectionFields}
       FROM inspections i
       LEFT JOIN clocks cl ON cl.id = i.clock_id
       LEFT JOIN properties p ON p.id = cl.property_id
       LEFT JOIN contacts c ON c.id = p.contact_id
       ${whereClause}
       ORDER BY datetime(i.started_at) DESC, datetime(i.updated_at) DESC`
    )
    .all(...params);

  res.json(inspections);
});

app.get('/api/inspections/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid inspection id.' });
  }

  const inspection = getInspectionById.get(id);
  if (!inspection) {
    return res.status(404).json({ message: 'Inspection not found.' });
  }

  res.json(inspection);
});

const allowedInspectionStatuses = new Set(['in_progress', 'completed', 'archived', 'cancelled']);

app.post('/api/inspections', (req, res) => {
  const clockId = Number.parseInt(req.body.clockId, 10);
  if (!Number.isInteger(clockId)) {
    return res.status(400).json({ message: 'A valid clock is required for each inspection.' });
  }
  const clock = getClockById.get(clockId);
  if (!clock) {
    return res.status(400).json({ message: 'Selected clock does not exist.' });
  }

  const existingActive = db
    .prepare("SELECT id FROM inspections WHERE clock_id = ? AND status = 'in_progress'")
    .get(clockId);
  if (existingActive) {
    return res.status(409).json({ message: 'An inspection is already in progress for this clock.' });
  }

  const startedAt = (req.body.startedAt || '').trim();
  const summary = (req.body.summary || '').trim();
  const notes = (req.body.notes || '').trim();

  const insert = db.prepare(
    'INSERT INTO inspections (clock_id, status, started_at, summary, notes) VALUES (?, "in_progress", COALESCE(NULLIF(?, ""), datetime(\'now\')), ?, ?)'
  );
  const info = insert.run(clockId, startedAt, summary, notes);
  const created = getInspectionById.get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.patch('/api/inspections/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid inspection id.' });
  }

  const existing = getInspectionById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Inspection not found.' });
  }

  const assignments = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    const status = (req.body.status || '').trim();
    if (!allowedInspectionStatuses.has(status)) {
      return res.status(400).json({ message: 'Invalid inspection status.' });
    }
    assignments.push('status = ?');
    params.push(status);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'summary')) {
    assignments.push('summary = ?');
    params.push((req.body.summary || '').trim());
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
    assignments.push('notes = ?');
    params.push((req.body.notes || '').trim());
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'startedAt')) {
    assignments.push('started_at = COALESCE(NULLIF(?, ""), started_at)');
    params.push((req.body.startedAt || '').trim());
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'completedAt')) {
    assignments.push('completed_at = COALESCE(NULLIF(?, ""), completed_at)');
    params.push((req.body.completedAt || '').trim());
  }

  if (assignments.length === 0) {
    return res.status(400).json({ message: 'No changes provided for the inspection.' });
  }

  assignments.push("updated_at = datetime('now')");

  const update = db.prepare(
    `UPDATE inspections SET ${assignments.join(', ')} WHERE id = ?`
  );
  update.run(...params, id);

  const updated = getInspectionById.get(id);
  res.json(updated);
});

app.delete('/api/inspections/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: 'Invalid inspection id.' });
  }

  const existing = getInspectionById.get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Inspection not found.' });
  }

  db.prepare('DELETE FROM inspections WHERE id = ?').run(id);
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Irrigation inspection manager running on http://localhost:${PORT}`);
});
