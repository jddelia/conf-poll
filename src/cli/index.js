#!/usr/bin/env node

/**
 * Conf-Poll CLI
 *
 * Command-line interface for the Confluence polling system.
 * Provides commands for:
 * - Starting/stopping the poller
 * - Testing configuration
 * - Viewing history
 * - Manual polling
 */

import { Command } from 'commander';
import { loadConfig, validateConfig } from '../config/index.js';
import { createLogger, getLogger } from '../utils/logger.js';
import { createConfluenceClient } from '../confluence/client.js';
import { createPoller } from '../poller.js';
import { getStorage } from '../storage/store.js';
import { getNotifier } from '../notify/notifier.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('conf-poll')
  .description('Confluence page polling and change detection system')
  .version(packageJson.version);

/**
 * Start command - main polling operation
 */
program
  .command('start')
  .description('Start polling the configured Confluence page')
  .option('-o, --once', 'Run a single poll and exit')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      const config = loadConfig();

      if (options.verbose) {
        config.logging.level = 'debug';
      }

      createLogger(config.logging);
      const logger = getLogger();

      const poller = createPoller(config);

      if (options.once) {
        logger.info('Running single poll');
        await poller.initialize();
        await poller.poll();
        await poller.stop();
        logger.info('Single poll complete');
      } else {
        // Import and run main application
        const { Application } = await import('../index.js');
        const app = new Application();
        await app.initialize();
        await app.start();
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Test command - verify configuration and connectivity
 */
program
  .command('test')
  .description('Test configuration and Confluence connectivity')
  .action(async () => {
    console.log('\n🔍 Testing conf-poll configuration...\n');

    try {
      // Step 1: Load config
      console.log('1. Loading configuration...');
      const config = loadConfig();
      console.log('   ✅ Configuration loaded\n');

      // Step 2: Test Confluence connection
      console.log('2. Testing Confluence connection...');
      const client = createConfluenceClient(config.confluence);
      const result = await client.testConnection(config.confluence.pageId);

      if (result.success) {
        console.log(`   ✅ Connected successfully`);
        console.log(`   📄 Page: "${result.pageTitle}"\n`);
      } else {
        console.log(`   ❌ Connection failed: ${result.error}\n`);
        process.exit(1);
      }

      // Step 3: Test storage
      console.log('3. Testing storage...');
      const storage = await getStorage(config.storage);
      const stats = storage.getStats();
      console.log('   ✅ Storage initialized');
      console.log(`   📊 ${stats.pagesTracked} pages tracked, ${stats.totalChangeRecords} changes recorded\n`);

      // Step 4: Test notifications
      console.log('4. Testing notifications...');
      const notifier = getNotifier(config.notifications);
      const notifyResult = await notifier.sendTestNotification();

      for (const [channel, status] of Object.entries(notifyResult.channels)) {
        if (status.success) {
          console.log(`   ✅ ${channel}: OK`);
        } else {
          console.log(`   ❌ ${channel}: ${status.error}`);
        }
      }

      console.log('\n✅ All tests passed! Configuration is valid.\n');

      // Close storage
      storage.close();

    } catch (error) {
      console.error(`\n❌ Test failed: ${error.message}\n`);
      process.exit(1);
    }
  });

/**
 * Validate command - check configuration without connecting
 */
program
  .command('validate')
  .description('Validate configuration file without connecting')
  .action(() => {
    console.log('\n🔍 Validating configuration...\n');

    try {
      const config = loadConfig();

      console.log('✅ Configuration is valid!\n');
      console.log('Configuration summary:');
      console.log(`  Confluence URL:   ${config.confluence.baseUrl}`);
      console.log(`  Page ID:          ${config.confluence.pageId}`);
      console.log(`  Poll Interval:    ${config.polling.intervalMs / 1000}s`);
      console.log(`  Table Index:      ${config.table.targetTableIndex}`);
      console.log(`  Log Level:        ${config.logging.level}`);

      if (config.notifications.slackWebhookUrl) {
        console.log('  Slack:            Configured');
      }
      if (config.notifications.discordWebhookUrl) {
        console.log('  Discord:          Configured');
      }

      console.log('');

    } catch (error) {
      console.error(`❌ Validation failed:\n${error.message}\n`);
      process.exit(1);
    }
  });

/**
 * History command - view change history
 */
program
  .command('history')
  .description('View change history for the monitored page')
  .option('-n, --limit <number>', 'Number of entries to show', '20')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const storage = await getStorage(config.storage);

      const history = storage.getChangeHistory(
        config.confluence.pageId,
        parseInt(options.limit, 10)
      );

      if (options.json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        if (history.length === 0) {
          console.log('\nNo change history found.\n');
        } else {
          console.log(`\n📜 Change History (last ${history.length} entries)\n`);
          console.log('─'.repeat(70));

          for (const entry of history) {
            console.log(`\n📅 ${new Date(entry.detectedAt).toLocaleString()}`);
            console.log(`   Version: ${entry.oldVersion || '?'} → ${entry.newVersion}`);
            console.log(`   Type: ${entry.changeType}`);
            console.log(`   Summary: ${entry.changeSummary}`);
          }

          console.log('\n' + '─'.repeat(70) + '\n');
        }
      }

      storage.close();

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Status command - show current status
 */
program
  .command('status')
  .description('Show storage and configuration status')
  .action(async () => {
    try {
      const config = loadConfig();
      const storage = await getStorage(config.storage);

      const stats = storage.getStats();
      const pageState = storage.getPageState(config.confluence.pageId);

      console.log('\n📊 Conf-Poll Status\n');
      console.log('─'.repeat(50));

      console.log('\nConfiguration:');
      console.log(`  Page ID:       ${config.confluence.pageId}`);
      console.log(`  Poll Interval: ${config.polling.intervalMs / 1000}s`);
      console.log(`  Database:      ${config.storage.databasePath}`);

      console.log('\nStorage:');
      console.log(`  Pages Tracked:   ${stats.pagesTracked}`);
      console.log(`  Change Records:  ${stats.totalChangeRecords}`);

      if (pageState) {
        console.log('\nLast Known State:');
        console.log(`  Page Title:    ${pageState.pageTitle}`);
        console.log(`  Version:       ${pageState.versionNumber}`);
        console.log(`  Last Modified: ${pageState.versionWhen}`);
        console.log(`  Modified By:   ${pageState.versionBy}`);
        console.log(`  Last Checked:  ${pageState.lastChecked}`);
      } else {
        console.log('\nNo state recorded for this page yet.');
      }

      console.log('\n' + '─'.repeat(50) + '\n');

      storage.close();

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Clear command - clear stored data
 */
program
  .command('clear')
  .description('Clear all stored data (use with caution)')
  .option('-f, --force', 'Skip confirmation')
  .action(async (options) => {
    if (!options.force) {
      console.log('\n⚠️  This will delete all stored data including change history.');
      console.log('   Use --force to confirm.\n');
      process.exit(1);
    }

    try {
      const config = loadConfig();
      const storage = await getStorage(config.storage);

      storage.clearAll();
      console.log('\n✅ All data cleared.\n');

      storage.close();

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
