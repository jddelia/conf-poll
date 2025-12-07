# Implementation Plan: Confluence Page Polling

## Overview
Build a Node.js application that polls a Confluence Cloud page at regular intervals, detects changes to table data, and reports/logs those changes.

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 18+ | Application runtime |
| HTTP Client | axios or node-fetch | API requests |
| HTML Parser | cheerio | Parse table from page body |
| Diff Library | deep-diff or fast-deep-equal | Compare table states |
| Storage | SQLite (better-sqlite3) or JSON file | Persist state |
| Scheduler | node-cron or setInterval | Polling intervals |
| Config | dotenv | Environment variables |
| Logging | pino or console | Structured logging |

---

## Project Structure

```
conf-poll/
├── plans/                    # Planning documents
├── src/
│   ├── index.js             # Entry point
│   ├── config.js            # Configuration loader
│   ├── confluence/
│   │   ├── client.js        # Confluence API client
│   │   └── parser.js        # Table HTML parser
│   ├── storage/
│   │   └── store.js         # Local state storage
│   ├── diff/
│   │   └── comparator.js    # Change detection logic
│   └── notify/
│       └── notifier.js      # Change notifications
├── data/                     # Local storage (gitignored)
├── .env.example             # Environment template
├── .env                     # Local config (gitignored)
├── package.json
└── README.md
```

---

## Implementation Phases

### Phase 1: Project Setup (30 min)
- [ ] Initialize npm project
- [ ] Install dependencies
- [ ] Set up project structure
- [ ] Create .env configuration
- [ ] Set up basic logging

### Phase 2: Confluence API Client (1-2 hours)
- [ ] Implement authentication (API token + Basic Auth)
- [ ] Create function to fetch page metadata (version check)
- [ ] Create function to fetch page content
- [ ] Handle rate limiting and errors
- [ ] Test API connectivity

### Phase 3: Table Parser (1-2 hours)
- [ ] Parse page body HTML using cheerio
- [ ] Extract table(s) from page content
- [ ] Convert table to structured JSON format
- [ ] Handle edge cases (merged cells, nested content, macros)
- [ ] Unit test parser with sample data

### Phase 4: Local Storage (1 hour)
- [ ] Implement storage interface
- [ ] Store last known page version
- [ ] Store last known table data (JSON)
- [ ] Store change history log
- [ ] Handle first-run scenario (no previous data)

### Phase 5: Change Detection (1 hour)
- [ ] Compare current vs stored table data
- [ ] Identify specific changes:
  - Rows added
  - Rows removed
  - Cells modified
- [ ] Generate human-readable change summary
- [ ] Test with sample data variations

### Phase 6: Polling Loop (30 min)
- [ ] Implement configurable polling interval
- [ ] Version check first (lightweight)
- [ ] Full content fetch only on version change
- [ ] Graceful error handling
- [ ] Clean shutdown handling

### Phase 7: Notifications (30 min - 1 hour)
- [ ] Console output for changes
- [ ] Optional: Desktop notifications (node-notifier)
- [ ] Optional: Write changes to log file
- [ ] Optional: Slack/Discord webhook

### Phase 8: Testing & Polish (1 hour)
- [ ] End-to-end testing
- [ ] Error scenario testing
- [ ] Documentation
- [ ] Example configuration

---

## Detailed Implementation Notes

### Authentication Setup

```javascript
// .env
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
CONFLUENCE_PAGE_ID=123456789
POLL_INTERVAL_MS=300000  // 5 minutes
```

```javascript
// Basic Auth header
const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Accept': 'application/json'
};
```

### API Client Implementation

