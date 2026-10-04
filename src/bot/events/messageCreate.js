const { UserXP, ConfigHelper, AutomodRule, Warn, Sanction, XPMultiplier } = require('../../database');
const embeds = require('../utils/embeds');
const { checkWarnThresholds, logModerationAction, sendDM } = require('../utils/moderationHelper');
const { calculateLevelFromXP, getXPNeededForLevel, handleRoleRewards, getMemberRoleMultiplier, awardUserXP } = require('../utils/xpHelper');
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

      await applyAutomodAction(client, message, actions, reason, isThreadStart);
      return true; // Stop processing immediately
    }
  }

  return false;
}

/**
 * Applies automod actions (delete, warn)
 * @param {boolean} isThreadStart - If true, 'delete' will delete the entire forum thread instead of just the message
 */
async function applyAutomodAction(client, message, actions, reason, isThreadStart = false) {
  const member = message.member;
  const guild = message.guild;
  const channel = message.channel;
  const botMember = guild.members.me;

  const shouldDelete = actions.includes('delete');
  const shouldWarn = actions.includes('warn');

  try {
    // 1. Delete message (or entire forum thread if it's the first post) if configured
    if (shouldDelete) {
      if (isThreadStart && channel.isThread()) {
        // Delete the whole forum thread (post), not just the message
        await channel.delete('[Automod] Contenu du post non conforme').catch(() => {});
      } else if (message.deletable) {
        await message.delete();
      }
    }

    // 2. Warn user if configured
    if (shouldWarn) {
      // Create warn entry
      const warnRecord = await Warn.create({
        userId: member.id,
        moderatorId: botMember.id,
        reason: `[Automod] ${reason}`,
      });

      // Send DM notifying of the warn and deletion
      const dmEmbed = embeds.custom(
        '⚠️ Avertissement & Suppression Automatique',
        `Vous avez reçu un avertissement automatique sur le serveur **${guild.name}**.\n\n` +
        `**Motif :** ${reason}\n` +
        `**Salon :** #${channel.name}\n` +
        `**Action :** Votre message a été supprimé et un avertissement (Warn #${warnRecord.id}) vous a été attribué.\n\n` +
        `*Veuillez respecter le règlement du serveur pour éviter d'autres sanctions.*`,
        embeds.COLORS.ERROR
      );
      await sendDM(member, dmEmbed);

      // Log moderation action
      await logModerationAction(client, {
        action: '⚠️ Warn Automatique (Automod)',
        target: member.user,
        moderator: botMember.user,
        reason: reason,
        warnId: warnRecord.id,
      });

      // Check for thresholds
      await checkWarnThresholds(client, member, botMember, `[Automod] ${reason}`);
    } 
    // 3. If delete only (not warned)
    else if (shouldDelete) {
      // Send DM notifying only of deletion
      const dmEmbed = embeds.custom(
        '🛡️ Message supprimé par l\'automodération',
        `Votre message dans le salon **#${channel.name}** sur le serveur **${guild.name}** a été supprimé par notre système d'automodération.\n\n` +
        `**Motif :** ${reason}\n\n` +
        `*Veuillez respecter les consignes du salon.*`,
        embeds.COLORS.WARNING
      );
      await sendDM(member, dmEmbed);

      // Log moderation action
      await logModerationAction(client, {
        action: '🛡️ Automod - Message Supprimé',
        target: member.user,
        moderator: botMember.user,
        reason: `Salon: ${channel} | ${reason}\nMessage original: \`\`\`${message.content.substring(0, 1000)}\`\`\``,
      });
    }

  } catch (error) {
    console.error('Error applying automod action:', error);
  }
}
