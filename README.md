# conf-poll

<div align="center">

**A production-grade Confluence page polling and change detection system**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-62%20passing-brightgreen.svg)](#testing)

*Monitor Confluence tables for changes without webhooks*

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
- [API & Components](#api--components)
- [Change Detection](#change-detection)
- [Notifications](#notifications)
- [Webhook Posting](#webhook-posting)
- [Error Handling](#error-handling)
- [Security](#security)
- [Performance](#performance)
- [Testing](#testing)
- [Extending & Scaling](#extending--scaling)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**conf-poll** solves a common problem: monitoring Confluence pages for changes when you can't use webhooks (local development, restricted network access, or corporate firewall limitations).

Instead of webhooks, conf-poll uses an efficient polling strategy:

1. **Lightweight version checks** - Only 1 API call to check if anything changed
2. **Content fetch on change** - Full page fetch only when version differs
3. **Smart table parsing** - Extracts and normalizes table data
4. **Granular diff detection** - Identifies exactly what changed (rows, cells)
5. **Multi-channel notifications** - Console, Slack, Discord, and extensible

### Why conf-poll?

| Challenge | Solution |
|-----------|----------|
| Can't register webhooks locally | Polling with configurable intervals |
| Don't want to miss changes | Persistent storage survives restarts |
| Need to know *what* changed | Cell-level diff with before/after values |
| Rate limits concern | Version-first strategy minimizes API calls |
| Want notifications | Slack, Discord, and extensible channels |

---

## Features

### Core Functionality

- **Efficient Polling Engine**
  - Version-based change detection (lightweight API calls)
  - Configurable polling intervals (30s to 24h)
  - Automatic pause/resume on errors

- **Table Change Detection**
  - Identifies rows added, removed, and modified
  - Cell-level diff with old/new values
  - Column header context in change reports
  - Configurable column filtering

- **Persistent Storage**
  - SQLite database (pure JavaScript, no native dependencies)
  - Survives application restarts
  - Complete change history with timestamps
  - Automatic history cleanup (configurable retention)

- **Multiple Notification Channels**
  - Console output (always enabled)
  - Slack webhooks with Block Kit formatting
  - Discord webhooks with embeds
  - Extensible notification interface

- **Webhook Posting**
  - Post changed rows to external endpoints
  - Configurable retry with exponential backoff
  - Row deduplication (one post per affected row)
  - Optional metadata in payload

### Production Features

- **Robust Error Handling**
  - Automatic retry with exponential backoff
  - Rate limit detection and respect
  - Consecutive error pause (prevents runaway failures)
  - Graceful degradation

- **Graceful Shutdown**
  - Clean termination on SIGINT/SIGTERM
  - Persists state before exit
  - No data loss on Ctrl+C

- **Structured Logging**
  - JSON and pretty-print formats
  - File and console output
  - Configurable log levels
  - Component-tagged log entries

- **Configuration Validation**
  - Schema-based validation (Zod)
  - Fail-fast on invalid config
  - Helpful error messages
  - Environment variable support

### Developer Experience

- **Full CLI Interface**
  - Interactive commands for all operations
  - Test mode for validation
  - History viewer
  - Status dashboard

- **Comprehensive Test Suite**
  - 62 unit tests covering core modules
  - Node.js built-in test runner
  - No external test framework dependencies

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           conf-poll                                  │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │     CLI      │───▶│    Poller    │◀──▶│   Storage    │          │
│  │   Interface  │    │ Orchestrator │    │   (SQLite)   │          │
│  └──────────────┘    └──────┬───────┘    └──────────────┘          │
│                             │                                        │
│         ┌───────────────────┼───────────────────┐                   │
│         ▼                   ▼                   ▼                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Confluence  │    │    Table     │    │   Change     │          │
│  │    Client    │    │    Parser    │    │  Comparator  │          │
│  └──────┬───────┘    └──────────────┘    └──────┬───────┘          │
│         │                                        │                   │
│         │                                        ▼                   │
│         │                                 ┌──────────────┐          │
│         │                                 │  Notifier    │          │
│         │                                 │ (Multi-chan) │          │
│         │                                 └──────────────┘          │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────┐
│  Confluence API  │
│    (Cloud)       │
└──────────────────┘
```

### Component Overview

| Component | File | Responsibility |
|-----------|------|----------------|
| **CLI** | `src/cli/index.js` | Command-line interface, user interaction |
| **Poller** | `src/poller.js` | Orchestrates polling cycle, coordinates components |
| **Confluence Client** | `src/confluence/client.js` | API communication, auth, retry logic |
| **Table Parser** | `src/confluence/parser.js` | HTML parsing, table extraction |
| **Storage** | `src/storage/store.js` | SQLite persistence, history management |
| **Comparator** | `src/diff/comparator.js` | Change detection, diff generation |
| **Notifier** | `src/notify/notifier.js` | Multi-channel notifications |
| **Webhook Poster** | `src/webhook/poster.js` | Posts row changes to external endpoints |
| **Config** | `src/config/index.js` | Configuration loading and validation |
| **Logger** | `src/utils/logger.js` | Structured logging (Pino) |

### Data Flow

```
1. Poll Triggered (timer or manual)
        │
        ▼
2. Version Check ────────────────────┐
   GET /content/{id}?expand=version  │
        │                            │
        ▼                            │
3. Version Changed? ─── No ──────────┼──▶ Skip, wait for next poll
        │                            │
       Yes                           │
        │                            │
        ▼                            │
4. Fetch Full Content                │
   GET /content/{id}?expand=body     │
        │                            │
        ▼                            │
5. Parse Table HTML                  │
   Extract target table              │
        │                            │
        ▼                            │
6. Compare with Stored State         │
   Generate change report            │
        │                            │
        ▼                            │
7. Changes Detected? ─── No ─────────┘
        │
       Yes
        │
        ├──▶ 8a. Record in History
        │
        ├──▶ 8b. Send Notifications
        │
        └──▶ 8c. Update Stored State
```

---

## Quick Start

```bash
# Clone and install
git clone <your-repo-url>
cd conf-poll
npm install

# Configure (see Configuration section for details)
cp .env.example .env
# Edit .env with your Confluence credentials

# Test your configuration
node src/cli/index.js test

# Start polling
npm start
```

---

## Installation

### Prerequisites

- **Node.js 18+** (uses ES modules and built-in test runner)
- **Confluence Cloud** account with API access
- **Read permissions** on the target page

### Install Dependencies

```bash
npm install
```

### Verify Installation

```bash
# Check Node version
node --version  # Should be 18.0.0 or higher

# Run tests
npm test

# Validate CLI
node src/cli/index.js --help
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

### Required Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `CONFLUENCE_BASE_URL` | Your Atlassian instance URL | `https://company.atlassian.net` |
| `CONFLUENCE_EMAIL` | Your Atlassian account email | `you@company.com` |
| `CONFLUENCE_API_TOKEN` | API token ([create here](https://id.atlassian.com/manage-profile/security/api-tokens)) | `ATATT3xFfGF0...` |
| `CONFLUENCE_PAGE_ID` | Numeric page ID to monitor | `123456789` |

### Optional Settings

#### Polling Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MS` | `300000` (5 min) | Time between polls in milliseconds |
| `MAX_CONSECUTIVE_ERRORS` | `5` | Errors before pausing |
| `ERROR_PAUSE_DURATION_MS` | `900000` (15 min) | Pause duration after max errors |

#### Storage Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/conf-poll.db` | SQLite database location |
| `MAX_HISTORY_ENTRIES` | `1000` | Maximum change history records |

#### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_TO_FILE` | `true` | Write logs to file |
| `LOG_FILE_PATH` | `./logs/conf-poll.log` | Log file location |
| `LOG_PRETTY` | `true` | Pretty-print console logs |

#### Notification Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_DESKTOP_NOTIFICATIONS` | `false` | Desktop notifications (requires additional setup) |
| `SLACK_WEBHOOK_URL` | - | Slack incoming webhook URL |
| `DISCORD_WEBHOOK_URL` | - | Discord webhook URL |

#### Table Parsing Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_TABLE_INDEX` | `0` | Which table to monitor (0-based) |
| `MONITOR_COLUMNS` | - | Comma-separated column indices (empty = all) |
| `IGNORE_HEADER_CHANGES` | `false` | Skip header row in comparison |

#### Webhook Posting Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_ENABLED` | `false` | Enable posting row changes to endpoint |
| `WEBHOOK_ENDPOINT_URL` | - | URL to POST changes to (required if enabled) |
| `WEBHOOK_TIMEOUT_MS` | `10000` | Request timeout in milliseconds |
| `WEBHOOK_MAX_RETRIES` | `3` | Maximum retry attempts on failure |
| `WEBHOOK_RETRY_DELAY_MS` | `1000` | Base delay between retries |
| `WEBHOOK_INCLUDE_METADATA` | `true` | Include page/version metadata in payload |

### Example Configuration

```bash
# Required - Confluence connection
CONFLUENCE_BASE_URL=https://mycompany.atlassian.net
CONFLUENCE_EMAIL=developer@mycompany.com
CONFLUENCE_API_TOKEN=ATATT3xFfGF0abcdef123456789
CONFLUENCE_PAGE_ID=987654321

# Polling - check every 2 minutes
POLL_INTERVAL_MS=120000

# Monitor only columns 0, 2, and 4 (Name, Status, Due Date)
TARGET_TABLE_INDEX=0
MONITOR_COLUMNS=0,2,4

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXX

# Webhook posting (post changed rows to external API)
WEBHOOK_ENABLED=true
WEBHOOK_ENDPOINT_URL=https://api.example.com/row-changes

# Logging
LOG_LEVEL=info
LOG_PRETTY=true
```

### Finding Your Page ID

The page ID is in your Confluence page URL:

```
https://company.atlassian.net/wiki/spaces/SPACE/pages/123456789/Page+Title
                                                  ─────────
                                                  This is your Page ID
```

Or use Page Information:
1. Open the Confluence page
2. Click `...` menu → `Page information`
3. Find the page ID in the URL or on the page

---

## CLI Reference

### `start` - Start Polling

```bash
# Start continuous polling
node src/cli/index.js start

# Run a single poll and exit
node src/cli/index.js start --once

# Enable verbose (debug) logging
node src/cli/index.js start --verbose
```

**Options:**
- `--once`, `-o`: Run single poll and exit
- `--verbose`, `-v`: Enable debug logging

### `test` - Test Configuration

```bash
node src/cli/index.js test
```

Tests:
1. Configuration loading and validation
2. Confluence API connectivity
3. Page access permissions
4. Storage initialization
5. Notification channel connectivity

### `validate` - Validate Configuration

```bash
node src/cli/index.js validate
```

Validates configuration without making network requests. Useful for CI/CD pipelines.

### `history` - View Change History

```bash
# View last 20 changes (default)
node src/cli/index.js history

# View last 100 changes
node src/cli/index.js history --limit 100

# Output as JSON
node src/cli/index.js history --json
```

**Options:**
- `--limit`, `-n`: Number of entries (default: 20)
- `--json`, `-j`: Output as JSON

### `status` - View Current Status

```bash
node src/cli/index.js status
```

Shows:
- Configuration summary
- Storage statistics
- Last known page state
- Last poll time

### `clear` - Clear Stored Data

```bash
# Requires --force flag for safety
node src/cli/index.js clear --force
```

**Warning:** This permanently deletes all stored data including change history.

---

## API & Components

### Confluence Client

```javascript
import { createConfluenceClient } from './confluence/client.js';

const client = createConfluenceClient({
  baseUrl: 'https://company.atlassian.net',
  email: 'user@company.com',
  apiToken: 'your-token',
});

// Get page version (lightweight)
const version = await client.getPageVersion('123456789');
// { number: 42, when: '2024-01-15T10:30:00Z', by: 'John Doe' }

// Get full page content
const page = await client.getPageContent('123456789');
// { id, title, version, body }

// Test connection
const result = await client.testConnection('123456789');
// { success: true, pageTitle: 'My Page' }
```

### Table Parser

```javascript
import { parseTablesFromHtml, extractTable, tableToObjects } from './confluence/parser.js';

// Parse all tables from HTML
const tables = parseTablesFromHtml(htmlContent);

// Extract specific table
const table = extractTable(htmlContent, 0);  // First table

// Convert to array of objects
const rows = tableToObjects(table);
// [{ Name: 'Task 1', Status: 'Complete' }, ...]
```

### Storage Manager

```javascript
import { getStorage } from './storage/store.js';

const storage = await getStorage({ databasePath: './data/db.sqlite' });

// Get/save page state
const state = storage.getPageState('123456789');
storage.savePageState({ pageId, versionNumber, tableData, ... });

// Record and retrieve history
storage.recordChange({ pageId, changeType, changeSummary, ... });
const history = storage.getChangeHistory('123456789', 50);

// Statistics
const stats = storage.getStats();
// { pagesTracked: 1, totalChangeRecords: 42, ... }
```

### Change Comparator

```javascript
import { compareTableData, formatChangeReport } from './diff/comparator.js';

const report = compareTableData(oldData, newData, { headers: ['Name', 'Status'] });
// {
//   hasChanges: true,
//   summary: '2 cell(s) modified, 1 row(s) added',
//   stats: { rowsAdded: 1, rowsRemoved: 0, cellsModified: 2 },
//   cellsModified: [{ row, column, oldValue, newValue, columnHeader }],
//   rowsAdded: [{ row, values }],
//   rowsRemoved: [{ row, values }]
// }

const formatted = formatChangeReport(report);
// Human-readable string output
```

### Notification Manager

```javascript
import { getNotifier } from './notify/notifier.js';

const notifier = getNotifier({
  slackWebhookUrl: 'https://hooks.slack.com/...',
  discordWebhookUrl: 'https://discord.com/api/webhooks/...',
});

// Send to all configured channels
await notifier.notify(message, changeReport, { pageTitle: 'My Page' });

// Test all channels
const results = await notifier.sendTestNotification();
```

### Poller

```javascript
import { createPoller, PollerState } from './poller.js';

const poller = createPoller(config);

// Event handling
poller.on('poll:changed', ({ report, pageTitle, version }) => { ... });
poller.on('poll:unchanged', ({ version }) => { ... });
poller.on('poll:error', ({ error, consecutiveErrors }) => { ... });
poller.on('paused', ({ reason, pauseDuration }) => { ... });

// Control
await poller.start();
await poller.forcePoll();  // Immediate poll
await poller.stop();

// Status
const status = poller.getStatus();
const history = poller.getHistory(50);
```

---

## Change Detection

### Detected Change Types

| Type | Description | Example |
|------|-------------|---------|
| `rows_added` | New rows at end of table | User adds new task row |
| `rows_removed` | Rows deleted from table | User removes completed tasks |
| `cells_modified` | Individual cell values changed | Status: "Pending" → "Complete" |

### Change Report Structure

```javascript
{
  hasChanges: true,
  summary: "2 cell(s) modified, 1 row(s) added",
  totalChanges: 3,
  stats: {
    rowsAdded: 1,
    rowsRemoved: 0,
    cellsModified: 2
  },
  rowsAdded: [
    { type: 'added', row: 5, values: ['Task 6', 'John', 'Pending'] }
  ],
  rowsRemoved: [],
  cellsModified: [
    {
      type: 'modified',
      row: 2,
      column: 1,
      columnHeader: 'Status',
      oldValue: 'In Progress',
      newValue: 'Complete'
    },
    {
      type: 'modified',
      row: 3,
      column: 2,
      columnHeader: 'Assignee',
      oldValue: 'Alice',
      newValue: 'Bob'
    }
  ],
  metadata: {
    oldRowCount: 5,
    newRowCount: 6,
    comparedAt: '2024-01-15T10:30:00.000Z'
  }
}
```

### Console Output Format

```
═══════════════════════════════════════
          CHANGES DETECTED
═══════════════════════════════════════

Summary: 2 cell(s) modified, 1 row(s) added
Total changes: 3

── Rows Added ──
  [Row 6] Task 6 | John | Pending

── Cells Modified ──
  [Row 3, Status]
    "In Progress" → "Complete"
  [Row 4, Assignee]
    "Alice" → "Bob"

═══════════════════════════════════════
```

---

## Notifications

### Console (Always Enabled)

Formatted change reports are always printed to stdout.

### Slack

Rich Block Kit formatted messages:

```
┌─────────────────────────────────────┐
│ 📊 Confluence Table Changed         │
├─────────────────────────────────────┤
│ 📄 **Project Tasks** (v42)          │
│                                     │
│ 🔔 2 cell(s) modified               │
│                                     │
│ Rows Added: 1   Rows Removed: 0     │
│ Cells Modified: 2                   │
│                                     │
│ Sample Changes:                     │
│ • Status (Row 3): `Pending` → `Done`│
├─────────────────────────────────────┤
│ 🤖 Sent by conf-poll                │
└─────────────────────────────────────┘
```

**Setup:**
1. Create Slack App at https://api.slack.com/apps
2. Enable Incoming Webhooks
3. Add webhook to workspace
4. Copy webhook URL to `SLACK_WEBHOOK_URL`

### Discord

Embedded messages with statistics:

```
┌─────────────────────────────────────┐
│ Confluence Table Changed            │
├─────────────────────────────────────┤
│ 📄 Project Tasks (v42)              │
│ 🔔 2 cell(s) modified               │
│                                     │
│ Rows Added    │ Rows Removed        │
│ 1             │ 0                   │
│                                     │
│ Cells Modified                      │
│ 2                                   │
│                                     │
│ Sample Changes                      │
│ **Status** (Row 3): `Pending`→`Done`│
├─────────────────────────────────────┤
│ conf-poll • Today at 10:30 AM       │
└─────────────────────────────────────┘
```

**Setup:**
1. Server Settings → Integrations → Webhooks
2. Create webhook for desired channel
3. Copy URL to `DISCORD_WEBHOOK_URL`

### Adding Custom Notification Channels

Extend `NotificationManager` in `src/notify/notifier.js`:

```javascript
// Add to setupChannels()
if (this.config.customWebhookUrl) {
  this.channels.push({
    name: 'custom',
    send: (message, report) => this.sendToCustom(message, report),
  });
}

// Implement custom sender
async sendToCustom(message, report) {
  await axios.post(this.config.customWebhookUrl, {
    text: message,
    changes: report?.stats,
  });
}
```

---

## Webhook Posting

The webhook posting feature allows you to send changed row data to an external API endpoint when changes are detected. This is useful for triggering workflows, updating external systems, or feeding data into automation pipelines.

### How It Works

1. When a table change is detected, the poller identifies all affected rows
2. Each affected row (added or modified) is posted individually to your endpoint
3. Removed rows are not posted (as the data no longer exists)
4. Multiple cell changes in the same row result in a single POST (deduplication)

### Enabling Webhook Posting

```bash
# In your .env file
WEBHOOK_ENABLED=true
WEBHOOK_ENDPOINT_URL=https://your-api.example.com/row-changes
```

### Payload Format

Each POST request contains:

```javascript
{
  "input": "Column1: Value1 | Column2: Value2 | Column3: Value3"
}
```

The `input` field contains the row data formatted as a pipe-separated string. If column headers are available, values are prefixed with header names.

### Payload with Metadata

When `WEBHOOK_INCLUDE_METADATA=true` (default), additional context is included:

```javascript
{
  "input": "Name: John Doe | Status: Complete | Due: 2024-01-15",
  "_metadata": {
    "pageTitle": "Project Tasks",
    "pageVersion": 42,
    "changeType": "modified",  // "added" or "modified"
    "rowIndex": 3,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "source": "conf-poll"
  }
}
```

### Retry Behavior

| Scenario | Behavior |
|----------|----------|
| Timeout | Retry up to `WEBHOOK_MAX_RETRIES` with exponential backoff |
| 5xx Error | Retry with exponential backoff |
| 429 Rate Limited | Retry with exponential backoff |
| 4xx Client Error | No retry (check endpoint configuration) |
| Network Error | Retry with exponential backoff |

### Example: Posting to n8n Webhook

```bash
WEBHOOK_ENABLED=true
WEBHOOK_ENDPOINT_URL=https://your-n8n-instance.com/webhook/abc123
WEBHOOK_INCLUDE_METADATA=true
```

### Example: Posting to Make (Integromat)

```bash
WEBHOOK_ENABLED=true
WEBHOOK_ENDPOINT_URL=https://hook.make.com/your-webhook-id
WEBHOOK_INCLUDE_METADATA=false  # Make prefers simpler payloads
```

### Programmatic Usage

```javascript
import { getWebhookPoster } from './webhook/poster.js';

const poster = getWebhookPoster({
  enabled: true,
  endpointUrl: 'https://api.example.com/webhook',
  timeoutMs: 10000,
  maxRetries: 3,
});

// Post a single row change
const result = await poster.postRowChange(
  ['John Doe', 'Complete', '2024-01-15'],
  {
    headers: ['Name', 'Status', 'Due Date'],
    metadata: {
      pageTitle: 'Tasks',
      version: 42,
      changeType: 'modified',
      rowIndex: 3,
    },
  }
);

// result: { success: true, response: { status: 200, data: {...} } }
// or: { success: false, error: 'Connection refused' }
```

### Events

The poller emits a `webhook:posted` event after posting:

```javascript
poller.on('webhook:posted', ({ successful, failed, results }) => {
  console.log(`Posted ${successful} rows, ${failed} failures`);
});
```

---

## Error Handling

### Retry Strategy

| Error Type | Retries | Backoff | Notes |
|------------|---------|---------|-------|
| Network errors | 3 | Exponential (1s, 2s, 4s) | Includes timeouts |
| 429 Rate Limited | 3 | Respects `Retry-After` header | May pause longer |
| 5xx Server Error | 3 | Exponential | Confluence issues |
| 401 Unauthorized | 0 | - | Check credentials |
| 404 Not Found | 0 | - | Check page ID |
| 403 Forbidden | 0 | - | Check permissions |

### Consecutive Error Handling

After `MAX_CONSECUTIVE_ERRORS` (default: 5) failures:

1. Polling **pauses** for `ERROR_PAUSE_DURATION_MS` (default: 15 minutes)
2. Warning logged with resume time
3. After pause, **auto-resumes** with reset error counter
4. If errors persist, cycle repeats

### Graceful Shutdown

On SIGINT (Ctrl+C) or SIGTERM:

1. Stop accepting new polls
2. Wait for in-progress poll to complete
3. Persist current state to database
4. Close database connection
5. Exit cleanly

---

## Security

### Credential Protection

- API tokens **never logged** (even at trace level)
- `.env` file in `.gitignore`
- Token validated without exposure in errors

### Network Security

- **HTTPS enforced** for Confluence connections
- HTTP URLs rejected at configuration validation
- TLS certificate verification enabled

### Input Validation

- All configuration validated with Zod schemas
- Page IDs validated as numeric strings
- URLs validated as proper format

### Recommendations

1. **Use dedicated API token** - Don't use your main account token
2. **Read-only access** - Create token with minimal permissions
3. **Rotate tokens** - Periodically regenerate API tokens
4. **Secure .env** - Set restrictive file permissions (`chmod 600 .env`)
5. **Audit logs** - Review log files for unauthorized access attempts

---

## Performance

### Resource Usage

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| Memory | ~50-80 MB | Mostly SQLite and Node.js overhead |
| CPU | <1% idle | Spikes briefly during polls |
| Disk | ~1-10 MB | Database grows with history |
| Network | Minimal | 1-2 API calls per poll |

### Optimization Strategies

1. **Version-first checking** reduces full content fetches by ~90%
2. **SQLite** provides fast local queries without network overhead
3. **Configurable history limit** prevents unbounded storage growth
4. **Efficient HTML parsing** with Cheerio (no browser overhead)

### Scaling Considerations

For monitoring many pages:

```javascript
// Current: Single page
CONFLUENCE_PAGE_ID=123456789

// Future enhancement: Multiple pages
// See "Extending & Scaling" section
```

---

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run specific test file
node --test src/confluence/parser.test.js
```

### Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| Configuration | 8 | Schema validation, error cases |
| Table Parser | 16 | HTML parsing, edge cases |
| Comparator | 17 | Diff detection, formatting, affected rows |
| Webhook Poster | 21 | Payload formatting, error handling, retry logic |
| **Total** | **62** | Core functionality |

### Test Categories

1. **Configuration Tests** (`src/config/config.test.js`)
   - Valid configuration acceptance
   - Invalid URL rejection
   - Email validation
   - Numeric page ID validation
   - Poll interval bounds

2. **Parser Tests** (`src/confluence/parser.test.js`)
   - Simple table parsing
   - Multiple tables
   - Empty/null input handling
   - Colspan/rowspan support
   - Header row detection
   - Text normalization

3. **Comparator Tests** (`src/diff/comparator.test.js`)
   - No change detection
   - Cell modification detection
   - Row addition/removal
   - Initial data handling
   - Report formatting
   - Affected rows extraction and deduplication

4. **Webhook Poster Tests** (`src/webhook/poster.test.js`)
   - Row formatting with/without headers
   - Payload building with metadata
   - URL sanitization for logging
   - Error classification (retryable vs non-retryable)
   - Singleton instance management

---

## Extending & Scaling

### Adding Multiple Page Support

**Current limitation:** Single page monitoring

**Enhancement approach:**

```javascript
// 1. Update config schema (src/config/schema.js)
export const confluenceConfigSchema = z.object({
  // ...existing fields...
  pageIds: z.array(z.string().regex(/^\d+$/)).optional(),
});

// 2. Update poller to iterate pages
async poll() {
  const pageIds = this.config.confluence.pageIds ||
                  [this.config.confluence.pageId];

  for (const pageId of pageIds) {
    await this.pollPage(pageId);
  }
}

// 3. Update storage for multi-page
// Already supports multiple pages via page_id column!
```

### Adding Webhook Output

**Use case:** Push changes to external systems

```javascript
// src/notify/webhook.js
export class WebhookNotifier {
  constructor(webhookUrl, options = {}) {
    this.url = webhookUrl;
    this.method = options.method || 'POST';
    this.headers = options.headers || {};
  }

  async send(changeReport, context) {
    await axios({
      method: this.method,
      url: this.url,
      headers: this.headers,
      data: {
        event: 'confluence.table.changed',
        timestamp: new Date().toISOString(),
        page: context.pageTitle,
        version: context.version,
        changes: changeReport,
      },
    });
  }
}
```

### Database Migration to PostgreSQL

**Use case:** Shared state across instances

```javascript
// Replace sql.js with pg
import pg from 'pg';

export class PostgresStorage {
  constructor(connectionString) {
    this.pool = new pg.Pool({ connectionString });
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS page_state (
        page_id TEXT PRIMARY KEY,
        version_number INTEGER NOT NULL,
        -- ... same schema
      )
    `);
  }

  // Implement same interface as StorageManager
}
```

### Adding REST API

**Use case:** External status queries, integrations

```javascript
// src/api/server.js
import express from 'express';

export function createApiServer(poller) {
  const app = express();

  app.get('/status', (req, res) => {
    res.json(poller.getStatus());
  });

  app.get('/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(poller.getHistory(limit));
  });

  app.post('/poll', async (req, res) => {
    await poller.forcePoll();
    res.json({ success: true });
  });

  return app;
}
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# Create data and logs directories
RUN mkdir -p data logs

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  conf-poll:
    build: .
    environment:
      - CONFLUENCE_BASE_URL=${CONFLUENCE_BASE_URL}
      - CONFLUENCE_EMAIL=${CONFLUENCE_EMAIL}
      - CONFLUENCE_API_TOKEN=${CONFLUENCE_API_TOKEN}
      - CONFLUENCE_PAGE_ID=${CONFLUENCE_PAGE_ID}
      - POLL_INTERVAL_MS=300000
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
```

### Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: conf-poll
spec:
  replicas: 1  # Single replica to avoid duplicate polls
  selector:
    matchLabels:
      app: conf-poll
  template:
    metadata:
      labels:
        app: conf-poll
    spec:
      containers:
      - name: conf-poll
        image: conf-poll:latest
        envFrom:
        - secretRef:
            name: conf-poll-secrets
        volumeMounts:
        - name: data
          mountPath: /app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: conf-poll-data
```

### Horizontal Scaling Considerations

For true horizontal scaling:

1. **Distributed locking** - Use Redis/etcd to prevent duplicate polls
2. **Shared storage** - PostgreSQL instead of SQLite
3. **Queue-based processing** - Kafka/RabbitMQ for change events
4. **Leader election** - Only one instance polls at a time

---

## Troubleshooting

### Common Issues

#### "Configuration validation failed"

```
❌ Configuration validation failed:
  - confluence.baseUrl: CONFLUENCE_BASE_URL must use HTTPS
```

**Solution:** Ensure URL starts with `https://`

#### "Authentication failed"

```
❌ Connection test failed: Authentication failed. Check your email and API token.
```

**Solutions:**
1. Verify email matches your Atlassian account
2. Generate new API token at https://id.atlassian.com/manage-profile/security/api-tokens
3. Ensure no extra whitespace in `.env` values

#### "Page not found"

```
❌ Connection test failed: Page not found. Check the page ID.
```

**Solutions:**
1. Verify page ID is correct (numeric only)
2. Ensure you have access to the page when logged in via browser
3. Check page hasn't been deleted or moved

#### "No table found at specified index"

```
⚠️ No table found at specified index
```

**Solutions:**
1. Verify page contains a table
2. Adjust `TARGET_TABLE_INDEX` (0 = first table)
3. Check if table is inside a macro that hides it from API

#### "Rate limit exceeded"

```
⚠️ Rate limited, waiting before retry
```

**Solutions:**
1. Increase `POLL_INTERVAL_MS` (minimum 60000 recommended)
2. This is auto-handled; the app will retry

### Debug Mode

Enable verbose logging:

```bash
# Via CLI flag
node src/cli/index.js start --verbose

# Via environment
LOG_LEVEL=debug npm start
```

### Log Analysis

```bash
# View recent logs
tail -100 logs/conf-poll.log

# Search for errors
grep -i error logs/conf-poll.log

# Follow logs in real-time
tail -f logs/conf-poll.log
```

### Reset State

If issues persist:

```bash
# Clear all data and start fresh
node src/cli/index.js clear --force

# Or manually delete database
rm data/conf-poll.db
```

---

## Contributing

### Development Setup

```bash
# Clone repository
git clone <repo-url>
cd conf-poll

# Install dependencies
npm install

# Create development config
cp .env.example .env
# Edit .env with test Confluence page

# Run in development mode (auto-reload)
npm run dev
```

### Code Style

- ES Modules (import/export)
- JSDoc comments for public APIs
- Consistent error handling patterns
- Structured logging with context

### Pull Request Process

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes
4. Add/update tests
5. Run test suite (`npm test`)
6. Commit changes (`git commit -m 'Add amazing feature'`)
7. Push branch (`git push origin feature/amazing-feature`)
8. Open Pull Request

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(notifications): add Microsoft Teams support`
- `fix(parser): handle empty table cells correctly`
- `docs(readme): add Docker deployment section`

---

## Project Structure

```
conf-poll/
├── src/
│   ├── index.js              # Application entry point
│   ├── poller.js             # Polling orchestrator
│   ├── cli/
│   │   └── index.js          # CLI commands
│   ├── config/
│   │   ├── index.js          # Config loader
│   │   ├── schema.js         # Zod schemas
│   │   └── config.test.js    # Config tests
│   ├── confluence/
│   │   ├── client.js         # API client
│   │   ├── parser.js         # Table parser
│   │   └── parser.test.js    # Parser tests
│   ├── storage/
│   │   └── store.js          # SQLite storage
│   ├── diff/
│   │   ├── comparator.js     # Change detection
│   │   └── comparator.test.js# Comparator tests
│   ├── notify/
│   │   └── notifier.js       # Notifications
│   ├── webhook/
│   │   ├── poster.js         # Webhook posting
│   │   └── poster.test.js    # Webhook tests
│   └── utils/
│       └── logger.js         # Pino logger
├── data/                      # SQLite database (gitignored)
├── logs/                      # Log files (gitignored)
├── plans/                     # Planning documents
│   ├── brainstorm.md         # Options analysis
│   ├── implementation-plan.md# Technical plan
│   └── user-requirements.md  # Setup guide
├── .env.example              # Config template
├── .gitignore
├── package.json
└── README.md
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Cheerio](https://cheerio.js.org/) - HTML parsing
- [Pino](https://getpino.io/) - Structured logging
- [Zod](https://zod.dev/) - Schema validation
- [sql.js](https://sql.js.org/) - SQLite in JavaScript
- [Axios](https://axios-http.com/) - HTTP client

---

<div align="center">

**Built with care for the Confluence community**

[Report Bug](../../issues) · [Request Feature](../../issues) · [Documentation](plans/user-requirements.md)

</div>
