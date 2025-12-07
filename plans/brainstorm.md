# Confluence Page Polling - Brainstorm Notes

## Problem Statement
- Need to detect changes to a Confluence Cloud page (specifically table data)
- Local application cannot receive webhooks (no public endpoint)
- Must work with Node.js

## Constraints
- Confluence Cloud (not self-hosted)
- Local development environment
- No webhook registration possible
- Table data is the primary focus

---

## Options Evaluated

### Option 1: Full Content Polling & Comparison
**Approach**: Fetch entire page content on each poll, compare with stored version

**Pros**:
- Simple implementation
- Guaranteed to catch all changes

**Cons**:
- Heavy on API usage
- Inefficient for large pages
- More processing required each poll

**Verdict**: Works but inefficient

---

### Option 2: Version-Based Polling (RECOMMENDED)
**Approach**:
1. Poll page metadata (includes version number and lastModified)
2. Only fetch full content when version changes
3. Parse and compare table data

**Pros**:
- Lightweight metadata checks
- Only fetches content when needed
- Confluence tracks versions natively
- Can use `/wiki/rest/api/content/{id}?expand=version` for minimal payload

**Cons**:
- Still polling (inherent delay)
- Must handle API rate limits

**Verdict**: Best balance of efficiency and simplicity

---

### Option 3: Metadata-Only Polling
**Approach**: Only check `lastModified` timestamp, never store content

**Pros**:
- Minimal API usage
- Very fast checks

**Cons**:
- Can only tell IF something changed, not WHAT
- Still need to fetch content to see actual changes

**Verdict**: Good for notifications, not for tracking specific changes

---

### Option 4: Cloud Proxy with Webhooks
**Approach**: Deploy serverless function (AWS Lambda, Cloudflare Worker) to receive webhooks, local app polls the proxy

**Pros**:
- Near real-time updates
- Proper event-driven architecture
- Reduces Confluence API calls

**Cons**:
- Requires cloud infrastructure
- Additional complexity and cost
- Webhook registration still needed (just to a different endpoint)

**Verdict**: Overkill for this use case, but good for production scale

---

### Option 5: Browser Extension / Userscript
**Approach**: Browser extension monitors page and sends changes to local server

**Pros**:
- Real-time when page is open
- No API authentication needed

**Cons**:
- Requires browser to be open on the page
- Not reliable for background monitoring

**Verdict**: Not suitable for automated monitoring

---

## Recommended Architecture: Version-Based Polling

```
┌─────────────────┐     Poll every N minutes    ┌──────────────────┐
│                 │ ─────────────────────────▶  │                  │
│  Node.js App    │                             │  Confluence API  │
│                 │ ◀─────────────────────────  │                  │
└────────┬────────┘    Page version/content     └──────────────────┘
         │
         │ Compare
         ▼
┌─────────────────┐
│  Local Storage  │  (SQLite / JSON file)
│  - Last version │
│  - Table data   │
│  - Change log   │
└─────────────────┘
         │
         │ On Change Detected
         ▼
┌─────────────────┐
│  Notification   │  (Console, Desktop, Slack, etc.)
│  / Action       │
└─────────────────┘
```

---

## Key Confluence API Endpoints

### Get Page Metadata (lightweight)
```
GET /wiki/rest/api/content/{pageId}?expand=version
```
Returns version number and last modified timestamp.

### Get Page Content
```
GET /wiki/rest/api/content/{pageId}?expand=body.storage,version
```
Returns full page content in storage format (HTML-like).

### Get Page History
```
GET /wiki/rest/api/content/{pageId}/history
```
Returns change history with who made changes.

---

## Table Parsing Considerations

Confluence stores tables in a specific format within the page body:
- Storage format is XHTML-based
- Tables use `<table>`, `<tr>`, `<td>` tags
- May include macros and formatting

**Parsing Strategy**:
1. Extract table HTML from page body
2. Use cheerio (jQuery-like) to parse HTML
3. Convert to structured JSON for comparison
4. Use deep-diff or similar for change detection

---

## Rate Limiting Considerations

Confluence Cloud API limits:
- Varies by plan (typically 100-1000 requests per minute)
- Use exponential backoff on 429 errors
- Recommended polling interval: 1-5 minutes minimum

---

## Authentication Options

1. **API Token** (Recommended)
   - Create at: https://id.atlassian.com/manage-profile/security/api-tokens
   - Use Basic Auth: `email:api_token` (base64 encoded)

2. **OAuth 2.0**
   - More complex setup
   - Better for distributed apps
   - Overkill for personal/local use

---

## Feasibility Assessment

**Verdict: Highly Feasible**

- Confluence REST API is well-documented
- Node.js has excellent libraries for HTTP requests and HTML parsing
- Local storage (JSON/SQLite) is trivial
- Polling is a proven pattern

**Estimated Complexity**: Low-Medium
**Estimated Development Time**: 4-8 hours for MVP

---

## Potential Enhancements

1. **Diff Visualization**: Show what specifically changed in the table
2. **Change History**: Keep log of all detected changes
3. **Multiple Pages**: Monitor multiple pages simultaneously
4. **Webhook Simulation**: Local endpoint for testing
5. **Desktop Notifications**: Alert when changes detected
6. **Slack/Discord Integration**: Post changes to channel
