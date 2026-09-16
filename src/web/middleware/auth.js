/**
 * Middleware ensuring the request is authenticated via session.
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated && req.session.permissions) {
    return next();
  }
  // Only return JSON error for API calls or explicit AJAX/JSON clients
  if (req.path.startsWith('/api') || (!req.accepts('html') && req.accepts('json'))) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  res.redirect('/login');
}

/**
 * Middleware ensuring the authenticated user has ADMINISTRATOR permissions.
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    if (req.path.startsWith('/api') || (!req.accepts('html') && req.accepts('json'))) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    return res.redirect('/login');
  }

  if (req.session.permissions && req.session.permissions.isAdmin) {
    return next();
  }

  return res.status(403).json({ error: 'Accès interdit : permission Administrateur requise.' });
}

/**
 * Middleware ensuring the authenticated user has at least VIEW_AUDIT_LOG or ADMINISTRATOR permissions.
 */
function requireViewAuditLog(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    if (req.path.startsWith('/api') || (!req.accepts('html') && req.accepts('json'))) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    return res.redirect('/login');
  }

  if (req.session.permissions && (req.session.permissions.isAdmin || req.session.permissions.canViewAuditLog)) {
    return next();
  }

  return res.status(403).json({ error: 'Accès interdit : permission "Voir les logs du serveur" requise.' });
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
  isAuthenticated,
  requireAdmin,
  requireViewAuditLog,
  csrfErrorHandler
};
