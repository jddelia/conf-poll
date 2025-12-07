/**
 * Structured Logger
 *
 * Production-grade logging with Pino.
 * Supports console and file output with configurable levels.
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Logger singleton instance
 * @type {pino.Logger|null}
 */
let loggerInstance = null;

/**
 * Creates and configures the logger
 * @param {object} config - Logging configuration
 * @param {string} config.level - Log level
 * @param {boolean} config.toFile - Whether to log to file
 * @param {string} config.filePath - Log file path
 * @param {boolean} config.pretty - Whether to use pretty printing
 * @returns {pino.Logger}
 */
export function createLogger(config) {
  if (loggerInstance) {
    return loggerInstance;
  }

  const { level = 'info', toFile = true, filePath = './logs/conf-poll.log', pretty = true } = config;

  // Ensure log directory exists
  if (toFile) {
    const logDir = dirname(filePath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  // Build transport targets
  const targets = [];

  // Console transport
  if (pretty) {
    targets.push({
      target: 'pino-pretty',
      level,
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  } else {
    targets.push({
      target: 'pino/file',
      level,
      options: { destination: 1 }, // stdout
    });
  }

  // File transport
  if (toFile) {
    targets.push({
      target: 'pino/file',
      level,
      options: {
        destination: filePath,
        mkdir: true,
      },
    });
  }

  loggerInstance = pino({
    level,
    transport: {
      targets,
    },
    base: {
      app: 'conf-poll',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return loggerInstance;
}

/**
 * Gets the logger instance
 * @returns {pino.Logger}
 * @throws {Error} If logger hasn't been created
 */
export function getLogger() {
  if (!loggerInstance) {
    // Create a default console-only logger for early bootstrap
    loggerInstance = pino({
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }
  return loggerInstance;
}

/**
 * Creates a child logger with additional context
 * @param {object} bindings - Additional context to include
 * @returns {pino.Logger}
 */
export function createChildLogger(bindings) {
  return getLogger().child(bindings);
}

/**
 * Resets the logger (for testing)
 */
export function resetLogger() {
  loggerInstance = null;
}

export default { createLogger, getLogger, createChildLogger, resetLogger };
