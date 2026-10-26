const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { Op } = require('sequelize');
const { 
  BrawlStarsRoleReward, 
  BrawlStarsUser, 
  BrawlStarsTrophyLog, 
  ConfigHelper 
} = require('../database');

// Rank Tier mapping (Ranked / Power League)
const RANKED_TIERS = [
  { id: 1, name: 'Bronze I', color: '#CD7F32' },
  { id: 2, name: 'Bronze II', color: '#CD7F32' },
  { id: 3, name: 'Bronze III', color: '#CD7F32' },
  { id: 4, name: 'Argent I', color: '#C0C0C0' },
  { id: 5, name: 'Argent II', color: '#C0C0C0' },
  { id: 6, name: 'Argent III', color: '#C0C0C0' },
  { id: 7, name: 'Or I', color: '#FFD700' },
  { id: 8, name: 'Or II', color: '#FFD700' },
  { id: 9, name: 'Or III', color: '#FFD700' },
  { id: 10, name: 'Diamant I', color: '#00E5FF' },
  { id: 11, name: 'Diamant II', color: '#00E5FF' },
  { id: 12, name: 'Diamant III', color: '#00E5FF' },
  { id: 13, name: 'Mythique I', color: '#FF1493' },
  { id: 14, name: 'Mythique II', color: '#FF1493' },
  { id: 15, name: 'Mythique III', color: '#FF1493' },
  { id: 16, name: 'Légendaire I', color: '#FF8C00' },
  { id: 17, name: 'Légendaire II', color: '#FF8C00' },
  { id: 18, name: 'Légendaire III', color: '#FF8C00' },
  { id: 19, name: 'Maître I (Master I)', color: '#FF0055' },
  { id: 20, name: 'Maître II (Master II)', color: '#FF0055' },
  { id: 21, name: 'Maître III (Master III)', color: '#FF0055' },
  { id: 22, name: 'Pro', color: '#A855F7' },
];

/**
 * Draws a clean vector trophy icon with golden gradient and badge.
 * @param {object} ctx Canvas 2D context
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
function drawTrophyIcon(ctx, x, y, size = 36) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 36;
  ctx.scale(s, s);

  // Background badge
  ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(18, 18, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cup gradient
  const gold = ctx.createLinearGradient(10, 8, 26, 24);
  gold.addColorStop(0, '#FDE047');
  gold.addColorStop(0.5, '#F59E0B');
  gold.addColorStop(1, '#D97706');

  ctx.fillStyle = gold;
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 1.2;

  // Trophy Cup
  ctx.beginPath();
  ctx.moveTo(11, 10);
  ctx.lineTo(25, 10);
  ctx.lineTo(23, 19);
  ctx.bezierCurveTo(22, 22, 20, 23, 18, 23);
  ctx.bezierCurveTo(16, 23, 14, 22, 13, 19);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Handles
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(10, 14, 3, 1.5 * Math.PI, 0.5 * Math.PI, true);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(26, 14, 3, 1.5 * Math.PI, 0.5 * Math.PI, false);
  ctx.stroke();

  // Stem
  ctx.fillStyle = '#D97706';
  ctx.fillRect(16.5, 23, 3, 4);

  // Base
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(12, 27, 12, 2.5);

  ctx.restore();
}

/**
 * Draws a clean vector Ranked shield icon with purple glow and golden star.
 * @param {object} ctx Canvas 2D context
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
function drawRankedIcon(ctx, x, y, size = 36) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 36;
  ctx.scale(s, s);

  // Background circular badge glow
  ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(18, 18, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Purple/Magenta Shield gradient
  const shieldGrad = ctx.createLinearGradient(10, 8, 26, 28);
  shieldGrad.addColorStop(0, '#C084FC');
  shieldGrad.addColorStop(0.5, '#9333EA');
  shieldGrad.addColorStop(1, '#6B21A8');

  ctx.fillStyle = shieldGrad;
  ctx.strokeStyle = '#E9D5FF';
  ctx.lineWidth = 1.2;

  // Hexagon/Diamond Shield
  ctx.beginPath();
  ctx.moveTo(18, 7);
  ctx.lineTo(27, 12);
  ctx.lineTo(25, 24);
  ctx.lineTo(18, 29);
  ctx.lineTo(11, 24);
  ctx.lineTo(9, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Golden star in center
  ctx.fillStyle = '#FBBF24';
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 0.8;

  ctx.beginPath();
  const cx = 18;
  const cy = 18;
  const spikes = 5;
  const outerRadius = 5.5;
  const innerRadius = 2.5;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    let sx = cx + Math.cos(rot) * outerRadius;
    let sy = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(sx, sy);
    rot += step;

    sx = cx + Math.cos(rot) * innerRadius;
    sy = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(sx, sy);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Normalizes a Brawl Stars player tag.
 * Replaces 'O' with '0', removes whitespace and ensures '#' prefix.
 * @param {string} tag
 * @returns {string}
 */
function normalizePlayerTag(tag) {
  if (!tag) return '';
  let clean = String(tag).trim().toUpperCase().replace(/O/g, '0');
  if (!clean.startsWith('#')) {
    clean = '#' + clean;
  }
  return clean;
}

/**
 * Retrieves the configured Brawl Stars API key.
 * @returns {Promise<string>}
 */
async function getApiKey() {
  const key = await ConfigHelper.get('brawlstars_api_key', '');
  return (key || process.env.BRAWLSTARS_API_KEY || '').trim();
}

/**
 * Converts Ranked Elo points (or tier ID) into the corresponding Ranked Tier index (1..22).
 * Supports both Ranked 2.0 (standard progression points) and direct tier indices.
 * @param {number} elo
 * @returns {number}
 */
