/**
 * Confluence API Client
 *
 * Production-grade client for Confluence Cloud REST API.
 * Features:
 * - Automatic retry with exponential backoff
 * - Rate limit handling
 * - Comprehensive error handling
 * - Request/response logging
 */

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { getLogger, createChildLogger } from '../utils/logger.js';

/**
 * @typedef {object} PageVersion
 * @property {number} number - Version number
 * @property {string} when - ISO timestamp of last modification
 * @property {string} by - Display name of who made the change
 * @property {string} message - Version message (if any)
 */

/**
 * @typedef {object} PageContent
 * @property {string} id - Page ID
 * @property {string} title - Page title
 * @property {PageVersion} version - Version info
 * @property {string} body - Page body HTML content
 */

/**
 * Custom error class for Confluence API errors
 */
export class ConfluenceApiError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [statusCode] - HTTP status code
   * @param {string} [code] - Error code
   * @param {object} [details] - Additional error details
   */
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = 'ConfluenceApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  /**
   * Whether this error is retryable
   * @returns {boolean}
   */
  isRetryable() {
    if (!this.statusCode) return true;
    // 429 (rate limit), 500-599 (server errors) are retryable
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

/**
 * Creates a Confluence API client
 * @param {object} config - Confluence configuration
 * @param {string} config.baseUrl - Confluence base URL
 * @param {string} config.email - User email
 * @param {string} config.apiToken - API token
 * @returns {object} Confluence client instance
 */
export function createConfluenceClient(config) {
  const { baseUrl, email, apiToken } = config;
  const logger = createChildLogger({ component: 'confluence-client' });

  // Create Basic Auth header
  const authString = Buffer.from(`${email}:${apiToken}`).toString('base64');

  // Create axios instance with defaults
  const client = axios.create({
    baseURL: `${baseUrl}/wiki/rest/api`,
    headers: {
      Authorization: `Basic ${authString}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 second timeout
  });

  // Configure retry behavior
  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount, error) => {
      // Check for Retry-After header (rate limiting)
      const retryAfter = error?.response?.headers?.['retry-after'];
      if (retryAfter) {
        const delay = parseInt(retryAfter, 10) * 1000;
        logger.warn({ retryAfter: delay }, 'Rate limited, waiting before retry');
        return delay;
      }
      // Exponential backoff: 1s, 2s, 4s
      return axiosRetry.exponentialDelay(retryCount);
    },
    retryCondition: (error) => {
      // Retry on network errors or 5xx errors or 429 (rate limit)
      return (
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error?.response?.status === 429 ||
        (error?.response?.status >= 500 && error?.response?.status <= 599)
      );
    },
    onRetry: (retryCount, error) => {
      logger.warn(
        {
          attempt: retryCount,
          status: error?.response?.status,
          message: error.message,
        },
        'Retrying request'
      );
    },
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (request) => {
      logger.debug(
        {
          method: request.method?.toUpperCase(),
          url: request.url,
        },
        'API request'
      );
      return request;
    },
    (error) => {
      logger.error({ error: error.message }, 'Request setup error');
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging and error handling
  client.interceptors.response.use(
    (response) => {
      logger.debug(
        {
          status: response.status,
          url: response.config.url,
        },
        'API response'
      );
      return response;
    },
    (error) => {
      const status = error?.response?.status;
      const errorData = error?.response?.data;

      let errorMessage = error.message;
      let errorCode = 'UNKNOWN_ERROR';

      if (status === 401) {
        errorMessage = 'Authentication failed. Check your email and API token.';
        errorCode = 'AUTH_FAILED';
      } else if (status === 403) {
        errorMessage = 'Access forbidden. Check your permissions for this page.';
        errorCode = 'ACCESS_FORBIDDEN';
      } else if (status === 404) {
        errorMessage = 'Page not found. Check the page ID.';
        errorCode = 'NOT_FOUND';
      } else if (status === 429) {
        errorMessage = 'Rate limit exceeded. Requests will be retried.';
        errorCode = 'RATE_LIMITED';
      } else if (status >= 500) {
        errorMessage = `Confluence server error (${status}). The server may be temporarily unavailable.`;
        errorCode = 'SERVER_ERROR';
      }

      logger.error(
        {
          status,
          code: errorCode,
          url: error?.config?.url,
          details: errorData,
        },
        errorMessage
      );

      return Promise.reject(
        new ConfluenceApiError(errorMessage, status, errorCode, errorData)
      );
    }
  );

  return {
    /**
     * Gets page version information (lightweight)
     * @param {string} pageId - Page ID
     * @returns {Promise<PageVersion>}
     */
    async getPageVersion(pageId) {
      logger.debug({ pageId }, 'Fetching page version');

      const response = await client.get(`/content/${pageId}`, {
        params: {
          expand: 'version',
        },
      });

      const { version } = response.data;

      return {
        number: version.number,
        when: version.when,
        by: version.by?.displayName || 'Unknown',
        message: version.message || '',
      };
    },

    /**
     * Gets full page content including body
     * @param {string} pageId - Page ID
     * @returns {Promise<PageContent>}
     */
    async getPageContent(pageId) {
      logger.debug({ pageId }, 'Fetching page content');

      const response = await client.get(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version',
        },
      });

      const { id, title, version, body } = response.data;

      return {
        id,
        title,
        version: {
          number: version.number,
          when: version.when,
          by: version.by?.displayName || 'Unknown',
          message: version.message || '',
        },
        body: body.storage.value,
      };
    },

    /**
     * Gets page history
     * @param {string} pageId - Page ID
     * @param {number} [limit=10] - Number of history entries
     * @returns {Promise<PageVersion[]>}
     */
    async getPageHistory(pageId, limit = 10) {
      logger.debug({ pageId, limit }, 'Fetching page history');

      const response = await client.get(`/content/${pageId}/history`, {
        params: {
          expand: 'lastUpdated',
        },
      });

      // The history endpoint returns differently structured data
      const { lastUpdated } = response.data;

      return {
        lastUpdated: {
          number: lastUpdated.number,
          when: lastUpdated.when,
          by: lastUpdated.by?.displayName || 'Unknown',
          message: lastUpdated.message || '',
        },
      };
    },

    /**
     * Tests the connection to Confluence
     * @param {string} pageId - Page ID to test with
     * @returns {Promise<{ success: boolean, pageTitle?: string, error?: string }>}
     */
    async testConnection(pageId) {
      try {
        logger.info('Testing Confluence connection');

        const response = await client.get(`/content/${pageId}`, {
          params: {
            expand: 'version',
          },
        });

        logger.info(
          { pageTitle: response.data.title },
          'Connection test successful'
        );

        return {
          success: true,
          pageTitle: response.data.title,
        };
      } catch (error) {
        logger.error({ error: error.message }, 'Connection test failed');

        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}

export default { createConfluenceClient, ConfluenceApiError };
