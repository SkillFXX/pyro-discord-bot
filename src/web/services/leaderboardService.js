const { UserXP, UserSnapshot, ConfigHelper } = require('../../database');
const { getXPNeededForLevel } = require('../../bot/utils/xpHelper');

/**
 * Retrieves public leaderboard data for the web interface.
 * Checks if leveling and public leaderboard are enabled.
 * 
 * @param {import('discord.js').Client} client 
 * @returns {Promise<object>}
 */
async function getLeaderboardData(client) {
  const xpEnabled = await ConfigHelper.get('xp_enabled', true);
  const publicLeaderboardEnabled = await ConfigHelper.get('xp_public_leaderboard', true);
  const searchEnabled = await ConfigHelper.get('xp_leaderboard_search', true);

  if (!xpEnabled || !publicLeaderboardEnabled) {
    return {
      enabled: false,
      reason: 'Le système de niveaux ou le classement public est actuellement désactivé sur ce serveur.',
    };
  }

  const guildId = process.env.GUILD_ID;
  const guild = (client && client.guilds) ? client.guilds.cache.get(guildId) : null;

  const topUsers = await UserXP.findAll({
    order: [['xp', 'DESC']],
    limit: 100,
  });

  // Query snapshots in bulk for offline / non-cached members
  const userIds = topUsers.map(u => u.userId);
  const snapshots = await UserSnapshot.findAll({
    where: { userId: userIds },
    raw: true,
  });
  const snapshotMap = new Map(snapshots.map(s => [s.userId, s]));

  const leaderboard = topUsers.map((record, index) => {
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
      rank: index + 1,
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
  });

  return {
    enabled: true,
    searchEnabled,
    serverName: guild?.name || 'Serveur Discord',
    serverIcon: guild?.iconURL({ size: 128, extension: 'png' }) || null,
    botName: client?.user?.displayName || client?.user?.username || 'Pyro Bot',
    botAvatar: client?.user?.displayAvatarURL({ size: 128, extension: 'png' }) || '/icon.svg',
    totalCount: topUsers.length,
    leaderboard,
  };
}

module.exports = {
  getLeaderboardData,
};
