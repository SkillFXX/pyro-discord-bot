const { ConfigHelper, AutomodRule, Warn, Sanction, XPMultiplier } = require('../../database');
const embeds = require('../utils/embeds');
const { checkWarnThresholds, logModerationAction, sendDM } = require('../utils/moderationHelper');
const { getMemberRoleMultiplier, awardUserXP } = require('../utils/xpHelper');
const analyticsService = require('../../services/analyticsService');

// Memory caches to avoid DB spam
const xpCooldowns = new Map();
const messageLog = new Map(); // For anti-spam and duplicate detection: userId -> array of message objects

// Periodic cleanup every 5 minutes to prevent memory leaks from inactive users
setInterval(() => {
  const now = Date.now();
  // 1. Prune XP cooldowns older than 5 minutes
  for (const [userId, timestamp] of xpCooldowns.entries()) {
    if (now - timestamp > 300000) {
      xpCooldowns.delete(userId);
    }
  }
  // 2. Prune anti-spam message logs older than 30 seconds
  for (const [userId, messages] of messageLog.entries()) {
    const recent = messages.filter(m => now - m.timestamp < 30000);
    if (recent.length === 0) {
      messageLog.delete(userId);
    } else {
      messageLog.set(userId, recent);
    }
  }
}, 300000).unref();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignore bots and direct messages
    if (message.author.bot || !message.guild) return;

    // 1. Run Automod checks (Priority)
    const isFlagged = await handleAutomod(message, client);
    if (isFlagged) return; // Stop processing if message was deleted/flagged

    // 2. Run XP System
    await handleXP(message, client);

    // 3. Record Analytics
    await analyticsService.recordMessage(message);
  },
};

/**
 * XP leveling system handler
 */
async function handleXP(message, client) {
  const userId = message.author.id;
  const now = Date.now();

  // Check if leveling is enabled
  const xpEnabled = await ConfigHelper.get('xp_enabled', true);
  if (!xpEnabled) return;

  // XP Cooldown (default: 60s)
  const xpCooldownTime = (await ConfigHelper.get('xp_cooldown_seconds', 60)) * 1000;
  
  if (xpCooldowns.has(userId)) {
    const lastXPTime = xpCooldowns.get(userId);
    if (now - lastXPTime < xpCooldownTime) {
      return; // Still in cooldown
    }
  }

  // Update cooldown cache
  xpCooldowns.set(userId, now);

  try {
    // Calculate XP based on message length between minXP and maxXP
    const minXP = parseInt(await ConfigHelper.get('xp_min_gain', 15), 10) || 15;
    const maxXP = parseInt(await ConfigHelper.get('xp_max_gain', 25), 10) || 25;
    const lowerBound = Math.min(minXP, maxXP);
    const upperBound = Math.max(minXP, maxXP);

    // Thresholds:
    // - Short message (<= 10 characters, e.g. "salut", "ok") -> lowerBound
    // - Long message (>= 150 characters, e.g. developed discussion) -> upperBound
    // - Linear progression between 10 and 150 characters
    const textContent = (message.content || '').trim();
    const charCount = textContent.length;
    const MIN_LEN = 10;
    const MAX_LEN = 150;

    let baseGain;
    if (upperBound <= lowerBound) {
      baseGain = lowerBound;
    } else if (charCount <= MIN_LEN) {
      baseGain = lowerBound;
    } else if (charCount >= MAX_LEN) {
      baseGain = upperBound;
    } else {
      const ratio = (charCount - MIN_LEN) / (MAX_LEN - MIN_LEN);
      baseGain = Math.round(lowerBound + ratio * (upperBound - lowerBound));
    }
    
    // Resolve channel ID for multiplier check (handles threads/forum posts parent channel)
    const xpChannelIdToCheck = message.channel.isThread() ? message.channel.parentId : message.channel.id;
    const multiplierRecord = await XPMultiplier.findByPk(xpChannelIdToCheck);
    const channelMultiplier = multiplierRecord ? multiplierRecord.multiplier : 1.0;
    
    // Resolve role multiplier
    const roleMultiplier = await getMemberRoleMultiplier(message.member);
    
    const totalMultiplier = channelMultiplier * roleMultiplier;
    let xpGained = Math.max(1, Math.floor(baseGain * totalMultiplier));

    await awardUserXP({
      client,
      member: message.member,
      xpAmount: xpGained,
      source: 'message',
      textChannel: message.channel,
    });

  } catch (error) {
    console.error('[XP System] Erreur lors de la gestion de l\'XP :', error);
  }
}

