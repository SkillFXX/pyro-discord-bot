const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
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

  // Configure templates using EJS but rendering HTML files
  app.engine('html', require('ejs').renderFile);
  app.set('view engine', 'html');
  app.set('views', path.join(__dirname, 'views'));

  // Middleware
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(express.static(path.join(__dirname, 'views')));

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
      res.status(429).render('login.html', { 
        error: 'Trop de tentatives de connexion depuis cette adresse IP. Veuillez réessayer dans 15 minutes.',
        _csrf: res.locals._csrf || ''
      });
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
    const voiceChannels = [];
    const categories = [];
    
    guild.channels.cache.forEach(c => {
      const channelData = { id: c.id, name: c.name };
      if (c.type === ChannelType.GuildText) textChannels.push({ ...channelData, forum: false });
      else if (c.type === ChannelType.GuildForum) textChannels.push({ ...channelData, forum: true });
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

  // Auth Routes
  app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect('/dashboard');
    }
    res.render('login.html', { error: null, _csrf: res.locals._csrf || '' });
  });

  app.post('/login', loginLimiter, (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check brute-force rate limit
    const rateLimitError = checkLoginRateLimit(clientIp);
    if (rateLimitError) {
      return res.render('login.html', { error: rateLimitError, _csrf: res.locals._csrf || '' });
    }

    const token = req.body.token;
    const expectedToken = process.env.DISCORD_TOKEN;

    // Constant-time comparison preventing timing attacks
    if (expectedToken && safeCompareTokens(token, expectedToken)) {
      loginAttempts.delete(clientIp);
      req.session.authenticated = true;
      return res.redirect('/dashboard');
    }

    recordFailedLogin(clientIp);
    res.render('login.html', { error: 'Token invalide. Veuillez réessayer.', _csrf: res.locals._csrf || '' });
  });

  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
  });

  // Dashboard Main protected route
  app.get('/dashboard', isAuthenticated, async (req, res) => {
    const guildContext = await getGuildContext();
    const lists = await getDashboardLists(guildContext);

    // Fetch config keys
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

    res.render('dashboard.html', {
      guildId: process.env.GUILD_ID,
      serverName: guildContext.guildName,
      channels: guildContext.channels,
      roles: guildContext.roles,
      members: guildContext.members,
      config,
      logConfigKeys: LOG_CONFIG_KEYS,
      ...lists
    });
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

  // --- API SETTINGS POSTS (AJAX / HTMX) ---

  // 1. General Config Save
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

    // Instantly update Bot Status presence
    await updateBotStatus(client);

    // Instantly update Member Counter channel if modified
    if (req.body.member_counter_channel_id !== undefined || req.body.member_counter_template !== undefined) {
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (guild) {
        const memberCounterService = require('../services/memberCounterService');
        await memberCounterService.updateMemberCounter(guild, { force: true });
      }
    }

    res.status(200).send();
  });

  // Logs Config Save
  app.post('/dashboard/logs', isAuthenticated, async (req, res) => {
    // 1. Update log channel
    if (req.body.log_channel_id !== undefined) {
      await ConfigHelper.set('log_channel_id', req.body.log_channel_id || null);
    }

    // 2. Update each log event toggle
    for (const item of LOG_CONFIG_KEYS) {
      const isEnabled = req.body[item.key] === 'true' || req.body[item.key] === 'on' || req.body[item.key] === true;
      await ConfigHelper.set(item.key, isEnabled);
    }

    res.status(200).send();
  });

  // Customization Config Save (Status, Presences, Embed Footer & Color)
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

    // Instantly update Bot Status presence
    await updateBotStatus(client);

    res.status(200).send();
  });

  // 2. Auto-Role Routes
  app.post('/dashboard/autorole', isAuthenticated, async (req, res) => {
    const roleId = req.body.roleId;
    if (roleId) {
      await AutoRole.findOrCreate({ where: { roleId } });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const autoRoles = await fetchAutoRoles(guild);
    res.render('partials/autoroles_table.html', { autoRoles });
  });

  app.delete('/dashboard/autorole/:roleId', isAuthenticated, async (req, res) => {
    const roleId = req.params.roleId;
    await AutoRole.destroy({ where: { roleId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const autoRoles = await fetchAutoRoles(guild);
    res.render('partials/autoroles_table.html', { autoRoles });
  });

  // 3. Warn Actions (Thresholds)
  app.post('/dashboard/warnaction', isAuthenticated, async (req, res) => {
    const { warnsCount, action, duration } = req.body;
    if (warnsCount && action) {
      await WarnAction.upsert({
        warnsCount: parseInt(warnsCount),
        action,
        duration: action === 'mute' ? parseInt(duration || 86400) : null
      });
    }
    const warnActions = await fetchWarnActions();
    res.render('partials/warnactions_table.html', { warnActions });
  });

  app.delete('/dashboard/warnaction/:count', isAuthenticated, async (req, res) => {
    const count = req.params.count;
    await WarnAction.destroy({ where: { warnsCount: count } });
    const warnActions = await fetchWarnActions();
    res.render('partials/warnactions_table.html', { warnActions });
  });

  // 4. Tickets Category Config
  app.post('/dashboard/tickets', isAuthenticated, async (req, res) => {
    const { ticket_category_id, ticket_staff_role_id } = req.body;
    await ConfigHelper.set('ticket_category_id', ticket_category_id || '');
    await ConfigHelper.set('ticket_staff_role_id', ticket_staff_role_id || '');
    res.status(200).send();
  });

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
  app.post('/dashboard/rolereward', isAuthenticated, async (req, res) => {
    const { level, roleId, replacePreviousRole } = req.body;
    if (level && roleId) {
      await RoleReward.upsert({
        level: parseInt(level),
        roleId,
        replacePreviousRole: replacePreviousRole === 'true'
      });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleRewards = await fetchRoleRewards(guild);
    res.render('partials/rolerewards_table.html', { roleRewards });
  });

  app.delete('/dashboard/rolereward/:level', isAuthenticated, async (req, res) => {
    const level = req.params.level;
    await RoleReward.destroy({ where: { level } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleRewards = await fetchRoleRewards(guild);
    res.render('partials/rolerewards_table.html', { roleRewards });
  });

  // 7. Automod Rules Config
  app.post('/dashboard/automod', isAuthenticated, async (req, res) => {
    const { 
      channelId, ruleType, 
      spam_max, spam_interval, 
      duplicate_max, duplicate_interval, 
      words_list, 
      min_length, max_length, regex_pattern,
      scope, monitoredTypes, customReason 
    } = req.body;
    
    // Parse multi-actions from checkbox inputs
    let actionsArray = [];
    if (Array.isArray(req.body.actions)) {
      actionsArray = req.body.actions;
    } else if (req.body.actions) {
      actionsArray = [req.body.actions];
    } else {
      actionsArray = ['delete']; // Default fallback if nothing selected
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
      const words = words_list 
        ? words_list.split(',').map(w => w.trim()).filter(w => w.length > 0) 
        : [];
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
    res.render('partials/automod_table.html', { automodRules });
  });

  app.delete('/dashboard/automod/:id', isAuthenticated, async (req, res) => {
    const id = req.params.id;
    await AutomodRule.destroy({ where: { id } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const automodRules = await fetchAutomodRules(guild);
    res.render('partials/automod_table.html', { automodRules });
  });

  // 8. XP Multipliers Routes
  app.post('/dashboard/xpmultiplier', isAuthenticated, async (req, res) => {
    const { channelId, multiplier } = req.body;
    if (channelId && multiplier) {
      await XPMultiplier.upsert({
        channelId,
        multiplier: parseFloat(multiplier)
      });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const xpMultipliers = await fetchXpMultipliers(guild);
    res.render('partials/xpmultipliers_table.html', { xpMultipliers });
  });

  app.delete('/dashboard/xpmultiplier/:channelId', isAuthenticated, async (req, res) => {
    const channelId = req.params.channelId;
    await XPMultiplier.destroy({ where: { channelId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const xpMultipliers = await fetchXpMultipliers(guild);
    res.render('partials/xpmultipliers_table.html', { xpMultipliers });
  });

  // Root redirect
  app.get('/', (req, res) => {
    res.redirect('/dashboard');
  });

  // CSRF and Security Error Handler
  app.use((err, req, res, next) => {
    if (err && (err.code === 'EBADCSRFTOKEN' || (err.message && err.message.toLowerCase().includes('csrf')))) {
      console.warn(`[Security] Requête CSRF bloquée depuis l'IP ${req.ip} sur ${req.originalUrl}`);
      if (req.headers['hx-request']) {
        return res.status(403).send('<div style="color:#e74c3c;padding:1rem;background:#1a1115;border-radius:6px;font-weight:600;">⚠️ Session expirée ou jeton CSRF invalide. Veuillez rafraîchir la page.</div>');
      }
      return res.status(403).render('login.html', { 
        error: 'Session ou jeton de sécurité expiré. Veuillez vous reconnecter.',
        _csrf: res.locals._csrf || ''
      });
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
