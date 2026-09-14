const crypto = require('crypto');

/**
 * Constant-time string comparison preventing timing attacks.
 */
function safeCompareTokens(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Middleware ensuring the request is authenticated via session.
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  // Only return JSON error for API calls or explicit AJAX/JSON clients
  if (req.path.startsWith('/api') || (!req.accepts('html') && req.accepts('json'))) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  res.redirect('/login');
}

/**
 * CSRF error handling middleware.
 */
function csrfErrorHandler(err, req, res, next) {
  if (err && (err.code === 'EBADCSRFTOKEN' || (err.message && err.message.toLowerCase().includes('csrf')))) {
    console.warn(`[Security] Requête CSRF bloquée depuis l'IP ${req.ip} sur ${req.originalUrl}`);
    return res.status(403).json({ error: 'Session expirée ou jeton CSRF invalide. Veuillez rafraîchir la page.' });
  }
  next(err);
}

module.exports = {
  safeCompareTokens,
  isAuthenticated,
  csrfErrorHandler
};

