/**
 * Page Service
 *
 * Business logic for managing mock Confluence pages.
 */

import { getDb, saveDatabase } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all pages (summary only)
 */
export function getAllPages() {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT p.id, p.title, p.version_number, p.version_when, p.updated_at,
           u.display_name as version_by_name
    FROM pages p
    LEFT JOIN users u ON p.version_by_id = u.id
    ORDER BY p.updated_at DESC
  `);

  const pages = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    pages.push({
      id: row.id,
      title: row.title,
      version: {
        number: row.version_number,
        when: row.version_when,
        by: row.version_by_name || 'Unknown',
      },
      updatedAt: row.updated_at,
    });
  }
  stmt.free();

  return pages;
}

/**
 * Get page by ID
 * @param {string} pageId - Page ID
 * @param {object} options - Options
 * @param {boolean} options.includeBody - Include body content
 */
export function getPageById(pageId, options = {}) {
  const { includeBody = false } = options;
  const db = getDb();

  const stmt = db.prepare(`
    SELECT p.*, u.display_name as version_by_name, u.account_id as version_by_account_id
    FROM pages p
    LEFT JOIN users u ON p.version_by_id = u.id
    WHERE p.id = ?
  `);
  stmt.bind([pageId]);

  if (!stmt.step()) {
    stmt.free();
    return null;
  }

  const row = stmt.getAsObject();
  stmt.free();

  const page = {
    id: row.id,
    type: 'page',
    title: row.title,
    version: {
      number: row.version_number,
      when: row.version_when,
      by: {
        displayName: row.version_by_name || 'Mock User',
        accountId: row.version_by_account_id || 'mock-user-123',
      },
      message: row.version_message || '',
    },
  };

  if (includeBody) {
    page.body = {
      storage: {
        value: row.body_content,
        representation: 'storage',
      },
    };
  }

  return page;
}

/**
 * Get page history
 * @param {string} pageId - Page ID
 */
export function getPageHistory(pageId) {
  const db = getDb();

  // First check if page exists
  const page = getPageById(pageId);
  if (!page) {
    return null;
  }

  return {
    lastUpdated: page.version,
  };
}

/**
 * Create a new page
 * @param {object} data - Page data
 * @param {string} data.title - Page title
 * @param {string} data.bodyContent - Page body HTML
 * @param {string} [data.id] - Optional custom ID
 * @param {string} [data.userId] - User ID making the change
 */
export function createPage(data) {
  const db = getDb();
  const { title, bodyContent, id, userId } = data;

  const pageId = id || uuidv4().replace(/-/g, '').substring(0, 12);
  const now = new Date().toISOString();
  const versionById = userId || 'user-1';

  db.run(
    `INSERT INTO pages (id, title, body_content, version_number, version_when, version_by_id, version_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pageId, title, bodyContent, 1, now, versionById, 'Initial version', now, now]
  );

  // Save to version history
  db.run(
    `INSERT INTO page_versions (page_id, version_number, title, body_content, version_when, version_by_id, version_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [pageId, 1, title, bodyContent, now, versionById, 'Initial version']
  );

  saveDatabase();

  return getPageById(pageId, { includeBody: true });
}

/**
 * Update a page (creates new version)
 * @param {string} pageId - Page ID
 * @param {object} data - Update data
 * @param {string} [data.title] - New title
 * @param {string} [data.bodyContent] - New body content
 * @param {string} [data.versionMessage] - Version message
 * @param {string} [data.userId] - User ID making the change
 */
export function updatePage(pageId, data) {
  const db = getDb();
  const { title, bodyContent, versionMessage, userId } = data;

  // Get current page
  const currentPage = getPageById(pageId, { includeBody: true });
  if (!currentPage) {
    return null;
  }

  const newVersionNumber = currentPage.version.number + 1;
  const now = new Date().toISOString();
  const versionById = userId || 'user-1';
  const newTitle = title || currentPage.title;
  const newBody = bodyContent !== undefined ? bodyContent : currentPage.body.storage.value;
  const message = versionMessage || '';

  // Update page
  db.run(
    `UPDATE pages
     SET title = ?, body_content = ?, version_number = ?, version_when = ?,
         version_by_id = ?, version_message = ?, updated_at = ?
     WHERE id = ?`,
    [newTitle, newBody, newVersionNumber, now, versionById, message, now, pageId]
  );

  // Save to version history
  db.run(
    `INSERT INTO page_versions (page_id, version_number, title, body_content, version_when, version_by_id, version_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [pageId, newVersionNumber, newTitle, newBody, now, versionById, message]
  );

  saveDatabase();

  return getPageById(pageId, { includeBody: true });
}

/**
 * Delete a page
 * @param {string} pageId - Page ID
 */
export function deletePage(pageId) {
  const db = getDb();

  // Check if page exists
  const page = getPageById(pageId);
  if (!page) {
    return false;
  }

  // Delete version history
  db.run(`DELETE FROM page_versions WHERE page_id = ?`, [pageId]);

  // Delete page
  db.run(`DELETE FROM pages WHERE id = ?`, [pageId]);

  saveDatabase();

  return true;
}

/**
 * Get page version history
 * @param {string} pageId - Page ID
 * @param {number} [limit=10] - Maximum versions to return
 */
export function getPageVersions(pageId, limit = 10) {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT pv.*, u.display_name as version_by_name
    FROM page_versions pv
    LEFT JOIN users u ON pv.version_by_id = u.id
    WHERE pv.page_id = ?
    ORDER BY pv.version_number DESC
    LIMIT ?
  `);
  stmt.bind([pageId, limit]);

  const versions = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    versions.push({
      number: row.version_number,
      when: row.version_when,
      by: row.version_by_name || 'Unknown',
      message: row.version_message || '',
    });
  }
  stmt.free();

  return versions;
}

export default {
  getAllPages,
  getPageById,
  getPageHistory,
  createPage,
  updatePage,
  deletePage,
  getPageVersions,
};
