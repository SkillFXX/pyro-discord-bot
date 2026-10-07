const express = require('express');
const { ConfigHelper, LOG_CONFIG_KEYS } = require('../../database');
const { updateBotStatus } = require('../../bot/events/ready');
const { requireAdmin } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

async function handleConfigSave(section, body, client) {
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
        const memberCounterService = require('../../services/memberCounterService');
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
    const ticketFields = [
      'ticket_category_id', 'ticket_staff_role_id',
      'ticket_panel_title', 'ticket_panel_message',
      'ticket_embed_title', 'ticket_embed_message'
    ];
    for (const field of ticketFields) {
      if (body[field] !== undefined) {
        await ConfigHelper.set(field, body[field] || '');
      }
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
    if (body.xp_voice_enabled !== undefined) {
      await ConfigHelper.set('xp_voice_enabled', body.xp_voice_enabled === true || body.xp_voice_enabled === 'true');
    }
    if (body.xp_voice_gain !== undefined) {
      await ConfigHelper.set('xp_voice_gain', parseInt(body.xp_voice_gain || 10, 10));
    }
    if (body.xp_voice_interval_seconds !== undefined) {
      await ConfigHelper.set('xp_voice_interval_seconds', Math.max(10, parseInt(body.xp_voice_interval_seconds || 60, 10)));
    }
    if (body.xp_voice_min_members !== undefined) {
      await ConfigHelper.set('xp_voice_min_members', Math.max(1, parseInt(body.xp_voice_min_members || 2, 10)));
    }
    if (body.xp_voice_ignore_muted !== undefined) {
      await ConfigHelper.set('xp_voice_ignore_muted', body.xp_voice_ignore_muted === true || body.xp_voice_ignore_muted === 'true');
    }
    if (body.xp_voice_ignore_deafened !== undefined) {
      await ConfigHelper.set('xp_voice_ignore_deafened', body.xp_voice_ignore_deafened === true || body.xp_voice_ignore_deafened === 'true');
    }
    if (body.xp_public_leaderboard !== undefined) {
      await ConfigHelper.set('xp_public_leaderboard', body.xp_public_leaderboard === true || body.xp_public_leaderboard === 'true');
    }
    if (body.xp_leaderboard_search !== undefined) {
      await ConfigHelper.set('xp_leaderboard_search', body.xp_leaderboard_search === true || body.xp_leaderboard_search === 'true');
    }
  } else if (section === 'gaming') {
    if (body.brawlstars_api_key !== undefined) {
      await ConfigHelper.set('brawlstars_api_key', (body.brawlstars_api_key || '').trim());
    }
  } else if (section === 'music') {
    if (body.music_enabled !== undefined) {
      await ConfigHelper.set('music_enabled', body.music_enabled === true || body.music_enabled === 'true');
    }
    if (body.music_lavalink_host !== undefined) {
      await ConfigHelper.set('music_lavalink_host', (body.music_lavalink_host || '').trim());
    }
    if (body.music_lavalink_port !== undefined) {
      await ConfigHelper.set('music_lavalink_port', parseInt(body.music_lavalink_port || 2333, 10));
    }
    if (body.music_lavalink_pass !== undefined) {
      await ConfigHelper.set('music_lavalink_pass', body.music_lavalink_pass || '');
    }
    if (body.music_lavalink_secure !== undefined) {
      await ConfigHelper.set('music_lavalink_secure', body.music_lavalink_secure === true || body.music_lavalink_secure === 'true');
    }
    if (body.music_allowed_roles !== undefined) {
      const roles = Array.isArray(body.music_allowed_roles) ? body.music_allowed_roles : [];
      await ConfigHelper.set('music_allowed_roles', roles);
    }
    if (body.music_allowed_channels !== undefined) {
      const channels = Array.isArray(body.music_allowed_channels) ? body.music_allowed_channels : [];
      await ConfigHelper.set('music_allowed_channels', channels);
    }
    if (body.music_default_volume !== undefined) {
      const vol = Math.min(100, Math.max(1, parseInt(body.music_default_volume || 80, 10)));
      await ConfigHelper.set('music_default_volume', vol);
    }
    if (body.music_search_provider !== undefined) {
      await ConfigHelper.set('music_search_provider', body.music_search_provider || 'ytsearch');
    }
    if (body.music_247 !== undefined) {
      await ConfigHelper.set('music_247', body.music_247 === true || body.music_247 === 'true');
    }

    const musicService = require('../../services/musicService');
    await musicService.reconfigure(client);
  }
}

function createConfigRouter(client) {
  const router = express.Router();

  // Apply rate limiter to all configuration routes
  router.use(apiLimiter);

  // Unified Config Save API (requires ADMINISTRATOR)
  router.post('/api/config/:section', requireAdmin, async (req, res) => {
    try {
      await handleConfigSave(req.params.section, req.body, client);
      res.json({ success: true });
    } catch (err) {
      console.error('[API Config Save] Error:', err);
      res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
    }
  });

  // Test Lavalink node connection endpoint
  router.post('/api/music/test-node', requireAdmin, async (req, res) => {
    try {
      const { host, port, pass, secure } = req.body;
      const musicService = require('../../services/musicService');
      const result = await musicService.testNode({
        host: (host || '').trim(),
        port: parseInt(port || 2333, 10),
        pass: pass || '',
        secure: secure === true || secure === 'true',
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get live music status
  router.get('/api/music/status', requireAdmin, (req, res) => {
    const musicService = require('../../services/musicService');
    res.json(musicService.getStatus());
  });

  // Legacy route aliases for full backwards compatibility
  const legacySections = ['general', 'logs', 'customization', 'tickets', 'xp', 'gaming', 'music'];
  for (const sec of legacySections) {
    router.post(`/dashboard/${sec}`, requireAdmin, async (req, res) => {
      try {
        await handleConfigSave(sec, req.body, client);
        res.status(200).send();
      } catch (err) {
        console.error(`[Legacy Config Save ${sec}] Error:`, err);
        res.status(500).send('Erreur lors de la sauvegarde');
      }
    });
  }

  return router;
}

module.exports = createConfigRouter;

