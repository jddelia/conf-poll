/**
 * Local Storage Layer
 *
 * Persistent storage using SQLite (sql.js - pure JavaScript implementation).
 * Stores page state, table data, and change history.
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger({ component: 'storage' });

/**
 * Storage manager class
 */
export class StorageManager {
  /**
   * @param {string} dbPath - Path to database file
   * @param {number} maxHistoryEntries - Maximum history entries to keep
   */
  constructor(dbPath, maxHistoryEntries = 1000) {
    this.dbPath = dbPath;
    this.maxHistoryEntries = maxHistoryEntries;
    this.db = null;
    this.SQL = null;
    this.initialized = false;
  }

  /**
   * Initialize the database
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    logger.info({ dbPath: this.dbPath }, 'Initializing storage');

    // Ensure directory exists
    const dbDir = dirname(this.dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
      logger.debug({ dir: dbDir }, 'Created database directory');
    }

    // Initialize SQL.js
    this.SQL = await initSqlJs();

    // Load existing database or create new
    if (existsSync(this.dbPath)) {
      const fileBuffer = readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      logger.info('Loaded existing database');
    } else {
      this.db = new this.SQL.Database();
      logger.info('Created new database');
    }

    // Create tables
    this.createTables();
    this.initialized = true;

    logger.info('Storage initialized successfully');
  }

  /**
   * Create database tables
   */
  createTables() {
    // Page state table - stores latest known state
    this.db.run(`
      CREATE TABLE IF NOT EXISTS page_state (
        page_id TEXT PRIMARY KEY,
        version_number INTEGER NOT NULL,
        version_when TEXT NOT NULL,
        version_by TEXT,
        page_title TEXT,
        table_data TEXT,
        last_checked TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Change history table - stores detected changes
    this.db.run(`
      CREATE TABLE IF NOT EXISTS change_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        old_version INTEGER,
        new_version INTEGER NOT NULL,
        change_type TEXT NOT NULL,
        change_summary TEXT,
        change_details TEXT,
        FOREIGN KEY (page_id) REFERENCES page_state(page_id)
      )
    `);

    // Create indexes for performance
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_change_history_page_id
      ON change_history(page_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_change_history_detected_at
      ON change_history(detected_at)
    `);

