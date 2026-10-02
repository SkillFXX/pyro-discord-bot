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
  { id: 19, name: 'Maître', color: '#FF0055' },
];

// Total brawlers currently available in Brawl Stars
const TOTAL_AVAILABLE_BRAWLERS = 88;

// Memory cache for downloaded images to avoid re-fetching on CDN
const imageCache = new Map();

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
 * Estimates account creation year from Supercell's sequential player tag.
 * @param {string} tag 
 * @returns {number}
 */
function estimateAccountCreationYear(tag) {
  const tagChars = '0289PYLQGRJCUV';
  const clean = tag.replace(/#/g, '').toUpperCase();
  let id = 0n;
  for (const char of clean) {
    const idx = BigInt(tagChars.indexOf(char));
    if (idx === -1n) continue;
    id = id * 14n + idx;
  }

  // Thresholds based on Supercell's sequential account registration sequence
  if (id < 12000000n) return 2017; // Bêta Canada
  if (id < 70000000n) return 2018; // Sortie mondiale
  if (id < 300000000n) return 2019;
  if (id < 700000000n) return 2020;
  if (id < 1200000000n) return 2021;
  if (id < 1900000000n) return 2022;
  if (id < 2800000000n) return 2023;
  if (id < 4000000000n) return 2024;
  if (id < 5500000000n) return 2025;
  return 2026;
}

/**
 * Resolves player's highest ranked league information from API data.
 * @param {object} player 
 * @returns {{ name: string, color: string }}
 */
function resolveRankedInfo(player) {
  const rawRank = player.highestRankedRank || player.highestRank || player.highestSoloLeagueRank || player.soloLeagueRank || player.rankedRank || 0;
  const tier = RANKED_TIERS.find(t => t.id === rawRank);
  if (tier) {
    return { name: tier.name, color: tier.color };
  }
  return { name: 'Non classé', color: '#64748B' };
}

/**
 * Resolves challenge wins from API data (excluding Robo Rumble).
 * @param {object} player 
 * @returns {string}
 */
function resolveChallengeWins(player) {
  if (player.mostChallengeWins !== undefined && player.mostChallengeWins !== null) {
    return `${player.mostChallengeWins}`;
  }
  if (player.challengeWins !== undefined && player.challengeWins !== null) {
    return `${player.challengeWins}`;
  }
  if (player.isQualifiedFromChampionshipChallenge) {
    return '15 (Qualifié)';
  }
  return '0';
}

/**
 * Computes brawler prestige badge information based on the Brawl Stars prestige system.
 * Prestige unlocks at 1,000 trophies. Below 1,000 trophies, returns Bronze/Silver/Gold tier.
 * @param {object} brawler
 * @returns {{ text: string, color: string } | null}
 */
function getBrawlerPrestigeBadge(brawler) {
  if (brawler.prestige !== undefined && brawler.prestige !== null) {
    return { text: `P${brawler.prestige}`, color: '#E11D48' };
  }
  const maxTr = Math.max(brawler.highestTrophies || 0, brawler.trophies || 0);
  if (maxTr >= 1000) {
    const level = Math.floor(maxTr / 1000);
    return { text: `PR ${level}`, color: level >= 2 ? '#E11D48' : '#F59E0B' };
  }
  if (maxTr >= 750) return { text: 'OR', color: '#EAB308' };
  if (maxTr >= 500) return { text: 'ARG', color: '#94A3B8' };
  if (maxTr >= 250) return { text: 'BRZ', color: '#CD7F32' };
  return null;
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
    if (imageCache.size > 300) {
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
 * Generates an HD, modern profile card for a Brawl Stars player.
 * Ultra-horizontal layout optimized for Discord embedding.
 * 
 * @param {object} player Player data from API
 * @param {string} [accentColor='#FF6B35']
 * @returns {Promise<Buffer>}
 */
async function generateProfileCard(player, accentColor = '#FF6B35') {
  const brawlers = Array.isArray(player.brawlers) ? [...player.brawlers] : [];
  brawlers.sort((a, b) => (b.trophies || 0) - (a.trophies || 0));

  const totalPlayerBrawlers = brawlers.length;
  const maxAvailableBrawlers = Math.max(TOTAL_AVAILABLE_BRAWLERS, totalPlayerBrawlers);

  // Horizontal Grid Layout: 14 columns of compact square tiles
  const cardWidth = 1500;
  const cols = 14;
  const rows = Math.ceil(totalPlayerBrawlers / cols);

  const tileWidth = 92;
  const tileHeight = 92;
  const gapX = 12;
  const gapY = 12;

  const headerHeight = 245;
  const gridStartX = (cardWidth - (cols * tileWidth + (cols - 1) * gapX)) / 2;
  const gridHeight = rows * tileHeight + (rows - 1) * gapY;
  const cardHeight = headerHeight + gridHeight + 60;

  const canvas = createCanvas(cardWidth, cardHeight);
  const ctx = canvas.getContext('2d');

  // Pre-load all brawler portraits, avatar image, and local official assets in parallel
  const avatarUrl = `https://cdn.brawlify.com/profile-icons/regular/${player.icon?.id || 28000000}.png`;
  const [
    avatarImg,
    trophyAsset,
    rankedAsset,
    trioAsset,
    soloAsset,
    duoAsset,
    brawlerAsset,
    challengeAsset,
    calendarAsset,
    clubAsset,
    expAsset,
    ...brawlerImages
  ] = await Promise.all([
    safeLoadImage(avatarUrl),
    getLocalAsset('trophy'),
    getLocalAsset('ranked'),
    getLocalAsset('trio'),
    getLocalAsset('solo'),
    getLocalAsset('duo'),
    getLocalAsset('brawler'),
    getLocalAsset('challenge'),
    getLocalAsset('calendar'),
    getLocalAsset('club'),
    getLocalAsset('exp'),
    ...brawlers.map(b => safeLoadImage(`https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`))
  ]);

  // 1. Background
  const bgGrad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
  bgGrad.addColorStop(0, '#0F1219');
  bgGrad.addColorStop(1, '#090B0F');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  // Top accent ambient glow
  const glowGrad = ctx.createRadialGradient(cardWidth / 2, 0, 10, cardWidth / 2, 0, 750);
  glowGrad.addColorStop(0, `${accentColor}33`);
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, cardWidth, 380);

  // 2. Header Box
  const headerBoxY = 20;
  const headerBoxHeight = headerHeight - 35;
  ctx.fillStyle = '#151924';
  ctx.strokeStyle = '#252B3C';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 30, headerBoxY, cardWidth - 60, headerBoxHeight, 14, true, true);

  // Top color highlight
  ctx.fillStyle = accentColor;
  roundRect(ctx, 30, headerBoxY, cardWidth - 60, 4, 2, true, false);

  // 3. Avatar Icon (Square with rounded corners)
  const avatarX = 50;
  const avatarY = 40;
  const avatarSize = 85;
  const avatarRadius = 14;
  ctx.save();
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarRadius, false, false);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#22283A';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarRadius, false, true);

  // 4. Player Details (Name, Tag, Badges)
  const textX = avatarX + avatarSize + 22;

  // Name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px sans-serif';
  const playerName = player.name || 'Brawler';
  ctx.fillText(playerName, textX, avatarY + 32);

  // Badges row: Tag, Creation Year, Club, Level
  const badgeY = avatarY + 48;
  let curBadgeX = textX;

  // Player Tag Badge
  ctx.font = 'bold 13px monospace';
  const tagText = player.tag || '#';
  const tagWidth = ctx.measureText(tagText).width;
  ctx.fillStyle = '#1E2536';
  ctx.strokeStyle = '#2F3A52';
  ctx.lineWidth = 1;
  roundRect(ctx, curBadgeX, badgeY, tagWidth + 16, 24, 6, true, true);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(tagText, curBadgeX + 8, badgeY + 16);
  curBadgeX += tagWidth + 24;

  // Account Creation Year Badge
  const creationYear = estimateAccountCreationYear(player.tag || '');
  ctx.font = 'bold 13px sans-serif';
  const yearText = `Compte ${creationYear}`;
  const yearWidth = ctx.measureText(yearText).width + 24;
  ctx.fillStyle = '#1E2536';
  ctx.strokeStyle = '#2F3A52';
  roundRect(ctx, curBadgeX, badgeY, yearWidth + 14, 24, 6, true, true);
  drawAssetIcon(ctx, calendarAsset, curBadgeX + 6, badgeY + 3, 18, 18);
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(yearText, curBadgeX + 28, badgeY + 16);
  curBadgeX += yearWidth + 22;

  // Club Badge
  if (player.club && player.club.name) {
    ctx.font = 'bold 13px sans-serif';
    const clubText = player.club.name;
    const clubWidth = ctx.measureText(clubText).width + 24;
    ctx.fillStyle = '#1E2536';
    ctx.strokeStyle = '#2F3A52';
    roundRect(ctx, curBadgeX, badgeY, clubWidth + 14, 24, 6, true, true);
    drawAssetIcon(ctx, clubAsset, curBadgeX + 6, badgeY + 3, 18, 18);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(clubText, curBadgeX + 28, badgeY + 16);
    curBadgeX += clubWidth + 22;
  }

  // Level Badge
  const levelText = `Niv. ${player.expLevel || 1}`;
  ctx.font = 'bold 13px sans-serif';
  const levelWidth = ctx.measureText(levelText).width;
  ctx.fillStyle = '#1E2536';
  ctx.strokeStyle = '#2F3A52';
  roundRect(ctx, curBadgeX, badgeY, levelWidth + 36, 24, 6, true, true);
  drawAssetIcon(ctx, expAsset, curBadgeX + 6, badgeY + 3, 18, 18);
  ctx.fillStyle = '#F59E0B';
  ctx.fillText(levelText, curBadgeX + 28, badgeY + 16);

  // 5. Stat Metric Cards (spread across the width)
  const rankedInfo = resolveRankedInfo(player);
  const challengeWinsText = resolveChallengeWins(player);
  const curTrophies = Number(player.trophies || 0).toLocaleString('fr-FR');
  const maxTrophies = Number(player.highestTrophies || 0).toLocaleString('fr-FR');

  const statCards = [
    { label: 'Trophées (Actuel / Record)', value: `${curTrophies} / ${maxTrophies}`, img: trophyAsset, color: '#FBBF24' },
    { label: 'Classé (Ranked)', value: rankedInfo.name, img: rankedAsset, color: rankedInfo.color },
    { label: 'Victoires 3v3', value: Number(player['3vs3Victories'] || 0).toLocaleString('fr-FR'), img: trioAsset, color: '#60A5FA' },
    { label: 'Victoires Solo', value: Number(player.soloVictories || 0).toLocaleString('fr-FR'), img: soloAsset, color: '#34D399' },
    { label: 'Victoires Duo', value: Number(player.duoVictories || 0).toLocaleString('fr-FR'), img: duoAsset, color: '#A78BFA' },
    { label: 'Brawlers', value: `${totalPlayerBrawlers} / ${maxAvailableBrawlers}`, img: brawlerAsset, color: accentColor },
    { label: 'Victoires Défi', value: challengeWinsText, img: challengeAsset, color: '#EC4899' },
  ];

  const statAreaX = 45;
  const statAreaY = 140;
  const statCardGap = 12;
  const statCardWidth = (cardWidth - 90 - (statCards.length - 1) * statCardGap) / statCards.length;
  const statCardHeight = 72;

  statCards.forEach((stat, i) => {
    const sx = statAreaX + i * (statCardWidth + statCardGap);
    ctx.fillStyle = '#1A1F2C';
    ctx.strokeStyle = '#272F42';
    ctx.lineWidth = 1;
    roundRect(ctx, sx, statAreaY, statCardWidth, statCardHeight, 8, true, true);

    // Left accent pill
    ctx.fillStyle = stat.color;
    roundRect(ctx, sx, statAreaY, 3, statCardHeight, 1.5, true, false);

    // Asset Icon
    drawAssetIcon(ctx, stat.img, sx + 8, statAreaY + 11, 20, 20);

    // Label
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 11px sans-serif';
    ctx.fillText(stat.label, sx + 34, statAreaY + 24);

    // Value
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(stat.value, sx + 10, statAreaY + 54);
  });

  // 6. Section Header
  let gridTitleX = 35;
  if (brawlerAsset) {
    drawAssetIcon(ctx, brawlerAsset, 35, headerHeight - 12, 22, 22);
    gridTitleX = 64;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 19px sans-serif';
  const gridTitle = `Grille des Brawlers (${totalPlayerBrawlers} / ${maxAvailableBrawlers})`;
  const titleW = ctx.measureText(gridTitle).width;
  ctx.fillText(gridTitle, gridTitleX, headerHeight + 5);

  ctx.fillStyle = '#64748B';
  ctx.font = '13px sans-serif';
  ctx.fillText('Triés par nombre de trophées décroissant • Niveau & Prestige', gridTitleX + titleW + 22, headerHeight + 5);

  // 7. Render Compact Brawlers Grid (14 columns)
  for (let idx = 0; idx < brawlers.length; idx++) {
    const brawler = brawlers[idx];
    const c = idx % cols;
    const r = Math.floor(idx / cols);

    const bx = gridStartX + c * (tileWidth + gapX);
    const by = headerHeight + 22 + r * (tileHeight + gapY);

    // Tile Box
    ctx.fillStyle = '#141824';
    ctx.strokeStyle = '#222838';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tileWidth, tileHeight, 10, true, true);

    // Brawler Portrait
    const bImg = brawlerImages[idx];
    const pSize = 58;
    const px = bx + (tileWidth - pSize) / 2;
    const py = by + 6;

    if (bImg) {
      ctx.drawImage(bImg, px, py, pSize, pSize);
    } else {
      ctx.fillStyle = '#222736';
      roundRect(ctx, px, py, pSize, pSize, 8, true, false);
      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', px + pSize / 2, py + 36);
      ctx.textAlign = 'left';
    }

    // Power Level Badge (Top Left)
    const power = brawler.power || 1;
    const pColor = power === 11 ? '#A855F7' : (power >= 9 ? '#F59E0B' : '#3B82F6');
    ctx.fillStyle = pColor;
    roundRect(ctx, bx + 5, by + 5, 23, 15, 3.5, true, false);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillText(`P${power}`, bx + 7, by + 16);

    // Prestige Badge (Top Right)
    const prestige = getBrawlerPrestigeBadge(brawler);
    if (prestige) {
      ctx.font = 'bold 9px sans-serif';
      const pW = ctx.measureText(prestige.text).width + 8;
      const bW = Math.max(22, pW);
      ctx.fillStyle = prestige.color;
      roundRect(ctx, bx + tileWidth - bW - 4, by + 5, bW, 15, 3.5, true, false);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(prestige.text, bx + tileWidth - bW / 2 - 4, by + 16);
      ctx.textAlign = 'left';
    }

    // Bottom Trophies Bar
    const barY = by + tileHeight - 22;
    ctx.fillStyle = 'rgba(12, 15, 23, 0.9)';
    roundRect(ctx, bx + 2, barY, tileWidth - 4, 20, 6, true, false);

    // Small Gold Trophy Icon
    drawAssetIcon(ctx, trophyAsset, bx + 5, barY + 3, 14, 14);

    // Trophy count text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    const trStr = Number(brawler.trophies || 0).toLocaleString('fr-FR');
    ctx.fillText(trStr, bx + tileWidth - 8, barY + 14);
    ctx.textAlign = 'left';
  }

  // 8. Footer
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pyro Bot • Données Brawl Stars via API officielle Supercell & Assets Brawlify', cardWidth / 2, cardHeight - 16);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
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
  TOTAL_AVAILABLE_BRAWLERS,
  normalizePlayerTag,
  estimateAccountCreationYear,
  resolveRankedInfo,
  resolveChallengeWins,
  getApiKey,
  fetchPlayerData,
  fetchSpotlightCard,
  validatePlayerTagViaSpotlight,
  getExpectedRoleIds,
  syncUserRoles,
  recordTrophySnapshot,
  generateProfileCard,
  generateTrophyGraph,
};
