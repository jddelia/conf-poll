# Mock Confluence Server - Implementation Plan

## Overview

Build a standalone mock Confluence server that replicates the Confluence REST API endpoints used by conf-poll. This enables testing and development without requiring access to a real Confluence instance.

**Key Principle**: The mock server must be a drop-in replacement - conf-poll should work identically by only changing `CONFLUENCE_BASE_URL` to point to the mock server.

---

## Goals

1. **API Compatibility**: Replicate exact Confluence REST API response structures
2. **Editable Content**: Provide a web UI to create/edit mock page content with tables
3. **Version Tracking**: Auto-increment versions on content changes (like real Confluence)
4. **Persistence**: Store page data in SQLite for persistence across restarts
5. **Simplicity**: Minimal dependencies, easy to run locally

---

## Architecture

```
mock-confluence/
├── server/                    # Backend (Express.js)
│   ├── index.js              # Server entry point
│   ├── routes/
│   │   ├── api.js            # Confluence REST API routes
│   │   └── admin.js          # Admin/UI routes
│   ├── services/
│   │   ├── pageService.js    # Page CRUD operations
│   │   └── versionService.js # Version management
│   ├── db/
│   │   └── database.js       # SQLite setup and queries
│   └── middleware/
│       └── auth.js           # Basic auth validation
├── frontend/                  # Web UI (vanilla HTML/CSS/JS)
│   ├── index.html            # Main editor page
│   ├── styles.css            # Styling
│   └── app.js                # Frontend logic
├── data/                      # SQLite database (gitignored)
├── package.json
└── README.md
```

---

## API Endpoints to Implement

Based on `src/confluence/client.js`, these are the exact endpoints conf-poll uses:

### 1. Get Page with Version (Lightweight Check)

**Real Confluence**:
```
GET /wiki/rest/api/content/{pageId}?expand=version
```

**Expected Response**:
```json
{
  "id": "123456789",
  "type": "page",
  "title": "My Test Page",
  "version": {
    "number": 5,
    "when": "2024-01-15T10:30:00.000Z",
    "by": {
      "displayName": "John Doe",
      "accountId": "abc123"
    },
    "message": ""
  }
}
```

### 2. Get Page with Body Content (Full Fetch)

**Real Confluence**:
```
GET /wiki/rest/api/content/{pageId}?expand=body.storage,version
```

**Expected Response**:
```json
{
  "id": "123456789",
  "type": "page",
  "title": "My Test Page",
  "version": {
    "number": 5,
    "when": "2024-01-15T10:30:00.000Z",
    "by": {
      "displayName": "John Doe",
      "accountId": "abc123"
    },
    "message": ""
  },
  "body": {
    "storage": {
      "value": "<table><tr><th>Name</th><th>Status</th></tr><tr><td>Task 1</td><td>Done</td></tr></table>",
      "representation": "storage"
    }
  }
}
```

### 3. Get Page History

**Real Confluence**:
```
GET /wiki/rest/api/content/{pageId}/history?expand=lastUpdated
```

**Expected Response**:
```json
{
  "lastUpdated": {
    "number": 5,
    "when": "2024-01-15T10:30:00.000Z",
    "by": {
      "displayName": "John Doe",
      "accountId": "abc123"
    },
    "message": ""
  }
}
```

---

## Database Schema

```sql
-- Pages table
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_content TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  version_when TEXT NOT NULL,
  version_by_name TEXT NOT NULL DEFAULT 'Mock User',
  version_by_account_id TEXT NOT NULL DEFAULT 'mock-user-123',
  version_message TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Version history for each page
CREATE TABLE page_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_content TEXT NOT NULL,
  version_when TEXT NOT NULL,
  version_by_name TEXT NOT NULL,
  version_message TEXT DEFAULT '',
  FOREIGN KEY (page_id) REFERENCES pages(id)
);

-- Users for author simulation
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE
);
```

---

## Frontend Features

### Page Editor UI

1. **Page List Sidebar**
   - List all mock pages
   - Create new page button
   - Delete page option

2. **Page Editor Panel**
   - Page title input
   - Rich table editor OR raw HTML textarea (toggle mode)
   - Version message input (optional)
   - Save button (triggers version increment)

