/**
 * User Service
 *
 * Business logic for managing mock Confluence users.
 */

import { getDb, saveDatabase } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all users
 */
export function getAllUsers() {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, display_name, account_id, userkey, created_at
    FROM users
    ORDER BY display_name
  `);

  const users = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    users.push({
      id: row.id,
      displayName: row.display_name,
      accountId: row.account_id,
      userkey: row.userkey,
      createdAt: row.created_at,
    });
  }
  stmt.free();

  return users;
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 */
export function getUserById(userId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, display_name, account_id, userkey, created_at
    FROM users
    WHERE id = ?
  `);
  stmt.bind([userId]);

  if (!stmt.step()) {
    stmt.free();
    return null;
  }

  const row = stmt.getAsObject();
  stmt.free();

  return {
    id: row.id,
    displayName: row.display_name,
    accountId: row.account_id,
    userkey: row.userkey,
    createdAt: row.created_at,
  };
}

/**
 * Create a new user
 * @param {object} data - User data
 * @param {string} data.displayName - Display name
 */
export function createUser(data) {
  const db = getDb();
  const { displayName } = data;

  const userId = `user-${uuidv4().substring(0, 8)}`;
  const accountId = `5a${uuidv4().replace(/-/g, '').substring(0, 10)}`;
  const userkey = `402880824c${Date.now().toString(36)}`;

  db.run(
    `INSERT INTO users (id, display_name, account_id, userkey) VALUES (?, ?, ?, ?)`,
    [userId, displayName, accountId, userkey]
  );

  saveDatabase();

  return getUserById(userId);
}

/**
 * Delete a user
 * @param {string} userId - User ID
 */
export function deleteUser(userId) {
  const db = getDb();

  // Check if user exists
  const user = getUserById(userId);
  if (!user) {
    return false;
  }

  db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  saveDatabase();

  return true;
}

/**
 * Generate user mention markup
 * @param {string} userId - User ID
 */
export function generateUserMention(userId) {
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  return `<ac:link><ri:user ri:userkey="${user.userkey}" ri:account-id="${user.accountId}"/><ac:plain-text-link-body><![CDATA[${user.displayName}]]></ac:plain-text-link-body></ac:link>`;
}

export default {
  getAllUsers,
  getUserById,
  createUser,
  deleteUser,
  generateUserMention,
};
