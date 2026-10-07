const { ChannelType } = require('discord.js');
const { 
  AutoRole, 
  WarnAction, 
  RoleReward, 
  AutomodRule, 
  XPMultiplier, 
  RoleXPMultiplier,
  UserSnapshot,
  BrawlStarsRoleReward,
} = require('../../database');
const { RANKED_TIERS } = require('../../services/brawlStarsService');

let cachedGuildContext = null;
let cachedGuildContextTime = 0;

/**
 * Clear cached guild context (useful when roles/channels are updated)
 */
function clearGuildCache() {
  cachedGuildContext = null;
  cachedGuildContextTime = 0;
}

/**
 * Fetch and structure Discord guild context (channels, roles, members) with a 30-second memory cache.
 */
async function getGuildContext(client, forceRefresh = false) {
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

  // Fetch fresh roles from Discord REST API to guarantee all server roles are present
  const fetchedRoles = await guild.roles.fetch().catch((err) => {
    console.warn('[GuildService] Warning fetching roles from Discord API:', err.message);
    return guild.roles.cache;
  });

  const roles = Array.from((fetchedRoles || guild.roles.cache).values())
    .filter(r => r.id !== guild.id && !r.managed)
    .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
    .sort((a, b) => {
      if (b.position !== a.position) {
        return b.position - a.position;
      }
      return a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' });
    });

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
      customReason: r.customReason,
      muteDuration: r.muteDuration || 600
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

async function fetchRoleXpMultipliers(guild) {
  const dbRoleMultipliers = await RoleXPMultiplier.findAll();
  return dbRoleMultipliers.map(m => {
    let roleName = 'Inconnu';
    let roleColor = null;
    if (guild) {
      const r = guild.roles.cache.get(m.roleId);
      if (r) {
        roleName = r.name;
        roleColor = r.hexColor !== '#000000' ? r.hexColor : null;
      }
    }
    return {
      roleId: m.roleId,
      roleName,
      roleColor,
      multiplier: m.multiplier
    };
  });
}

async function fetchBrawlStarsRewards(guild) {
  const dbRewards = await BrawlStarsRoleReward.findAll({ order: [['threshold', 'ASC']] });
  return dbRewards.map(r => {
    let thresholdLabel = `${Number(r.threshold).toLocaleString('fr-FR')} Trophées`;
    if (r.type === 'ranked') {
      const tier = RANKED_TIERS.find(t => t.id === r.threshold);
      thresholdLabel = tier ? tier.name : `Rang ${r.threshold}`;
    }
    return {
      id: r.id,
      type: r.type,
      threshold: r.threshold,
      thresholdLabel,
      roleId: r.roleId,
      roleName: guild ? (guild.roles.cache.get(r.roleId)?.name || 'Rôle Inconnu') : 'Rôle Inconnu',
      replacePreviousRole: r.replacePreviousRole
    };
  });
}

async function getDashboardLists(client) {
  const guildId = process.env.GUILD_ID;
  const guild = client.guilds.cache.get(guildId);

  const [
    autoRoles, 
    warnActions, 
    roleRewards, 
    automodRules, 
    xpMultipliers, 
    roleXpMultipliers,
    brawlStarsRewards,
  ] = await Promise.all([
    fetchAutoRoles(guild),
    fetchWarnActions(),
    fetchRoleRewards(guild),
    fetchAutomodRules(guild),
    fetchXpMultipliers(guild),
    fetchRoleXpMultipliers(guild),
    fetchBrawlStarsRewards(guild),
  ]);

  return { 
    autoRoles, 
    warnActions, 
    roleRewards, 
    automodRules, 
    xpMultipliers, 
    roleXpMultipliers,
    brawlStarsRewards,
  };
}

module.exports = {
  clearGuildCache,
  getGuildContext,
  fetchAutoRoles,
  fetchWarnActions,
  fetchRoleRewards,
  fetchAutomodRules,
  fetchXpMultipliers,
  fetchRoleXpMultipliers,
  fetchBrawlStarsRewards,
  getDashboardLists
};

