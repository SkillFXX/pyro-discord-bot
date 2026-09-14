const express = require('express');
const { ConfigHelper, LOG_CONFIG_KEYS } = require('../../database');
const { updateBotStatus } = require('../../bot/events/ready');
const { isAuthenticated } = require('../middleware/auth');

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
  }
}

function createConfigRouter(client) {
  const router = express.Router();

  // Unified Config Save API
  router.post('/api/config/:section', isAuthenticated, async (req, res) => {
    try {
      await handleConfigSave(req.params.section, req.body, client);
      res.json({ success: true });
    } catch (err) {
      console.error('[API Config Save] Error:', err);
      res.status(500).json({ error: 'Erreur lors de la sauvegarde de la configuration' });
    }
  });

  // Legacy route aliases for full backwards compatibility
  const legacySections = ['general', 'logs', 'customization', 'tickets', 'xp'];
  for (const sec of legacySections) {
    router.post(`/dashboard/${sec}`, isAuthenticated, async (req, res) => {
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

