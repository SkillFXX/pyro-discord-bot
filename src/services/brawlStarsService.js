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
  { id: 19, name: 'Maître', color: '#FF0055' },
];

// Memory cache for downloaded images to avoid re-fetching on CDN
const imageCache = new Map();

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
    throw new Error('Accès refusé par l\'API Brawl Stars (Code 403). La clé d\'API est invalide ou restreinte à une autre adresse IP.');
  }

  if (!response.ok) {
    throw new Error(`Erreur API Brawl Stars (${response.status} ${response.statusText})`);
  }

  const data = await response.json();
  return data;
}

/**
 * Safe image loader with in-memory caching and fallback
 * @param {string} url 
 * @returns {Promise<import('@napi-rs/canvas').Image|null>}
 */
async function safeLoadImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) {
    return imageCache.get(url);
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Pyro-Discord-Bot/1.0 (+https://github.com/SkillFXX/pyro-discord-bot)',
      },
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const img = await loadImage(buffer);
    imageCache.set(url, img);
    
    // Prune cache if it grows too large
    if (imageCache.size > 250) {
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }
    return img;
  } catch {
    return null;
  }
}

/**
 * Computes which role IDs a member should retain based on a metric value
 * and the `replacePreviousRole` settings across configured rewards.
 * 
 * @param {number} currentValue 
 * @param {Array<{threshold: number, roleId: string, replacePreviousRole: boolean}>} rewards 
 * @returns {Set<string>}
 */
