const { Op } = require('sequelize');
const { UserXP, UserSnapshot, ConfigHelper } = require('../../database');
const { getXPNeededForLevel } = require('../../bot/utils/xpHelper');

/**
 * Retrieves public leaderboard data for the web interface.
 * Checks if leveling and public leaderboard are enabled.
 * Supports pagination (limit & offset) and server-side search.
 * 
 * @param {import('discord.js').Client} client 
 * @param {object} options
 * @param {number} [options.limit=10]
 * @param {number} [options.offset=0]
 * @param {string} [options.search='']
 * @returns {Promise<object>}
 */
async function getLeaderboardData(client, options = {}) {
  const xpEnabled = await ConfigHelper.get('xp_enabled', true);
  const publicLeaderboardEnabled = await ConfigHelper.get('xp_public_leaderboard', true);
  const searchEnabled = await ConfigHelper.get('xp_leaderboard_search', true);
  const themeColor = (await ConfigHelper.get('embed_color')) || '#FF6B35';

  if (!xpEnabled || !publicLeaderboardEnabled) {
    return {
      enabled: false,
      reason: 'Le système de niveaux ou le classement public est actuellement désactivé sur ce serveur.',
      themeColor,
    };
  }

  const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 10));
  const offset = Math.max(0, parseInt(options.offset, 10) || 0);
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const guildId = process.env.GUILD_ID;
  const guild = (client && client.guilds) ? client.guilds.cache.get(guildId) : null;

  let whereClause = {};
  if (search) {
    // Find matching snapshots by username or displayName
    const matchingSnapshots = await UserSnapshot.findAll({
      where: {
        [Op.or]: [
          { username: { [Op.like]: `%${search}%` } },
          { displayName: { [Op.like]: `%${search}%` } },
        ],
      },
      attributes: ['userId'],
      raw: true,
    });
    const matchedUserIds = matchingSnapshots.map(s => s.userId);

    const isNum = !isNaN(parseInt(search, 10));
    const orConditions = [];
    if (matchedUserIds.length > 0) {
      orConditions.push({ userId: { [Op.in]: matchedUserIds } });
    }
    orConditions.push({ userId: { [Op.like]: `%${search}%` } });
    if (isNum) {
      orConditions.push({ level: parseInt(search, 10) });
    }

    whereClause = { [Op.or]: orConditions };
  }

  const totalCount = await UserXP.count({ where: whereClause });

  const topUsers = await UserXP.findAll({
    where: whereClause,
    order: [['xp', 'DESC']],
    limit,
    offset,
  });

  // Query snapshots in bulk for offline / non-cached members
  const userIds = topUsers.map(u => u.userId);
  const snapshots = await UserSnapshot.findAll({
    where: { userId: userIds },
    raw: true,
  });
  const snapshotMap = new Map(snapshots.map(s => [s.userId, s]));

  const leaderboard = await Promise.all(topUsers.map(async (record, index) => {
    let rank;
    if (search) {
      const higherCount = await UserXP.count({
        where: {
          xp: { [Op.gt]: record.xp },
        },
      });
      rank = higherCount + 1;
    } else {
      rank = offset + index + 1;
    }

    const member = guild?.members?.cache?.get(record.userId);
    const snapshot = snapshotMap.get(record.userId);

    const username = member?.user?.username || snapshot?.username || 'Membre';
    const displayName = member?.displayName || snapshot?.displayName || username;

    let avatarUrl = member?.displayAvatarURL({ size: 128, extension: 'png' }) || snapshot?.avatarUrl;
    if (!avatarUrl) {
      try {
        const defaultIndex = (BigInt(record.userId) >> 22n) % 6n;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
      } catch {
        avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }
    }

    const level = record.level || 0;
    const currentXP = record.xp || 0;
    const levelStartXP = getXPNeededForLevel(level);
    const levelEndXP = getXPNeededForLevel(level + 1);
    const xpInLevel = Math.max(0, currentXP - levelStartXP);
    const xpRequiredForNext = Math.max(1, levelEndXP - levelStartXP);
    const progressPercent = Math.min(100, Math.max(0, Math.round((xpInLevel / xpRequiredForNext) * 100)));

    return {
      rank,
      userId: record.userId,
      username,
      displayName,
      avatarUrl,
      level,
      xp: currentXP,
      xpInLevel,
      xpRequiredForNext,
      levelStartXP,
      levelEndXP,
      progressPercent,
    };
  }));

  return {
    enabled: true,
    searchEnabled,
    themeColor,
    serverName: guild?.name || 'Serveur Discord',
    serverIcon: guild?.iconURL({ size: 128, extension: 'png' }) || null,
    botName: client?.user?.displayName || client?.user?.username || 'Pyro Bot',
    botAvatar: client?.user?.displayAvatarURL({ size: 128, extension: 'png' }) || '/icon.svg',
    totalCount,
    offset,
    limit,
    hasMore: (offset + topUsers.length) < totalCount,
    leaderboard,
  };
}

module.exports = {
  getLeaderboardData,
};
