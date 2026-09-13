const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const lusca = require('lusca');
const { ChannelType } = require('discord.js');
const { 
  ConfigHelper, 
  AutoRole, 
  WarnAction, 
  RoleReward, 
  AutomodRule,
  XPMultiplier,
  UserSnapshot,
  Session,
  LOG_CONFIG_KEYS
} = require('../database');
const { updateBotStatus } = require('../bot/events/ready');
const analyticsService = require('../services/analyticsService');

// Persistent SQLite Session Store (avoids MemoryStore leak warning and persists logins across bot restarts)
class SequelizeSessionStore extends session.Store {
  async get(sid, fn) {
    try {
      const sess = await Session.findByPk(sid);
      if (!sess) return fn();
      if (sess.expires && new Date(sess.expires).getTime() < Date.now()) {
        await sess.destroy();
        return fn();
      }
      const data = JSON.parse(sess.data);
      fn(null, data);
    } catch (err) {
      fn(err);
    }
  }

  async set(sid, sess, fn) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : null;
      await Session.upsert({
        sid,
        data: JSON.stringify(sess),
        expires
      });
      if (fn) fn();
    } catch (err) {
      if (fn) fn(err);
    }
  }

  async destroy(sid, fn) {
    try {
      await Session.destroy({ where: { sid } });
      if (fn) fn();
    } catch (err) {
      if (fn) fn(err);
    }
  }

  async touch(sid, sess, fn) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : null;
      if (expires) {
        await Session.update({ expires }, { where: { sid } });
      }
      if (fn) fn();
    } catch (err) {
      if (fn) fn(err);
    }
  }
}

// Login rate limiting (max 5 failed attempts per 15 minutes)
const loginAttempts = new Map();

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt) {
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
      const remainingMins = Math.ceil((attempt.lockedUntil - now) / 60000);
      return `Trop de tentatives. Veuillez patienter ${remainingMins} minute(s).`;
    }
    if (attempt.lockedUntil && now >= attempt.lockedUntil) {
      loginAttempts.delete(ip);
    }
  }
  return null;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockedUntil = now + 15 * 60 * 1000;
  }
  loginAttempts.set(ip, attempt);
}

