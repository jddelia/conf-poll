/**
 * Conf-Poll Main Entry Point
 *
 * Production-grade Confluence page polling and change detection.
 * Monitors a Confluence page table and detects/reports changes.
 */

import { loadConfig } from './config/index.js';
import { createLogger, getLogger } from './utils/logger.js';
import { createPoller, PollerState } from './poller.js';

/**
 * Main application class
 */
class Application {
  constructor() {
    this.config = null;
    this.logger = null;
    this.poller = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      // Load and validate configuration
      this.config = loadConfig();

      // Initialize logger
      this.logger = createLogger(this.config.logging);
      this.logger.info('Configuration loaded successfully');

      // Create poller
      this.poller = createPoller(this.config);

      // Setup event handlers
      this.setupEventHandlers();

      // Setup graceful shutdown
      this.setupShutdownHandlers();

      this.logger.info('Application initialized');
    } catch (error) {
      console.error('Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  /**
   * Setup poller event handlers
   */
  setupEventHandlers() {
    this.poller.on('initialized', () => {
      this.logger.info('Poller components initialized');
    });

    this.poller.on('started', () => {
      this.logger.info('Polling started');
    });

    this.poller.on('poll:changed', ({ report, pageTitle, version }) => {
      this.logger.info(
        {
          pageTitle,
          version,
          changes: report.summary,
        },
        'Changes detected!'
      );
    });

    this.poller.on('poll:unchanged', ({ version }) => {
      this.logger.debug({ version }, 'No changes');
    });

    this.poller.on('poll:error', ({ error, consecutiveErrors }) => {
      this.logger.error(
        {
          error: error.message,
          consecutiveErrors,
        },
        'Poll error'
      );
    });

    this.poller.on('paused', ({ reason, pauseDuration }) => {
      this.logger.warn(
        {
          reason,
          pauseDurationMs: pauseDuration,
          resumeAt: new Date(Date.now() + pauseDuration).toISOString(),
        },
        'Polling paused'
      );
    });

    this.poller.on('resumed', () => {
      this.logger.info('Polling resumed');
    });

    this.poller.on('stopped', () => {
      this.logger.info('Poller stopped');
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        this.logger.warn('Shutdown already in progress, forcing exit');
        process.exit(1);
      }

      this.isShuttingDown = true;
      this.logger.info({ signal }, 'Shutdown signal received');

      try {
        // Stop poller gracefully
        if (this.poller && this.poller.state !== PollerState.STOPPED) {
          await this.poller.stop();
        }

        this.logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        this.logger.error({ error: error.message }, 'Error during shutdown');
        process.exit(1);
      }
    };

    // Handle various termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.fatal({ reason, promise }, 'Unhandled promise rejection');
      shutdown('unhandledRejection');
    });
  }

  /**
   * Start the application
   */
  async start() {
    this.logger.info('Starting conf-poll');
    this.printStartupBanner();

    try {
      await this.poller.start();
    } catch (error) {
      this.logger.fatal({ error: error.message }, 'Failed to start poller');
      process.exit(1);
    }
  }

  /**
   * Print startup banner
   */
  printStartupBanner() {
    const banner = `
╔═══════════════════════════════════════════════════════════════╗
║                        CONF-POLL                              ║
║          Confluence Page Change Detection System              ║
╚═══════════════════════════════════════════════════════════════╝

  Page ID:        ${this.config.confluence.pageId}
  Poll Interval:  ${this.config.polling.intervalMs / 1000}s
  Table Index:    ${this.config.table.targetTableIndex}
  Log Level:      ${this.config.logging.level}

  Press Ctrl+C to stop gracefully.
`;
    console.log(banner);
  }
}

/**
 * Main entry point
 */
async function main() {
  const app = new Application();
  await app.initialize();
  await app.start();
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { Application };
export default main;
