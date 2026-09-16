const express = require('express');
const path = require('path');
const fs = require('fs');
const { isAuthenticated } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { getGuildContext, getDashboardLists } = require('../services/guildService');
const { ConfigHelper, LOG_CONFIG_KEYS } = require('../../database');

function createDashboardRouter(client, distDir) {
  const router = express.Router();

  // Apply rate limiter to all dashboard routes
  router.use(apiLimiter);

  // SPA Dashboard Bootstrap JSON API
  router.get('/api/dashboard/init', apiLimiter, isAuthenticated, async (req, res) => {
    try {
      const guildContext = await getGuildContext(client);
      const lists = await getDashboardLists(client);

      const isAdmin = Boolean(req.session?.permissions?.isAdmin);

      const logKeys = LOG_CONFIG_KEYS.map(k => k.key);
      const configKeys = [
        'bot_status_type', 'bot_status_text', 'bot_status_state', 'bot_status_url',
        'embed_footer_text', 'embed_footer_icon_url', 'embed_color',
        'log_channel_id', 'welcome_channel_id', 'leave_channel_id',
        'voice_creator_channel_id', 'voice_creator_category_id',
        'welcome_message_template', 'leave_message_template',
        'member_counter_channel_id', 'member_counter_template',
        'ticket_category_id', 'ticket_staff_role_id',
        'ticket_panel_title', 'ticket_panel_message',
        'ticket_embed_title', 'ticket_embed_message',
        'xp_enabled', 'xp_min_gain', 'xp_max_gain', 'xp_cooldown_seconds', 'xp_announcement_channel_id',
        ...logKeys
      ];

      const config = {};
      if (isAdmin) {
        for (const key of configKeys) {
          config[key] = await ConfigHelper.get(key);
        }
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
        user: req.session.user || null,
        permissions: req.session.permissions || null,
        config: isAdmin ? config : {},
        logConfigKeys: isAdmin ? LOG_CONFIG_KEYS : [],
        ...(isAdmin ? lists : { autoRoles: [], warnActions: [], roleRewards: [], automodRules: [], xpMultipliers: [] })
      });
    } catch (error) {
      console.error('[API Dashboard Init] Error:', error);
      res.status(500).json({ error: 'Erreur lors du chargement des données' });
    }
  });

  // Dashboard SPA Main route (serves the SPA, rate limited)
  router.get('/dashboard', apiLimiter, (req, res) => {
    const distIndexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return res.sendFile(distIndexPath);
    }
    res.status(200).send('Pyro Bot Dashboard - Veuillez exécuter "npm run build".');
  });

  return router;
}

module.exports = createDashboardRouter;