function convertEloToRankedTier(elo) {
  if (typeof elo !== 'number' || isNaN(elo) || elo <= 0) return 0;

  // If already a rank tier ID (1 to 22)
  if (Number.isInteger(elo) && elo >= 1 && elo <= 22) return elo;

  // Ranked points thresholds (Ranked 2.0 / Elo)
  if (elo >= 11250) return 22; // Pro (11250+)
  if (elo >= 11000) return 21; // Maître III (Master III) (11000+)
  if (elo >= 10000) return 20; // Maître II (Master II) (10000+)
  if (elo >= 9000) return 19;  // Maître I (Master I) (9000+)
  if (elo >= 7500) return 18;  // Légendaire III (7500 - 8999)
  if (elo >= 6750) return 17;  // Légendaire II (6750 - 7499)
  if (elo >= 6000) return 16;  // Légendaire I (6000 - 6749)
  if (elo >= 5500) return 15;  // Mythique III (5500 - 5999)
  if (elo >= 5000) return 14;  // Mythique II (5000 - 5499)
  if (elo >= 4500) return 13;  // Mythique I (4500 - 4999)
  if (elo >= 4000) return 12;  // Diamant III (4000 - 4499)
  if (elo >= 3500) return 11;  // Diamant II (3500 - 3999)
  if (elo >= 3000) return 10;  // Diamant I (3000 - 3499)
  if (elo >= 2500) return 9;   // Or III (2500 - 2999)
  if (elo >= 2000) return 8;   // Or II (2000 - 2499)
  if (elo >= 1500) return 7;   // Or I (1500 - 1999)
  if (elo >= 1250) return 6;   // Argent III (1250 - 1499)
  if (elo >= 1000) return 5;   // Argent II (1000 - 1249)
  if (elo >= 750) return 4;    // Argent I (750 - 999)
  if (elo >= 500) return 3;    // Bronze III (500 - 749)
  if (elo >= 250) return 2;    // Bronze II (250 - 499)
  if (elo > 0) return 1;       // Bronze I (1 - 249)

  return 0;
}

/**
 * Fetches player data from the official Brawl Stars API.
 * @param {string} playerTag
 * @returns {Promise<object>}
 */
async function fetchPlayerData(playerTag) {
  const cleanTag = normalizePlayerTag(playerTag);
  if (!cleanTag || cleanTag.length < 3) {
    throw new Error('Tag joueur Brawl Stars invalide.');
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('La clé API Brawl Stars n\'est pas encore configurée. Un administrateur doit la renseigner sur le dashboard web dans l\'onglet Gaming.');
  }

  const encodedTag = encodeURIComponent(cleanTag);
  const url = `https://api.brawlstars.com/v1/players/${encodedTag}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
  } catch (netErr) {
    throw new Error(`Erreur réseau lors de la communication avec l'API Brawl Stars : ${netErr.message}`);
  }

  if (response.status === 404) {
    throw new Error(`Le joueur avec le tag **${cleanTag}** est introuvable. Vérifiez que le tag est correct.`);
  }

  if (response.status === 403) {
    throw new Error('Accès refusé par l\'API Brawl Stars (Code 403). L\'adresse IP de ce serveur est **193.51.159.240**. Pensez à l\'autoriser dans votre clé sur https://developer.brawlstars.com/.');
  }

  if (!response.ok) {
    throw new Error(`Erreur API Brawl Stars (${response.status} ${response.statusText})`);
  }

  const data = await response.json();

  // Extract Peak Ranked Elo & Tier from official player object
  const candidates = [
    data.highestAllTimeRankedElo,
    data.highestRankedElo,
    data.rankedElo,
    data.highestRank,
    data.soloLeagueRank,
    data.highestSoloLeagueRank,
  ].filter(v => typeof v === 'number' && !isNaN(v) && v > 0);

  let bestRank = 0;
  for (const val of candidates) {
    const tier = convertEloToRankedTier(val);
    if (tier > bestRank) {
      bestRank = tier;
    }
  }

  const rawElo = data.highestAllTimeRankedElo || data.highestRankedElo || data.rankedElo || bestRank;

  data.rankedElo = rawElo;
  data.highestAllTimeRankedElo = data.highestAllTimeRankedElo || rawElo;
  data.rankedRank = bestRank;
  data.highestRank = bestRank;
  data.highestRankedRank = bestRank;
  data.soloLeagueRank = bestRank;
  data.currentRankedPoints = Number(data.rankedElo || data.highestAllTimeRankedElo || data.highestRankedElo || 0);

  return data;
}

/**
 * Fetches a profile card directly from SpotLight CDN.
 * Available types: 'trophies' (default), 'ranks', 'mastery', 'trmax'.
 * @param {string} playerTag
 * @param {string} type
 * @returns {Promise<Buffer>}
 */
