const express = require('express');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
  AutoRole, 
  WarnAction, 
  RoleReward, 
  AutomodRule, 
  XPMultiplier, 
  ConfigHelper 
} = require('../../database');
const { 
  fetchAutoRoles, 
  fetchWarnActions, 
  fetchRoleRewards, 
  fetchAutomodRules, 
  fetchXpMultipliers 
} = require('../services/guildService');
const { requireAdmin } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const embeds = require('../../bot/utils/embeds');

function createFeaturesRouter(client) {
  const router = express.Router();

  // Apply rate limiter to all feature routes
  router.use(apiLimiter);

  // 1. Auto-Role Handlers
  async function handleAutoRoleAdd(req, res) {
    const roleId = req.body.roleId;
    if (roleId) {
      await AutoRole.findOrCreate({ where: { roleId } });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const autoRoles = await fetchAutoRoles(guild);
    return res.json({ autoRoles });
  }

  async function handleAutoRoleDelete(req, res) {
    const roleId = req.params.roleId;
    await AutoRole.destroy({ where: { roleId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const autoRoles = await fetchAutoRoles(guild);
    return res.json({ autoRoles });
  }

  router.post(['/api/autorole', '/dashboard/autorole'], requireAdmin, handleAutoRoleAdd);
  router.delete(['/api/autorole/:roleId', '/dashboard/autorole/:roleId'], requireAdmin, handleAutoRoleDelete);

  // 2. Warn Actions Handlers
  async function handleWarnActionAdd(req, res) {
    const { warnsCount, action, duration } = req.body;
    if (warnsCount && action) {
      const parsedCount = parseInt(warnsCount, 10);
      if (isNaN(parsedCount) || parsedCount < 1) {
        return res.status(400).json({ error: 'Le seuil d\'avertissements doit être un nombre positif supérieur à 0.' });
      }

      let parsedDuration = null;
      if (action === 'mute') {
        const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60; // 2419200s (28 jours max autorisé par Discord)
        parsedDuration = parseInt(duration || 86400, 10);
        if (isNaN(parsedDuration) || parsedDuration < 10) {
          parsedDuration = 10;
        }
        if (parsedDuration > MAX_TIMEOUT_SECONDS) {
          return res.status(400).json({ 
            error: 'La durée maximale d\'exclusion temporaire autorisée par l\'API Discord est de 28 jours (2 419 200 secondes).' 
          });
        }
      }

      await WarnAction.upsert({
        warnsCount: parsedCount,
        action,
        duration: parsedDuration
      });
    }
    const warnActions = await fetchWarnActions();
    return res.json({ warnActions });
  }

  async function handleWarnActionDelete(req, res) {
    const count = req.params.count;
    await WarnAction.destroy({ where: { warnsCount: count } });
    const warnActions = await fetchWarnActions();
    return res.json({ warnActions });
  }

  router.post(['/api/warnaction', '/dashboard/warnaction'], requireAdmin, handleWarnActionAdd);
  router.delete(['/api/warnaction/:count', '/dashboard/warnaction/:count'], requireAdmin, handleWarnActionDelete);

  // 3. Tickets Deploy Handler
  async function handleTicketDeploy(req, res) {
    try {
      const channelId = req.body.channel_id;
      if (!channelId) return res.status(400).json({ error: 'Salon requis' });

      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) return res.status(500).json({ error: 'Serveur introuvable' });

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).json({ error: 'Salon introuvable' });

      const panelTitle = (await ConfigHelper.get('ticket_panel_title')) || '🎫 Support - Ouvrir un Ticket';
      const panelMessage = (await ConfigHelper.get('ticket_panel_message')) || 
        `Besoin d'aide ? Vous rencontrez un problème ?\n` +
        `Cliquez sur le bouton ci-dessous pour ouvrir un ticket et entrer en contact avec notre équipe.`;

      const ticketEmbed = embeds.custom(
        panelTitle,
        panelMessage,
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
      return res.json({ success: true });
    } catch (error) {
      console.error('[Dashboard Tickets Deploy] Erreur :', error);
      res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
    }
  }

  router.post(['/api/tickets/deploy', '/dashboard/tickets/deploy'], requireAdmin, handleTicketDeploy);

  // 4. Role Rewards Handlers
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
    return res.json({ roleRewards });
  }

  async function handleRoleRewardDelete(req, res) {
    const level = req.params.level;
    await RoleReward.destroy({ where: { level } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleRewards = await fetchRoleRewards(guild);
    return res.json({ roleRewards });
  }

  router.post(['/api/rolereward', '/dashboard/rolereward'], requireAdmin, handleRoleRewardAdd);
  router.delete(['/api/rolereward/:level', '/dashboard/rolereward/:level'], requireAdmin, handleRoleRewardDelete);

  // 5. Automod Rules Handlers
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
    return res.json({ automodRules });
  }

  async function handleAutomodDelete(req, res) {
    const id = req.params.id;
    await AutomodRule.destroy({ where: { id } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const automodRules = await fetchAutomodRules(guild);
    return res.json({ automodRules });
  }

  router.post(['/api/automod', '/dashboard/automod'], requireAdmin, handleAutomodAdd);
  router.delete(['/api/automod/:id', '/dashboard/automod/:id'], requireAdmin, handleAutomodDelete);

  // 6. XP Multipliers Handlers
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
    return res.json({ xpMultipliers });
  }

  async function handleXpMultiplierDelete(req, res) {
    const channelId = req.params.channelId;
    await XPMultiplier.destroy({ where: { channelId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const xpMultipliers = await fetchXpMultipliers(guild);
    return res.json({ xpMultipliers });
  }

  router.post(['/api/xpmultiplier', '/dashboard/xpmultiplier'], requireAdmin, handleXpMultiplierAdd);
  router.delete(['/api/xpmultiplier/:channelId', '/dashboard/xpmultiplier/:channelId'], requireAdmin, handleXpMultiplierDelete);

  return router;
}

module.exports = createFeaturesRouter;

