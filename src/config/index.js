/**
 * Configuration Manager
 *
 * Loads, validates, and provides access to application configuration.
 * Configuration sources (in order of precedence):
 * 1. Environment variables
 * 2. .env file
 * 3. Default values from schema
 */

import { config as dotenvConfig } from 'dotenv';
import { appConfigSchema } from './schema.js';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parses a comma-separated string into an array of integers
 * @param {string|undefined} value - Comma-separated string
 * @returns {number[]} Array of integers
 */
function parseIntArray(value) {
  if (!value || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));
}

/**
 * Parses a string to boolean
 * @param {string|undefined} value - String value
 * @param {boolean} defaultValue - Default if undefined
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parses a string to integer with default
 * @param {string|undefined} value - String value
 * @param {number} defaultValue - Default if undefined or invalid
 * @returns {number}
 */
function parseInteger(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Loads configuration from environment variables
 * @returns {object} Raw configuration object
 */
function loadFromEnvironment() {
  // Load .env file if it exists
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath });
  }

  return {
    confluence: {
      baseUrl: process.env.CONFLUENCE_BASE_URL,
      email: process.env.CONFLUENCE_EMAIL,
      apiToken: process.env.CONFLUENCE_API_TOKEN,
      pageId: process.env.CONFLUENCE_PAGE_ID,
    },
    polling: {
      intervalMs: parseInteger(process.env.POLL_INTERVAL_MS, 300000),
      maxConsecutiveErrors: parseInteger(process.env.MAX_CONSECUTIVE_ERRORS, 5),
      errorPauseDurationMs: parseInteger(process.env.ERROR_PAUSE_DURATION_MS, 900000),
    },
    storage: {
      databasePath: process.env.DATABASE_PATH || './data/conf-poll.db',
      maxHistoryEntries: parseInteger(process.env.MAX_HISTORY_ENTRIES, 1000),
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      toFile: parseBoolean(process.env.LOG_TO_FILE, true),
      filePath: process.env.LOG_FILE_PATH || './logs/conf-poll.log',
      pretty: parseBoolean(process.env.LOG_PRETTY, true),
    },
    notifications: {
      enableDesktop: parseBoolean(process.env.ENABLE_DESKTOP_NOTIFICATIONS, false),
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || null,
      discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
    },
    table: {
      targetTableIndex: parseInteger(process.env.TARGET_TABLE_INDEX, 0),
      monitorColumns: parseIntArray(process.env.MONITOR_COLUMNS),
      ignoreHeaderChanges: parseBoolean(process.env.IGNORE_HEADER_CHANGES, false),
    },
  };
}

/**
 * Configuration singleton
 */
let cachedConfig = null;

/**
 * Loads and validates application configuration
 * @param {object} [overrides] - Optional configuration overrides (for testing)
 * @returns {import('./schema.js').AppConfig} Validated configuration
 * @throws {Error} If configuration validation fails
 */
export function loadConfig(overrides = {}) {
  if (cachedConfig && Object.keys(overrides).length === 0) {
    return cachedConfig;
  }

  const rawConfig = loadFromEnvironment();

  // Merge overrides (deep merge for nested objects)
  const mergedConfig = deepMerge(rawConfig, overrides);

  // Validate configuration
  const result = appConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const errors = result.error.errors.map((err) => {
      const path = err.path.join('.');
      return `  - ${path}: ${err.message}`;
    });
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object (takes precedence)
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] !== undefined && source[key] !== null) {
      if (
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * Clears the cached configuration (useful for testing)
 */
export function clearConfigCache() {
  cachedConfig = null;
}

/**
 * Gets the current configuration (must be loaded first)
 * @returns {import('./schema.js').AppConfig}
 * @throws {Error} If configuration hasn't been loaded
 */
export function getConfig() {
  if (!cachedConfig) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

/**
 * Validates configuration without caching
 * @param {object} config - Configuration object to validate
 * @returns {{ success: boolean, errors?: string[], config?: object }}
 */
export function validateConfig(config) {
  const result = appConfigSchema.safeParse(config);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      }),
    };
  }

  return {
    success: true,
    config: result.data,
  };
}

export default { loadConfig, getConfig, clearConfigCache, validateConfig };