async function fetchSpotlightCard(playerTag, type = 'trophies') {
  const cleanTag = normalizePlayerTag(playerTag).replace('#', '');
  const validTypes = ['trophies', 'ranks', 'mastery', 'trmax'];
  const cardType = validTypes.includes(type) ? type : 'trophies';
  const url = `https://img.sltbot.com/player/${cleanTag}/${cardType}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Pyro-Discord-Bot/1.0 (+https://github.com/SkillFXX/pyro-discord-bot)',
      },
    });
  } catch (err) {
    throw new Error(`Erreur réseau lors de la récupération de la carte SpotLight : ${err.message}`);
  }

  if (response.status === 404) {
    throw new Error(`Le joueur avec le tag **#${cleanTag}** est introuvable sur Brawl Stars.`);
  }

  if (!response.ok) {
    throw new Error(`Erreur lors de la récupération de la carte SpotLight (${response.status} ${response.statusText}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Validates whether a player tag exists by checking the SpotLight CDN.
 * @param {string} playerTag
 * @returns {Promise<boolean>}
 */
async function validatePlayerTagViaSpotlight(playerTag) {
  const cleanTag = normalizePlayerTag(playerTag).replace('#', '');
  if (!cleanTag || cleanTag.length < 3) return false;

  try {
    const res = await fetch(`https://img.sltbot.com/player/${cleanTag}/trophies`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Pyro-Discord-Bot/1.0',
      },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Computes which role IDs a member should retain based on a metric value
 * and the `replacePreviousRole` settings across configured rewards.
 */
function getExpectedRoleIds(currentValue, rewards) {
  const eligible = rewards.filter(r => r.threshold <= currentValue);
  if (eligible.length === 0) return new Set();

  const expectedRoleIds = new Set();
  let cutoff = 0;

  const sorted = [...eligible].sort((a, b) => b.threshold - a.threshold);
  for (const reward of sorted) {
    if (reward.threshold > cutoff) {
      expectedRoleIds.add(reward.roleId);
      if (reward.replacePreviousRole) {
        cutoff = Math.max(cutoff, reward.threshold);
      }
    }
  }

  return expectedRoleIds;
}

/**
 * Synchronizes Brawl Stars roles for a Discord member based on their stats (peak trophies and best rank).
 */
async function syncUserRoles(client, member, playerData = null) {
  if (!member || !member.guild) return { added: [], removed: [] };

  const guild = member.guild;
  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!botMember) return { added: [], removed: [] };

  const [trophyRewards, rankedRewards] = await Promise.all([
    BrawlStarsRoleReward.findAll({ where: { type: 'trophies' }, order: [['threshold', 'ASC']] }),
    BrawlStarsRoleReward.findAll({ where: { type: 'ranked' }, order: [['threshold', 'ASC']] }),
  ]);

  let currentTrophies = 0;
  let bestRankedIndex = 0;

  if (playerData) {
    currentTrophies = playerData.trophies || 0;
    bestRankedIndex = (
      playerData.highestRankedRank ||
      playerData.rankedRank ||
      playerData.highestRank ||
      playerData.soloLeagueRank ||
      playerData.lastRankedRank ||
      0
    );
  } else if (member && member.id) {
    try {
      const dbUser = await BrawlStarsUser.findByPk(member.id);
      if (dbUser) {
        currentTrophies = dbUser.lastTrophies || 0;
        bestRankedIndex = dbUser.highestRankedRank || dbUser.lastRankedRank || 0;
      }
    } catch (_) {}
  }

  const expectedTrophyRoles = currentTrophies > 0 ? getExpectedRoleIds(currentTrophies, trophyRewards) : new Set();
  const expectedRankedRoles = bestRankedIndex > 0 ? getExpectedRoleIds(bestRankedIndex, rankedRewards) : new Set();

  const allExpectedRoleIds = new Set([...expectedTrophyRoles, ...expectedRankedRoles]);
  const allManagedRoleIds = new Set([
    ...trophyRewards.map(r => r.roleId),
    ...rankedRewards.map(r => r.roleId),
  ]);

  const memberRoleIds = new Set(member.roles.cache.keys());
  const rolesToAdd = [];
  const rolesToRemove = [];

  for (const roleId of allManagedRoleIds) {
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) continue;

    if (role.position >= botMember.roles.highest.position) {
      continue;
    }

    const shouldHave = allExpectedRoleIds.has(roleId);
    const hasRole = memberRoleIds.has(roleId);

    if (shouldHave && !hasRole) {
      rolesToAdd.push(role);
    } else if (!shouldHave && hasRole) {
      rolesToRemove.push(role);
    }
  }

  if (rolesToRemove.length > 0) {
    await member.roles.remove(rolesToRemove, 'Brawl Stars - Mise à jour des paliers').catch(e => {
      console.warn('[BrawlStarsService] Erreur retrait rôles :', e.message);
    });
  }
  if (rolesToAdd.length > 0) {
    await member.roles.add(rolesToAdd, 'Brawl Stars - Obtention des rôles de palier').catch(e => {
      console.warn('[BrawlStarsService] Erreur ajout rôles :', e.message);
    });
  }

  return {
    added: rolesToAdd.map(r => r.name),
    removed: rolesToRemove.map(r => r.name),
  };
}

/**
 * Records a trophy & ranked snapshot for history tracking.
 */
async function recordTrophySnapshot(userId, playerTag, trophies, arg4 = 0, arg5 = 0) {
  try {
    const cleanTag = normalizePlayerTag(playerTag);
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const recent = await BrawlStarsTrophyLog.findOne({
      where: {
        userId,
        recordedAt: { [Op.gte]: fourHoursAgo },
      },
      order: [['recordedAt', 'DESC']],
    });

    let rankedRank = 0;
    let rankedPoints = 0;
    if (typeof arg4 === 'object' && arg4 !== null) {
      rankedRank = arg4.rankedRank || 0;
      rankedPoints = arg4.rankedPoints || 0;
    } else if (arg4 > 50) {
      rankedPoints = arg4;
      rankedRank = arg5 || 0;
    } else {
      rankedRank = arg4 || 0;
      rankedPoints = arg5 || 0;
    }

    if (
      recent &&
      recent.trophies === trophies &&
      (recent.rankedRank ?? 0) === (rankedRank || 0) &&
      (recent.rankedPoints ?? 0) === (rankedPoints || 0)
    ) {
      return;
    }

    await BrawlStarsTrophyLog.create({
      userId,
      playerTag: cleanTag,
      trophies,
      rankedRank: rankedRank || 0,
      rankedPoints: rankedPoints || 0,
      recordedAt: new Date(),
    });
  } catch (err) {
    console.warn('[BrawlStarsService] Erreur snapshot trophées/ranked :', err.message);
  }
}

/**
 * Returns ISO week key string, e.g. "2026-W43".
 */
function getIsoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns ISO week key string of the previous week, e.g. "2026-W43".
 */
function getPreviousIsoWeekKey(d = new Date()) {
  const prevDate = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000);
  return getIsoWeekKey(prevDate);
}

/**
 * Returns Monday 00:00:00.000 for the week of the given date.
 */
function getStartOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Ensures user's weekly starting baseline and progression gain are up to date.
 */
