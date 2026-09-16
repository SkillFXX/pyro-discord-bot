const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PermissionFlagsBits } = require('discord.js');
const { loginLimiter, apiLimiter } = require('../middleware/rateLimiter');

function createAuthRouter(client, distDir) {
  const router = express.Router();

  // Apply rate limiter to all auth routes
  router.use(apiLimiter);

  // SPA Auth Status API
  router.get('/api/auth/status', (req, res) => {
    // Invalidate obsolete sessions (e.g. legacy token sessions missing user profile or permissions)
    if (req.session && req.session.authenticated && (!req.session.permissions || !req.session.user)) {
      req.session.destroy(() => {});
      res.clearCookie('pyro_session');
      return res.json({
        authenticated: false,
        user: null,
        permissions: null,
        csrfToken: res.locals._csrf || '',
        discordConfigured: Boolean(process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI)
      });
    }

    res.json({
      authenticated: Boolean(req.session && req.session.authenticated && req.session.permissions),
      user: req.session?.user || null,
      permissions: req.session?.permissions || null,
      csrfToken: res.locals._csrf || '',
      discordConfigured: Boolean(process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI)
    });
  });

  // Start Discord OAuth2 Flow
  router.get('/api/auth/discord', loginLimiter, (req, res) => {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.warn('[OAuth2] Configuration Discord OAuth2 incomplète (DISCORD_CLIENT_SECRET ou DISCORD_REDIRECT_URI manquant).');
      return res.redirect('/login?error=oauth_not_configured');
    }

    // Generate secure anti-CSRF state token
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;

    const discordAuthUrl = new URL('https://discord.com/oauth2/authorize');
    discordAuthUrl.searchParams.set('client_id', clientId);
    discordAuthUrl.searchParams.set('response_type', 'code');
    discordAuthUrl.searchParams.set('redirect_uri', redirectUri);
    discordAuthUrl.searchParams.set('scope', 'identify');
    discordAuthUrl.searchParams.set('state', state);

    res.redirect(discordAuthUrl.toString());
  });

  // Discord OAuth2 Callback Endpoint
  router.get('/api/auth/discord/callback', loginLimiter, async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      console.warn('[OAuth2] Erreur retournée par Discord :', error);
      return res.redirect('/login?error=access_denied');
    }

    if (!code || !state || !req.session.oauthState || state !== req.session.oauthState) {
      console.warn('[OAuth2] Requête de callback invalide ou état CSRF expiré.');
      return res.redirect('/login?error=invalid_state');
    }

    delete req.session.oauthState;

    try {
      // 1. Exchange authorization code for access token
      const tokenParams = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      });

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString()
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('[OAuth2] Échec échange token Discord :', errText);
        return res.redirect('/login?error=token_exchange_failed');
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // 2. Fetch user profile from Discord API
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!userRes.ok) {
        const errText = await userRes.text();
        console.error('[OAuth2] Échec récupération profil utilisateur Discord :', errText);
        return res.redirect('/login?error=user_fetch_failed');
      }

      const discordUser = await userRes.json();

      // 3. Check guild membership and permissions via the Discord bot client
      const guildId = process.env.GUILD_ID;
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        guild = await client.guilds.fetch(guildId).catch(() => null);
      }

      if (!guild) {
        console.error('[OAuth2] Serveur configuré introuvable pour le bot (GUILD_ID) :', guildId);
        return res.redirect('/login?error=guild_not_found');
      }

      const member = await guild.members.fetch(discordUser.id).catch(() => null);

      if (!member) {
        console.warn(`[OAuth2] L'utilisateur ${discordUser.username} (${discordUser.id}) n'est pas sur le serveur ${guild.name}.`);
        return res.redirect('/login?error=not_in_guild');
      }

      // Check Discord Permissions: ADMINISTRATOR or VIEW_AUDIT_LOG
      const isOwner = guild.ownerId === discordUser.id;
      const isAdmin = isOwner || member.permissions.has(PermissionFlagsBits.Administrator);
      const canViewAuditLog = isAdmin || member.permissions.has(PermissionFlagsBits.ViewAuditLog);

      if (!isAdmin && !canViewAuditLog) {
        console.warn(`[OAuth2] Accès refusé pour ${discordUser.username} : permissions insuffisantes (ni Administrateur, ni Voir les logs).`);
        return res.redirect('/login?error=insufficient_permissions');
      }

      // Format avatar URL
      let avatarUrl = null;
      if (discordUser.avatar) {
        const isAnimated = discordUser.avatar.startsWith('a_');
        avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${isAnimated ? 'gif' : 'png'}?size=128`;
      } else {
        const defaultIndex = Number((BigInt(discordUser.id) >> 22n) % 6n);
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
      }

      // 4. Initialize authenticated session with user identity and permissions
      req.session.authenticated = true;
      req.session.user = {
        id: discordUser.id,
        username: discordUser.global_name || discordUser.username,
        tag: discordUser.discriminator && discordUser.discriminator !== '0'
          ? `${discordUser.username}#${discordUser.discriminator}`
          : discordUser.username,
        avatar: avatarUrl
      };
      req.session.permissions = {
        isOwner,
        isAdmin,
        canViewAuditLog
      };

      console.log(`[OAuth2] Connexion réussie pour ${req.session.user.username} (Admin: ${isAdmin}, ViewAuditLog: ${canViewAuditLog})`);
      return res.redirect('/dashboard');
    } catch (err) {
      console.error('[OAuth2] Erreur interne pendant le flux OAuth2 :', err);
      return res.redirect('/login?error=internal_error');
    }
  });

  // SPA Logout API
  router.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('pyro_session');
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

  // Logout Action
  router.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('pyro_session');
      res.redirect('/login');
    });
  });

  return router;
}

module.exports = createAuthRouter;
