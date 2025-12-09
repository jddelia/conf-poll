/**
 * Database Layer
 *
 * SQLite database using sql.js for persistence.
 * Stores mock Confluence pages, versions, and users.
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.MOCK_DB_PATH || path.join(__dirname, '../../data/mock-confluence.db');

let db = null;

/**
 * Initialize the database
 */
export async function initDatabase() {
  const SQL = await initSqlJs();

  // Try to load existing database
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
    createSchema();
    seedData();
  }

  return db;
}

/**
 * Create database schema
 */
function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      account_id TEXT NOT NULL UNIQUE,
      userkey TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body_content TEXT NOT NULL,
      version_number INTEGER NOT NULL DEFAULT 1,
      version_when TEXT NOT NULL,
      version_by_id TEXT,
      version_message TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (version_by_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS page_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      body_content TEXT NOT NULL,
      version_when TEXT NOT NULL,
      version_by_id TEXT,
      version_message TEXT DEFAULT '',
      FOREIGN KEY (page_id) REFERENCES pages(id),
      FOREIGN KEY (version_by_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_page_versions_page_id
    ON page_versions(page_id, version_number DESC)
  `);

  console.log('[DB] Schema created');
}

/**
 * Seed initial data
 */
function seedData() {
  // Create default users
  const users = [
    { id: 'user-1', displayName: 'Alice Johnson', accountId: '5a1234567890', userkey: '402880824c1001' },
    { id: 'user-2', displayName: 'Bob Smith', accountId: '5a0987654321', userkey: '402880824c1002' },
    { id: 'user-3', displayName: 'Charlie Davis', accountId: '5a1122334455', userkey: '402880824c1003' },
  ];

  for (const user of users) {
    db.run(
      `INSERT INTO users (id, display_name, account_id, userkey) VALUES (?, ?, ?, ?)`,
      [user.id, user.displayName, user.accountId, user.userkey]
    );
  }

  // Create a sample page with a table
  const sampleBody = `
<h1>Project Status Tracker</h1>
<p>This is a sample page for testing the conf-poll system.</p>
<table>
  <tr>
    <th>Task</th>
    <th>Assignee</th>
    <th>Status</th>
    <th>Due Date</th>
  </tr>
  <tr>
    <td>Design mockups</td>
    <td><ac:link><ri:user ri:userkey="402880824c1001" ri:account-id="5a1234567890"/><ac:plain-text-link-body><![CDATA[Alice Johnson]]></ac:plain-text-link-body></ac:link></td>
    <td>Complete</td>
    <td>2024-01-15</td>
  </tr>
  <tr>
    <td>Backend API</td>
    <td><ac:link><ri:user ri:userkey="402880824c1002" ri:account-id="5a0987654321"/><ac:plain-text-link-body><![CDATA[Bob Smith]]></ac:plain-text-link-body></ac:link></td>
    <td>In Progress</td>
    <td>2024-01-22</td>
  </tr>
  <tr>
    <td>Testing</td>
    <td><ac:link><ri:user ri:userkey="402880824c1003" ri:account-id="5a1122334455"/><ac:plain-text-link-body><![CDATA[Charlie Davis]]></ac:plain-text-link-body></ac:link></td>
    <td>Not Started</td>
    <td>2024-01-29</td>
  </tr>
</table>
`.trim();

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO pages (id, title, body_content, version_number, version_when, version_by_id, version_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['123456789', 'Project Status Tracker', sampleBody, 1, now, 'user-1', 'Initial version', now, now]
  );

  // Save initial version to history
  db.run(
    `INSERT INTO page_versions (page_id, version_number, title, body_content, version_when, version_by_id, version_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['123456789', 1, 'Project Status Tracker', sampleBody, now, 'user-1', 'Initial version']
  );

  console.log('[DB] Seed data created');
  saveDatabase();
}

/**
 * Save database to file
 */
export function saveDatabase() {
  if (!db) return;

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  console.log('[DB] Database saved to', DB_PATH);
}

/**
 * Get database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database
 */
export function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

export default { initDatabase, getDb, saveDatabase, closeDatabase };