async function updateUserWeeklyStats(user, currentTrophies, currentRankedRank) {
  try {
    const currentWeek = getIsoWeekKey();
    const cleanTrophies = typeof currentTrophies === 'number' ? currentTrophies : (user.lastTrophies || 0);
    const cleanRank = typeof currentRankedRank === 'number' ? currentRankedRank : (user.lastRankedRank || 0);

    if (user.weekKey !== currentWeek || user.weekStartTrophies === null || user.weekStartTrophies === undefined) {
      // Archive previous week final gain before starting a new week
      if (user.weekKey && user.weekKey !== currentWeek) {
        user.previousWeekGain = user.weeklyTrophyGain || 0;
        user.previousWeekKey = user.weekKey;
      }

      const startOfWeek = getStartOfWeek();
      let baseline = await BrawlStarsTrophyLog.findOne({
        where: {
          userId: user.userId,
          recordedAt: { [Op.lte]: startOfWeek },
        },
        order: [['recordedAt', 'DESC']],
      });

      if (!baseline) {
        baseline = await BrawlStarsTrophyLog.findOne({
          where: { userId: user.userId },
          order: [['recordedAt', 'ASC']],
        });
      }

      user.weekStartTrophies = baseline ? (baseline.trophies ?? cleanTrophies) : cleanTrophies;
      user.weekStartRankedRank = (baseline && typeof baseline.rankedRank === 'number' && baseline.rankedRank > 0)
        ? baseline.rankedRank
        : cleanRank;
      user.weekKey = currentWeek;
    }

    // Safety guard: A player linking mid-week with high stats must NEVER have a baseline of 0
    if (user.weekStartTrophies === 0 && cleanTrophies > 0) {
      const firstEverLog = await BrawlStarsTrophyLog.findOne({
        where: { userId: user.userId },
        order: [['recordedAt', 'ASC']],
      });
      user.weekStartTrophies = firstEverLog ? firstEverLog.trophies : cleanTrophies;
    }

    if (user.weekStartRankedRank === 0 && cleanRank > 0) {
      const firstEverLog = await BrawlStarsTrophyLog.findOne({
        where: { userId: user.userId },
        order: [['recordedAt', 'ASC']],
      });
      user.weekStartRankedRank = (firstEverLog && firstEverLog.rankedRank > 0) ? firstEverLog.rankedRank : cleanRank;
    }

    user.lastTrophies = cleanTrophies;
    user.lastRankedRank = cleanRank;
    user.weeklyTrophyGain = cleanTrophies - (user.weekStartTrophies ?? cleanTrophies);
    user.weeklyRankedGain = cleanRank - (user.weekStartRankedRank ?? cleanRank);
    user.lastCheckedAt = new Date();
    await user.save();
    return user;
  } catch (err) {
    console.warn('[BrawlStarsService] Erreur mise à jour stats hebdo :', err.message);
    return user;
  }
}

/**
 * Fetches all linked guild members and returns sorted leaderboards:
 * - topTrophies: sorted by trophies DESC
 * - topRanked: sorted by rankedRank DESC, then trophies DESC
 * - topTrophyGain: sorted by weeklyTrophyGain DESC
 * - topRankedGain: sorted by weeklyRankedGain DESC
 */
async function getLeaderboards(guild) {
  const linkedUsers = await BrawlStarsUser.findAll();
  const currentWeek = getIsoWeekKey();

  const guildUsers = [];
  for (const u of linkedUsers) {
    let member = null;
    if (guild) {
      member = guild.members.cache.get(u.userId) || await guild.members.fetch(u.userId).catch(() => null);
    }
    if (member) {
      if (u.weekKey !== currentWeek || (u.weekStartTrophies === 0 && u.lastTrophies > 0)) {
        await updateUserWeeklyStats(u, u.lastTrophies, u.lastRankedRank);
      }
      guildUsers.push({
        user: u,
        member,
        userId: u.userId,
        playerName: u.playerName || member.displayName || 'Brawler',
        playerTag: u.playerTag,
        trophies: u.lastTrophies || 0,
        rankedRank: u.lastRankedRank || 0,
        highestRankedRank: u.highestRankedRank || 0,
        weeklyTrophyGain: u.weeklyTrophyGain || 0,
        weeklyRankedGain: u.weeklyRankedGain || 0,
        weekStartTrophies: u.weekStartTrophies || 0,
        weekStartRankedRank: u.weekStartRankedRank || 0,
      });
    }
  }

  const topTrophies = [...guildUsers].sort((a, b) => b.trophies - a.trophies);
  const topRanked = [...guildUsers].sort((a, b) => {
    if (b.rankedRank !== a.rankedRank) return b.rankedRank - a.rankedRank;
    return b.trophies - a.trophies;
  });
  const topTrophyGain = [...guildUsers].sort((a, b) => b.weeklyTrophyGain - a.weeklyTrophyGain);

  return {
    topTrophies,
    topRanked,
    topTrophyGain,
    totalPlayers: guildUsers.length,
    weekKey: currentWeek,
  };
}

/**
 * Automatically attributes weekly trophy progression role to the #1 in trophy growth.
 * Removes the role from any former holder.
 */