/**
 * Automod handler
 * Returns true if the message was flagged & deleted/acted upon, preventing further execution.
 */
async function handleAutomod(message, client) {
  const userId = message.author.id;
  const content = message.content;
  const now = Date.now();

  // Check if member has bypass permissions (e.g. Administrator or ManageMessages)
  if (message.member.permissions.has('ManageMessages')) {
    return false;
  }

  // 1. Resolve channel ID to check (if inside thread, parent channel is checked)
  const channelIdToCheck = message.channel.isThread() ? message.channel.parentId : message.channel.id;
  
  // 2. Fetch rules for this channel, and global rules
  const rules = await AutomodRule.findAll({
    where: {
      channelId: [channelIdToCheck, 'global']
    }
  });

  if (rules.length === 0) return false;

  // Track if this is the first (creation) post of a forum thread
  // A thread's first message has the same ID as the thread itself
  const isForumThread = message.channel.isThread() && message.channel.parent?.type === 15; // 15 = GuildForum
  const isThreadStart = isForumThread && message.id === message.channel.id;

  // Build a fingerprint for the message: text content + attachment properties
  // Using name, size, and contentType instead of URL since Discord generates different URLs each time
  const attachmentFingerprint = [...message.attachments.values()]
    .map(a => `${a.name}:${a.size}:${a.contentType || 'unknown'}`)
    .sort()
    .join('|');
  const messageFingerprint = content.trim() + (attachmentFingerprint ? '::' + attachmentFingerprint : '');

  // Track user message log for anti-spam/duplicate
  if (!messageLog.has(userId)) {
    messageLog.set(userId, []);
  }
  const userMessages = messageLog.get(userId);
  userMessages.push({ content, fingerprint: messageFingerprint, timestamp: now });
  
  // Clean logs older than 30 seconds
  const thirtySecsAgo = now - 30000;
  const cleanedMessages = userMessages.filter(m => m.timestamp > thirtySecsAgo);
  messageLog.set(userId, cleanedMessages);

  // Check each rule
  for (const rule of rules) {
    // A. Scope Check
    if (rule.scope === 'new_threads' && !isThreadStart) {
      continue; // Skip rules that only target thread creation if this is a normal message
    }

    // B. Content Type Check
    if (rule.monitoredTypes === 'text' && content.trim() === '') {
      continue; // Skip text rules if message content is empty
    }
    
    if (rule.monitoredTypes === 'attachments') {
      const hasLinks = /https?:\/\/[^\s]+/i.test(content);
      const hasAttachmentsOrLinks = message.attachments.size > 0 || hasLinks;
      if (!hasAttachmentsOrLinks) {
        continue; // Skip attachment rules if message has no attachments or links
      }
    }

    let triggered = false;
    let reason = '';

    const parameters = JSON.parse(rule.parameters || '[]');

    if (rule.ruleType === 'spam') {
      const maxMsgs = parameters.maxMessages || 5;
      const intervalMs = (parameters.intervalSeconds || 5) * 1000;
      
      const recentMsgs = cleanedMessages.filter(m => now - m.timestamp < intervalMs);
      if (recentMsgs.length > maxMsgs) {
        triggered = true;
        reason = `Spam détecté (${recentMsgs.length} messages en ${intervalMs / 1000}s)`;
      }
    } 
    else if (rule.ruleType === 'duplicate') {
      // Skip if there is strictly nothing to compare (no text AND no attachments)
      if (messageFingerprint.trim() === '') {
        continue;
      }

      const maxDuplicates = parameters.maxDuplicates || 3;
      const intervalMs = (parameters.intervalSeconds || 15) * 1000;

      const recentMsgs = cleanedMessages.filter(m => now - m.timestamp < intervalMs);
      let duplicateCount = 0;
      for (const m of recentMsgs) {
        // Compare fingerprints: catches text dupes AND image dupes (same attachment URL)
        if (m.fingerprint && m.fingerprint !== '' && m.fingerprint === messageFingerprint) {
          duplicateCount++;
        }
      }

      if (duplicateCount >= maxDuplicates) {
        triggered = true;
        reason = `Messages répétitifs/identiques détectés (${duplicateCount} fois en ${intervalMs / 1000}s)`;
      }
    } 
    else if (rule.ruleType === 'words_blacklist') {
      const blacklist = parameters;
      const threadTitle = isThreadStart ? (message.channel.name || '') : '';
      const contentToCheck = content + ' ' + threadTitle;
      for (const word of blacklist) {
        if (contentToCheck.toLowerCase().includes(word.toLowerCase())) {
          triggered = true;
          reason = rule.customReason || `Contient un mot banni : "${word}"`;
          break;
        }
      }
    } 
    else if (rule.ruleType === 'words_whitelist') {
      const whitelist = parameters;
      if (whitelist.length > 0) {
        const threadTitle = isThreadStart ? (message.channel.name || '') : '';
        const contentToCheck = content + ' ' + threadTitle;
        const containsApprovedWord = whitelist.some(word => 
          contentToCheck.toLowerCase().includes(word.toLowerCase())
        );
        if (!containsApprovedWord) {
          triggered = true;
          reason = rule.customReason || `Format de message incorrect (ne contient aucun mot requis)`;
        }
      }
    }
    else if (rule.ruleType === 'min_length') {
      const minLength = parameters.minLength || 0;
      if (content.length < minLength) {
        triggered = true;
        reason = rule.customReason || `Message trop court (minimum ${minLength} caractères)`;
      }
    }
    else if (rule.ruleType === 'max_length') {
      const maxLength = parameters.maxLength || 2000;
      if (content.length > maxLength) {
        triggered = true;
        reason = rule.customReason || `Message trop long (maximum ${maxLength} caractères)`;
      }
    }
    else if (rule.ruleType === 'regex') {
      const pattern = parameters.pattern;
      if (pattern && typeof pattern === 'string') {
        // ReDoS safety: prevent oversized regex or dangerous nested quantifiers that cause event loop freeze
        if (pattern.length > 200 || /(\+|\*|\{[^}]+\})\s*(\+|\*|\{[^}]+\})/i.test(pattern)) {
          console.warn('[Automod] Motifs imbriqués dangereux (ReDoS) ou trop longs ignorés :', pattern);
          continue;
        }
        try {
          const threadTitle = isThreadStart ? (message.channel.name || '') : '';
          const contentToCheck = (content + ' ' + threadTitle).substring(0, 4000); // Cap content check length
          const regex = new RegExp(pattern, 'i');
          if (regex.test(contentToCheck)) {
            triggered = true;
            reason = rule.customReason || `Message correspond à un motif non autorisé`;
          }
        } catch (e) {
          console.error('[Automod] Invalid regex pattern:', pattern, e.message);
        }
      }
    }

    if (triggered) {
      // Parse multi-actions from rule.actions JSON array
      let actions = [];
      try {
        actions = JSON.parse(rule.actions || '[]');
      } catch(e) {}

      // Fallback compatibility with old rule.action string
      if (actions.length === 0 && rule.action) {
        if (rule.action === 'delete_and_warn') {
          actions = ['delete', 'warn'];
        } else {
          actions = [rule.action];
        }
      }

      // Default fallback
      if (actions.length === 0) {
        actions = ['delete'];
      }

      await applyAutomodAction(client, message, rule, actions, reason, isThreadStart);
      return true; // Stop processing immediately
    }
  }

  return false;
}

