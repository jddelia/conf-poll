/**
 * Configuration Schema Definitions
 *
 * Uses Zod for runtime validation and type safety.
 * All configuration values are validated at startup.
 */

import { z } from 'zod';

/**
 * Confluence connection configuration schema
 */
export const confluenceConfigSchema = z.object({
  baseUrl: z
    .string()
    .url('CONFLUENCE_BASE_URL must be a valid URL')
    .refine(
      (url) => {
        // Allow HTTP for localhost (mock server/development)
        const isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
        // Require HTTPS for all other URLs
        return isLocalhost || url.startsWith('https://');
      },
      'CONFLUENCE_BASE_URL must use HTTPS for security (HTTP allowed for localhost only)'
    ),
  email: z
    .string()
    .email('CONFLUENCE_EMAIL must be a valid email address'),
  apiToken: z
    .string()
    .min(1, 'CONFLUENCE_API_TOKEN is required')
    .refine(
      (token) => !token.includes(' '),
      'CONFLUENCE_API_TOKEN should not contain spaces'
    ),
  pageId: z
    .string()
    .min(1, 'CONFLUENCE_PAGE_ID is required')
    .refine(
      (id) => /^\d+$/.test(id),
      'CONFLUENCE_PAGE_ID must be a numeric string'
    ),
});

/**
 * Polling configuration schema
 */
export const pollingConfigSchema = z.object({
  intervalMs: z
    .number()
    .int()
    .min(30000, 'Poll interval must be at least 30 seconds to respect rate limits')
    .max(86400000, 'Poll interval cannot exceed 24 hours')
    .default(300000),
  maxConsecutiveErrors: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5),
  errorPauseDurationMs: z
    .number()
    .int()
    .min(60000, 'Error pause must be at least 1 minute')
    .max(3600000, 'Error pause cannot exceed 1 hour')
    .default(900000),
});

/**
 * Storage configuration schema
 */
export const storageConfigSchema = z.object({
  databasePath: z
    .string()
    .min(1)
    .default('./data/conf-poll.db'),
  maxHistoryEntries: z
    .number()
    .int()
    .min(10)
    .max(100000)
    .default(1000),
});

/**
 * Logging configuration schema
 */
export const loggingConfigSchema = z.object({
  level: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  toFile: z.boolean().default(true),
  filePath: z.string().default('./logs/conf-poll.log'),
  pretty: z.boolean().default(true),
});

/**
 * Notification configuration schema
 */
export const notificationConfigSchema = z.object({
  enableDesktop: z.boolean().default(false),
  slackWebhookUrl: z
    .string()
    .url()
    .optional()
    .nullable(),
  discordWebhookUrl: z
    .string()
    .url()
    .optional()
    .nullable(),
});

/**
 * Webhook posting configuration schema
 * For posting row changes to external endpoints
 */
export const webhookConfigSchema = z.object({
  enabled: z.boolean().default(false),
  endpointUrl: z
    .string()
    .url('WEBHOOK_ENDPOINT_URL must be a valid URL')
    .optional()
    .nullable(),
  timeoutMs: z
    .number()
    .int()
    .min(1000, 'Webhook timeout must be at least 1 second')
    .max(60000, 'Webhook timeout cannot exceed 60 seconds')
    .default(10000),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(3),
  retryDelayMs: z
    .number()
    .int()
    .min(100)
    .max(30000)
    .default(1000),
  includeMetadata: z.boolean().default(true),
}).refine(
  (config) => {
    // If enabled, endpoint URL must be provided
    if (config.enabled && !config.endpointUrl) {
      return false;
    }
    return true;
  },
  {
    message: 'WEBHOOK_ENDPOINT_URL is required when WEBHOOK_ENABLED is true',
    path: ['endpointUrl'],
  }
);

/**
 * Table parsing configuration schema
 */
export const tableConfigSchema = z.object({
  targetTableIndex: z
    .number()
    .int()
    .min(0)
    .default(0),
  monitorColumns: z
    .array(z.number().int().min(0))
    .optional()
    .default([]),
  ignoreHeaderChanges: z.boolean().default(false),
  showUserNames: z.boolean().default(true),
});

/**
 * Complete application configuration schema
 */
export const appConfigSchema = z.object({
  confluence: confluenceConfigSchema,
  polling: pollingConfigSchema,
  storage: storageConfigSchema,
  logging: loggingConfigSchema,
  notifications: notificationConfigSchema,
  table: tableConfigSchema,
  webhook: webhookConfigSchema,
});

/**
 * Type definitions for TypeScript-like autocompletion in IDEs
 * @typedef {z.infer<typeof appConfigSchema>} AppConfig
 * @typedef {z.infer<typeof confluenceConfigSchema>} ConfluenceConfig
 * @typedef {z.infer<typeof pollingConfigSchema>} PollingConfig
 * @typedef {z.infer<typeof storageConfigSchema>} StorageConfig
 * @typedef {z.infer<typeof loggingConfigSchema>} LoggingConfig
 * @typedef {z.infer<typeof notificationConfigSchema>} NotificationConfig
 * @typedef {z.infer<typeof tableConfigSchema>} TableConfig
 * @typedef {z.infer<typeof webhookConfigSchema>} WebhookConfig
 */