async function syncWeeklyGrowthRoles(client) {
  try {
    const trophyGrowthRoleId = await ConfigHelper.get('brawlstars_top_trophies_growth_role_id');
    const formerRankedRoleId = await ConfigHelper.get('brawlstars_top_ranked_growth_role_id');

    const guildId = process.env.GUILD_ID;
    const guild = client?.guilds?.cache?.get(guildId) || client?.guilds?.cache?.first();
    if (!guild) {
      return { skipped: true, reason: 'Serveur Discord introuvable.' };
    }

    // Clean up former ranked growth role if it was configured
    if (formerRankedRoleId) {
      const role = guild.roles.cache.get(formerRankedRoleId);
      if (role) {
        for (const [, member] of role.members) {
          await member.roles.remove(role, 'Brawl Stars : Retrait du rôle Évolution Ranked (désactivé)').catch(() => {});
        }
      }
      await ConfigHelper.set('brawlstars_top_ranked_growth_role_id', '');
    }

    if (!trophyGrowthRoleId) {
      return { skipped: true, reason: 'Aucun rôle d\'évolution configuré.' };
    }

    const role = guild.roles.cache.get(trophyGrowthRoleId);
    if (!role) {
      return { skipped: true, reason: 'Rôle Discord introuvable.' };
    }

    const currentWeek = getIsoWeekKey();
    const previousWeek = getPreviousIsoWeekKey();
    let activeWeek = await ConfigHelper.get('brawlstars_trophy_growth_active_week');
    let winnerUserId = await ConfigHelper.get('brawlstars_trophy_growth_winner_user_id');
    let winnerName = await ConfigHelper.get('brawlstars_trophy_growth_winner_name');
    let winnerGain = parseInt(await ConfigHelper.get('brawlstars_trophy_growth_winner_gain', '0'), 10) || 0;

    // Check if we need to crown a new champion (transition from previousWeek to currentWeek)
    if (activeWeek !== currentWeek) {
      const linkedUsers = await BrawlStarsUser.findAll();
      const candidates = [];

      for (const u of linkedUsers) {
        let gain = 0;
        if (u.previousWeekKey === previousWeek) {
          gain = u.previousWeekGain || 0;
        } else if (u.weekKey === previousWeek) {
          // If the user has not updated to currentWeek yet, their gain is from previousWeek
          gain = u.weeklyTrophyGain || 0;
        }

        if (gain > 0) {
          candidates.push({
            userId: u.userId,
            playerName: u.playerName,
            gain,
          });
        }
      }

      candidates.sort((a, b) => b.gain - a.gain);
      const crowned = candidates[0] || null;

      if (crowned) {
        winnerUserId = crowned.userId;
        winnerName = crowned.playerName;
        winnerGain = crowned.gain;
        await ConfigHelper.set('brawlstars_trophy_growth_winner_user_id', winnerUserId);
        await ConfigHelper.set('brawlstars_trophy_growth_winner_name', winnerName);
        await ConfigHelper.set('brawlstars_trophy_growth_winner_gain', String(winnerGain));
        await ConfigHelper.set('brawlstars_trophy_growth_winner_from_week', previousWeek);
      } else {
        winnerUserId = null;
        winnerName = null;
        winnerGain = 0;
        await ConfigHelper.set('brawlstars_trophy_growth_winner_user_id', '');
        await ConfigHelper.set('brawlstars_trophy_growth_winner_name', '');
        await ConfigHelper.set('brawlstars_trophy_growth_winner_gain', '0');
      }

      await ConfigHelper.set('brawlstars_trophy_growth_active_week', currentWeek);
      activeWeek = currentWeek;
    }

    // Enforce role assignment on Discord: ONLY the crowned winner holds the role during activeWeek
    for (const [memberId, member] of role.members) {
      if (!winnerUserId || memberId !== winnerUserId) {
        await member.roles.remove(role, 'Brawl Stars : Fin de règne Meilleure Évolution Trophées').catch(() => {});
      }
    }

    if (winnerUserId) {
      const winnerMember = guild.members.cache.get(winnerUserId) || await guild.members.fetch(winnerUserId).catch(() => null);
      if (winnerMember && !winnerMember.roles.cache.has(role.id)) {
        await winnerMember.roles.add(role, `Brawl Stars : Vainqueur de la Semaine ${previousWeek} (+${winnerGain} trophées)`).catch(() => {});
      }
    }

    return {
      success: true,
      activeWeek,
      winner: winnerUserId ? { userId: winnerUserId, name: winnerName, gain: winnerGain, fromWeek: previousWeek } : null,
      trophyRoleName: role.name,
    };
  } catch (err) {
    console.error('[BrawlStarsService] Erreur synchronisation rôle progression hebdomadaire :', err);
    return { success: false, error: err.message };
  }
}

/**
 * Draws a rounded rectangle helper
 */