```javascript
// confluence/client.js
async function getPageVersion(pageId) {
  const response = await axios.get(
    `${baseUrl}/wiki/rest/api/content/${pageId}?expand=version`,
    { headers }
  );
  return {
    version: response.data.version.number,
    lastModified: response.data.version.when,
    modifiedBy: response.data.version.by.displayName
  };
}

async function getPageContent(pageId) {
  const response = await axios.get(
    `${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage,version`,
    { headers }
  );
  return {
    version: response.data.version.number,
    body: response.data.body.storage.value
  };
}
```

### Table Parser Implementation

```javascript
// confluence/parser.js
const cheerio = require('cheerio');

function parseTable(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const tables = [];

  $('table').each((tableIndex, table) => {
    const rows = [];
    $(table).find('tr').each((rowIndex, row) => {
      const cells = [];
      $(row).find('th, td').each((cellIndex, cell) => {
        cells.push({
          text: $(cell).text().trim(),
          isHeader: cell.tagName === 'th'
        });
      });
      rows.push(cells);
    });
    tables.push({ index: tableIndex, rows });
  });

  return tables;
}
```

### Change Detection Logic

```javascript
// diff/comparator.js
function compareTableData(oldData, newData) {
  const changes = [];

  // Compare row counts
  if (oldData.rows.length !== newData.rows.length) {
    changes.push({
      type: oldData.rows.length < newData.rows.length ? 'rows_added' : 'rows_removed',
      count: Math.abs(newData.rows.length - oldData.rows.length)
    });
  }

  // Compare individual cells
  const minRows = Math.min(oldData.rows.length, newData.rows.length);
  for (let i = 0; i < minRows; i++) {
    const oldRow = oldData.rows[i];
    const newRow = newData.rows[i];
    const minCells = Math.min(oldRow.length, newRow.length);

    for (let j = 0; j < minCells; j++) {
      if (oldRow[j].text !== newRow[j].text) {
        changes.push({
          type: 'cell_modified',
          row: i,
          column: j,
          oldValue: oldRow[j].text,
          newValue: newRow[j].text
        });
      }
    }
  }

  return changes;
}
```

### Polling Loop

```javascript
// index.js
const cron = require('node-cron');

let lastKnownVersion = null;

async function poll() {
  try {
    // Step 1: Check version (lightweight)
    const versionInfo = await getPageVersion(pageId);

    if (lastKnownVersion === versionInfo.version) {
      console.log(`No changes (version ${versionInfo.version})`);
      return;
    }

    // Step 2: Version changed, fetch full content
    console.log(`Version changed: ${lastKnownVersion} -> ${versionInfo.version}`);
    const content = await getPageContent(pageId);

    // Step 3: Parse table
    const tables = parseTable(content.body);

    // Step 4: Compare with stored data
    const storedData = await storage.getTableData();
    if (storedData) {
      const changes = compareTableData(storedData, tables[0]);
      if (changes.length > 0) {
        await notifyChanges(changes);
      }
    }

    // Step 5: Update storage
    await storage.saveTableData(tables[0]);
    lastKnownVersion = versionInfo.version;

  } catch (error) {
    console.error('Poll failed:', error.message);
  }
}

// Start polling
setInterval(poll, config.pollIntervalMs);
poll(); // Initial poll
```

---

## Dependencies (package.json)

```json
{
  "name": "conf-poll",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "dotenv": "^16.3.0",
    "deep-diff": "^1.0.2",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

## Error Handling Strategy

1. **Network Errors**: Retry with exponential backoff (max 3 attempts)
2. **401 Unauthorized**: Log error, prompt to check credentials
3. **404 Not Found**: Log error, prompt to check page ID
4. **429 Rate Limited**: Pause polling, resume after retry-after header
5. **Parse Errors**: Log error, skip this poll cycle, retain last known data

---

## Testing Checklist

- [ ] API authentication works
- [ ] Page metadata fetch works
- [ ] Page content fetch works
- [ ] Table parsing extracts correct data
- [ ] Change detection identifies:
  - [ ] New rows
  - [ ] Removed rows
  - [ ] Modified cells
- [ ] Storage persists between restarts
- [ ] Polling continues after errors
- [ ] Graceful shutdown (Ctrl+C)

---

## Future Enhancements

1. **Web Dashboard**: Simple UI to view change history
2. **Multiple Pages**: Configure array of pages to monitor
3. **Specific Column Monitoring**: Only alert on changes to certain columns
4. **Change Filtering**: Ignore certain types of changes
5. **API Mode**: Expose REST API for external integrations
6. **Docker**: Containerize for easy deployment

---

## Getting Started (After Implementation)

```bash
# 1. Clone and install
cd conf-poll
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your Confluence details

# 3. Run
npm start
```

---

## Timeline Estimate

| Phase | Time |
|-------|------|
| Setup | 30 min |
| API Client | 1.5 hours |
| Parser | 1.5 hours |
| Storage | 1 hour |
| Diff | 1 hour |
| Polling | 30 min |
| Notifications | 45 min |
| Testing | 1 hour |
| **Total** | **~8 hours** |

MVP (phases 1-6) can be completed in ~5-6 hours.
