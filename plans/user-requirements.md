# User Requirements - Setup Guide

This document provides step-by-step instructions for everything you need to set up and run conf-poll.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Get Your Confluence API Token](#2-get-your-confluence-api-token)
3. [Find Your Page ID](#3-find-your-page-id)
4. [Configure the Application](#4-configure-the-application)
5. [Run the Application](#5-run-the-application)
6. [Optional: Slack Notifications](#6-optional-slack-notifications)
7. [Optional: Discord Notifications](#7-optional-discord-notifications)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

### Required Software

Before you begin, ensure you have:

- **Node.js 18 or higher** installed

  Check your version:
  ```bash
  node --version
  ```

  If not installed or version is too old:
  - **macOS**: `brew install node`
  - **Windows**: Download from https://nodejs.org/
  - **Linux**: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`

- **npm** (comes with Node.js)

  Check:
  ```bash
  npm --version
  ```

### Required Access

You will need:

- A **Confluence Cloud** account with access to the page you want to monitor
- **Read permissions** on the target Confluence page
- Your **Atlassian account email address**

---

## 2. Get Your Confluence API Token

The API token allows the application to authenticate with Confluence on your behalf.

### Step-by-Step Instructions

1. **Open Atlassian Account Settings**

   Go to: https://id.atlassian.com/manage-profile/security/api-tokens

   Or navigate manually:
   - Click your profile picture in any Atlassian product
   - Select "Manage account"
   - Click "Security" in the left sidebar
   - Click "Create and manage API tokens"

2. **Create a New Token**

   - Click the **"Create API token"** button
   - Enter a label for the token (e.g., "conf-poll")
   - Click **"Create"**

3. **Copy the Token**

   - **IMPORTANT**: Copy the token immediately! You won't be able to see it again.
   - Store it securely (password manager recommended)
   - The token looks something like: `ATATT3xFfGF0...` (long string)

### Security Notes

- **Never commit your API token to git** - it's in `.gitignore` for a reason
- API tokens have the same permissions as your account
- You can revoke tokens at any time from the same page
- Consider creating a dedicated Atlassian account with read-only access for production use

---

## 3. Find Your Page ID

Every Confluence page has a unique numeric ID. You need this to tell conf-poll which page to monitor.

### Method 1: From the URL (Easiest)

1. Open your Confluence page in a browser
2. Look at the URL - it will look like one of these:

   ```
   https://yourcompany.atlassian.net/wiki/spaces/SPACE/pages/123456789/Page+Title
                                                        ^^^^^^^^^
                                                        This is your Page ID

   https://yourcompany.atlassian.net/wiki/pages/viewpage.action?pageId=123456789
                                                                       ^^^^^^^^^
                                                                       This is your Page ID
   ```

3. Copy just the numeric part (e.g., `123456789`)

### Method 2: From Page Info

1. Open the Confluence page
2. Click the **"..."** (more actions) menu in the top right
3. Select **"Page information"** or **"Page history"**
4. The Page ID will be visible in the URL or on the page

### Method 3: Using Browser Developer Tools

1. Open the Confluence page
2. Press `F12` to open Developer Tools
3. Go to the **Console** tab
4. Type: `AJS.params.pageId` and press Enter
5. The Page ID will be displayed

---

## 4. Configure the Application

### Step 1: Navigate to the Project Directory

```bash
cd /path/to/conf-poll
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Create Your Configuration File

Copy the example configuration:

```bash
cp .env.example .env
```

### Step 4: Edit the Configuration

Open `.env` in your favorite text editor:

```bash
# Using VS Code
code .env

# Using nano
nano .env

# Using vim
vim .env
```

### Step 5: Fill in Required Values

Edit these lines with your information:

```bash
# Your Confluence URL (replace 'yourcompany' with your actual subdomain)
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net

# Your Atlassian account email
CONFLUENCE_EMAIL=your.email@company.com

# The API token you created in Step 2
CONFLUENCE_API_TOKEN=your-api-token-here

# The Page ID you found in Step 3
CONFLUENCE_PAGE_ID=123456789
```

### Step 6: Adjust Optional Settings (if needed)

```bash
# How often to check for changes (in milliseconds)
# Default: 300000 (5 minutes)
# Minimum: 30000 (30 seconds) - don't go lower to avoid rate limits
POLL_INTERVAL_MS=300000

# Which table to monitor (0 = first table on the page)
TARGET_TABLE_INDEX=0

# Log detail level: trace, debug, info, warn, error
LOG_LEVEL=info
```

### Step 7: Validate Your Configuration

Run the validation command:

```bash
npm run validate
```

Or using the CLI directly:

```bash
node src/cli/index.js validate
```

---

## 5. Run the Application

### Option A: Test Mode (Recommended First)

Test that everything works before starting continuous polling:

```bash
node src/cli/index.js test
```

This will:
- Verify your configuration
- Test the Confluence connection
- Confirm access to your page
- Test notification channels

### Option B: Single Poll

Run one poll and exit (good for testing):

```bash
node src/cli/index.js start --once
```

### Option C: Continuous Polling

Start the full polling system:

```bash
npm start
```

Or:

```bash
node src/cli/index.js start
```

### Option D: Verbose Mode

See detailed logging:

```bash
node src/cli/index.js start --verbose
```

### Stopping the Application

Press `Ctrl+C` to stop gracefully. The application will:
- Complete any in-progress poll
- Save all data to the database
- Exit cleanly

---

## 6. Optional: Slack Notifications

Get notified in Slack when changes are detected.

### Step 1: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Name it (e.g., "Confluence Monitor")
5. Select your workspace

### Step 2: Enable Incoming Webhooks

1. In your app settings, click **"Incoming Webhooks"** in the sidebar
2. Toggle **"Activate Incoming Webhooks"** to **On**
3. Click **"Add New Webhook to Workspace"**
4. Select the channel where you want notifications
5. Click **"Allow"**

### Step 3: Copy the Webhook URL

After authorization, you'll see a Webhook URL like:
```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

Copy this URL.

### Step 4: Add to Configuration

Edit your `.env` file:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 5: Test

```bash
node src/cli/index.js test
```

Look for "✅ slack: OK" in the output.

---

## 7. Optional: Discord Notifications

Get notified in Discord when changes are detected.

### Step 1: Create a Webhook in Discord

1. Open Discord and go to your server
2. Right-click on the channel where you want notifications
3. Select **"Edit Channel"**
4. Go to **"Integrations"** tab
5. Click **"Webhooks"**
6. Click **"New Webhook"**
7. Name it (e.g., "Confluence Monitor")
8. Click **"Copy Webhook URL"**

### Step 2: Add to Configuration

Edit your `.env` file:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789/abcdefghijk...
```

### Step 3: Test

```bash
node src/cli/index.js test
```

Look for "✅ discord: OK" in the output.

---

## 8. Troubleshooting

### Error: "Configuration validation failed"

**Cause**: One or more required values are missing or invalid.

**Solution**:
1. Check that all required values are set in `.env`
2. Verify the format:
   - `CONFLUENCE_BASE_URL` must start with `https://`
   - `CONFLUENCE_EMAIL` must be a valid email
   - `CONFLUENCE_PAGE_ID` must be only numbers

### Error: "Authentication failed"

**Cause**: Invalid email or API token.

**Solution**:
1. Verify your email is correct
2. Generate a new API token and update `.env`
3. Make sure there are no extra spaces around the token

### Error: "Page not found"

**Cause**: Invalid Page ID or you don't have access.

**Solution**:
1. Double-check the Page ID
2. Verify you can access the page in your browser while logged in
3. Ensure your account has read permissions

### Error: "Rate limit exceeded"

**Cause**: Polling too frequently.

**Solution**:
1. Increase `POLL_INTERVAL_MS` (minimum 60000 recommended)
2. The app will automatically retry with backoff

### Error: "No table found at specified index"

**Cause**: The page doesn't have a table, or the index is wrong.

**Solution**:
1. Verify the page has a table
2. If the page has multiple tables, adjust `TARGET_TABLE_INDEX`
3. `0` = first table, `1` = second table, etc.

### Logs Not Appearing

**Solution**:
1. Check `LOG_LEVEL` is set to `info` or lower
2. Check the `logs/` directory for file logs
3. Run with `--verbose` flag

### Changes Not Detected

**Cause**: The table data hasn't actually changed, or it's in a different table.

**Solution**:
1. Run `node src/cli/index.js start --once` to force a poll
2. Check `TARGET_TABLE_INDEX` is pointing to the correct table
3. View status: `node src/cli/index.js status`

### Database Issues

**Solution**:
1. Check the `data/` directory exists and is writable
2. Try clearing data: `node src/cli/index.js clear --force`
3. Delete `data/conf-poll.db` and restart

---

## Quick Reference

### Common Commands

```bash
# Validate configuration
node src/cli/index.js validate

# Test everything
node src/cli/index.js test

# Run single poll
node src/cli/index.js start --once

# Start continuous polling
npm start

# View change history
node src/cli/index.js history

# View status
node src/cli/index.js status

# Clear all data
node src/cli/index.js clear --force
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONFLUENCE_BASE_URL` | Yes | - | Your Atlassian URL |
| `CONFLUENCE_EMAIL` | Yes | - | Your email |
| `CONFLUENCE_API_TOKEN` | Yes | - | API token |
| `CONFLUENCE_PAGE_ID` | Yes | - | Page ID to monitor |
| `POLL_INTERVAL_MS` | No | 300000 | Poll interval (ms) |
| `TARGET_TABLE_INDEX` | No | 0 | Which table (0-based) |
| `LOG_LEVEL` | No | info | Log verbosity |
| `SLACK_WEBHOOK_URL` | No | - | Slack notifications |
| `DISCORD_WEBHOOK_URL` | No | - | Discord notifications |

---

## Getting Help

If you encounter issues not covered here:

1. Check the logs in `logs/conf-poll.log`
2. Run with `--verbose` for more detail
3. Review the README.md for additional information