function roundRect(ctx, x, y, width, height, radius, fill = false, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/**
 * Formats a Date object to YYYY-MM-DD in local time.
 */
function getLocalDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates a smooth, regular day-by-day bezier curve chart showing trophy evolution.
 * Handles gaps between days with carry-forward, collapses multiple intra-day snapshots
 * into daily end-of-day values, and supports intra-day mode when only one day of data exists.
 */
async function generateTrophyGraph(playerName, playerTag, logs, days = 30, accentColor = '#FF6B35', metric = 'trophies') {
  if (metric === 'ranked') {
    return generateRankedGraph(playerName, playerTag, logs, days, accentColor === '#FF6B35' ? '#A855F7' : accentColor);
  }
  const width = 1100;
  const height = 580;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0F1219');
  bgGrad.addColorStop(1, '#090B0F');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Top header box
  ctx.fillStyle = '#151924';
  ctx.strokeStyle = '#252B3C';
  ctx.lineWidth = 1;
  roundRect(ctx, 35, 25, width - 70, 95, 12, true, true);

  // Trophy Icon in header
  drawTrophyIcon(ctx, 50, 42, 36);

  // Header Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`Évolution des Trophées — ${playerName}`, 100, 62);

  // Handle case with no data
  if (!logs || logs.length === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Données insuffisantes pour tracer une courbe d\'évolution.', width / 2, height / 2);
    ctx.font = '13px sans-serif';
    ctx.fillText('Revenez plus tard : le bot enregistre automatiquement vos trophées au fil du temps.', width / 2, height / 2 + 30);
    return canvas.toBuffer('image/png');
  }

  // Sort logs chronologically ASC
  const sorted = [...logs].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  // Group snapshots by calendar day to keep the latest snapshot of each day
  const logsByDay = new Map();
  for (const log of sorted) {
    const dayKey = getLocalDateKey(log.recordedAt);
    logsByDay.set(dayKey, log);
  }

  const uniqueDays = Array.from(logsByDay.keys());
  let points = [];
  let periodSubtitle = '';

  // Chart bounds
  const chartX = 85;
  const chartY = 165;
  const chartW = width - 130;
  const chartH = height - 240;

  if (uniqueDays.length < 2) {
    // If only 1 snapshot exists overall, cannot draw a line
    if (sorted.length < 2) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Données insuffisantes pour tracer une courbe d\'évolution.', width / 2, height / 2);
      ctx.font = '13px sans-serif';
      ctx.fillText('Revenez plus tard : le bot enregistre automatiquement vos trophées au fil du temps.', width / 2, height / 2 + 30);
      return canvas.toBuffer('image/png');
    }

    // Intraday mode: multiple snapshots on the same single day
    const minTime = new Date(sorted[0].recordedAt).getTime();
    const maxTime = new Date(sorted[sorted.length - 1].recordedAt).getTime();
    const timeRange = maxTime - minTime || 1;

    periodSubtitle = `Aujourd'hui (${sorted.length} relevés)`;
    points = sorted.map(l => {
      const t = new Date(l.recordedAt).getTime();
      return {
        trophies: l.trophies,
        date: new Date(l.recordedAt),
        tRel: (t - minTime) / timeRange,
        label: new Date(l.recordedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      };
    });
  } else {
    // Multi-day mode: regular calendar timeline (1 point per day, evenly spaced)
    const firstLogDate = new Date(sorted[0].recordedAt);
    firstLogDate.setHours(0, 0, 0, 0);

    const lastLogDate = new Date(sorted[sorted.length - 1].recordedAt);
    lastLogDate.setHours(0, 0, 0, 0);

    const requestedStartDate = new Date(lastLogDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const actualStartDate = new Date(Math.max(firstLogDate.getTime(), requestedStartDate.getTime()));

    let currentTrophies = sorted[0].trophies;
    for (const l of sorted) {
      if (new Date(l.recordedAt) <= actualStartDate) {
        currentTrophies = l.trophies;
      }
    }

    const curr = new Date(actualStartDate);
    const dailyPoints = [];

    while (curr <= lastLogDate) {
      const key = getLocalDateKey(curr);
      if (logsByDay.has(key)) {
        currentTrophies = logsByDay.get(key).trophies;
      }
      dailyPoints.push({
        date: new Date(curr),
        trophies: currentTrophies,
        label: new Date(curr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      });
      curr.setDate(curr.getDate() + 1);
    }

    const totalDays = dailyPoints.length;
    periodSubtitle = `${totalDays} derniers jours`;
    points = dailyPoints.map((d, index) => ({
      ...d,
      tRel: totalDays > 1 ? index / (totalDays - 1) : 0,
    }));
  }

  // Header Subtitle
  ctx.fillStyle = '#94A3B8';
  ctx.font = '14px monospace';
  ctx.fillText(`${playerTag} • Période : ${periodSubtitle}`, 100, 90);

  // Trophy min/max/delta metrics
  const trophyValues = points.map(p => p.trophies);
  const minTrophies = Math.min(...trophyValues);
  const maxTrophies = Math.max(...trophyValues);
  const startTrophies = points[0].trophies;
  const endTrophies = points[points.length - 1].trophies;
  const delta = endTrophies - startTrophies;

  const deltaText = delta > 0 ? `+${delta.toLocaleString('fr-FR')}` : `${delta.toLocaleString('fr-FR')}`;
  const deltaColor = delta > 0 ? '#10B981' : (delta < 0 ? '#EF4444' : '#94A3B8');

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = deltaColor;
  ctx.fillText(deltaText, width - 55, 62);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`Min: ${minTrophies.toLocaleString('fr-FR')} • Max: ${maxTrophies.toLocaleString('fr-FR')}`, width - 55, 90);
  ctx.textAlign = 'left';

  // Value bounds & Range
  const valMargin = Math.max(50, Math.round((maxTrophies - minTrophies) * 0.15));
  const chartMin = Math.max(0, minTrophies - valMargin);
  const chartMax = maxTrophies + valMargin;
  const valRange = chartMax - chartMin || 1;

  // Grid Lines
  const gridLines = 5;
  ctx.strokeStyle = '#1F2535';
  ctx.lineWidth = 1;
  ctx.font = '12px monospace';
  ctx.fillStyle = '#64748B';

  for (let i = 0; i <= gridLines; i++) {
    const gy = chartY + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();

    const gVal = Math.round(chartMax - (valRange / gridLines) * i);
    ctx.textAlign = 'right';
    ctx.fillText(gVal.toLocaleString('fr-FR'), chartX - 12, gy + 4);
  }
  ctx.textAlign = 'left';

  // Compute pixel positions for all points
  points.forEach(p => {
    p.x = chartX + p.tRel * chartW;
    p.y = chartY + chartH - ((p.trophies - chartMin) / valRange) * chartH;
  });

  // Smooth Bezier Curve with monotonic clamping to prevent wobbles on flat plateaus
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    cp1y = Math.max(minY, Math.min(maxY, cp1y));
    cp2y = Math.max(minY, Math.min(maxY, cp2y));

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Gradient area fill under curve
  ctx.lineTo(points[points.length - 1].x, chartY + chartH);
  ctx.lineTo(points[0].x, chartY + chartH);
  ctx.closePath();

  const areaGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  areaGrad.addColorStop(0, `${accentColor}55`);
  areaGrad.addColorStop(1, `${accentColor}00`);
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Draw points/dots
  points.forEach((p, idx) => {
    const isSpecial = idx === 0 || idx === points.length - 1 || p.trophies === maxTrophies || p.trophies === minTrophies;
    const prev = points[idx - 1];
    const next = points[idx + 1];
    const isChange = (prev && prev.trophies !== p.trophies) || (next && next.trophies !== p.trophies);

    if (points.length <= 35 || isSpecial || isChange) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSpecial ? 5.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = accentColor;
      ctx.stroke();
    }
  });

  // Date Labels along X Axis (evenly spaced, non-overlapping, unique dates)
  ctx.fillStyle = '#64748B';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';

  const maxIdx = points.length - 1;
  const labelCount = Math.min(6, maxIdx);
  const labelIndices = new Set();
  for (let i = 0; i <= labelCount; i++) {
    labelIndices.add(Math.round((i / labelCount) * maxIdx));
  }

  for (const idx of labelIndices) {
    const p = points[idx];
    ctx.fillText(p.label, p.x, chartY + chartH + 22);
  }

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pyro Bot • Suivi des Trophées Brawl Stars', width / 2, height - 20);

  return canvas.toBuffer('image/png');
}

