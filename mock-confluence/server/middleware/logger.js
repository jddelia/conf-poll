/**
 * Request Logger Middleware
 *
 * Logs all incoming requests for debugging.
 */

/**
 * Simple request logger
 */
export function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request
  console.log(`[${new Date().toISOString()}] --> ${req.method} ${req.originalUrl}`);

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(
      `[${new Date().toISOString()}] <-- ${req.method} ${req.originalUrl} ${statusColor}${res.statusCode}\x1b[0m ${duration}ms`
    );
  });

  next();
}

export default { requestLogger };
