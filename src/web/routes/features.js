const express = require('express');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
  AutoRole, 
  WarnAction, 
  RoleReward, 
  AutomodRule, 
  XPMultiplier, 
  RoleXPMultiplier,
  BrawlStarsRoleReward,
  BrawlStarsUser,
  ConfigHelper 
} = require('../../database');
const { 
  fetchAutoRoles, 
  fetchWarnActions, 
  fetchRoleRewards, 
  fetchAutomodRules, 
  fetchXpMultipliers,
  fetchRoleXpMultipliers,
  fetchBrawlStarsRewards
} = require('../services/guildService');
const brawlStarsService = require('../../services/brawlStarsService');
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

  async function handleWarnActionUpdate(req, res) {
    const oldCount = parseInt(req.params.count, 10);
    const { warnsCount, action, duration } = req.body;

    const parsedCount = parseInt(warnsCount, 10);
    if (isNaN(parsedCount) || parsedCount < 1) {
      return res.status(400).json({ error: 'Le seuil d\'avertissements doit être un nombre positif supérieur à 0.' });
    }

    let parsedDuration = null;
    if (action === 'mute') {
      const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;
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

    const existing = await WarnAction.findByPk(oldCount);
    if (!existing) {
      return res.status(404).json({ error: 'Seuil introuvable' });
    }

    if (parsedCount !== oldCount) {
      const collision = await WarnAction.findByPk(parsedCount);
      if (collision) {
        return res.status(400).json({ error: `Un seuil d'avertissement existe déjà pour ${parsedCount} avertissement(s).` });
      }
      await WarnAction.destroy({ where: { warnsCount: oldCount } });
      await WarnAction.create({
        warnsCount: parsedCount,
        action,
        duration: parsedDuration
      });
    } else {
      await existing.update({
        action,
        duration: parsedDuration
      });
    }

    const warnActions = await fetchWarnActions();
    return res.json({ warnActions });
  }

  router.post(['/api/warnaction', '/dashboard/warnaction'], requireAdmin, handleWarnActionAdd);
  router.put(['/api/warnaction/:count', '/dashboard/warnaction/:count'], requireAdmin, handleWarnActionUpdate);
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

  async function handleRoleRewardUpdate(req, res) {
    const oldLevel = parseInt(req.params.level, 10);
    const { level, roleId, replacePreviousRole } = req.body;

    const parsedLevel = parseInt(level, 10);
    if (isNaN(parsedLevel) || parsedLevel < 1) {
      return res.status(400).json({ error: 'Le niveau requis doit être un nombre positif supérieur à 0.' });
    }
    if (!roleId) {
      return res.status(400).json({ error: 'Rôle requis' });
    }

    const existing = await RoleReward.findByPk(oldLevel);
    if (!existing) {
      return res.status(404).json({ error: 'Récompense introuvable' });
    }

    const replaceBool = replacePreviousRole === true || replacePreviousRole === 'true';

    if (parsedLevel !== oldLevel) {
      const collision = await RoleReward.findByPk(parsedLevel);
      if (collision) {
        return res.status(400).json({ error: `Une récompense existe déjà pour le niveau ${parsedLevel}.` });
      }
      await RoleReward.destroy({ where: { level: oldLevel } });
      await RoleReward.create({
        level: parsedLevel,
        roleId,
        replacePreviousRole: replaceBool
      });
    } else {
      await existing.update({
        roleId,
        replacePreviousRole: replaceBool
      });
    }

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleRewards = await fetchRoleRewards(guild);
    return res.json({ roleRewards });
  }

  router.post(['/api/rolereward', '/dashboard/rolereward'], requireAdmin, handleRoleRewardAdd);
  router.put(['/api/rolereward/:level', '/dashboard/rolereward/:level'], requireAdmin, handleRoleRewardUpdate);
  router.delete(['/api/rolereward/:level', '/dashboard/rolereward/:level'], requireAdmin, handleRoleRewardDelete);

  // 5. Automod Rules Handlers
  function buildAutomodData(body) {
    const { 
      channelId, ruleType, 
      spam_max, spam_interval, 
      duplicate_max, duplicate_interval, 
      words_list, 
      min_length, max_length, regex_pattern,
      scope, monitoredTypes, customReason,
      mute_duration 
    } = body;
    
    let actionsArray = [];
    if (Array.isArray(body.actions)) {
      actionsArray = body.actions;
    } else if (body.actions) {
      actionsArray = [body.actions];
    } else {
      actionsArray = ['delete'];
    }
    const actionsJson = JSON.stringify(actionsArray);

    const parsedMute = parseInt(mute_duration || 600, 10);
    const safeMuteDuration = isNaN(parsedMute) || parsedMute < 10 
      ? 600 
      : Math.min(parsedMute, 2419200);

    let parameters = '{}';
    if (ruleType === 'spam') {
      parameters = JSON.stringify({
        maxMessages: parseInt(spam_max || 5, 10),
        intervalSeconds: parseInt(spam_interval || 5, 10)
      });
    } else if (ruleType === 'duplicate') {
      parameters = JSON.stringify({
        maxDuplicates: parseInt(duplicate_max || 3, 10),
        intervalSeconds: parseInt(duplicate_interval || 15, 10)
      });
    } else if (ruleType === 'words_blacklist' || ruleType === 'words_whitelist') {
      const words = Array.isArray(words_list)
        ? words_list
        : (words_list ? words_list.split(',').map(w => w.trim()).filter(w => w.length > 0) : []);
      parameters = JSON.stringify(words);
    } else if (ruleType === 'min_length') {
      parameters = JSON.stringify({ minLength: parseInt(min_length || 0, 10) });
    } else if (ruleType === 'max_length') {
      parameters = JSON.stringify({ maxLength: parseInt(max_length || 2000, 10) });
    } else if (ruleType === 'regex') {
      parameters = JSON.stringify({ pattern: regex_pattern || '' });
    }

    return {
      channelId: channelId || 'global',
      ruleType,
      parameters,
      actions: actionsJson,
      scope: scope || 'all_messages',
      monitoredTypes: monitoredTypes || 'all',
      customReason: customReason || null,
      muteDuration: safeMuteDuration
    };
  }

  async function handleAutomodAdd(req, res) {
    const ruleData = buildAutomodData(req.body);
    await AutomodRule.create(ruleData);

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const automodRules = await fetchAutomodRules(guild);
    return res.json({ automodRules });
  }

  async function handleAutomodUpdate(req, res) {
    const id = req.params.id;
    const rule = await AutomodRule.findByPk(id);
    if (!rule) {
      return res.status(404).json({ error: 'Règle introuvable' });
    }

    const ruleData = buildAutomodData(req.body);
    await rule.update(ruleData);

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
  router.put(['/api/automod/:id', '/dashboard/automod/:id'], requireAdmin, handleAutomodUpdate);
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

  async function handleXpMultiplierUpdate(req, res) {
    const channelId = req.params.channelId;
    const { multiplier } = req.body;
    const existing = await XPMultiplier.findByPk(channelId);
    if (!existing) {
      return res.status(404).json({ error: 'Multiplicateur introuvable' });
    }
    await existing.update({ multiplier: parseFloat(multiplier) });
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
  router.put(['/api/xpmultiplier/:channelId', '/dashboard/xpmultiplier/:channelId'], requireAdmin, handleXpMultiplierUpdate);
  router.delete(['/api/xpmultiplier/:channelId', '/dashboard/xpmultiplier/:channelId'], requireAdmin, handleXpMultiplierDelete);

  // 7. Role XP Multipliers Handlers
  async function handleRoleXpMultiplierAdd(req, res) {
    const { roleId, multiplier } = req.body;
    if (roleId && multiplier) {
      await RoleXPMultiplier.upsert({
        roleId,
        multiplier: parseFloat(multiplier)
      });
    }
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleXpMultipliers = await fetchRoleXpMultipliers(guild);
    return res.json({ roleXpMultipliers });
  }

  async function handleRoleXpMultiplierUpdate(req, res) {
    const roleId = req.params.roleId;
    const { multiplier } = req.body;
    const existing = await RoleXPMultiplier.findByPk(roleId);
    if (!existing) {
      return res.status(404).json({ error: 'Multiplicateur de rôle introuvable' });
    }
    await existing.update({ multiplier: parseFloat(multiplier) });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleXpMultipliers = await fetchRoleXpMultipliers(guild);
    return res.json({ roleXpMultipliers });
  }

  async function handleRoleXpMultiplierDelete(req, res) {
    const roleId = req.params.roleId;
    await RoleXPMultiplier.destroy({ where: { roleId } });
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const roleXpMultipliers = await fetchRoleXpMultipliers(guild);
    return res.json({ roleXpMultipliers });
  }

  router.post(['/api/rolexpmultiplier', '/dashboard/rolexpmultiplier'], requireAdmin, handleRoleXpMultiplierAdd);
  router.put(['/api/rolexpmultiplier/:roleId', '/dashboard/rolexpmultiplier/:roleId'], requireAdmin, handleRoleXpMultiplierUpdate);
  router.delete(['/api/rolexpmultiplier/:roleId', '/dashboard/rolexpmultiplier/:roleId'], requireAdmin, handleRoleXpMultiplierDelete);

  // 8. Brawl Stars Rewards & Config Handlers
  async function handleBrawlStarsRewardAdd(req, res) {
    try {
      const { type, threshold, roleId, replacePreviousRole } = req.body;
      if (!type || threshold === undefined || !roleId) {
        return res.status(400).json({ error: 'Champs requis manquants (type, seuil, rôle).' });
      }

      const parsedThreshold = parseInt(threshold, 10);
      if (isNaN(parsedThreshold) || parsedThreshold < 0) {
        return res.status(400).json({ error: 'Le seuil doit être un nombre positif ou nul.' });
      }

      await BrawlStarsRoleReward.create({
        type: type === 'ranked' ? 'ranked' : 'trophies',
        threshold: parsedThreshold,
        roleId,
        replacePreviousRole: Boolean(replacePreviousRole),
      });

      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      const brawlStarsRewards = await fetchBrawlStarsRewards(guild);
      return res.json({ brawlStarsRewards });
    } catch (err) {
      console.error('[Features] Erreur ajout reward Brawl Stars :', err);
      return res.status(500).json({ error: 'Erreur serveur lors de l\'ajout du palier Brawl Stars.' });
    }
  }

  async function handleBrawlStarsRewardUpdate(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { type, threshold, roleId, replacePreviousRole } = req.body;

      const reward = await BrawlStarsRoleReward.findByPk(id);
      if (!reward) {
        return res.status(404).json({ error: 'Palier Brawl Stars introuvable.' });
      }

      const updateData = {};
      if (type) updateData.type = type === 'ranked' ? 'ranked' : 'trophies';
      if (threshold !== undefined) {
        const parsed = parseInt(threshold, 10);
        if (!isNaN(parsed) && parsed >= 0) updateData.threshold = parsed;
      }
      if (roleId) updateData.roleId = roleId;
      if (replacePreviousRole !== undefined) updateData.replacePreviousRole = Boolean(replacePreviousRole);

      await reward.update(updateData);

      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      const brawlStarsRewards = await fetchBrawlStarsRewards(guild);
      return res.json({ brawlStarsRewards });
    } catch (err) {
      console.error('[Features] Erreur modification reward Brawl Stars :', err);
      return res.status(500).json({ error: 'Erreur serveur lors de la modification du palier.' });
    }
  }

  async function handleBrawlStarsRewardDelete(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      await BrawlStarsRoleReward.destroy({ where: { id } });

      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      const brawlStarsRewards = await fetchBrawlStarsRewards(guild);
      return res.json({ brawlStarsRewards });
    } catch (err) {
      console.error('[Features] Erreur suppression reward Brawl Stars :', err);
      return res.status(500).json({ error: 'Erreur serveur lors de la suppression du palier.' });
    }
  }

  async function handleBrawlStarsSync(req, res) {
    try {
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) {
        return res.status(400).json({ error: 'Serveur Discord introuvable.' });
      }

      const linkedUsers = await BrawlStarsUser.findAll();
      let syncedCount = 0;

      for (const u of linkedUsers) {
        try {
          const member = await guild.members.fetch(u.userId).catch(() => null);
          if (member) {
            const freshData = await brawlStarsService.fetchPlayerData(u.playerTag);
            await brawlStarsService.syncUserRoles(client, member, freshData);
            const peakRank = freshData.highestRankedRank ?? u.highestRankedRank ?? 0;
            await u.update({
              playerName: freshData.name || u.playerName,
              lastTrophies: freshData.trophies || 0,
              highestTrophies: freshData.highestTrophies || 0,
              lastRankedRank: peakRank,
              highestRankedRank: peakRank,
              lastCheckedAt: new Date(),
            });
            syncedCount++;
          }
        } catch (_) {}
      }

      return res.json({ success: true, syncedCount, totalUsers: linkedUsers.length });
    } catch (err) {
      console.error('[Features] Erreur sync Brawl Stars :', err);
      return res.status(500).json({ error: 'Erreur serveur lors de la synchronisation des rôles.' });
    }
  }

  async function handleBrawlStarsTestKey(req, res) {
    try {
      const apiKey = req.body.apiKey;
      if (!apiKey || !apiKey.trim()) {
        return res.status(400).json({ valid: false, error: 'Veuillez saisir une clé API.' });
      }

      const testTag = '%232PP';
      const response = await fetch(`https://api.brawlstars.com/v1/players/${testTag}`, {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 403) {
        return res.json({ valid: false, error: 'Clé API refusée (403 Forbidden). Assurez-vous que l\'IP configurée sur le portail Supercell correspond à celle de l\'hébergement.' });
      }

      if (response.ok || response.status === 404) {
        return res.json({ valid: true, message: 'Clé API valide et opérationnelle !' });
      }

      return res.json({ valid: false, error: `Réponse inattendue de l'API (${response.status})` });
    } catch (err) {
      return res.status(500).json({ valid: false, error: err.message });
    }
  }

  router.post(['/api/brawlstars/rewards', '/dashboard/brawlstars/rewards'], requireAdmin, handleBrawlStarsRewardAdd);
  router.put(['/api/brawlstars/rewards/:id', '/dashboard/brawlstars/rewards/:id'], requireAdmin, handleBrawlStarsRewardUpdate);
  router.delete(['/api/brawlstars/rewards/:id', '/dashboard/brawlstars/rewards/:id'], requireAdmin, handleBrawlStarsRewardDelete);
  router.post(['/api/brawlstars/sync', '/dashboard/brawlstars/sync'], requireAdmin, handleBrawlStarsSync);
  router.post(['/api/brawlstars/test-key', '/dashboard/brawlstars/test-key'], requireAdmin, handleBrawlStarsTestKey);

  return router;
}

module.exports = createFeaturesRouter;

