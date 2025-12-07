/**
 * Configuration Tests
 *
 * Tests for configuration loading and validation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { validateConfig, clearConfigCache } from './index.js';

describe('Configuration', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    clearConfigCache();
  });

  describe('validateConfig', () => {
    const validConfig = {
      confluence: {
        baseUrl: 'https://example.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token-123',
        pageId: '123456789',
      },
      polling: {
        intervalMs: 300000,
        maxConsecutiveErrors: 5,
        errorPauseDurationMs: 900000,
      },
      storage: {
        databasePath: './data/test.db',
        maxHistoryEntries: 1000,
      },
      logging: {
        level: 'info',
        toFile: false,
        filePath: './logs/test.log',
        pretty: true,
      },
      notifications: {
        enableDesktop: false,
        slackWebhookUrl: null,
        discordWebhookUrl: null,
      },
      table: {
        targetTableIndex: 0,
        monitorColumns: [],
        ignoreHeaderChanges: false,
      },
    };

    it('should validate a correct configuration', () => {
      const result = validateConfig(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(result.config);
    });

    it('should reject HTTP base URLs', () => {
      const config = {
        ...validConfig,
        confluence: {
          ...validConfig.confluence,
          baseUrl: 'http://example.atlassian.net',
        },
      };

      const result = validateConfig(config);
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.some((e) => e.includes('HTTPS')));
    });

    it('should reject invalid email', () => {
      const config = {
        ...validConfig,
        confluence: {
          ...validConfig.confluence,
          email: 'not-an-email',
        },
      };

      const result = validateConfig(config);
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.some((e) => e.includes('email')));
    });

    it('should reject non-numeric page ID', () => {
      const config = {
        ...validConfig,
        confluence: {
          ...validConfig.confluence,
          pageId: 'abc-not-numeric',
        },
      };

      const result = validateConfig(config);
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.some((e) => e.includes('numeric')));
    });

    it('should reject poll interval below minimum', () => {
      const config = {
        ...validConfig,
        polling: {
          ...validConfig.polling,
          intervalMs: 1000, // 1 second - too low
        },
      };

      const result = validateConfig(config);
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.some((e) => e.includes('30 seconds')));
    });

    it('should accept valid Slack webhook URL', () => {
      const config = {
        ...validConfig,
        notifications: {
          ...validConfig.notifications,
          slackWebhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
        },
      };

      const result = validateConfig(config);
      assert.strictEqual(result.success, true);
    });

    it('should accept valid log levels', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

      for (const level of levels) {
        const config = {
          ...validConfig,
          logging: {
            ...validConfig.logging,
            level,
          },
        };

        const result = validateConfig(config);
        assert.strictEqual(result.success, true, `Level ${level} should be valid`);
      }
    });

    it('should reject invalid log level', () => {
      const config = {
        ...validConfig,
        logging: {
          ...validConfig.logging,
          level: 'invalid',
        },
      };

      const result = validateConfig(config);
      assert.strictEqual(result.success, false);
    });
  });
});