3. **Table Builder** (simplified)
   - Add/remove rows
   - Add/remove columns
   - Edit cell content inline
   - Support for header row toggle
   - Preview of generated HTML

4. **User Mention Simulator**
   - Dropdown to add user mentions to cells
   - Generates proper `<ac:link><ri:user>` markup

5. **Status Panel**
   - Current version number
   - Last modified timestamp
   - Quick copy of page ID for testing

---

## Implementation Phases

### Phase 1: Project Setup (30 min)
- [ ] Create `mock-confluence/` directory structure
- [ ] Initialize npm project
- [ ] Install dependencies: express, sql.js, cors, uuid
- [ ] Set up basic Express server
- [ ] Configure CORS for frontend access

### Phase 2: Database Layer (1 hour)
- [ ] Set up sql.js (SQLite in Node.js)
- [ ] Create schema initialization script
- [ ] Implement page CRUD operations
- [ ] Implement version history tracking
- [ ] Add seed data (sample page with table)

### Phase 3: API Routes (1.5 hours)
- [ ] Implement GET `/wiki/rest/api/content/:pageId` with expand parsing
- [ ] Implement GET `/wiki/rest/api/content/:pageId/history`
- [ ] Add Basic Auth middleware (accept any valid format)
- [ ] Match exact Confluence response structure
- [ ] Handle 404 for missing pages
- [ ] Add request logging

### Phase 4: Admin API (1 hour)
- [ ] POST `/admin/pages` - Create page
- [ ] PUT `/admin/pages/:id` - Update page (increments version)
- [ ] DELETE `/admin/pages/:id` - Delete page
- [ ] GET `/admin/pages` - List all pages
- [ ] GET `/admin/users` - List mock users
- [ ] POST `/admin/users` - Create mock user

### Phase 5: Frontend - Basic Structure (1 hour)
- [ ] Create HTML layout with sidebar + editor panels
- [ ] Add CSS styling (clean, simple design)
- [ ] Set up JavaScript module structure
- [ ] Implement API client functions

### Phase 6: Frontend - Page Management (1.5 hours)
- [ ] Load and display page list
- [ ] Create new page functionality
- [ ] Select and load page into editor
- [ ] Delete page with confirmation
- [ ] Show page metadata (ID, version, dates)

### Phase 7: Frontend - Table Editor (2 hours)
- [ ] Build table grid editor component
- [ ] Add row/column management
- [ ] Inline cell editing
- [ ] Header row toggle
- [ ] Generate Confluence-compatible HTML output
- [ ] Raw HTML mode toggle (for advanced users)

### Phase 8: Frontend - User Mentions (1 hour)
- [ ] User dropdown selector
- [ ] Insert user mention at cursor
- [ ] Generate proper AC/RI markup
- [ ] Display user mentions nicely in preview

### Phase 9: Testing & Integration (1 hour)
- [ ] Test with actual conf-poll system
- [ ] Verify version detection works
- [ ] Verify change detection works
- [ ] Test user name extraction
- [ ] Document configuration steps

### Phase 10: Polish (30 min)
- [ ] Add helpful error messages
- [ ] Create README with usage instructions
- [ ] Add sample data script
- [ ] Clean up and finalize

---

## Technical Specifications

### Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "sql.js": "^1.9.0",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  }
}
```

### Server Configuration

```javascript
// Default port
const PORT = process.env.MOCK_CONFLUENCE_PORT || 3001;

// Database path
const DB_PATH = process.env.MOCK_DB_PATH || './data/mock-confluence.db';
```

### Authentication Handling

The mock server should:
1. Accept any Basic Auth header in valid format (`Basic base64(email:token)`)
2. Decode and log the email for debugging
3. Not validate actual credentials (it's a mock)
4. Return 401 if no auth header present (to match real behavior)

```javascript
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Decode for logging but don't validate
  const base64 = authHeader.split(' ')[1];
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [email] = decoded.split(':');

  req.userEmail = email;
  next();
}
```

---

## Confluence HTML Markup Reference

### Basic Table
```html
<table>
  <tr>
    <th>Header 1</th>
    <th>Header 2</th>
  </tr>
  <tr>
    <td>Cell 1</td>
    <td>Cell 2</td>
  </tr>
