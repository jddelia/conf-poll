/**
 * Notification System
 *
 * Handles various notification channels:
 * - Console output
 * - Slack webhooks
 * - Discord webhooks
 * - Desktop notifications (optional)
 */

import axios from 'axios';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger({ component: 'notifier' });

/**
 * Notification manager class
 */
export class NotificationManager {
  /**
   * @param {object} config - Notification configuration
   */
  constructor(config) {
    this.config = config;
    this.channels = [];
    this.setupChannels();
  }

  /**
   * Setup notification channels based on config
   */
  setupChannels() {
    // Console is always enabled
    this.channels.push({
      name: 'console',
      send: (message) => this.sendToConsole(message),
    });

    // Slack webhook
    if (this.config.slackWebhookUrl) {
      this.channels.push({
        name: 'slack',
        send: (message, report) => this.sendToSlack(message, report),
      });
      logger.info('Slack notifications enabled');
    }

    // Discord webhook
    if (this.config.discordWebhookUrl) {
      this.channels.push({
        name: 'discord',
        send: (message, report) => this.sendToDiscord(message, report),
      });
      logger.info('Discord notifications enabled');
    }

    logger.info(
      { channels: this.channels.map((c) => c.name) },
      'Notification channels configured'
    );
  }

  /**
   * Send notification to all configured channels
   * @param {string} message - Notification message
   * @param {object} [report] - Full change report (for rich formatting)
   * @param {object} [context] - Additional context
   */
  async notify(message, report = null, context = {}) {
    if (!message) {
      return;
    }

    const results = await Promise.allSettled(
      this.channels.map((channel) =>
        channel.send(message, report, context).catch((error) => {
          logger.error(
            { channel: channel.name, error: error.message },
            'Failed to send notification'
          );
          throw error;
        })
      )
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn(
        { failureCount: failures.length },
        'Some notifications failed to send'
      );
    }
  }

  /**
   * Send to console (always enabled)
   * @param {string} message - Message to display
   */
  async sendToConsole(message) {
    console.log('\n' + message + '\n');
  }

  /**
   * Send to Slack webhook
   * @param {string} message - Plain text message
   * @param {object} report - Change report for rich formatting
   */
  async sendToSlack(message, report = null) {
    const blocks = this.formatSlackBlocks(message, report);

    try {
      await axios.post(
        this.config.slackWebhookUrl,
        {
          text: message,
          blocks,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );
      logger.debug('Slack notification sent');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to send Slack notification');
      throw error;
    }
  }

  /**
   * Format Slack block kit message
   * @param {string} message - Plain message
   * @param {object} report - Change report
   * @returns {object[]} Slack blocks
   */
  formatSlackBlocks(message, report) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Confluence Table Changed',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ];

    if (report && report.hasChanges) {
      // Add stats section
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Rows Added:* ${report.stats.rowsAdded}`,
          },
          {
            type: 'mrkdwn',
            text: `*Rows Removed:* ${report.stats.rowsRemoved}`,
          },
          {
            type: 'mrkdwn',
            text: `*Cells Modified:* ${report.stats.cellsModified}`,
          },
          {
            type: 'mrkdwn',
            text: `*Detected At:* ${new Date().toLocaleString()}`,
          },
        ],
      });

      // Add sample changes
      if (report.cellsModified.length > 0) {
        const sampleChanges = report.cellsModified
          .slice(0, 5)
          .map(
            (c) =>
              `• *${c.columnHeader}* (Row ${c.row + 1}): \`${c.oldValue}\` → \`${c.newValue}\``
          )
          .join('\n');

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sample Changes:*\n${sampleChanges}`,
          },
        });
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '🤖 Sent by conf-poll',
        },
      ],
    });

    return blocks;
  }

  /**
   * Send to Discord webhook
   * @param {string} message - Plain text message
   * @param {object} report - Change report for rich formatting
   */
  async sendToDiscord(message, report = null) {
    const embed = this.formatDiscordEmbed(message, report);

    try {
      await axios.post(
        this.config.discordWebhookUrl,
        {
          content: '📊 **Confluence Table Update**',
          embeds: [embed],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );
      logger.debug('Discord notification sent');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to send Discord notification');
      throw error;
    }
  }

  /**
   * Format Discord embed message
   * @param {string} message - Plain message
   * @param {object} report - Change report
   * @returns {object} Discord embed
   */
  formatDiscordEmbed(message, report) {
    const embed = {
      title: 'Confluence Table Changed',
      description: message,
      color: 0x0052cc, // Confluence blue
      timestamp: new Date().toISOString(),
      footer: {
        text: 'conf-poll',
      },
      fields: [],
    };

    if (report && report.hasChanges) {
      embed.fields.push(
        {
          name: 'Rows Added',
          value: String(report.stats.rowsAdded),
          inline: true,
        },
        {
          name: 'Rows Removed',
          value: String(report.stats.rowsRemoved),
          inline: true,
        },
        {
          name: 'Cells Modified',
          value: String(report.stats.cellsModified),
          inline: true,
        }
      );

      // Add sample changes
      if (report.cellsModified.length > 0) {
        const sampleChanges = report.cellsModified
          .slice(0, 3)
          .map(
            (c) =>
              `**${c.columnHeader}** (Row ${c.row + 1}): \`${c.oldValue}\` → \`${c.newValue}\``
          )
          .join('\n');

        embed.fields.push({
          name: 'Sample Changes',
          value: sampleChanges || 'N/A',
          inline: false,
        });
      }
    }

    return embed;
  }

  /**
   * Send a test notification to verify configuration
   * @returns {Promise<object>} Test results
   */
  async sendTestNotification() {
    const testMessage = '🔔 Test notification from conf-poll - Configuration verified!';

    const results = {
      timestamp: new Date().toISOString(),
      channels: {},
    };

    for (const channel of this.channels) {
      try {
        await channel.send(testMessage, null, { test: true });
        results.channels[channel.name] = { success: true };
      } catch (error) {
        results.channels[channel.name] = {
          success: false,
          error: error.message,
        };
      }
    }

    return results;
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create notification manager
 * @param {object} config - Notification configuration
 * @returns {NotificationManager}
 */
export function getNotifier(config) {
  if (!instance) {
    instance = new NotificationManager(config);
  }
  return instance;
}

/**
 * Reset notifier instance (for testing)
 */
export function resetNotifier() {
  instance = null;
}

export default { NotificationManager, getNotifier, resetNotifier };
