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

// Local directory for official game assets
const ASSETS_DIR = path.join(__dirname, '../assets/brawlstars');
const localAssetCache = new Map();

/**
 * Loads a local asset from src/assets/brawlstars with caching and extension fallback.
 * Supports .webp, .png, .svg, and .jpg
 * @param {string} name 
 * @returns {Promise<import('@napi-rs/canvas').Image|null>}
 */
async function getLocalAsset(name) {
  if (!name) return null;
  if (localAssetCache.has(name)) {
    return localAssetCache.get(name);
  }

  const extensions = ['.webp', '.png', '.svg', '.jpg'];
  for (const ext of extensions) {
    const fullPath = path.join(ASSETS_DIR, `${name}${ext}`);
    if (fs.existsSync(fullPath)) {
      try {
        const img = await loadImage(fullPath);
        localAssetCache.set(name, img);
        return img;
      } catch (e) {
        console.warn(`[BrawlStarsService] Erreur lors du chargement de l'asset ${fullPath}:`, e.message);
      }
    }
  }

  return null;
}

/**
 * Draws an image fitted within a bounding box while preserving its aspect ratio.
 */
function drawAssetIcon(ctx, img, targetX, targetY, targetWidth, targetHeight) {
  if (!img || !img.width || !img.height) return;
  const ratio = Math.min(targetWidth / img.width, targetHeight / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = targetX + (targetWidth - w) / 2;
  const y = targetY + (targetHeight - h) / 2;
  ctx.drawImage(img, x, y, w, h);
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
 * Synchronizes Brawl Stars roles for a Discord member based on their stats.
 */
async function syncUserRoles(client, member, playerData) {
  if (!member || !member.guild) return { added: [], removed: [] };

  const guild = member.guild;
  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!botMember) return { added: [], removed: [] };

  const [trophyRewards, rankedRewards] = await Promise.all([
    BrawlStarsRoleReward.findAll({ where: { type: 'trophies' }, order: [['threshold', 'ASC']] }),
    BrawlStarsRoleReward.findAll({ where: { type: 'ranked' }, order: [['threshold', 'ASC']] }),
  ]);

  const currentTrophies = playerData.trophies || 0;
  let currentRankedIndex = 0;
  if (playerData.highestRank) {
    currentRankedIndex = parseInt(playerData.highestRank, 10) || 0;
  } else if (playerData.soloLeagueRank) {
    currentRankedIndex = parseInt(playerData.soloLeagueRank, 10) || 0;
  }

  const expectedTrophyRoles = getExpectedRoleIds(currentTrophies, trophyRewards);
  const expectedRankedRoles = currentRankedIndex > 0 ? getExpectedRoleIds(currentRankedIndex, rankedRewards) : new Set();

  const allExpectedRoleIds = new Set([...expectedTrophyRoles, ...expectedRankedRoles]);
  const allManagedRoleIds = new Set([
    ...trophyRewards.map(r => r.roleId),
    ...rankedRewards.map(r => r.roleId),
  ]);

  const memberRoleIds = new Set(member.roles.cache.keys());
  const rolesToAdd = [];
  const rolesToRemove = [];

  for (const roleId of allManagedRoleIds) {
    const role = guild.roles.cache.get(roleId);
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
    await member.roles.remove(rolesToRemove, 'Brawl Stars - Mise à jour des paliers').catch(() => {});
  }
  if (rolesToAdd.length > 0) {
    await member.roles.add(rolesToAdd, 'Brawl Stars - Obtention des rôles de palier').catch(() => {});
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

  // Official Trophy Icon in header
  const trophyAsset = await getLocalAsset('trophy');
  drawAssetIcon(ctx, trophyAsset, 50, 42, 36, 36);

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
  fetchSpotlightCard,
  validatePlayerTagViaSpotlight,
  getExpectedRoleIds,
  syncUserRoles,
  recordTrophySnapshot,
  generateTrophyGraph,
};
