const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const lusca = require('lusca');

// Middleware & Session Store
const { SequelizeSessionStore } = require('./middleware/sessionStore');
const { apiLimiter } = require('./middleware/rateLimiter');
const { csrfErrorHandler } = require('./middleware/auth');

// Route Modules
const createAuthRouter = require('./routes/auth');
const createDashboardRouter = require('./routes/dashboard');
const createConfigRouter = require('./routes/config');
const createFeaturesRouter = require('./routes/features');
const createAnalyticsRouter = require('./routes/analytics');

/**
 * Starts the Express web dashboard server with modular routes and security middleware.
 */
function startWebServer(client, rawPort) {
  // Ensure port is a valid integer (handles numbers, Pterodactyl/Pelican SERVER_PORT, and strings)
  let port = parseInt(rawPort, 10);
  if (isNaN(port) || port <= 0) {
    port = parseInt(process.env.PORT, 10);
  }
  if (isNaN(port) || port <= 0) {
    port = parseInt(process.env.SERVER_PORT, 10);
  }
  if (isNaN(port) || port <= 0) {
    port = 3000;
  }

  const app = express();

  // Trust first proxy for correct client IP detection behind reverse proxies (Nginx, Traefik, Cloudflare)
  app.set('trust proxy', 1);

  // Body Parsing Middleware
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  // Static Assets Middleware
  const distDir = path.join(__dirname, 'dist');
  const clientPublicDir = path.join(__dirname, 'client', 'public');

  // Auto-build fallback if dist is missing
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('[Dashboard Web] Dashboard Svelte non compilé. Exécution automatique de "npm run build"...');
    try {
      const { execSync } = require('child_process');
      execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
    } catch (err) {
      console.warn('[Dashboard Web] Échec de la compilation automatique :', err.message);
    }
  }

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
  }
  if (fs.existsSync(clientPublicDir)) {
    app.use('/public', express.static(clientPublicDir));
    app.use(express.static(clientPublicDir));
  }

  // Session Security Configuration
  const sessionSecret = process.env.SESSION_SECRET || (() => {
    console.warn('[Security] SESSION_SECRET non configuré dans .env. Utilisation d\'une clé aléatoire temporaire.');
    return crypto.randomBytes(32).toString('hex');
  })();

  const isProduction = process.env.NODE_ENV === 'production';
  const isSecureCookie = process.env.COOKIE_SECURE === 'true' || isProduction;

  app.use(session({
    store: new SequelizeSessionStore(),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'pyro_session',
    cookie: { 
      secure: isSecureCookie,
      httpOnly: true, // Mitigate XSS cookie access
      sameSite: 'lax', // Protect against CSRF via cookie leaking
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }));

  // CSRF Protection
  app.use(lusca.csrf());

  // Global Rate Limiting for sensitive routes
  app.use('/dashboard', apiLimiter);
  app.use('/api', apiLimiter);

  // Mount Modular Routes
  app.use(createAuthRouter(distDir));
  app.use(createDashboardRouter(client, distDir));
  app.use(createConfigRouter(client));
  app.use(createFeaturesRouter(client));
  app.use(createAnalyticsRouter(client));

  // SPA Wildcard & Fallback Handler
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint introuvable' });
    }
    if (req.path.includes('.')) {
      return next();
    }

    const distIndexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }

    return res.status(200).send('Pyro Bot Dashboard - Veuillez exécuter "npm run build".');
  });

  // CSRF and Security Error Handler
  app.use(csrfErrorHandler);

  // Bind to 0.0.0.0 and listen on integer port
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Dashboard Web] Serveur démarré avec succès sur le port ${port} (http://0.0.0.0:${port})`);
  });
}

module.exports = {
  startWebServer
};
