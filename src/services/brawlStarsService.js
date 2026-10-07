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
 * Records a trophy snapshot for history tracking.
 */
async function recordTrophySnapshot(userId, playerTag, trophies) {
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

    if (recent && recent.trophies === trophies) {
      return;
    }

    await BrawlStarsTrophyLog.create({
      userId,
      playerTag: cleanTag,
      trophies,
      recordedAt: new Date(),
    });
  } catch (err) {
    console.warn('[BrawlStarsService] Erreur snapshot trophées :', err.message);
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
 * Generates a smooth bezier curve chart showing trophy evolution day-by-day.
 */
async function generateTrophyGraph(playerName, playerTag, logs, days = 30, accentColor = '#FF6B35') {
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

  ctx.fillStyle = '#94A3B8';
  ctx.font = '14px monospace';
  ctx.fillText(`${playerTag} • Période : ${days} derniers jours`, 100, 90);

  // Handle case with insufficient data points (< 2)
  if (!logs || logs.length < 2) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Données insuffisantes pour tracer une courbe d\'évolution.', width / 2, height / 2);
    ctx.font = '13px sans-serif';
    ctx.fillText('Revenez plus tard : le bot enregistre automatiquement vos trophées au fil du temps.', width / 2, height / 2 + 30);
    return canvas.toBuffer('image/png');
  }

  const trophyValues = logs.map(l => l.trophies);
  const minTrophies = Math.min(...trophyValues);
  const maxTrophies = Math.max(...trophyValues);
  const startTrophies = trophyValues[0];
  const endTrophies = trophyValues[trophyValues.length - 1];
  const delta = endTrophies - startTrophies;

  const deltaText = delta >= 0 ? `+${delta.toLocaleString('fr-FR')}` : `${delta.toLocaleString('fr-FR')}`;
  const deltaColor = delta >= 0 ? '#10B981' : '#EF4444';

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = deltaColor;
  ctx.fillText(deltaText, width - 55, 62);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`Min: ${minTrophies.toLocaleString('fr-FR')} • Max: ${maxTrophies.toLocaleString('fr-FR')}`, width - 55, 90);
  ctx.textAlign = 'left';

  // Chart bounds
  const chartX = 85;
  const chartY = 165;
  const chartW = width - 130;
  const chartH = height - 240;

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

  // Points
  const points = logs.map((log, index) => {
    const px = chartX + (index / (logs.length - 1)) * chartW;
    const py = chartY + chartH - ((log.trophies - chartMin) / valRange) * chartH;
    return { x: px, y: py, trophies: log.trophies, date: new Date(log.recordedAt) };
  });

  // Smooth Bezier Curve
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Gradient under curve
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
    const isSpecial = idx === 0 || idx === points.length - 1 || p.trophies === maxTrophies || p.trophies === minTrophies;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isSpecial ? 5.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accentColor;
    ctx.stroke();
  });

  // Date Labels along X Axis
  ctx.fillStyle = '#64748B';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';

  const labelStep = Math.max(1, Math.floor(points.length / 6));
  for (let i = 0; i < points.length; i += labelStep) {
    const p = points[i];
    const dateStr = p.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    ctx.fillText(dateStr, p.x, chartY + chartH + 22);
  }

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pyro Bot • Suivi des Trophées Brawl Stars', width / 2, height - 20);

  return canvas.toBuffer('image/png');
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
};