/**
 * Applies automod actions (delete, warn, mute, ban)
 * @param {object} client - Discord client instance
 * @param {import('discord.js').Message} message - Infringing message
 * @param {object} rule - Triggered AutomodRule DB instance
 * @param {string[]} actions - List of actions to execute ('delete', 'warn', 'mute', 'ban')
 * @param {string} reason - Infraction reason
 * @param {boolean} isThreadStart - If true, 'delete' will delete the entire forum thread instead of just the message
 */
async function applyAutomodAction(client, message, rule, actions, reason, isThreadStart = false) {
  let member = message.member;
  const guild = message.guild;
  const channel = message.channel;
  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));

  if (!member && message.author) {
    member = await guild.members.fetch(message.author.id).catch(() => null);
  }

  const shouldDelete = actions.includes('delete');
  const shouldWarn = actions.includes('warn');
  const shouldMute = actions.includes('mute');
  const shouldBan = actions.includes('ban');

  try {
    // 1. Delete message or thread if configured
    let messageDeleted = false;
    if (shouldDelete) {
      if (isThreadStart && channel.isThread()) {
        await channel.delete('[Automod] Contenu du post non conforme').catch(() => {});
        messageDeleted = true;
      } else if (message.deletable) {
        await message.delete().catch(() => {});
        messageDeleted = true;
      }
    }

    if (!member) {
      return;
    }

    // 2. Warn user if configured
    let warnRecord = null;
    if (shouldWarn) {
      try {
        warnRecord = await Warn.create({
          userId: member.id,
          moderatorId: botMember.id,
          reason: `[Automod] ${reason}`,
        });
      } catch (warnErr) {
        console.error('[Automod] Erreur enregistrement Warn:', warnErr);
      }
    }

    // 3. Mute / Timeout user if configured
    let muteApplied = false;
    let muteDurationStr = '';
    if (shouldMute) {
      const isAlreadyMuted = member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now();
      if (!isAlreadyMuted) {
        if (!member.moderatable) {
          console.warn(`[Automod] Impossible d'exclure (timeout) ${member.user?.tag || member.id}: permissions insuffisantes ou rôle supérieur.`);
          await logModerationAction(client, {
            action: '⚠️ Erreur Automod (Hiérarchie Discord)',
            target: member.user || member,
            moderator: botMember.user,
            reason: `Impossible de timeout ${member.user?.username || member.id} : rôle supérieur/égal au bot ou Administrateur (Infraction: ${reason}).`,
          });
        } else {
          const rawSeconds = parseInt(rule?.muteDuration || 600, 10);
          const safeSeconds = isNaN(rawSeconds) || rawSeconds < 10 ? 600 : Math.min(rawSeconds, 2419200);
          const durationMs = safeSeconds * 1000;

          muteDurationStr = safeSeconds >= 86400 
            ? `${Math.round(safeSeconds / 86400)} jour(s)` 
            : safeSeconds >= 3600 
              ? `${Math.round(safeSeconds / 3600)} heure(s)` 
              : `${Math.round(safeSeconds / 60)} minute(s)`;

          try {
            await member.timeout(durationMs, `[Automod] ${reason}`);
            await Sanction.create({
              userId: member.id,
              moderatorId: botMember.id,
              type: 'mute',
              reason: `[Automod] ${reason}`,
            });
            muteApplied = true;
          } catch (timeoutErr) {
            console.error(`[Automod] Erreur timeout Discord:`, timeoutErr);
            await logModerationAction(client, {
              action: '⚠️ Erreur Timeout Automod',
              target: member.user || member,
              moderator: botMember.user,
              reason: `Échec de l'exclusion temporaire pour ${member.user?.username || member.id} (${timeoutErr.message}) suite à l'automodération.`,
            });
          }
        }
      }
    }

    // 4. Ban user check if configured
    let banEligible = false;
    if (shouldBan) {
      if (!member.bannable) {
        console.warn(`[Automod] Impossible de bannir ${member.user?.tag || member.id}: permissions insuffisantes ou rôle supérieur.`);
        await logModerationAction(client, {
          action: '⚠️ Erreur Automod (Hiérarchie Discord)',
          target: member.user || member,
          moderator: botMember.user,
          reason: `Impossible de bannir ${member.user?.username || member.id} : rôle supérieur/égal au bot ou Administrateur (Infraction: ${reason}).`,
        });
      } else {
        banEligible = true;
      }
    }

    // 5. Send DM Notification (sent before ban so delivery succeeds)
    const actionsTaken = [];
    if (shouldDelete) actionsTaken.push('• Suppression de votre message');
    if (warnRecord) actionsTaken.push(`• Avertissement (Warn #${warnRecord.id})`);
    if (muteApplied) actionsTaken.push(`• Exclusion temporaire (Mute) : **${muteDurationStr}**`);
    if (banEligible) actionsTaken.push('• Bannissement définitif du serveur');

    if (actionsTaken.length > 0) {
      let dmTitle = '🛡️ Message supprimé par l\'automodération';
      let dmColor = embeds.COLORS.WARNING;

      if (banEligible) {
        dmTitle = '🔨 Bannissement Automatique (Automod)';
        dmColor = embeds.COLORS.ERROR;
      } else if (muteApplied) {
        dmTitle = '🔇 Exclusion Automatique (Automod)';
        dmColor = embeds.COLORS.ERROR;
      } else if (warnRecord) {
        dmTitle = '⚠️ Avertissement Automatique (Automod)';
        dmColor = embeds.COLORS.ERROR;
      }

      const dmEmbed = embeds.custom(
        dmTitle,
        `Une infraction aux règles du serveur **${guild.name}** a été détectée dans le salon **#${channel.name}**.\n\n` +
        `**Motif :** ${reason}\n\n` +
        `**Sanction(s) appliquée(s) :**\n${actionsTaken.join('\n')}\n\n` +
        `*Veuillez respecter le règlement du serveur pour garantir une expérience agréable à tous.*`,
        dmColor
      );

      await sendDM(member, dmEmbed);
    }

    // 6. Execute Ban if eligible
    let banApplied = false;
    if (banEligible) {
      try {
        await member.ban({ reason: `[Automod] ${reason}` });
        await Sanction.create({
          userId: member.id,
          moderatorId: botMember.id,
          type: 'ban',
          reason: `[Automod] ${reason}`,
        });
        banApplied = true;
      } catch (banErr) {
        console.error('[Automod] Erreur ban Discord:', banErr);
        await logModerationAction(client, {
          action: '⚠️ Erreur Bannissement Automod',
          target: member.user || member,
          moderator: botMember.user,
          reason: `Échec du bannissement pour ${member.user?.username || member.id} (${banErr.message}) suite à l'automodération.`,
        });
      }
    }

    // 7. Log Moderation Action
    const summaryActions = [];
    if (shouldDelete) summaryActions.push('Suppression');
    if (warnRecord) summaryActions.push(`Warn #${warnRecord.id}`);
    if (muteApplied) summaryActions.push(`Mute (${muteDurationStr})`);
    if (banApplied) summaryActions.push('Ban');

    const logActionTitle = banApplied
      ? '🔨 Automod - Bannissement'
      : (muteApplied
        ? `🔇 Automod - Mute (${muteDurationStr})`
        : (warnRecord
          ? `⚠️ Automod - Warn #${warnRecord.id}`
          : '🛡️ Automod - Message Supprimé'));

    await logModerationAction(client, {
      action: logActionTitle,
      target: member.user || member,
      moderator: botMember.user,
      reason: `Salon: ${channel} | ${reason}\nSanctions: ${summaryActions.join(', ')}\nMessage original: \`\`\`${message.content.substring(0, 1000)}\`\`\``,
      duration: muteApplied ? muteDurationStr : null,
      warnId: warnRecord ? warnRecord.id : null,
    });

    // 8. Trigger warn thresholds if warned
    if (warnRecord && !banApplied) {
      await checkWarnThresholds(client, member, botMember, `[Automod] ${reason}`);
    }

  } catch (error) {
    console.error('Error applying automod action:', error);
  }
}
