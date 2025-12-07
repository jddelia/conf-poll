/**
 * Polling Orchestrator
 *
 * Core engine that coordinates polling, change detection, and notifications.
 * Features:
 * - Configurable polling intervals
 * - Automatic retry with backoff
 * - Error recovery and pause
 * - Graceful shutdown
 * - Event emission for extensibility
 */

import { EventEmitter } from 'events';
import { createConfluenceClient } from './confluence/client.js';
import { extractTable, normalizeTableForComparison } from './confluence/parser.js';
import { getStorage } from './storage/store.js';
import { compareTableData, formatChangeReport, createNotificationMessage, getAffectedRows } from './diff/comparator.js';
import { getNotifier } from './notify/notifier.js';
import { getWebhookPoster } from './webhook/poster.js';
import { createChildLogger } from './utils/logger.js';

const logger = createChildLogger({ component: 'poller' });

/**
 * Poller states
 */
export const PollerState = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
};

/**
 * Polling orchestrator class
 * @extends EventEmitter
 */
export class Poller extends EventEmitter {
  /**
   * @param {object} config - Full application config
   */
  constructor(config) {
    super();
    this.config = config;
    this.state = PollerState.IDLE;
    this.consecutiveErrors = 0;
    this.pollCount = 0;
    this.lastPollTime = null;
    this.nextPollTime = null;
    this.pollTimer = null;
    this.client = null;
    this.storage = null;
    this.notifier = null;
    this.webhookPoster = null;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    logger.info('Initializing poller');

    // Initialize Confluence client
    this.client = createConfluenceClient(this.config.confluence);

    // Initialize storage
    this.storage = await getStorage(this.config.storage);

    // Initialize notifier
    this.notifier = getNotifier(this.config.notifications);

    // Initialize webhook poster (if enabled)
    this.webhookPoster = getWebhookPoster(this.config.webhook);
    if (this.webhookPoster) {
      logger.info('Webhook posting enabled');
    }

    logger.info('Poller initialized');
    this.emit('initialized');
  }

  /**
   * Start the polling loop
   */
  async start() {
    if (this.state === PollerState.RUNNING) {
      logger.warn('Poller is already running');
      return;
    }

    if (!this.client) {
      await this.initialize();
    }

    logger.info(
      { intervalMs: this.config.polling.intervalMs },
      'Starting poller'
    );

    this.state = PollerState.RUNNING;
    this.emit('started');

    // Run initial poll immediately
    await this.poll();

    // Schedule subsequent polls
    this.schedulePoll();
  }

  /**
   * Schedule the next poll
   */
  schedulePoll() {
    if (this.state !== PollerState.RUNNING) {
      return;
    }

    const intervalMs = this.config.polling.intervalMs;
    this.nextPollTime = new Date(Date.now() + intervalMs);

    logger.debug(
      { nextPoll: this.nextPollTime.toISOString() },
      'Next poll scheduled'
    );

    this.pollTimer = setTimeout(async () => {
      if (this.state === PollerState.RUNNING) {
        await this.poll();
        this.schedulePoll();
      }
    }, intervalMs);
  }

  /**
   * Execute a single poll cycle
   */
  async poll() {
    if (this.state !== PollerState.RUNNING) {
      return;
    }

    this.pollCount++;
    this.lastPollTime = new Date();

    const pageId = this.config.confluence.pageId;

    logger.info({ pollNumber: this.pollCount, pageId }, 'Starting poll');

    try {
      // Step 1: Get current page version (lightweight check)
      const versionInfo = await this.client.getPageVersion(pageId);
      const storedState = this.storage.getPageState(pageId);

      // Check if version changed
      if (storedState && storedState.versionNumber === versionInfo.number) {
        logger.info(
          { version: versionInfo.number },
          'No version change, skipping content fetch'
        );
        this.storage.updateLastChecked(pageId);
        this.consecutiveErrors = 0;
        this.emit('poll:unchanged', { version: versionInfo.number });
        return;
      }

      // Step 2: Version changed - fetch full content
      logger.info(
        {
          oldVersion: storedState?.versionNumber,
          newVersion: versionInfo.number,
        },
        'Version changed, fetching content'
      );

      const pageContent = await this.client.getPageContent(pageId);

      // Step 3: Parse table from content
      const table = extractTable(pageContent.body, this.config.table.targetTableIndex);

      if (!table) {
        logger.warn(
          { tableIndex: this.config.table.targetTableIndex },
          'No table found at specified index'
        );
        this.emit('poll:no-table');
        return;
      }

      // Step 4: Normalize table data for comparison
      const normalizedTable = normalizeTableForComparison(table, {
        monitorColumns: this.config.table.monitorColumns,
        ignoreHeaders: this.config.table.ignoreHeaderChanges,
      });

      // Step 5: Compare with stored data
      const changeReport = compareTableData(
        storedState?.tableData,
        normalizedTable,
        { headers: table.headers }
      );

      // Step 6: Handle changes
      if (changeReport.hasChanges) {
        // Log change
        this.storage.recordChange({
          pageId,
          oldVersion: storedState?.versionNumber || null,
          newVersion: versionInfo.number,
          changeType: this.categorizeChangeType(changeReport),
          changeSummary: changeReport.summary,
          changeDetails: {
            stats: changeReport.stats,
            cellsModified: changeReport.cellsModified,
            rowsAdded: changeReport.rowsAdded.length,
            rowsRemoved: changeReport.rowsRemoved.length,
          },
        });

        // Send notification
        const notificationMessage = createNotificationMessage(changeReport, {
          pageTitle: pageContent.title,
          version: versionInfo.number,
        });

        if (notificationMessage) {
          await this.notifier.notify(
            formatChangeReport(changeReport),
            changeReport,
            { pageTitle: pageContent.title }
          );
        }

        // Post affected rows to webhook if enabled
        if (this.webhookPoster) {
          const affectedRows = getAffectedRows(changeReport);

          if (affectedRows.length > 0) {
            logger.info(
              { rowCount: affectedRows.length },
              'Posting affected rows to webhook'
            );

            const webhookResults = await this.webhookPoster.postBatch(
              affectedRows.map((affected) => ({
                rowData: affected.rowData,
                metadata: {
                  pageTitle: pageContent.title,
                  version: versionInfo.number,
                  changeType: affected.changeType,
                  rowIndex: affected.rowIndex,
                },
              })),
              table.headers
            );

            logger.info(
              {
                successful: webhookResults.successful,
                failed: webhookResults.failed,
              },
              'Webhook posting completed'
            );

            this.emit('webhook:posted', webhookResults);
          }
        }

        this.emit('poll:changed', {
          report: changeReport,
          pageTitle: pageContent.title,
          version: versionInfo.number,
        });
      } else {
        logger.info('Content fetched but no table data changes detected');
        this.emit('poll:unchanged', { version: versionInfo.number });
      }

      // Step 7: Update stored state
      this.storage.savePageState({
        pageId,
        versionNumber: versionInfo.number,
        versionWhen: versionInfo.when,
        versionBy: versionInfo.by,
        pageTitle: pageContent.title,
        tableData: normalizedTable,
      });

      // Reset error counter on success
      this.consecutiveErrors = 0;

      logger.info(
        { pollNumber: this.pollCount, version: versionInfo.number },
        'Poll completed successfully'
      );

    } catch (error) {
      this.handlePollError(error);
    }
  }

