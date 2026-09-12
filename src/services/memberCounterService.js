const { ConfigHelper } = require('../database');

// Cooldown between channel renames: 5 minutes (300,000 ms)
// Discord allows max 2 edits per 10 minutes per channel.
const RENAME_COOLDOWN_MS = 5 * 60 * 1000;

let lastUpdateTimestamp = 0;
let pendingTimeout = null;
let isUpdating = false;

/**
 * Formats channel name from template and member count.
 * Supports {count}, {memberCount}, {members}, or standalone X (case-insensitive)
 * @param {string} template 
 * @param {number} memberCount 
 * @returns {string} Formatted channel name (max 100 characters)
 */
function formatChannelName(template, memberCount) {
  const safeCount = Number.isInteger(memberCount) ? memberCount : 0;
  const countStr = safeCount.toLocaleString('fr-FR');

  let str = (template || '👥・Membres : {count}').trim();

  // 1. Replace bracketed placeholders
  str = str
    .replace(/\{count\}/gi, countStr)
    .replace(/\{membercount\}/gi, countStr)
    .replace(/\{members\}/gi, countStr);

  // 2. Replace standalone 'X' or 'x' if present as a variable (e.g. "Utilisateurs : X" or "Membres : X")
  // Matches X preceded by whitespace, colon, dash, or start of string, followed by whitespace, dash, or end of string
  if (/(^|[\s:\-–—|])X([\s:\-–—|]|$)/i.test(str)) {
    str = str.replace(/(^|[\s:\-–—|])X([\s:\-–—|]|$)/i, `$1${countStr}$2`);
  }

  // 3. Fallback: if user provided text without any variable, append the count
  if (!str.includes(countStr)) {
    str = `${str} : ${countStr}`;
  }

  // Discord channel names have a maximum length of 100 characters
  return str.substring(0, 100);
}

/**
 * Updates the member counter channel name if configured.
 * Safely handles Discord channel rename rate limits.
 * @param {import('discord.js').Guild} guild 
 * @param {object} options 
 * @param {boolean} [options.force=false] Force update bypassing the 5-min cooldown
 * @returns {Promise<{ updated: boolean, reason?: string, newName?: string, queued?: boolean }>}
 */
async function updateMemberCounter(guild, options = {}) {
  const { force = false } = options;
  if (!guild) return { updated: false, reason: 'guild_missing' };

  try {
    const channelId = await ConfigHelper.get('member_counter_channel_id');
    const template = await ConfigHelper.get('member_counter_template', '👥・Membres : {count}');

    if (!channelId) {
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
      return { updated: false, reason: 'disabled' };
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.warn(`[MemberCounter] Salon de compteur introuvable (${channelId})`);
      return { updated: false, reason: 'channel_not_found' };
    }

    const memberCount = guild.memberCount || 0;
    const targetName = formatChannelName(template, memberCount);

    // If channel is already named correctly, nothing to do!
    if (channel.name === targetName) {
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
      return { updated: false, reason: 'already_up_to_date', targetName };
    }

    const now = Date.now();
    const elapsed = now - lastUpdateTimestamp;

    // Rate Limit guard: if less than 5 minutes since last update and not forced
    if (elapsed < RENAME_COOLDOWN_MS && !force) {
      if (!pendingTimeout) {
        const remainingDelay = RENAME_COOLDOWN_MS - elapsed;
        console.log(`[MemberCounter] Renommage différé de ${Math.round(remainingDelay / 1000)}s pour respecter le rate-limit Discord.`);
        pendingTimeout = setTimeout(async () => {
          pendingTimeout = null;
          await updateMemberCounter(guild, { force: true });
        }, remainingDelay).unref();
      }
      return { updated: false, queued: true, delayMs: RENAME_COOLDOWN_MS - elapsed };
    }

    // Cooldown elapsed or forced: execute update
    if (isUpdating) return { updated: false, reason: 'already_in_progress' };
    isUpdating = true;

    try {
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }

      await channel.setName(targetName, `Mise à jour automatique du compteur de membres (${memberCount})`);
      lastUpdateTimestamp = Date.now();
      console.log(`[MemberCounter] Salon renommé avec succès : "${targetName}" (${channel.id})`);
      return { updated: true, newName: targetName };
    } finally {
      isUpdating = false;
    }

  } catch (error) {
    console.error('[MemberCounter] Erreur lors de la mise à jour du salon compteur :', error);
    return { updated: false, error: error.message };
  }
}

module.exports = {
  formatChannelName,
  updateMemberCounter,
  RENAME_COOLDOWN_MS,
};