/**
 * Generates a smooth, regular day-by-day bezier curve chart showing Ranked (Elo) points evolution.
 */
async function generateRankedGraph(playerName, playerTag, logs, days = 30, accentColor = '#A855F7') {
  const width = 1100;
  const height = 580;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0F1219');
  bgGrad.addColorStop(1, '#090B0F');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Top header box
  ctx.fillStyle = '#151924';
  ctx.strokeStyle = '#252B3C';
  ctx.lineWidth = 1;
  roundRect(ctx, 35, 25, width - 70, 95, 12, true, true);

  // Ranked Icon in header
  drawRankedIcon(ctx, 50, 42, 36);

  // Header Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`Évolution Ranked — ${playerName}`, 100, 62);

  // Handle case with no data
  if (!logs || logs.length === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Données insuffisantes pour tracer une courbe d\'évolution Ranked.', width / 2, height / 2);
    ctx.font = '13px sans-serif';
    ctx.fillText('Le bot enregistre automatiquement vos points Ranked au fil du temps.', width / 2, height / 2 + 30);
    return canvas.toBuffer('image/png');
  }

  // Sort logs chronologically ASC
  const sorted = [...logs].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  // Group snapshots by calendar day to keep the latest snapshot of each day
  const logsByDay = new Map();
  for (const log of sorted) {
    const dayKey = getLocalDateKey(log.recordedAt);
    logsByDay.set(dayKey, log);
  }

  const uniqueDays = Array.from(logsByDay.keys());
  let points = [];
  let periodSubtitle = '';

  // Chart bounds
  const chartX = 85;
  const chartY = 165;
  const chartW = width - 130;
  const chartH = height - 240;

  if (uniqueDays.length < 2) {
    if (sorted.length < 2) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Données insuffisantes pour tracer une courbe d\'évolution Ranked.', width / 2, height / 2);
      ctx.font = '13px sans-serif';
      ctx.fillText('Le bot enregistre automatiquement vos points Ranked au fil du temps.', width / 2, height / 2 + 30);
      return canvas.toBuffer('image/png');
    }

    const minTime = new Date(sorted[0].recordedAt).getTime();
    const maxTime = new Date(sorted[sorted.length - 1].recordedAt).getTime();
    const timeRange = maxTime - minTime || 1;

    periodSubtitle = `Aujourd'hui (${sorted.length} relevés)`;
    points = sorted.map(l => {
      const t = new Date(l.recordedAt).getTime();
      return {
        value: Number(l.rankedPoints || 0),
        date: new Date(l.recordedAt),
        tRel: (t - minTime) / timeRange,
        label: new Date(l.recordedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      };
    });
  } else {
    const firstLogDate = new Date(sorted[0].recordedAt);
    firstLogDate.setHours(0, 0, 0, 0);

    const lastLogDate = new Date(sorted[sorted.length - 1].recordedAt);
    lastLogDate.setHours(0, 0, 0, 0);

    const requestedStartDate = new Date(lastLogDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const actualStartDate = new Date(Math.max(firstLogDate.getTime(), requestedStartDate.getTime()));

    let currentVal = Number(sorted[0].rankedPoints || 0);
    for (const l of sorted) {
      if (new Date(l.recordedAt) <= actualStartDate) {
        currentVal = Number(l.rankedPoints || 0);
      }
    }

    const curr = new Date(actualStartDate);
    const dailyPoints = [];

    while (curr <= lastLogDate) {
      const key = getLocalDateKey(curr);
      if (logsByDay.has(key)) {
        currentVal = Number(logsByDay.get(key).rankedPoints || 0);
      }
      dailyPoints.push({
        date: new Date(curr),
        value: currentVal,
        label: new Date(curr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      });
      curr.setDate(curr.getDate() + 1);
    }

    const totalDays = dailyPoints.length;
    periodSubtitle = `${totalDays} derniers jours`;
    points = dailyPoints.map((d, index) => ({
      ...d,
      tRel: totalDays > 1 ? index / (totalDays - 1) : 0,
    }));
  }

  const values = points.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const startVal = points[0].value;
  const endVal = points[points.length - 1].value;
  const delta = endVal - startVal;

  if (maxVal === 0 && minVal === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aucun point Ranked enregistré sur cette période.', width / 2, height / 2);
    ctx.font = '13px sans-serif';
    ctx.fillText('Participez à des matchs du mode Ranked (Compétitif) Brawl Stars pour commencer le suivi.', width / 2, height / 2 + 30);
    return canvas.toBuffer('image/png');
  }

  const currentTierId = convertEloToRankedTier(endVal);
  const currentTierObj = RANKED_TIERS.find(t => t.id === currentTierId);
  const currentTierName = currentTierObj ? currentTierObj.name : 'Non classé';

  // Subtitle
  ctx.fillStyle = '#94A3B8';
  ctx.font = '14px monospace';
  ctx.fillText(`${playerTag} • Période : ${periodSubtitle}`, 100, 90);

  // Delta & metrics
  const deltaText = delta > 0 ? `+${delta.toLocaleString('fr-FR')} pts` : (delta < 0 ? `${delta.toLocaleString('fr-FR')} pts` : '0 pt');
  const deltaColor = delta > 0 ? '#10B981' : (delta < 0 ? '#EF4444' : '#94A3B8');

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = deltaColor;
  ctx.fillText(deltaText, width - 55, 62);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = currentTierObj ? currentTierObj.color : '#C084FC';
  const tierText = `Rang : ${currentTierName} (${endVal.toLocaleString('fr-FR')} pts)`;
  ctx.fillText(`${tierText} • Min: ${minVal.toLocaleString('fr-FR')} • Max: ${maxVal.toLocaleString('fr-FR')}`, width - 55, 90);
  ctx.textAlign = 'left';

  // Value bounds & Range
  const valMargin = Math.max(50, Math.round((maxVal - minVal) * 0.15));
  const chartMin = Math.max(0, minVal - valMargin);
  const chartMax = maxVal + valMargin;
  const valRange = chartMax - chartMin || 1;

  // Grid Lines
  const gridLines = 5;
  ctx.strokeStyle = '#1F2535';
  ctx.lineWidth = 1;
  ctx.font = '12px monospace';
  ctx.fillStyle = '#64748B';

  for (let i = 0; i <= gridLines; i++) {
    const gy = chartY + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();

    const gVal = Math.round(chartMax - (valRange / gridLines) * i);
    ctx.textAlign = 'right';
    ctx.fillText(`${gVal.toLocaleString('fr-FR')} pts`, chartX - 12, gy + 4);
  }
  ctx.textAlign = 'left';

  // Compute pixel positions for all points
  points.forEach(p => {
    p.x = chartX + p.tRel * chartW;
    p.y = chartY + chartH - ((p.value - chartMin) / valRange) * chartH;
  });

  // Curve
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    cp1y = Math.max(minY, Math.min(maxY, cp1y));
    cp2y = Math.max(minY, Math.min(maxY, cp2y));

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Gradient area fill under curve
  ctx.lineTo(points[points.length - 1].x, chartY + chartH);
  ctx.lineTo(points[0].x, chartY + chartH);
  ctx.closePath();

  const areaGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  areaGrad.addColorStop(0, `${accentColor}55`);
  areaGrad.addColorStop(1, `${accentColor}00`);
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Points
  points.forEach((p, idx) => {
    const isSpecial = idx === 0 || idx === points.length - 1 || p.value === maxVal || p.value === minVal;
    const prev = points[idx - 1];
    const next = points[idx + 1];
    const isChange = (prev && prev.value !== p.value) || (next && next.value !== p.value);

    if (points.length <= 35 || isSpecial || isChange) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSpecial ? 5.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = accentColor;
      ctx.stroke();
    }
  });

  // Date Labels along X Axis
  ctx.fillStyle = '#64748B';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';

  const maxIdx = points.length - 1;
  const labelCount = Math.min(6, maxIdx);
  const labelIndices = new Set();
  for (let i = 0; i <= labelCount; i++) {
    labelIndices.add(Math.round((i / labelCount) * maxIdx));
  }

  for (const idx of labelIndices) {
    const p = points[idx];
    ctx.fillText(p.label, p.x, chartY + chartH + 22);
  }

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pyro Bot • Suivi du Mode Ranked (Compétitif) Brawl Stars', width / 2, height - 20);

  return canvas.toBuffer('image/png');
}