    logger.debug('Database tables created/verified');
  }

  /**
   * Save database to file
   */
  persist() {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
    logger.debug('Database persisted to disk');
  }

  /**
   * Get stored page state
   * @param {string} pageId - Page ID
   * @returns {object|null} Page state or null if not found
   */
  getPageState(pageId) {
    const stmt = this.db.prepare(`
      SELECT * FROM page_state WHERE page_id = ?
    `);
    stmt.bind([pageId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();

      return {
        pageId: row.page_id,
        versionNumber: row.version_number,
        versionWhen: row.version_when,
        versionBy: row.version_by,
        pageTitle: row.page_title,
        tableData: row.table_data ? JSON.parse(row.table_data) : null,
        lastChecked: row.last_checked,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    stmt.free();
    return null;
  }

  /**
   * Save or update page state
   * @param {object} state - Page state to save
   */
  savePageState(state) {
    const {
      pageId,
      versionNumber,
      versionWhen,
      versionBy,
      pageTitle,
      tableData,
    } = state;

    const now = new Date().toISOString();
    const tableDataJson = tableData ? JSON.stringify(tableData) : null;

    // Check if exists
    const existing = this.getPageState(pageId);

    if (existing) {
      this.db.run(
        `
        UPDATE page_state SET
          version_number = ?,
          version_when = ?,
          version_by = ?,
          page_title = ?,
          table_data = ?,
          last_checked = ?,
          updated_at = ?
        WHERE page_id = ?
      `,
        [
          versionNumber,
          versionWhen,
          versionBy,
          pageTitle,
          tableDataJson,
          now,
          now,
          pageId,
        ]
      );
      logger.debug({ pageId, version: versionNumber }, 'Updated page state');
    } else {
      this.db.run(
        `
        INSERT INTO page_state (
          page_id, version_number, version_when, version_by,
          page_title, table_data, last_checked, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          pageId,
          versionNumber,
          versionWhen,
          versionBy,
          pageTitle,
          tableDataJson,
          now,
          now,
          now,
        ]
      );
      logger.debug({ pageId, version: versionNumber }, 'Created page state');
    }

    this.persist();
  }

  /**
   * Update last checked time without changing other data
   * @param {string} pageId - Page ID
   */
  updateLastChecked(pageId) {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE page_state SET last_checked = ? WHERE page_id = ?`,
      [now, pageId]
    );
    this.persist();
  }

  /**
   * Record a change in history
   * @param {object} change - Change record
   */
  recordChange(change) {
    const {
      pageId,
      oldVersion,
      newVersion,
      changeType,
      changeSummary,
      changeDetails,
    } = change;

    const now = new Date().toISOString();
    const detailsJson = changeDetails ? JSON.stringify(changeDetails) : null;

    this.db.run(
      `
      INSERT INTO change_history (
        page_id, detected_at, old_version, new_version,
        change_type, change_summary, change_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [pageId, now, oldVersion, newVersion, changeType, changeSummary, detailsJson]
    );

    logger.info(
      { pageId, changeType, oldVersion, newVersion },
      'Recorded change'
    );

    // Cleanup old history entries
    this.cleanupHistory(pageId);

    this.persist();
  }

  /**
   * Remove old history entries beyond the limit
   * @param {string} pageId - Page ID
   */
  cleanupHistory(pageId) {
    const countResult = this.db.exec(
      `SELECT COUNT(*) as count FROM change_history WHERE page_id = ?`,
      [pageId]
    );

    if (countResult.length > 0) {
      const count = countResult[0].values[0][0];

      if (count > this.maxHistoryEntries) {
        const toDelete = count - this.maxHistoryEntries;
        this.db.run(
          `
          DELETE FROM change_history
          WHERE page_id = ? AND id IN (
            SELECT id FROM change_history
            WHERE page_id = ?
            ORDER BY detected_at ASC
            LIMIT ?
          )
        `,
          [pageId, pageId, toDelete]
        );

        logger.debug({ pageId, deleted: toDelete }, 'Cleaned up old history');
      }
    }
  }

  /**
   * Get change history for a page
   * @param {string} pageId - Page ID
   * @param {number} [limit=50] - Maximum entries to return
   * @returns {object[]} Array of change records
   */
  getChangeHistory(pageId, limit = 50) {
    const results = [];

    const stmt = this.db.prepare(`
      SELECT * FROM change_history
      WHERE page_id = ?
      ORDER BY detected_at DESC
      LIMIT ?
    `);
    stmt.bind([pageId, limit]);

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id,
        pageId: row.page_id,
        detectedAt: row.detected_at,
        oldVersion: row.old_version,
        newVersion: row.new_version,
        changeType: row.change_type,
        changeSummary: row.change_summary,
        changeDetails: row.change_details ? JSON.parse(row.change_details) : null,
      });
    }

    stmt.free();
    return results;
  }

  /**
   * Get statistics about stored data
   * @returns {object} Storage statistics
   */
  getStats() {
    const pageCountResult = this.db.exec('SELECT COUNT(*) FROM page_state');
    const historyCountResult = this.db.exec('SELECT COUNT(*) FROM change_history');

    const pageCount =
      pageCountResult.length > 0 ? pageCountResult[0].values[0][0] : 0;
    const historyCount =
      historyCountResult.length > 0 ? historyCountResult[0].values[0][0] : 0;

    return {
      pagesTracked: pageCount,
      totalChangeRecords: historyCount,
      databasePath: this.dbPath,
      maxHistoryEntries: this.maxHistoryEntries,
    };
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
      this.initialized = false;
      logger.info('Database closed');
    }
  }

  /**
   * Clear all data (use with caution!)
   */
  clearAll() {
    this.db.run('DELETE FROM change_history');
    this.db.run('DELETE FROM page_state');
    this.persist();
    logger.warn('All data cleared from database');
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create storage manager instance
 * @param {object} config - Storage configuration
 * @returns {Promise<StorageManager>}
 */
export async function getStorage(config) {
  if (!instance) {
    instance = new StorageManager(config.databasePath, config.maxHistoryEntries);
    await instance.initialize();
  }
  return instance;
}

/**
 * Reset storage instance (for testing)
 */
export function resetStorage() {
  if (instance) {
    instance.close();
    instance = null;
  }
}

export default { StorageManager, getStorage, resetStorage };
