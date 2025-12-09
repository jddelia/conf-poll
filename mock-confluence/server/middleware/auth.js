/**
 * Authentication Middleware
 *
 * Validates Basic Auth format for Confluence API compatibility.
 * Accepts any valid credentials (it's a mock server).
 */

/**
 * Basic auth middleware for Confluence API routes
 */
export function confluenceAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Authentication required',
    });
  }

  if (!authHeader.startsWith('Basic ')) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid authentication format. Use Basic Auth.',
    });
  }

  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [email] = credentials.split(':');

    if (!email) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Invalid credentials format',
      });
    }

    // Store email for logging (don't validate - it's a mock)
    req.userEmail = email;
    next();
  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Failed to decode credentials',
    });
  }
}

export default { confluenceAuth };
