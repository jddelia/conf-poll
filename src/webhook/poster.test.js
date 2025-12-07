/**
 * Webhook Poster Tests
 *
 * Tests for the webhook posting module.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  WebhookPoster,
  WebhookPostError,
  getWebhookPoster,
  resetWebhookPoster,
} from './poster.js';

describe('WebhookPoster', () => {
  describe('formatRowAsString', () => {
    it('should format row data without headers', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const result = poster.formatRowAsString(['Value1', 'Value2', 'Value3']);

      assert.strictEqual(result, 'Value1 | Value2 | Value3');
    });

    it('should format row data with headers', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const result = poster.formatRowAsString(
        ['John', 'Doe', 'john@example.com'],
        ['First Name', 'Last Name', 'Email']
      );

      assert.strictEqual(
        result,
        'First Name: John | Last Name: Doe | Email: john@example.com'
      );
    });

    it('should handle empty row data', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const result = poster.formatRowAsString([]);

      assert.strictEqual(result, '');
    });

    it('should handle null row data', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const result = poster.formatRowAsString(null);

      assert.strictEqual(result, '');
    });

    it('should fallback to column number when headers are incomplete', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const result = poster.formatRowAsString(
        ['A', 'B', 'C'],
        ['Header1'] // Only one header
      );

      assert.strictEqual(result, 'Header1: A | Column 2: B | Column 3: C');
    });
  });

  describe('buildPayload', () => {
    it('should build basic payload with input string', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
        includeMetadata: false,
      });

      const payload = poster.buildPayload('Test input string');

      assert.deepStrictEqual(payload, { input: 'Test input string' });
    });

    it('should include metadata when enabled', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
        includeMetadata: true,
      });

      const payload = poster.buildPayload('Test input', {
        pageTitle: 'My Page',
        version: 5,
        changeType: 'modified',
        rowIndex: 2,
      });

      assert.strictEqual(payload.input, 'Test input');
      assert.ok(payload._metadata);
      assert.strictEqual(payload._metadata.pageTitle, 'My Page');
      assert.strictEqual(payload._metadata.pageVersion, 5);
      assert.strictEqual(payload._metadata.changeType, 'modified');
      assert.strictEqual(payload._metadata.rowIndex, 2);
      assert.strictEqual(payload._metadata.source, 'conf-poll');
      assert.ok(payload._metadata.timestamp);
    });

    it('should not include metadata when disabled', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
        includeMetadata: false,
      });

      const payload = poster.buildPayload('Test input', {
        pageTitle: 'My Page',
      });

      assert.strictEqual(payload.input, 'Test input');
      assert.strictEqual(payload._metadata, undefined);
    });
  });

  describe('sanitizeUrl', () => {
    it('should remove query parameters from URL', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook?token=secret123',
      });

      const sanitized = poster.sanitizeUrl(
        'https://example.com/webhook?token=secret123&key=value'
      );

      assert.strictEqual(sanitized, 'https://example.com/webhook');
    });

    it('should return invalid-url for malformed URLs', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const sanitized = poster.sanitizeUrl('not-a-valid-url');

      assert.strictEqual(sanitized, '[invalid-url]');
    });
  });

  describe('handleError', () => {
    it('should classify timeout errors as retryable', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      // Create a mock axios error with timeout code
      const axiosError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      };

      const error = poster.handleError(axiosError, 0);

      assert.ok(error instanceof WebhookPostError);
      assert.strictEqual(error.code, 'TIMEOUT');
      assert.strictEqual(error.retryable, true);
    });

    it('should classify 5xx errors as retryable', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const axiosError = {
        isAxiosError: true,
        response: { status: 503, data: { message: 'Service Unavailable' } },
        message: 'Request failed with status 503',
      };

      const error = poster.handleError(axiosError, 0);

      assert.ok(error instanceof WebhookPostError);
      assert.strictEqual(error.code, 'SERVER_ERROR');
      assert.strictEqual(error.retryable, true);
      assert.strictEqual(error.statusCode, 503);
    });

    it('should classify 401/403 errors as non-retryable', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const axiosError = {
        isAxiosError: true,
        response: { status: 401, data: { message: 'Unauthorized' } },
        message: 'Request failed with status 401',
      };

      const error = poster.handleError(axiosError, 0);

      assert.ok(error instanceof WebhookPostError);
      assert.strictEqual(error.code, 'AUTH_ERROR');
      assert.strictEqual(error.retryable, false);
    });

    it('should classify 429 rate limit as retryable', () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const axiosError = {
        isAxiosError: true,
        response: { status: 429, data: { message: 'Too Many Requests' } },
        message: 'Request failed with status 429',
      };

      const error = poster.handleError(axiosError, 0);

      assert.ok(error instanceof WebhookPostError);
      assert.strictEqual(error.code, 'RATE_LIMITED');
      assert.strictEqual(error.retryable, true);
    });
  });

  describe('sleep', () => {
    it('should delay for specified duration', async () => {
      const poster = new WebhookPoster({
        endpointUrl: 'https://example.com/webhook',
      });

      const start = Date.now();
      await poster.sleep(50);
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 45, `Expected at least 45ms, got ${elapsed}ms`);
      assert.ok(elapsed < 100, `Expected less than 100ms, got ${elapsed}ms`);
    });
  });
});

describe('WebhookPostError', () => {
  it('should create error with all properties', () => {
    const error = new WebhookPostError('Test error', 500, 'SERVER_ERROR', true);

    assert.strictEqual(error.message, 'Test error');
    assert.strictEqual(error.statusCode, 500);
    assert.strictEqual(error.code, 'SERVER_ERROR');
    assert.strictEqual(error.retryable, true);
    assert.strictEqual(error.name, 'WebhookPostError');
  });

  it('should default retryable to false', () => {
    const error = new WebhookPostError('Test error', 400, 'CLIENT_ERROR');

    assert.strictEqual(error.retryable, false);
  });
});

describe('getWebhookPoster', () => {
  beforeEach(() => {
    resetWebhookPoster();
  });

  afterEach(() => {
    resetWebhookPoster();
  });

  it('should return null when disabled', () => {
    const poster = getWebhookPoster({ enabled: false });

    assert.strictEqual(poster, null);
  });

  it('should return null when no endpoint URL', () => {
    const poster = getWebhookPoster({ enabled: true, endpointUrl: null });

    assert.strictEqual(poster, null);
  });

  it('should return poster instance when enabled with URL', () => {
    const poster = getWebhookPoster({
      enabled: true,
      endpointUrl: 'https://example.com/webhook',
    });

    assert.ok(poster instanceof WebhookPoster);
  });

  it('should return same singleton instance', () => {
    const poster1 = getWebhookPoster({
      enabled: true,
      endpointUrl: 'https://example.com/webhook',
    });
    const poster2 = getWebhookPoster({
      enabled: true,
      endpointUrl: 'https://different.com/webhook',
    });

    assert.strictEqual(poster1, poster2);
  });
});