/**
 * Periodically synchronizes all linked Brawl Stars accounts in the background.
 * Fetches fresh player stats, records a trophy snapshot, and updates guild roles.
 */
async function syncAllLinkedUsers(client) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) return;

    const linkedUsers = await BrawlStarsUser.findAll();
    if (!linkedUsers || linkedUsers.length === 0) return;

    const guildId = process.env.GUILD_ID;
    const guild = client?.guilds?.cache?.get(guildId);

    let count = 0;
    for (const u of linkedUsers) {
      try {
        const freshData = await fetchPlayerData(u.playerTag);
        if (freshData) {
          const currentRankedPoints = freshData.currentRankedPoints || 0;
          const peakRank = freshData.highestRankedRank ?? u.highestRankedRank ?? 0;
          await updateUserWeeklyStats(u, freshData.trophies || 0, peakRank);
          await recordTrophySnapshot(u.userId, u.playerTag, freshData.trophies || 0, peakRank, currentRankedPoints);
          await u.update({
            playerName: freshData.name || u.playerName,
            lastTrophies: freshData.trophies || 0,
            highestTrophies: freshData.highestTrophies || 0,
            lastRankedRank: peakRank,
            highestRankedRank: peakRank,
            lastRankedPoints: currentRankedPoints,
            highestRankedPoints: Math.max(u.highestRankedPoints || 0, currentRankedPoints),
            lastCheckedAt: new Date(),
          });

          if (guild) {
            const member = await guild.members.fetch(u.userId).catch(() => null);
            if (member) {
              await syncUserRoles(client, member, freshData);
            }
          }
          count++;
        }
      } catch (_) {}
      // Small delay between requests to respect API rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    // Automatically sync weekly growth roles (Top 1 Trophies Growth & Top 1 Ranked Growth)
    if (client) {
      await syncWeeklyGrowthRoles(client);
    }
  } catch (err) {
    console.warn('[BrawlStarsService] Erreur lors de la synchronisation périodique :', err.message);
  }
}

/**
 * Starts the periodic background sync service for Brawl Stars accounts.
 * Runs once after a short initial delay, then every 4 hours.
 */
let syncInterval = null;
function initPeriodicSync(client, intervalMs = 4 * 60 * 60 * 1000) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Initial sync after 30 seconds
  setTimeout(() => {
    syncAllLinkedUsers(client).catch(() => {});
  }, 30000).unref();

  // Recurring sync every 4 hours
  syncInterval = setInterval(() => {
    syncAllLinkedUsers(client).catch(() => {});
  }, intervalMs).unref();
}

module.exports = {
  RANKED_TIERS,
  normalizePlayerTag,
  getApiKey,
  fetchPlayerData,
  convertEloToRankedTier,
  fetchSpotlightCard,
  validatePlayerTagViaSpotlight,
  getExpectedRoleIds,
  syncUserRoles,
  recordTrophySnapshot,
  generateTrophyGraph,
  generateRankedGraph,
  drawRankedIcon,
  getIsoWeekKey,
  getPreviousIsoWeekKey,
  getStartOfWeek,
  updateUserWeeklyStats,
  getLeaderboards,
  syncWeeklyGrowthRoles,
  syncAllLinkedUsers,
  initPeriodicSync,
};