function getExpectedRoleIds(currentValue, rewards) {
  const eligible = rewards.filter(r => r.threshold <= currentValue);
  if (eligible.length === 0) return new Set();

  const expectedRoleIds = new Set();
  let cutoff = 0;

  // Descending sort: highest threshold first
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
 * 
 * @param {import('discord.js').Client} client 
 * @param {import('discord.js').GuildMember} member 
 * @param {object} playerData 
 * @returns {Promise<{added: string[], removed: string[]}>}
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
  // Ranked tier detection: if ranked is available in player data, or highest rank
  // In recent BS API: highestRank or soloLeagueRank may be provided, otherwise 0
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

    // Check bot permission hierarchy
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
 * Avoids recording identical snapshots within 4 hours.
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
      return; // Already recorded recently with same trophies
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
 * Generates an HD, modern profile card for a Brawl Stars player.
 * @param {object} player Player data from API
 * @param {string} [accentColor='#FF6B35']
 * @returns {Promise<Buffer>}
 */
async function generateProfileCard(player, accentColor = '#FF6B35') {
  const brawlers = Array.isArray(player.brawlers) ? [...player.brawlers] : [];
  // Sort brawlers by trophies descending
  brawlers.sort((a, b) => (b.trophies || 0) - (a.trophies || 0));

  const totalBrawlers = brawlers.length;
  const cols = 7;
  const rows = Math.ceil(totalBrawlers / cols);

  const cardWidth = 1200;
  const headerHeight = 310;
  const brawlerItemWidth = 145;
  const brawlerItemHeight = 135;
  const gapX = 16;
  const gapY = 16;
  const gridPaddingX = (cardWidth - (cols * brawlerItemWidth + (cols - 1) * gapX)) / 2;
  const gridHeight = rows * brawlerItemHeight + (rows - 1) * gapY;
  const cardHeight = headerHeight + gridHeight + 70;

  const canvas = createCanvas(cardWidth, cardHeight);
  const ctx = canvas.getContext('2d');

  // 1. Background with subtle dark gradient
  const bgGrad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
  bgGrad.addColorStop(0, '#10131B');
  bgGrad.addColorStop(1, '#0C0E14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  // Decorative top accent glow
  const glowGrad = ctx.createRadialGradient(cardWidth / 2, 0, 10, cardWidth / 2, 0, 700);
  glowGrad.addColorStop(0, `${accentColor}33`); // 20% opacity
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, cardWidth, 400);

  // 2. Header Container
  ctx.fillStyle = '#171B26';
  ctx.strokeStyle = '#252B3C';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 30, 25, cardWidth - 60, headerHeight - 45, 16, true, true);

  // Accent colored top stripe on header
  ctx.fillStyle = accentColor;
  roundRect(ctx, 30, 25, cardWidth - 60, 4, 2, true, false);

  // 3. Player Icon (Avatar)
  const iconId = player.icon?.id || 28000000;
  const iconUrl = `https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`;
  const avatarImg = await safeLoadImage(iconUrl);

  const avatarX = 55;
  const avatarY = 55;
  const avatarSize = 100;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#222736';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // Avatar border ring
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Player Name, Tag & Club
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px sans-serif';
  const playerName = player.name || 'Brawler';
  ctx.fillText(playerName, avatarX + avatarSize + 22, avatarY + 36);

  // Tag Badge
  ctx.font = 'bold 15px monospace';
  const tagText = player.tag || '#';
  const tagMetrics = ctx.measureText(tagText);
  const tagBadgeX = avatarX + avatarSize + 22;
  const tagBadgeY = avatarY + 50;

  ctx.fillStyle = '#22283A';
  roundRect(ctx, tagBadgeX, tagBadgeY, tagMetrics.width + 16, 26, 6, true, false);
  ctx.fillStyle = '#A0AEC0';
  ctx.fillText(tagText, tagBadgeX + 8, tagBadgeY + 18);

  // Club Badge
  if (player.club && player.club.name) {
    const clubBadgeX = tagBadgeX + tagMetrics.width + 26;
    ctx.font = 'bold 14px sans-serif';
    const clubText = `🛡️ ${player.club.name}`;
    const clubMetrics = ctx.measureText(clubText);

    ctx.fillStyle = '#1E2536';
    ctx.strokeStyle = '#2F384F';
    ctx.lineWidth = 1;
    roundRect(ctx, clubBadgeX, tagBadgeY, clubMetrics.width + 16, 26, 6, true, true);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(clubText, clubBadgeX + 8, tagBadgeY + 18);
  }

  // Experience level badge
  const expLevel = player.expLevel || 1;
  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`⭐ Niveau ${expLevel}`, avatarX + avatarSize + 22, avatarY + 102);

  // 5. Stat Metric Cards (Trophies, Highest, 3v3, Solo, Duo)
  const statCards = [
    { label: 'Trophées Actuels', value: Number(player.trophies || 0).toLocaleString('fr-FR'), icon: '🏆', color: '#FBBF24' },
    { label: 'Record Trophées', value: Number(player.highestTrophies || 0).toLocaleString('fr-FR'), icon: '👑', color: '#F59E0B' },
    { label: 'Victoires 3v3', value: Number(player['3vs3Victories'] || 0).toLocaleString('fr-FR'), icon: '⚔️', color: '#60A5FA' },
    { label: 'Victoires Solo', value: Number(player.soloVictories || 0).toLocaleString('fr-FR'), icon: '💀', color: '#34D399' },
    { label: 'Victoires Duo', value: Number(player.duoVictories || 0).toLocaleString('fr-FR'), icon: '👥', color: '#A78BFA' },
    { label: 'Brawlers', value: `${totalBrawlers}`, icon: '🎯', color: accentColor },
  ];

  const statCardWidth = (cardWidth - 60 - 20 - (statCards.length - 1) * 12) / statCards.length;
  const statCardY = 175;
  const statCardHeight = 85;

  statCards.forEach((stat, i) => {
    const sx = 40 + i * (statCardWidth + 12);
    ctx.fillStyle = '#1D2230';
    ctx.strokeStyle = '#283042';
    ctx.lineWidth = 1;
    roundRect(ctx, sx, statCardY, statCardWidth, statCardHeight, 10, true, true);

    // Left micro accent line
    ctx.fillStyle = stat.color;
    roundRect(ctx, sx, statCardY, 3.5, statCardHeight, 2, true, false);

    ctx.font = '16px sans-serif';
    ctx.fillText(stat.icon, sx + 12, statCardY + 30);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 11px sans-serif';
    ctx.fillText(stat.label, sx + 34, statCardY + 28);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(stat.value, sx + 12, statCardY + 62);
  });

  // 6. Section Title: Brawlers Grid
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`🎮 Liste des Brawlers (${totalBrawlers})`, 35, headerHeight + 15);

  ctx.fillStyle = '#64748B';
  ctx.font = '13px sans-serif';
  ctx.fillText('Triés par nombre de trophées décroissant', 340, headerHeight + 15);

  // 7. Render Brawlers Grid
  for (let idx = 0; idx < brawlers.length; idx++) {
    const brawler = brawlers[idx];
    const c = idx % cols;
    const r = Math.floor(idx / cols);

    const bx = gridPaddingX + c * (brawlerItemWidth + gapX);
    const by = headerHeight + 35 + r * (brawlerItemHeight + gapY);

    // Tile background
    ctx.fillStyle = '#161A24';
    ctx.strokeStyle = '#242A3B';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, brawlerItemWidth, brawlerItemHeight, 12, true, true);

    // Brawler portrait image
    const brawlerImgUrl = `https://cdn.brawlify.com/brawlers/borderless/${brawler.id}.png`;
    const bImg = await safeLoadImage(brawlerImgUrl);

    const imgSize = 64;
    const imgX = bx + (brawlerItemWidth - imgSize) / 2;
    const imgY = by + 12;

    if (bImg) {
      ctx.drawImage(bImg, imgX, imgY, imgSize, imgSize);
    } else {
      ctx.fillStyle = '#222838';
      roundRect(ctx, imgX, imgY, imgSize, imgSize, 8, true, false);
      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('?', imgX + 26, imgY + 40);
    }

    // Power Level Badge (e.g. Power 11)
    const powerLevel = brawler.power || 1;
    ctx.fillStyle = powerLevel === 11 ? '#EF4444' : (powerLevel >= 9 ? '#F59E0B' : '#3B82F6');
    roundRect(ctx, bx + 8, by + 8, 28, 18, 4, true, false);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`P${powerLevel}`, bx + 12, by + 21);

    // Rank / Prestige Badge (Top right)
    if (brawler.rank) {
      ctx.fillStyle = '#334155';
      roundRect(ctx, bx + brawlerItemWidth - 36, by + 8, 28, 18, 4, true, false);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`R${brawler.rank}`, bx + brawlerItemWidth - 33, by + 21);
    }

    // Brawler Name
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    const brawlerName = brawler.name ? brawler.name.charAt(0).toUpperCase() + brawler.name.slice(1).toLowerCase() : 'Brawler';
    ctx.fillText(brawlerName, bx + brawlerItemWidth / 2, by + 94);

    // Trophies Count Bar
    const trophyBarY = by + 104;
    ctx.fillStyle = '#1E2433';
    roundRect(ctx, bx + 12, trophyBarY, brawlerItemWidth - 24, 22, 6, true, false);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 12px sans-serif';
    const trophiesFormatted = `🏆 ${Number(brawler.trophies || 0).toLocaleString('fr-FR')}`;
    ctx.fillText(trophiesFormatted, bx + brawlerItemWidth / 2, trophyBarY + 16);
    ctx.textAlign = 'left'; // Reset
  }

  // 8. Footer branding
  ctx.fillStyle = '#64748B';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pyro Bot • Stats Brawl Stars via API officielle & Brawlify', cardWidth / 2, cardHeight - 20);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

