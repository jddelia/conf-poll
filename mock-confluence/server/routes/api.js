/**
 * Confluence REST API Routes
 *
 * Replicates the exact Confluence Cloud REST API endpoints used by conf-poll.
 * Base path: /wiki/rest/api
 */

import { Router } from 'express';
import { confluenceAuth } from '../middleware/auth.js';
import { getPageById, getPageHistory } from '../services/pageService.js';

const router = Router();

// Apply auth to all API routes
router.use(confluenceAuth);

/**
 * GET /content/:pageId
 *
 * Get page with optional expansions.
 * Supports: ?expand=version and ?expand=body.storage,version
 */
router.get('/content/:pageId', (req, res) => {
  const { pageId } = req.params;
  const expand = req.query.expand || '';

  console.log(`[API] Get page ${pageId} (expand: ${expand || 'none'})`);

  // Determine what to include
  const includeBody = expand.includes('body.storage');

  const page = getPageById(pageId, { includeBody });

  if (!page) {
    return res.status(404).json({
      statusCode: 404,
      data: {
        authorized: true,
        valid: true,
        errors: [],
        successful: false,
      },
      message: `No content found with id: ${pageId}`,
    });
  }

  res.json(page);
});

/**
 * GET /content/:pageId/history
 *
 * Get page history.
 * Supports: ?expand=lastUpdated
 */
router.get('/content/:pageId/history', (req, res) => {
  const { pageId } = req.params;

  console.log(`[API] Get page history ${pageId}`);

  const history = getPageHistory(pageId);

  if (!history) {
    return res.status(404).json({
      statusCode: 404,
      message: `No content found with id: ${pageId}`,
    });
  }

  res.json(history);
});

export default router;