  /**
   * Handle poll errors
   * @param {Error} error - The error that occurred
   */
  handlePollError(error) {
    this.consecutiveErrors++;

    logger.error(
      {
        error: error.message,
        consecutiveErrors: this.consecutiveErrors,
        maxErrors: this.config.polling.maxConsecutiveErrors,
      },
      'Poll failed'
    );

    this.emit('poll:error', { error, consecutiveErrors: this.consecutiveErrors });

    // Check if we should pause
    if (this.consecutiveErrors >= this.config.polling.maxConsecutiveErrors) {
      this.pause();
    }
  }

  /**
   * Categorize the type of change
   * @param {object} report - Change report
   * @returns {string} Change type
   */
  categorizeChangeType(report) {
    if (report.stats.rowsAdded > 0 && report.stats.rowsRemoved === 0) {
      return 'rows_added';
    }
    if (report.stats.rowsRemoved > 0 && report.stats.rowsAdded === 0) {
      return 'rows_removed';
    }
    if (report.stats.rowsAdded > 0 && report.stats.rowsRemoved > 0) {
      return 'rows_modified';
    }
    if (report.stats.cellsModified > 0) {
      return 'cells_modified';
    }
    return 'unknown';
  }

  /**
   * Pause polling (after max errors)
   */
  pause() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.state = PollerState.PAUSED;
    const pauseDuration = this.config.polling.errorPauseDurationMs;

    logger.warn(
      { pauseDurationMs: pauseDuration },
      'Pausing poller due to consecutive errors'
    );

    this.emit('paused', { reason: 'consecutive_errors', pauseDuration });

    // Resume after pause duration
    setTimeout(() => {
      if (this.state === PollerState.PAUSED) {
        this.resume();
      }
    }, pauseDuration);
  }

  /**
   * Resume polling after pause
   */
  resume() {
    if (this.state !== PollerState.PAUSED) {
      return;
    }

    logger.info('Resuming poller');
    this.consecutiveErrors = 0;
    this.state = PollerState.RUNNING;
    this.emit('resumed');

    // Run a poll immediately and reschedule
    this.poll().then(() => this.schedulePoll());
  }

  /**
   * Stop the poller gracefully
   */
  async stop() {
    if (this.state === PollerState.STOPPED || this.state === PollerState.STOPPING) {
      return;
    }

    logger.info('Stopping poller');
    this.state = PollerState.STOPPING;

    // Clear timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Close storage
    if (this.storage) {
      this.storage.close();
    }

    this.state = PollerState.STOPPED;
    logger.info('Poller stopped');
    this.emit('stopped');
  }

  /**
   * Force an immediate poll (outside normal schedule)
   */
  async forcePoll() {
    logger.info('Forcing immediate poll');
    await this.poll();
  }

  /**
   * Get current poller status
   * @returns {object} Status information
   */
  getStatus() {
    return {
      state: this.state,
      pollCount: this.pollCount,
      consecutiveErrors: this.consecutiveErrors,
      lastPollTime: this.lastPollTime?.toISOString() || null,
      nextPollTime: this.nextPollTime?.toISOString() || null,
      config: {
        pageId: this.config.confluence.pageId,
        intervalMs: this.config.polling.intervalMs,
        tableIndex: this.config.table.targetTableIndex,
      },
    };
  }

  /**
   * Get storage statistics
   * @returns {object} Storage stats
   */
  getStorageStats() {
    return this.storage?.getStats() || null;
  }

  /**
   * Get change history
   * @param {number} [limit=50] - Maximum entries
   * @returns {object[]} History entries
   */
  getHistory(limit = 50) {
    const pageId = this.config.confluence.pageId;
    return this.storage?.getChangeHistory(pageId, limit) || [];
  }
}

/**
 * Create and configure a poller instance
 * @param {object} config - Application configuration
 * @returns {Poller}
 */
export function createPoller(config) {
  return new Poller(config);
}

export default { Poller, PollerState, createPoller };
