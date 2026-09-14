const { ChannelType } = require('discord.js');
const { 
  AutoRole, 
  WarnAction, 
  RoleReward, 
  AutomodRule, 
  XPMultiplier, 
  UserSnapshot 
} = require('../../database');

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

async function getDashboardLists(client) {
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

module.exports = {
  clearGuildCache,
  getGuildContext,
  fetchAutoRoles,
  fetchWarnActions,
  fetchRoleRewards,
  fetchAutomodRules,
  fetchXpMultipliers,
  getDashboardLists
};

