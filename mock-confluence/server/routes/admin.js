/**
 * Admin API Routes
 *
 * Endpoints for managing mock pages and users through the web UI.
 * Base path: /admin
 */

import { Router } from 'express';
import {
  getAllPages,
  getPageById,
  createPage,
  updatePage,
  deletePage,
  getPageVersions,
} from '../services/pageService.js';
import {
  getAllUsers,
  getUserById,
  createUser,
  deleteUser,
  generateUserMention,
} from '../services/userService.js';

const router = Router();

// ============ Page Routes ============

/**
 * GET /admin/pages
 * List all pages
 */
router.get('/pages', (req, res) => {
  const pages = getAllPages();
  res.json({ pages });
});

/**
 * GET /admin/pages/:pageId
 * Get a single page with full content
 */
router.get('/pages/:pageId', (req, res) => {
  const { pageId } = req.params;
  const page = getPageById(pageId, { includeBody: true });

  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }

  res.json(page);
});

/**
 * POST /admin/pages
 * Create a new page
 */
router.post('/pages', (req, res) => {
  const { title, bodyContent, id, userId } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (!bodyContent) {
    return res.status(400).json({ error: 'Body content is required' });
  }

  try {
    const page = createPage({ title, bodyContent, id, userId });
    res.status(201).json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /admin/pages/:pageId
 * Update a page (creates new version)
 */
router.put('/pages/:pageId', (req, res) => {
  const { pageId } = req.params;
  const { title, bodyContent, versionMessage, userId } = req.body;

  const page = updatePage(pageId, { title, bodyContent, versionMessage, userId });

  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }

  res.json(page);
});

/**
 * DELETE /admin/pages/:pageId
 * Delete a page
 */
router.delete('/pages/:pageId', (req, res) => {
  const { pageId } = req.params;
  const deleted = deletePage(pageId);

  if (!deleted) {
    return res.status(404).json({ error: 'Page not found' });
  }

  res.json({ success: true });
});

/**
 * GET /admin/pages/:pageId/versions
 * Get version history for a page
 */
router.get('/pages/:pageId/versions', (req, res) => {
  const { pageId } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  const versions = getPageVersions(pageId, limit);
  res.json({ versions });
});

// ============ User Routes ============

/**
 * GET /admin/users
 * List all users
 */
router.get('/users', (req, res) => {
  const users = getAllUsers();
  res.json({ users });
});

/**
 * GET /admin/users/:userId
 * Get a single user
 */
router.get('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const user = getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(user);
});

/**
 * POST /admin/users
 * Create a new user
 */
router.post('/users', (req, res) => {
  const { displayName } = req.body;

  if (!displayName) {
    return res.status(400).json({ error: 'Display name is required' });
  }

  try {
    const user = createUser({ displayName });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /admin/users/:userId
 * Delete a user
 */
router.delete('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const deleted = deleteUser(userId);

  if (!deleted) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ success: true });
});

/**
 * GET /admin/users/:userId/mention
 * Generate user mention markup
 */
router.get('/users/:userId/mention', (req, res) => {
  const { userId } = req.params;
  const mention = generateUserMention(userId);

  if (!mention) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ mention });
});

export default router;
