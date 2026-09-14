const express = require('express');
const path = require('path');
const fs = require('fs');
const { safeCompareTokens } = require('../middleware/auth');
const { 
  checkLoginRateLimit, 
  recordFailedLogin, 
  clearLoginAttempts, 
  loginLimiter,
  apiLimiter 
} = require('../middleware/rateLimiter');

function createAuthRouter(distDir) {
  const router = express.Router();

  // Apply rate limiter to all auth routes
  router.use(apiLimiter);

  // SPA Auth Status API
  router.get('/api/auth/status', (req, res) => {
    res.json({
      authenticated: Boolean(req.session && req.session.authenticated),
      csrfToken: res.locals._csrf || ''
    });
  });

  // SPA Login API
  router.post('/api/login', loginLimiter, (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const rateLimitError = checkLoginRateLimit(clientIp);
    if (rateLimitError) {
      return res.status(429).json({ error: rateLimitError });
    }

    const token = req.body.token;
    const expectedToken = process.env.DISCORD_TOKEN;

    if (expectedToken && safeCompareTokens(token, expectedToken)) {
      clearLoginAttempts(clientIp);
      req.session.authenticated = true;
      return res.json({ 
        success: true, 
        csrfToken: res.locals._csrf || '' 
      });
    }

    recordFailedLogin(clientIp);
    res.status(401).json({ error: 'Token invalide. Veuillez réessayer.' });
  });

  // SPA Logout API
  router.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Login View (serves SPA, rate limited)
  router.get('/login', apiLimiter, (req, res) => {
    const distIndexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }
    res.status(200).send('Pyro Bot Dashboard - Veuillez exécuter "npm run build".');
  });

  // Legacy Login Action
  router.post('/login', loginLimiter, (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const rateLimitError = checkLoginRateLimit(clientIp);
    if (rateLimitError) {
      return res.status(429).json({ error: rateLimitError });
    }

    const token = req.body.token;
    const expectedToken = process.env.DISCORD_TOKEN;

    if (expectedToken && safeCompareTokens(token, expectedToken)) {
      clearLoginAttempts(clientIp);
      req.session.authenticated = true;
      return res.json({ success: true, csrfToken: res.locals._csrf || '' });
    }

    recordFailedLogin(clientIp);
    return res.status(401).json({ error: 'Token invalide. Veuillez réessayer.' });
  });

  // Legacy Logout Action
  router.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  return router;
}

module.exports = createAuthRouter;

