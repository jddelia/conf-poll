# Mock Confluence Server

A complete mock of Confluence REST API for testing the conf-poll system without requiring access to a real Confluence instance.

## Features

- **Drop-in Replacement**: Works with conf-poll by simply changing the base URL
- **Web UI**: Visual editor for creating and editing mock pages with tables
- **Table Builder**: Interactive table editor with add/remove rows/columns
- **User Mentions**: Insert Confluence-style user mentions that conf-poll can parse
- **Version Tracking**: Automatically increments version numbers on save
- **SQLite Persistence**: Data survives server restarts

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload during development
npm run dev
```

The server starts at `http://localhost:3001`

## Usage with conf-poll

1. Start the mock server
2. Open `http://localhost:3001` in your browser
3. Create or edit a page using the web UI
4. Configure conf-poll to use the mock server:

```bash
# .env
CONFLUENCE_BASE_URL=http://localhost:3001
CONFLUENCE_EMAIL=test@example.com
CONFLUENCE_API_TOKEN=any-value
CONFLUENCE_PAGE_ID=123456789
```

5. Start conf-poll and it will poll the mock server exactly like real Confluence

## Sample Data

The server comes with sample data:

- **Page ID**: `123456789` - A sample page with a status tracking table
- **Users**: Alice Johnson, Bob Smith, Charlie Davis

## Web UI Features

### Page Editor

- Create, edit, and delete pages
- Edit page titles
- Add version messages (like commit messages)

### Table Editor

- Add/remove rows and columns
- Toggle header row
- Inline cell editing
- Insert user mentions

### Raw HTML Mode

- Toggle to raw HTML view for advanced editing
- Paste existing Confluence content

## API Endpoints

### Confluence-Compatible API

These endpoints match the real Confluence REST API:

| Endpoint | Description |
|----------|-------------|
| `GET /wiki/rest/api/content/:pageId?expand=version` | Get page with version info |
| `GET /wiki/rest/api/content/:pageId?expand=body.storage,version` | Get page with body content |
| `GET /wiki/rest/api/content/:pageId/history` | Get page history |

### Admin API

These endpoints power the web UI:

| Endpoint | Description |
|----------|-------------|
| `GET /admin/pages` | List all pages |
| `GET /admin/pages/:id` | Get a page |
| `POST /admin/pages` | Create a page |
| `PUT /admin/pages/:id` | Update a page |
| `DELETE /admin/pages/:id` | Delete a page |
| `GET /admin/users` | List all users |
| `POST /admin/users` | Create a user |
| `GET /admin/users/:id/mention` | Get user mention markup |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_CONFLUENCE_PORT` | `3001` | Server port |
| `MOCK_DB_PATH` | `./data/mock-confluence.db` | Database file path |

## Authentication

The mock server accepts any valid Basic Auth credentials. It validates the format but not the actual values, since it's a mock server.

## User Mentions

User mentions are stored in Confluence's XML format:

```html
<ac:link>
  <ri:user ri:userkey="402880824c1001" ri:account-id="5a1234567890"/>
  <ac:plain-text-link-body><![CDATA[Alice Johnson]]></ac:plain-text-link-body>
</ac:link>
```

The conf-poll parser handles this format and extracts user display names.

## Testing Workflow

1. Start mock server: `npm start`
2. Open browser to `http://localhost:3001`
3. Make changes to a page
4. Watch conf-poll detect and report the changes

Each save in the UI increments the page version, which triggers conf-poll's change detection.

## Troubleshooting

### Database Reset

To reset the database and start fresh:

```bash
rm data/mock-confluence.db
npm start
```

### Port Already in Use

Change the port:

```bash
MOCK_CONFLUENCE_PORT=3002 npm start
```

## License

MIT