</table>
```

### User Mention
```html
<ac:link>
  <ri:user ri:userkey="402880824c1234" ri:account-id="5a1234"/>
  <ac:plain-text-link-body><![CDATA[John Doe]]></ac:plain-text-link-body>
</ac:link>
```

### Status Macro
```html
<ac:structured-macro ac:name="status">
  <ac:parameter ac:name="title">IN PROGRESS</ac:parameter>
  <ac:parameter ac:name="colour">Yellow</ac:parameter>
</ac:structured-macro>
```

### Emoticon
```html
<ac:emoticon ac:name="tick"/>
```

---

## Usage with conf-poll

### Configuration

```bash
# .env for conf-poll when using mock server
CONFLUENCE_BASE_URL=http://localhost:3001
CONFLUENCE_EMAIL=test@example.com
CONFLUENCE_API_TOKEN=mock-token
CONFLUENCE_PAGE_ID=mock-page-1
```

Note: The only difference is:
- `CONFLUENCE_BASE_URL` points to mock server
- Email/token can be anything (mock accepts all)
- Page ID must match a page created in mock server

### Workflow

1. Start mock server: `cd mock-confluence && npm start`
2. Open browser to `http://localhost:3001` to access editor UI
3. Create/edit a page with table content
4. Copy the page ID
5. Configure conf-poll with mock server URL and page ID
6. Start conf-poll: `npm start`
7. Edit page content in mock UI to trigger change detection

---

## File Structure Detail

```
mock-confluence/
├── server/
│   ├── index.js                 # Express app setup, starts server
│   ├── routes/
│   │   ├── api.js               # /wiki/rest/api/* routes
│   │   └── admin.js             # /admin/* routes for UI
│   ├── services/
│   │   ├── pageService.js       # Business logic for pages
│   │   └── versionService.js    # Version increment logic
│   ├── db/
│   │   ├── database.js          # sql.js setup, connection
│   │   ├── schema.sql           # Schema definitions
│   │   └── seed.js              # Initial sample data
│   └── middleware/
│       ├── auth.js              # Basic auth handling
│       └── logger.js            # Request logging
├── frontend/
│   ├── index.html               # Main page
│   ├── css/
│   │   └── styles.css           # All styles
│   └── js/
│       ├── app.js               # Main application
│       ├── api.js               # API client
│       ├── pageList.js          # Page list component
│       ├── pageEditor.js        # Page editor component
│       ├── tableEditor.js       # Table builder component
│       └── userMention.js       # User mention helper
├── data/                         # Database storage
│   └── .gitkeep
├── package.json
├── .gitignore
└── README.md
```

---

## Timeline Estimate

| Phase | Description | Time |
|-------|-------------|------|
| 1 | Project Setup | 30 min |
| 2 | Database Layer | 1 hour |
| 3 | API Routes | 1.5 hours |
| 4 | Admin API | 1 hour |
| 5 | Frontend Structure | 1 hour |
| 6 | Page Management | 1.5 hours |
| 7 | Table Editor | 2 hours |
| 8 | User Mentions | 1 hour |
| 9 | Testing | 1 hour |
| 10 | Polish | 30 min |
| **Total** | | **~11 hours** |

**MVP** (Phases 1-6): ~6 hours - Basic working mock with simple text editor
**Full Feature** (All phases): ~11 hours - Complete with table builder and user mentions

---

## Success Criteria

1. **API Compatibility**: conf-poll works without code changes (only config change)
2. **Version Detection**: Saving in UI increments version, triggers poll detection
3. **Change Detection**: Table edits are properly detected and reported
4. **User Parsing**: User mentions work correctly with showUserNames option
5. **Persistence**: Data survives server restart
6. **Usability**: Non-technical users can edit tables through the UI

---

## Future Enhancements

1. **Multiple Pages**: Support for multiple monitored pages
2. **Simulated Delays**: Add configurable latency to mimic real API
3. **Error Simulation**: Toggle to return errors (401, 404, 500, 429)
4. **Rate Limiting**: Simulate Confluence rate limits
5. **Webhook Testing**: Built-in endpoint to receive and display webhook posts
6. **Docker**: Containerize for easy deployment
7. **Import/Export**: Import real Confluence page content, export mock data
