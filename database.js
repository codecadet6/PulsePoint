const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'pulsepoint.db');
const db = new sqlite3.Database(dbPath);

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function dbInit() {
  console.log('Initializing SQLite database schema...');
  
  // Create emergencies table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS emergencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      lat REAL,
      lng REAL,
      triggerType TEXT,
      status TEXT,
      timestamp TEXT,
      firstAidTip TEXT
    )
  `);

  // Create responders table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS responders (
      id TEXT PRIMARY KEY,
      emergencyId TEXT,
      type TEXT,
      name TEXT,
      lat REAL,
      lng REAL,
      eta TEXT,
      FOREIGN KEY(emergencyId) REFERENCES emergencies(id) ON DELETE CASCADE
    )
  `);

  // Create api_logs table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      type TEXT,
      action TEXT,
      details TEXT
    )
  `);
  
  console.log('Database schema validated successfully.');
}

// Emergency CRUD helpers
async function saveEmergency(e) {
  return dbRun(`
    INSERT OR REPLACE INTO emergencies (id, name, phone, lat, lng, triggerType, status, timestamp, firstAidTip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [e.id, e.name, e.phone, e.lat, e.lng, e.triggerType, e.status, e.timestamp, e.firstAidTip]);
}

async function getEmergencies() {
  return dbAll(`SELECT * FROM emergencies`);
}

async function getEmergency(id) {
  return dbGet(`SELECT * FROM emergencies WHERE id = ?`, [id]);
}

async function deleteEmergency(id) {
  return dbRun(`DELETE FROM emergencies WHERE id = ?`, [id]);
}

// Responder CRUD helpers
async function saveResponder(r) {
  return dbRun(`
    INSERT OR REPLACE INTO responders (id, emergencyId, type, name, lat, lng, eta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [r.id, r.emergencyId, r.type, r.name, r.lat, r.lng, r.eta]);
}

async function getResponders() {
  return dbAll(`SELECT * FROM responders`);
}

async function deleteResponder(id) {
  return dbRun(`DELETE FROM responders WHERE id = ?`, [id]);
}

async function deleteRespondersForEmergency(emergencyId) {
  return dbRun(`DELETE FROM responders WHERE emergencyId = ?`, [emergencyId]);
}

// API Logs helpers
async function logApiEvent(type, action, details) {
  const timestamp = new Date().toLocaleTimeString();
  await dbRun(`
    INSERT INTO api_logs (timestamp, type, action, details)
    VALUES (?, ?, ?, ?)
  `, [timestamp, type, action, details]);
  return { timestamp, type, action, details };
}

async function getApiLogs(limit = 50) {
  return dbAll(`SELECT * FROM api_logs ORDER BY id DESC LIMIT ?`, [limit]);
}

async function clearApiLogs() {
  return dbRun(`DELETE FROM api_logs`);
}

module.exports = {
  dbInit,
  saveEmergency,
  getEmergencies,
  getEmergency,
  deleteEmergency,
  saveResponder,
  getResponders,
  deleteResponder,
  deleteRespondersForEmergency,
  logApiEvent,
  getApiLogs,
  clearApiLogs
};