/**
 * Generates a smooth bezier curve chart showing trophy evolution day-by-day.
 * 
 * @param {string} playerName 
 * @param {string} playerTag 
 * @param {Array<{trophies: number, recordedAt: Date|string}>} logs 
 * @param {number} days 
 * @param {string} [accentColor='#FF6B35']
 * @returns {Promise<Buffer>}
 */
async function generateTrophyGraph(playerName, playerTag, logs, days = 30, accentColor = '#FF6B35') {
  const width = 1000;
  const height = 550;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#10131B');
  bgGrad.addColorStop(1, '#0C0E14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Top header box
  ctx.fillStyle = '#171B26';
  ctx.strokeStyle = '#252B3C';
  ctx.lineWidth = 1;
  roundRect(ctx, 35, 25, width - 70, 95, 12, true, true);

  // Header Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`Évolution des Trophées — ${playerName}`, 55, 62);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '14px monospace';
  ctx.fillText(`${playerTag} • Période : ${days} derniers jours`, 55, 90);

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

  // Compute metrics: min, max, start, end, delta
  const trophyValues = logs.map(l => l.trophies);
  const minTrophies = Math.min(...trophyValues);
  const maxTrophies = Math.max(...trophyValues);
  const startTrophies = trophyValues[0];
  const endTrophies = trophyValues[trophyValues.length - 1];
  const delta = endTrophies - startTrophies;

  // Header Badges (Min, Max, Variation)
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
  const chartY = 160;
  const chartW = width - 130;
  const chartH = height - 230;

  // Value padding
  const valMargin = Math.max(50, Math.round((maxTrophies - minTrophies) * 0.15));
  const chartMin = Math.max(0, minTrophies - valMargin);
  const chartMax = maxTrophies + valMargin;
  const valRange = chartMax - chartMin || 1;

  // Draw Horizontal Grid Lines
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

  // Calculate coordinates for data points
  const points = logs.map((log, index) => {
    const px = chartX + (index / (logs.length - 1)) * chartW;
    const py = chartY + chartH - ((log.trophies - chartMin) / valRange) * chartH;
    return { x: px, y: py, trophies: log.trophies, date: new Date(log.recordedAt) };
  });

  // Draw Smooth Curve using Cardinal / Catmull-Rom or Bezier
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

  // Save path for stroke
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Create filled gradient under the curve
  ctx.lineTo(points[points.length - 1].x, chartY + chartH);
  ctx.lineTo(points[0].x, chartY + chartH);
  ctx.closePath();

  const areaGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  areaGrad.addColorStop(0, `${accentColor}55`); // 33% opacity
  areaGrad.addColorStop(1, `${accentColor}00`); // transparent
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Draw Points & Tooltip Labels for start, end, min, max
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
  getExpectedRoleIds,
  syncUserRoles,
  recordTrophySnapshot,
  generateProfileCard,
  generateTrophyGraph,
};
