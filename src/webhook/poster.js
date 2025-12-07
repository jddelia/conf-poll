/**
 * Webhook Poster Module
 *
 * Posts row change data to external endpoints.
 * Features:
 * - Configurable retry with exponential backoff
 * - Request timeout handling
 * - Secure payload formatting
 * - Comprehensive error handling and logging
 */

import axios from 'axios';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger({ component: 'webhook-poster' });

/**
 * Custom error class for webhook posting errors
 */
export class WebhookPostError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [statusCode] - HTTP status code
   * @param {string} [code] - Error code
   * @param {boolean} [retryable] - Whether the error is retryable
   */
  constructor(message, statusCode, code, retryable = false) {
    super(message);
    this.name = 'WebhookPostError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Webhook poster class
 */
export class WebhookPoster {
  /**
   * @param {object} config - Webhook configuration
   * @param {string} config.endpointUrl - Target endpoint URL
   * @param {number} [config.timeoutMs=10000] - Request timeout
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {number} [config.retryDelayMs=1000] - Base delay between retries
   * @param {boolean} [config.includeMetadata=true] - Include metadata in payload
   */
  constructor(config) {
    this.endpointUrl = config.endpointUrl;
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
    this.includeMetadata = config.includeMetadata !== false;

    // Create axios instance with defaults
    this.client = axios.create({
      timeout: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'conf-poll/1.0',
      },
    });

    logger.info(
      {
        endpoint: this.sanitizeUrl(this.endpointUrl),
        timeoutMs: this.timeoutMs,
        maxRetries: this.maxRetries,
      },
      'Webhook poster initialized'
    );
  }

  /**
   * Sanitize URL for logging (remove sensitive parts)
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL
   */
  sanitizeUrl(url) {
    try {
      const parsed = new URL(url);
      // Remove query parameters that might contain tokens
      parsed.search = '';
      return parsed.toString();
    } catch {
      return '[invalid-url]';
    }
  }

  /**
   * Format row data as string for the webhook payload
   * @param {string[]} rowData - Array of cell values
   * @param {string[]} [headers] - Optional column headers
   * @returns {string} Formatted row string
   */
  formatRowAsString(rowData, headers = []) {
    if (!rowData || rowData.length === 0) {
      return '';
    }

    // If headers provided, format as "Header: Value" pairs
    if (headers.length > 0) {
      const parts = rowData.map((value, index) => {
        const header = headers[index] || `Column ${index + 1}`;
        return `${header}: ${value}`;
      });
      return parts.join(' | ');
    }

    // Otherwise, just join values
    return rowData.join(' | ');
  }

  /**
   * Build the webhook payload
   * @param {string} rowString - Formatted row data string
   * @param {object} [metadata] - Optional metadata
   * @returns {object} Webhook payload
   */
  buildPayload(rowString, metadata = null) {
    const payload = {
      input: rowString,
    };

    // Optionally include metadata as additional context
    if (this.includeMetadata && metadata) {
      payload._metadata = {
        pageTitle: metadata.pageTitle,
        pageVersion: metadata.version,
        changeType: metadata.changeType,
        rowIndex: metadata.rowIndex,
        timestamp: new Date().toISOString(),
        source: 'conf-poll',
      };
    }

    return payload;
  }

  /**
   * Post a single row change to the webhook endpoint
   * @param {string[]} rowData - Array of cell values
   * @param {object} options - Post options
   * @param {string[]} [options.headers] - Column headers
   * @param {object} [options.metadata] - Change metadata
   * @returns {Promise<{ success: boolean, response?: object, error?: string }>}
   */
  async postRowChange(rowData, options = {}) {
    const { headers = [], metadata = null } = options;

    const rowString = this.formatRowAsString(rowData, headers);
    const payload = this.buildPayload(rowString, metadata);

    logger.debug(
      {
        rowIndex: metadata?.rowIndex,
        changeType: metadata?.changeType,
        payloadSize: JSON.stringify(payload).length,
      },
      'Posting row change to webhook'
    );

    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const response = await this.client.post(this.endpointUrl, payload);

        logger.info(
          {
            status: response.status,
            rowIndex: metadata?.rowIndex,
            attempt: attempt + 1,
          },
          'Webhook post successful'
        );

        return {
          success: true,
          response: {
            status: response.status,
            data: response.data,
          },
        };
      } catch (error) {
        lastError = this.handleError(error, attempt);

        if (!lastError.retryable || attempt >= this.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        logger.warn(
          {
            attempt: attempt + 1,
            nextRetryIn: delay,
            error: lastError.message,
          },
          'Webhook post failed, retrying'
        );

        await this.sleep(delay);
        attempt++;
      }
    }

    logger.error(
      {
        attempts: attempt + 1,
        error: lastError.message,
        code: lastError.code,
      },
      'Webhook post failed after all retries'
    );

    return {
      success: false,
      error: lastError.message,
    };
  }

  /**
   * Post multiple row changes (batch)
   * @param {Array<{ rowData: string[], metadata?: object }>} changes - Array of changes
   * @param {string[]} [headers] - Column headers
   * @returns {Promise<{ successful: number, failed: number, results: object[] }>}
   */
  async postBatch(changes, headers = []) {
    const results = [];
    let successful = 0;
    let failed = 0;

    logger.info({ count: changes.length }, 'Starting batch webhook posts');

    for (const change of changes) {
      const result = await this.postRowChange(change.rowData, {
        headers,
        metadata: change.metadata,
      });

      results.push(result);

      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Small delay between requests to avoid overwhelming the endpoint
      if (changes.indexOf(change) < changes.length - 1) {
        await this.sleep(100);
      }
    }

    logger.info(
      { successful, failed, total: changes.length },
      'Batch webhook posts completed'
    );

    return { successful, failed, results };
  }

  /**
   * Handle axios errors and convert to WebhookPostError
   * @param {Error} error - Axios error
   * @param {number} attempt - Current attempt number
   * @returns {WebhookPostError}
   */
  handleError(error, attempt) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      // Determine if retryable
      let retryable = false;
      let code = 'UNKNOWN_ERROR';

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        retryable = true;
        code = 'TIMEOUT';
      } else if (error.code === 'ECONNREFUSED') {
        retryable = true;
        code = 'CONNECTION_REFUSED';
      } else if (error.code === 'ENOTFOUND') {
        retryable = false;
        code = 'HOST_NOT_FOUND';
      } else if (status === 429) {
        retryable = true;
        code = 'RATE_LIMITED';
      } else if (status >= 500) {
        retryable = true;
        code = 'SERVER_ERROR';
      } else if (status === 401 || status === 403) {
        retryable = false;
        code = 'AUTH_ERROR';
      } else if (status >= 400) {
        retryable = false;
        code = 'CLIENT_ERROR';
      }

      return new WebhookPostError(message, status, code, retryable);
    }

    // Non-axios error
    return new WebhookPostError(error.message, null, 'UNKNOWN_ERROR', true);
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test the webhook endpoint connectivity
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async testConnection() {
    logger.info('Testing webhook endpoint connectivity');

    try {
      // Send a minimal test payload
      const testPayload = {
        input: '[conf-poll connection test]',
        _metadata: {
          test: true,
          timestamp: new Date().toISOString(),
          source: 'conf-poll',
        },
      };

      const response = await this.client.post(this.endpointUrl, testPayload);

      logger.info(
        { status: response.status },
        'Webhook endpoint test successful'
      );

      return { success: true };
    } catch (error) {
      const webhookError = this.handleError(error, 0);

      logger.error(
        { error: webhookError.message, code: webhookError.code },
        'Webhook endpoint test failed'
      );

      return {
        success: false,
        error: webhookError.message,
      };
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create webhook poster instance
 * @param {object} config - Webhook configuration
 * @returns {WebhookPoster|null} Poster instance or null if disabled
 */
export function getWebhookPoster(config) {
  if (!config.enabled || !config.endpointUrl) {
    return null;
  }

  if (!instance) {
    instance = new WebhookPoster(config);
  }

  return instance;
}

/**
 * Reset webhook poster instance (for testing)
 */
export function resetWebhookPoster() {
  instance = null;
}

export default { WebhookPoster, WebhookPostError, getWebhookPoster, resetWebhookPoster };
