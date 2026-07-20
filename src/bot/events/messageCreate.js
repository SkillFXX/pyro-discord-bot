const { UserXP, RoleReward, ConfigHelper, AutomodRule, Warn, Sanction, XPMultiplier } = require('../../database');
const embeds = require('../utils/embeds');
const { checkWarnThresholds, logModerationAction, sendDM } = require('../utils/moderationHelper');

// Memory caches to avoid DB spam
const xpCooldowns = new Map();
const messageLog = new Map(); // For anti-spam and duplicate detection: userId -> array of message objects

function getXPNeededForLevel(level) {
  if (level <= 0) return 0;
  return Math.floor(100 * Math.pow(level, 1.5));
}

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
    // Find or create User XP record
    let [userRecord, created] = await UserXP.findOrCreate({
      where: { userId },
      defaults: { xp: 0, level: 0 },
    });

    // Random XP gain (default: 15-25 XP)
    const minXP = await ConfigHelper.get('xp_min_gain', 15);
    const maxXP = await ConfigHelper.get('xp_max_gain', 25);
    
    // Resolve channel ID for multiplier check (handles threads/forum posts parent channel)
    const xpChannelIdToCheck = message.channel.isThread() ? message.channel.parentId : message.channel.id;
    const multiplierRecord = await XPMultiplier.findByPk(xpChannelIdToCheck);
    const xpMultiplier = multiplierRecord ? multiplierRecord.multiplier : 1.0;
    
    let xpGained = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;
    if (xpMultiplier !== 1.0) {
      xpGained = Math.floor(xpGained * xpMultiplier);
    }

    const newXP = userRecord.xp + xpGained;
    let newLevel = userRecord.level;

    // Calculate if level up occurs
    let levelUp = false;
    while (newXP >= getXPNeededForLevel(newLevel + 1)) {
      newLevel++;
      levelUp = true;
    }

    // Save user state
    userRecord.xp = newXP;
    userRecord.level = newLevel;
    userRecord.lastMessageTimestamp = new Date(now);
    await userRecord.save();

    if (levelUp) {
      // 1. Announce Level Up
      const levelChannelId = await ConfigHelper.get('xp_announcement_channel_id');
      if (levelChannelId) {
        const channel = await message.guild.channels.fetch(levelChannelId).catch(() => null);
        if (channel) {
          const levelEmbed = embeds.custom(
            '🎉 Passage de Niveau !',
            `Félicitations ${message.author}, tu viens de passer au **Niveau ${newLevel}** ! 🚀`,
            embeds.COLORS.SUCCESS,
            null,
            message.author.displayAvatarURL({ dynamic: true })
          );
          await channel.send({ embeds: [levelEmbed] });
        }
      }

      // 2. Distribute Role Rewards
      await handleRoleRewards(message.member, newLevel);
    }

  } catch (error) {
    console.error('[XP System] Erreur lors de la gestion de l\'XP :', error);
  }
}

/**
 * Handles role rewards when leveling up
 */
async function handleRoleRewards(member, newLevel) {
  try {
    const guild = member.guild;
    const botMember = guild.members.me;

    // Get all rewards up to the new level
    const rewards = await RoleReward.findAll({
      order: [['level', 'ASC']],
    });

    if (rewards.length === 0) return;

    const rolesToAdd = [];
    const rolesToRemove = [];

    // Separate active rewards and previous rewards that should be replaced
    for (const reward of rewards) {
      const role = guild.roles.cache.get(reward.roleId);
      if (!role) continue;

      // Check if role is assignable
      if (role.position >= botMember.roles.highest.position) {
        console.warn(`[XP Rewards] Cannot manage role ${role.name} - higher than bot highest role.`);
        continue;
      }

      if (reward.level <= newLevel) {
        // User is eligible for this role
        if (!member.roles.cache.has(reward.roleId)) {
          rolesToAdd.push(role);
        }

        // If this level reward replaces previous level rewards
        if (reward.replacePreviousRole && reward.level === newLevel) {
          // Find lower rewards
          const lowerRewards = rewards.filter(r => r.level < newLevel);
          for (const lr of lowerRewards) {
            const lowerRole = guild.roles.cache.get(lr.roleId);
            if (lowerRole && member.roles.cache.has(lr.roleId)) {
              rolesToRemove.push(lowerRole);
            }
          }
        }
      }
    }

    // Apply changes
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove, `XP Remplacement Rôles (Niveau ${newLevel})`);
      console.log(`[XP Rewards] Retrait de ${rolesToRemove.length} rôles à ${member.user.tag}`);
    }
    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd, `XP Récompense Niveau ${newLevel}`);
      console.log(`[XP Rewards] Attribution de ${rolesToAdd.length} rôles à ${member.user.tag}`);
    }

  } catch (error) {
    console.error('[XP Rewards] Erreur lors de la distribution des rôles :', error);
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
      // Also check thread title if this is the first post of a forum thread
      const threadTitle = isThreadStart ? (message.channel.name || '') : '';
      const contentToCheck = content + ' ' + threadTitle;
      for (const word of blacklist) {
        if (contentToCheck.toLowerCase().includes(word.toLowerCase())) {
          triggered = true;
          reason = `Contient un mot banni : "${word}"`;
          if (threadTitle && threadTitle.toLowerCase().includes(word.toLowerCase())) {
            reason += ` (dans le titre du post)`;
          }
          break;
        }
      }
    } 
    else if (rule.ruleType === 'words_whitelist') {
      const whitelist = parameters;
      if (whitelist.length > 0) {
        // Also check thread title if this is the first post of a forum thread
        const threadTitle = isThreadStart ? (message.channel.name || '') : '';
        const contentToCheck = content + ' ' + threadTitle;
        const containsApprovedWord = whitelist.some(word => 
          contentToCheck.toLowerCase().includes(word.toLowerCase())
        );
        if (!containsApprovedWord) {
          triggered = true;
          reason = `Format de message incorrect (ne contient aucun mot requis de la liste : ${whitelist.join(', ')})`;
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