function safeCompareTokens(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function startWebServer(client, rawPort) {
  // Ensure port is a valid integer (handles Pterodactyl/Pelican SERVER_PORT and string literals)
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

  // Trust first proxy for correct client IP detection and HTTPS recognition behind reverse proxies
  app.set('trust proxy', 1);

  // Middleware
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  const distDir = path.join(__dirname, 'dist');
  const clientPublicDir = path.join(__dirname, 'client', 'public');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
  }
  if (fs.existsSync(clientPublicDir)) {
    app.use('/public', express.static(clientPublicDir));
    app.use(express.static(clientPublicDir));
  }

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

  // CSRF Protection (fixes CodeQL alert: Missing CSRF middleware)
  app.use(lusca.csrf());

  // Rate Limiting (fixes CodeQL alert: Missing rate limiting)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Trop de tentatives de connexion depuis cette adresse IP. Veuillez réessayer dans 15 minutes.',
    handler: (req, res) => {
      const errMsg = 'Trop de tentatives de connexion depuis cette adresse IP. Veuillez réessayer dans 15 minutes.';
      return res.status(429).json({ error: errMsg });
    }
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 150, // 150 requests per minute
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/dashboard', apiLimiter);
  app.use('/api', apiLimiter);

  // Auth Middleware
  function isAuthenticated(req, res, next) {
    if (req.session && req.session.authenticated) {
      return next();
    }
    if (req.accepts('json') || req.path.startsWith('/api')) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    res.redirect('/login');
  }

  // Helper: Get guild data with 30s memory cache
  let cachedGuildContext = null;
  let cachedGuildContextTime = 0;

  async function getGuildContext(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedGuildContext && (now - cachedGuildContextTime < 30000)) {
      return cachedGuildContext;
    }

    const guildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      return { 
        guildName: 'Serveur Inconnu', 
        channels: { text: [], voice: [], categories: [] }, 
        roles: [],
        members: []
      };
    }

    const textChannels = [];
    const forumChannels = [];
    const voiceChannels = [];
    const categories = [];
    
    guild.channels.cache.forEach(c => {
      const channelData = { id: c.id, name: c.name };
      if (c.type === ChannelType.GuildText) textChannels.push({ ...channelData, forum: false });
      else if (c.type === ChannelType.GuildForum || c.type === ChannelType.GuildMedia) {
        textChannels.push({ ...channelData, forum: true });
        forumChannels.push(channelData);
      }
      else if (c.type === ChannelType.GuildVoice) voiceChannels.push(channelData);
      else if (c.type === ChannelType.GuildCategory) categories.push(channelData);
    });

    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const membersMap = new Map();
    guild.members.cache.forEach(m => {
      if (!m.user.bot) {
        membersMap.set(m.id, {
          id: m.id,
          name: m.displayName || m.user.username,
          tag: m.user.tag || m.user.username
        });
      }
    });

    try {
      const snapshots = await UserSnapshot.findAll({ 
        attributes: ['userId', 'username', 'displayName'],
        limit: 500,
        raw: true 
      });
      for (const s of snapshots) {
        if (!membersMap.has(s.userId)) {
          membersMap.set(s.userId, {
            id: s.userId,
            name: s.displayName || s.username || s.userId,
            tag: s.username || s.userId
          });
        }
      }
    } catch (e) {}

    const members = Array.from(membersMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    cachedGuildContext = {
      guildName: guild.name,
      channels: {
        text: textChannels.sort((a, b) => a.name.localeCompare(b.name)),
        forums: forumChannels.sort((a, b) => a.name.localeCompare(b.name)),
        voice: voiceChannels.sort((a, b) => a.name.localeCompare(b.name)),
        categories: categories.sort((a, b) => a.name.localeCompare(b.name)),
      },
      roles,
      members
    };
    cachedGuildContextTime = now;
    return cachedGuildContext;
  }

  // Modular Table Fetchers (DRY & High Performance)
  async function fetchAutoRoles(guild) {
    const dbAutoRoles = await AutoRole.findAll();
    return dbAutoRoles.map(r => ({
      roleId: r.roleId,
      roleName: guild ? (guild.roles.cache.get(r.roleId)?.name || 'Rôle Inconnu') : 'Rôle Inconnu'
    }));
  }

  async function fetchWarnActions() {
    return await WarnAction.findAll({ order: [['warnsCount', 'ASC']] });
  }

  async function fetchRoleRewards(guild) {
    const dbRoleRewards = await RoleReward.findAll({ order: [['level', 'ASC']] });
    return dbRoleRewards.map(r => ({
      level: r.level,
      roleId: r.roleId,
      roleName: guild ? (guild.roles.cache.get(r.roleId)?.name || 'Rôle Inconnu') : 'Rôle Inconnu',
      replacePreviousRole: r.replacePreviousRole
    }));
  }

  async function fetchAutomodRules(guild) {
    const dbAutomodRules = await AutomodRule.findAll();
    return dbAutomodRules.map(r => {
      let channelName = 'Inconnu';
      if (r.channelId === 'global') {
        channelName = 'Global';
      } else if (guild) {
        const c = guild.channels.cache.get(r.channelId);
        if (c) channelName = c.name;
      }
      return {
        id: r.id,
        channelId: r.channelId,
        channelName,
        ruleType: r.ruleType,
        parameters: r.parameters,
        actions: r.actions,
        action: r.action,
        scope: r.scope,
        monitoredTypes: r.monitoredTypes,
        customReason: r.customReason
      };
    });
  }

  async function fetchXpMultipliers(guild) {
    const dbXpMultipliers = await XPMultiplier.findAll();
    return dbXpMultipliers.map(m => {
      let channelName = 'Inconnu';
      if (guild) {
        const c = guild.channels.cache.get(m.channelId);
        if (c) channelName = c.name;
      }
      return {
        channelId: m.channelId,
        channelName,
        multiplier: m.multiplier
      };
    });
  }

  // Combined fetcher for full dashboard load
  async function getDashboardLists(guildContext) {
    const guildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(guildId);

    const [autoRoles, warnActions, roleRewards, automodRules, xpMultipliers] = await Promise.all([
      fetchAutoRoles(guild),
      fetchWarnActions(),
      fetchRoleRewards(guild),
      fetchAutomodRules(guild),
      fetchXpMultipliers(guild),
    ]);

    return { autoRoles, warnActions, roleRewards, automodRules, xpMultipliers };
  }

  // --- ROUTES ---

  // SPA Auth Status API
  app.get('/api/auth/status', (req, res) => {
    res.json({
      authenticated: Boolean(req.session && req.session.authenticated),
      csrfToken: res.locals._csrf || ''
    });
  });

  // SPA Login API
  app.post('/api/login', loginLimiter, (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const rateLimitError = checkLoginRateLimit(clientIp);
    if (rateLimitError) {
      return res.status(429).json({ error: rateLimitError });
    }

    const token = req.body.token;
    const expectedToken = process.env.DISCORD_TOKEN;

    if (expectedToken && safeCompareTokens(token, expectedToken)) {
      loginAttempts.delete(clientIp);
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
  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Auth Routes
  app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect('/dashboard');
    }
    const distIndexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }
    res.status(200).send('Pyro Bot Dashboard - Veuillez exécuter "npm run build".');
  });

  app.post('/login', loginLimiter, (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check brute-force rate limit
    const rateLimitError = checkLoginRateLimit(clientIp);
    if (rateLimitError) {
      return res.status(429).json({ error: rateLimitError });
    }

    const token = req.body.token;
    const expectedToken = process.env.DISCORD_TOKEN;

    // Constant-time comparison preventing timing attacks
    if (expectedToken && safeCompareTokens(token, expectedToken)) {
      loginAttempts.delete(clientIp);
      req.session.authenticated = true;
      return res.json({ success: true, csrfToken: res.locals._csrf || '' });
    }

    recordFailedLogin(clientIp);
    return res.status(401).json({ error: 'Token invalide. Veuillez réessayer.' });
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  // SPA Dashboard Bootstrap JSON API
  app.get('/api/dashboard/init', isAuthenticated, async (req, res) => {
    try {
      const guildContext = await getGuildContext();
      const lists = await getDashboardLists(guildContext);

      const logKeys = LOG_CONFIG_KEYS.map(k => k.key);
      const configKeys = [
        'bot_status_type', 'bot_status_text', 'bot_status_state', 'bot_status_url',
        'embed_footer_text', 'embed_footer_icon_url', 'embed_color',
        'log_channel_id', 'welcome_channel_id', 'leave_channel_id',
        'voice_creator_channel_id', 'voice_creator_category_id',
        'welcome_message_template', 'leave_message_template',
        'member_counter_channel_id', 'member_counter_template',
        'ticket_category_id', 'ticket_staff_role_id',
        'xp_enabled', 'xp_min_gain', 'xp_max_gain', 'xp_cooldown_seconds', 'xp_announcement_channel_id',
        ...logKeys
      ];

      const config = {};
      for (const key of configKeys) {
        config[key] = await ConfigHelper.get(key);
      }

      const bot = {
        username: client.user ? (client.user.displayName || client.user.username) : 'Pyro',
        avatarUrl: client.user ? (client.user.displayAvatarURL({ size: 128, extension: 'png' }) || '/icon.svg') : '/icon.svg',
        id: client.user ? client.user.id : ''
      };

      res.json({
        guildId: process.env.GUILD_ID,
        serverName: guildContext.guildName,
        bot,
        channels: guildContext.channels,
        roles: guildContext.roles,
        members: guildContext.members,
        config,
        logConfigKeys: LOG_CONFIG_KEYS,
        ...lists
      });
    } catch (error) {
      console.error('[API Dashboard Init] Error:', error);
      res.status(500).json({ error: 'Erreur lors du chargement des données' });
    }
  });

  // Dashboard Main protected route
  app.get('/dashboard', isAuthenticated, (req, res) => {
    const distIndexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }
    res.status(200).send('Pyro Bot Dashboard - Veuillez exécuter "npm run build".');
  });

  // --- ANALYTICS API ROUTES ---
  app.get('/api/analytics', isAuthenticated, async (req, res) => {
    try {
      const guildId = process.env.GUILD_ID;
      const guild = client.guilds.cache.get(guildId);
      const { range, startDate, endDate, channelId, roleId, userId } = req.query;

      const data = await analyticsService.getAnalytics({
        range: range || '7d',
        startDate,
        endDate,
        channelId,
        roleId,
        userId,
        guild,
      });

      res.json(data);
    } catch (error) {
      console.error('[API Analytics] Error:', error);
      res.status(500).json({ error: 'Erreur lors du calcul des analyses' });
    }
  });

  app.get('/api/analytics/export', isAuthenticated, async (req, res) => {
    try {
      const guildId = process.env.GUILD_ID;
      const guild = client.guilds.cache.get(guildId);
      const { range, startDate, endDate, channelId, roleId, userId } = req.query;

      const csv = await analyticsService.exportCSV({
        range: range || '7d',
        startDate,
        endDate,
        channelId,
        roleId,
        userId,
        guild,
      });

      res.header('Content-Type', 'text/csv');
      res.attachment(`pyro-analytics-${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('[API Analytics Export] Error:', error);
      res.status(500).send('Erreur lors de l\'exportation CSV');
    }
  });

  // --- API SETTINGS & CONFIG POSTS ---

  // Unified Config Save API (covers general, logs, customization, tickets, xp)
  app.post('/api/config/:section', isAuthenticated, async (req, res) => {
    try {
      const { section } = req.params;
      const body = req.body;

      if (section === 'general' || section === 'customization') {
        const allowed = [
          'bot_status_type', 'bot_status_text', 'bot_status_state', 'bot_status_url',
          'embed_footer_text', 'embed_footer_icon_url', 'embed_color',
          'log_channel_id', 'welcome_channel_id', 'leave_channel_id',
          'voice_creator_channel_id', 'voice_creator_category_id',
          'welcome_message_template', 'leave_message_template',
          'member_counter_channel_id', 'member_counter_template'
        ];
        for (const field of allowed) {
          if (body[field] !== undefined) {
            await ConfigHelper.set(field, body[field]);
          }
        }
        await updateBotStatus(client);

        if (body.member_counter_channel_id !== undefined || body.member_counter_template !== undefined) {
          const guild = client.guilds.cache.get(process.env.GUILD_ID);
          if (guild) {
            const memberCounterService = require('../services/memberCounterService');
            await memberCounterService.updateMemberCounter(guild, { force: true });
          }
        }
      } else if (section === 'logs') {
        if (body.log_channel_id !== undefined) {
          await ConfigHelper.set('log_channel_id', body.log_channel_id || null);
        }
        for (const item of LOG_CONFIG_KEYS) {
          if (body[item.key] !== undefined) {
            const isEnabled = body[item.key] === true || body[item.key] === 'true' || body[item.key] === 'on';
            await ConfigHelper.set(item.key, isEnabled);
          }
        }
      } else if (section === 'tickets') {
        if (body.ticket_category_id !== undefined) {
          await ConfigHelper.set('ticket_category_id', body.ticket_category_id || '');
        }
        if (body.ticket_staff_role_id !== undefined) {
          await ConfigHelper.set('ticket_staff_role_id', body.ticket_staff_role_id || '');
        }
      } else if (section === 'xp') {
        if (body.xp_enabled !== undefined) {
          await ConfigHelper.set('xp_enabled', body.xp_enabled === true || body.xp_enabled === 'true');
        }
        if (body.xp_min_gain !== undefined) {
          await ConfigHelper.set('xp_min_gain', parseInt(body.xp_min_gain || 15));
        }
        if (body.xp_max_gain !== undefined) {
          await ConfigHelper.set('xp_max_gain', parseInt(body.xp_max_gain || 25));
        }
        if (body.xp_cooldown_seconds !== undefined) {
          await ConfigHelper.set('xp_cooldown_seconds', parseInt(body.xp_cooldown_seconds || 60));
        }
        if (body.xp_announcement_channel_id !== undefined) {
          await ConfigHelper.set('xp_announcement_channel_id', body.xp_announcement_channel_id || '');
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[API Config Save] Error:', err);
      res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
    }
  });

  // Legacy General Config Save
  app.post('/dashboard/general', isAuthenticated, async (req, res) => {
    const fields = [
      'bot_status_type', 'bot_status_text',
      'log_channel_id', 'welcome_channel_id', 'leave_channel_id',
      'voice_creator_channel_id', 'voice_creator_category_id',
      'welcome_message_template', 'leave_message_template',
      'member_counter_channel_id', 'member_counter_template'
    ];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        await ConfigHelper.set(field, req.body[field]);
      }
    }

    await updateBotStatus(client);

    if (req.body.member_counter_channel_id !== undefined || req.body.member_counter_template !== undefined) {
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (guild) {
        const memberCounterService = require('../services/memberCounterService');
        await memberCounterService.updateMemberCounter(guild, { force: true });
      }
    }

    res.status(200).send();
  });

  // Legacy Logs Config Save
  app.post('/dashboard/logs', isAuthenticated, async (req, res) => {
    if (req.body.log_channel_id !== undefined) {
      await ConfigHelper.set('log_channel_id', req.body.log_channel_id || null);
    }
    for (const item of LOG_CONFIG_KEYS) {
      const isEnabled = req.body[item.key] === 'true' || req.body[item.key] === 'on' || req.body[item.key] === true;
      await ConfigHelper.set(item.key, isEnabled);
    }
    res.status(200).send();
  });

  // Legacy Customization Config Save
  app.post('/dashboard/customization', isAuthenticated, async (req, res) => {
    const fields = [
      'bot_status_type', 'bot_status_text', 'bot_status_state', 'bot_status_url',
      'embed_footer_text', 'embed_footer_icon_url', 'embed_color'
    ];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        await ConfigHelper.set(field, req.body[field]);
      }
    }
    await updateBotStatus(client);
    res.status(200).send();
  });

  // Helper to send JSON response
  function sendTableOrJson(req, res, template, data) {
    return res.json(data);
  }

  // 2. Auto-Role Routes
  async function handleAutoRoleAdd(req, res) {
    const roleId = req.body.roleId;
    if (roleId) {
      await AutoRole.findOrCreate({ where: { roleId } });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const autoRoles = await fetchAutoRoles(guild);
    return sendTableOrJson(req, res, 'partials/autoroles_table.html', { autoRoles });
  }

  async function handleAutoRoleDelete(req, res) {
    const roleId = req.params.roleId;
    await AutoRole.destroy({ where: { roleId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const autoRoles = await fetchAutoRoles(guild);
    return sendTableOrJson(req, res, 'partials/autoroles_table.html', { autoRoles });
  }

  app.post('/api/autorole', isAuthenticated, handleAutoRoleAdd);
  app.post('/dashboard/autorole', isAuthenticated, handleAutoRoleAdd);
  app.delete('/api/autorole/:roleId', isAuthenticated, handleAutoRoleDelete);
  app.delete('/dashboard/autorole/:roleId', isAuthenticated, handleAutoRoleDelete);

  // 3. Warn Actions (Thresholds)
  async function handleWarnActionAdd(req, res) {
    const { warnsCount, action, duration } = req.body;
    if (warnsCount && action) {
      const parsedCount = parseInt(warnsCount, 10);
      if (isNaN(parsedCount) || parsedCount < 1) {
        if (req.accepts('json') || req.path.startsWith('/api')) {
          return res.status(400).json({ error: 'Le seuil d\'avertissements doit être un nombre positif supérieur à 0.' });
        }
        return res.status(400).send('Seuil d\'avertissements invalide');
      }

      let parsedDuration = null;
      if (action === 'mute') {
        const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60; // 2419200s (28 jours max autorisé par Discord)
        parsedDuration = parseInt(duration || 86400, 10);
        if (isNaN(parsedDuration) || parsedDuration < 10) {
          parsedDuration = 10;
        }
        if (parsedDuration > MAX_TIMEOUT_SECONDS) {
          if (req.accepts('json') || req.path.startsWith('/api')) {
            return res.status(400).json({ 
              error: 'La durée maximale d\'exclusion temporaire autorisée par l\'API Discord est de 28 jours (2 419 200 secondes).' 
            });
          }
          parsedDuration = MAX_TIMEOUT_SECONDS;
        }
      }

      await WarnAction.upsert({
        warnsCount: parsedCount,
        action,
        duration: parsedDuration
      });
    }
    const warnActions = await fetchWarnActions();
    return sendTableOrJson(req, res, 'partials/warnactions_table.html', { warnActions });
  }

  async function handleWarnActionDelete(req, res) {
    const count = req.params.count;
    await WarnAction.destroy({ where: { warnsCount: count } });
    const warnActions = await fetchWarnActions();
    return sendTableOrJson(req, res, 'partials/warnactions_table.html', { warnActions });
  }

  app.post('/api/warnaction', isAuthenticated, handleWarnActionAdd);
  app.post('/dashboard/warnaction', isAuthenticated, handleWarnActionAdd);
  app.delete('/api/warnaction/:count', isAuthenticated, handleWarnActionDelete);
  app.delete('/dashboard/warnaction/:count', isAuthenticated, handleWarnActionDelete);

  // 4. Tickets Category Config & Deploy
  app.post('/dashboard/tickets', isAuthenticated, async (req, res) => {
    const { ticket_category_id, ticket_staff_role_id } = req.body;
    await ConfigHelper.set('ticket_category_id', ticket_category_id || '');
    await ConfigHelper.set('ticket_staff_role_id', ticket_staff_role_id || '');
    res.status(200).send();
  });

  async function handleTicketDeploy(req, res) {
    try {
      const channelId = req.body.channel_id;
      if (!channelId) return res.status(400).send('Salon requis');

      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) return res.status(500).send('Serveur introuvable');

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).send('Salon introuvable');

      const embeds = require('../bot/utils/embeds');
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

      const ticketEmbed = embeds.custom(
        '🎫 Support - Ouvrir un Ticket',
        `Besoin d'aide ? Vous rencontrez un problème ?\n` +
        `Cliquez sur le bouton ci-dessous pour ouvrir un ticket et entrer en contact avec notre équipe.`,
        embeds.COLORS.PRIMARY
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket_btn')
          .setLabel('🎫 Créer un Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [ticketEmbed],
        components: [row]
      });

      console.log(`[Dashboard] Message d'ouverture de ticket déployé dans #${channel.name} (${channel.id})`);
      if (req.accepts('json') || req.path.startsWith('/api')) {
        return res.json({ success: true });
      }
      res.status(200).send();
    } catch (error) {
      console.error('[Dashboard Tickets Deploy] Erreur :', error);
      res.status(500).send('Erreur lors de l\'envoi du message');
    }
  }

  app.post('/api/tickets/deploy', isAuthenticated, handleTicketDeploy);
  app.post('/dashboard/tickets/deploy', isAuthenticated, handleTicketDeploy);

  // 5. XP General Config
  app.post('/dashboard/xp', isAuthenticated, async (req, res) => {
    const { xp_enabled, xp_min_gain, xp_max_gain, xp_cooldown_seconds, xp_announcement_channel_id } = req.body;
    await ConfigHelper.set('xp_enabled', xp_enabled === 'true');
    await ConfigHelper.set('xp_min_gain', parseInt(xp_min_gain || 15));
    await ConfigHelper.set('xp_max_gain', parseInt(xp_max_gain || 25));
    await ConfigHelper.set('xp_cooldown_seconds', parseInt(xp_cooldown_seconds || 60));
    await ConfigHelper.set('xp_announcement_channel_id', xp_announcement_channel_id || '');
    res.status(200).send();
  });

  // 6. Role Rewards Config
  async function handleRoleRewardAdd(req, res) {
    const { level, roleId, replacePreviousRole } = req.body;
    if (level && roleId) {
      await RoleReward.upsert({
        level: parseInt(level),
        roleId,
        replacePreviousRole: replacePreviousRole === true || replacePreviousRole === 'true'
      });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleRewards = await fetchRoleRewards(guild);
    return sendTableOrJson(req, res, 'partials/rolerewards_table.html', { roleRewards });
  }

  async function handleRoleRewardDelete(req, res) {
    const level = req.params.level;
    await RoleReward.destroy({ where: { level } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleRewards = await fetchRoleRewards(guild);
    return sendTableOrJson(req, res, 'partials/rolerewards_table.html', { roleRewards });
  }

  app.post('/api/rolereward', isAuthenticated, handleRoleRewardAdd);
  app.post('/dashboard/rolereward', isAuthenticated, handleRoleRewardAdd);
  app.delete('/api/rolereward/:level', isAuthenticated, handleRoleRewardDelete);
  app.delete('/dashboard/rolereward/:level', isAuthenticated, handleRoleRewardDelete);

  // 7. Automod Rules Config
  async function handleAutomodAdd(req, res) {
    const { 
      channelId, ruleType, 
      spam_max, spam_interval, 
      duplicate_max, duplicate_interval, 
      words_list, 
      min_length, max_length, regex_pattern,
      scope, monitoredTypes, customReason 
    } = req.body;
    
    let actionsArray = [];
    if (Array.isArray(req.body.actions)) {
      actionsArray = req.body.actions;
    } else if (req.body.actions) {
      actionsArray = [req.body.actions];
    } else {
      actionsArray = ['delete'];
    }
    const actionsJson = JSON.stringify(actionsArray);

    let parameters = '{}';
    if (ruleType === 'spam') {
      parameters = JSON.stringify({
        maxMessages: parseInt(spam_max || 5),
        intervalSeconds: parseInt(spam_interval || 5)
      });
    } else if (ruleType === 'duplicate') {
      parameters = JSON.stringify({
        maxDuplicates: parseInt(duplicate_max || 3),
        intervalSeconds: parseInt(duplicate_interval || 15)
      });
    } else if (ruleType === 'words_blacklist' || ruleType === 'words_whitelist') {
      const words = Array.isArray(words_list)
        ? words_list
        : (words_list ? words_list.split(',').map(w => w.trim()).filter(w => w.length > 0) : []);
      parameters = JSON.stringify(words);
    } else if (ruleType === 'min_length') {
      parameters = JSON.stringify({ minLength: parseInt(min_length || 0) });
    } else if (ruleType === 'max_length') {
      parameters = JSON.stringify({ maxLength: parseInt(max_length || 2000) });
    } else if (ruleType === 'regex') {
      parameters = JSON.stringify({ pattern: regex_pattern || '' });
    }

    await AutomodRule.create({
      channelId,
      ruleType,
      parameters,
      actions: actionsJson,
      scope: scope || 'all_messages',
      monitoredTypes: monitoredTypes || 'all',
      customReason: customReason || null
    });

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const automodRules = await fetchAutomodRules(guild);
    return sendTableOrJson(req, res, 'partials/automod_table.html', { automodRules });
  }

  async function handleAutomodDelete(req, res) {
    const id = req.params.id;
    await AutomodRule.destroy({ where: { id } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const automodRules = await fetchAutomodRules(guild);
    return sendTableOrJson(req, res, 'partials/automod_table.html', { automodRules });
  }

  app.post('/api/automod', isAuthenticated, handleAutomodAdd);
  app.post('/dashboard/automod', isAuthenticated, handleAutomodAdd);
  app.delete('/api/automod/:id', isAuthenticated, handleAutomodDelete);
  app.delete('/dashboard/automod/:id', isAuthenticated, handleAutomodDelete);

  // 8. XP Multipliers Routes
  async function handleXpMultiplierAdd(req, res) {
    const { channelId, multiplier } = req.body;
    if (channelId && multiplier) {
      await XPMultiplier.upsert({
        channelId,
        multiplier: parseFloat(multiplier)
      });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const xpMultipliers = await fetchXpMultipliers(guild);
    return sendTableOrJson(req, res, 'partials/xpmultipliers_table.html', { xpMultipliers });
  }

  async function handleXpMultiplierDelete(req, res) {
    const channelId = req.params.channelId;
    await XPMultiplier.destroy({ where: { channelId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const xpMultipliers = await fetchXpMultipliers(guild);
    return sendTableOrJson(req, res, 'partials/xpmultipliers_table.html', { xpMultipliers });
  }

  app.post('/api/xpmultiplier', isAuthenticated, handleXpMultiplierAdd);
  app.post('/dashboard/xpmultiplier', isAuthenticated, handleXpMultiplierAdd);
  app.delete('/api/xpmultiplier/:channelId', isAuthenticated, handleXpMultiplierDelete);
  app.delete('/dashboard/xpmultiplier/:channelId', isAuthenticated, handleXpMultiplierDelete);

  // SPA & Legacy Fallback Routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint introuvable' });
    }
    if (req.path.includes('.')) {
      return next();
    }

    const distIndexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }

    if (req.path === '/login') {
      if (req.session && req.session.authenticated) return res.redirect('/dashboard');
      return res.status(200).send('Pyro Bot Dashboard - Veuillez exécuter "npm run build".');
    }

    return res.redirect('/dashboard');
  });

  // CSRF and Security Error Handler
  app.use((err, req, res, next) => {
    if (err && (err.code === 'EBADCSRFTOKEN' || (err.message && err.message.toLowerCase().includes('csrf')))) {
      console.warn(`[Security] Requête CSRF bloquée depuis l'IP ${req.ip} sur ${req.originalUrl}`);
      return res.status(403).json({ error: 'Session expirée ou jeton CSRF invalide. Veuillez rafraîchir la page.' });
    }
    next(err);
  });

  // Start Express listener explicitly binding to 0.0.0.0 and integer port
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Dashboard Web] Serveur démarré avec succès sur le port ${port} (http://0.0.0.0:${port})`);
  });
}

module.exports = {
  startWebServer
};
