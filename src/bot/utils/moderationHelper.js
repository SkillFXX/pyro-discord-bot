const { Op } = require('sequelize');
const { ConfigHelper, Warn, WarnAction, Sanction } = require('../../database');
const embeds = require('./embeds');
const { PermissionFlagsBits } = require('discord.js');

/**
 * Sends a DM to a member with an Embed.
 * Returns true if successful, false if DMs are blocked.
 */
async function sendDM(member, embed) {
  try {
    // If we only have user object or member object, get the user
    const user = member.user || member;
    await user.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn(`Could not send DM to ${member.id || member}:`, error.message);
    return false;
  }
}

const loggerService = require('../../services/loggerService');

/**
 * Logs a moderation action in the configured log channel.
 */
async function logModerationAction(client, { action, target, moderator, reason, duration = null, warnId = null }) {
  try {
    const fields = [
      { name: '👤 Membre', value: `${target} (\`${target.id}\`)`, inline: true },
      { name: '🛡️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    ];

    if (reason) {
      const safeReason = reason.length > 1024 ? reason.substring(0, 1021) + '...' : reason;
      fields.push({ name: '📝 Motif', value: safeReason, inline: false });
    }

    if (duration) {
      fields.push({ name: '⏳ Durée', value: duration, inline: true });
    }

    if (warnId) {
      fields.push({ name: '🔢 Warn ID', value: `\`#${warnId}\``, inline: true });
    }

    let logKey = 'log_bot_moderation';
    if (action.toLowerCase().includes('ticket')) {
      logKey = 'log_bot_tickets';
    } else if (action.toLowerCase().includes('automod')) {
      logKey = 'log_bot_automod';
    } else if (warnId != null || action.toLowerCase().includes('avertissement') || action.toLowerCase().includes('automatique') || action.toLowerCase().includes('warn')) {
      logKey = 'log_bot_sanctions';
    }

    await loggerService.log(client, logKey, {
      title: `🔔 Action : ${action}`,
      color: action.toLowerCase().includes('ticket') ? '#3498DB' : '#E74C3C',
      fields,
      footer: { text: `Pyro Surveillance • Cible ID: ${target.id || 'N/A'}` },
    });
  } catch (error) {
    console.error('Error logging moderation action:', error);
  }
}

/**
 * Checks if adding one or more warns just crossed any automatic punishment thresholds.
 * @param {object} client - Discord client instance
 * @param {import('discord.js').GuildMember} member - Target guild member
 * @param {import('discord.js').GuildMember|import('discord.js').User} moderator - Moderator or Bot
 * @param {string} reason - Warn reason
 * @param {number} [warnsAdded=1] - Number of warns just created in this action
 */
async function checkWarnThresholds(client, member, moderator, reason, warnsAdded = 1) {
  try {
    if (!member || !member.guild) return;

    // Total warns currently on the user
    const totalWarns = await Warn.count({ where: { userId: member.id } });
    if (totalWarns === 0) return;

    const previousWarnCount = Math.max(0, totalWarns - warnsAdded);
    
    // Only find thresholds that were *newly crossed* by this addition:
    // previousWarnCount < warnsCount <= totalWarns
    // (e.g. going from 2 to 3 warns crosses threshold 3, but going from 3 to 4 warns will NOT re-trigger threshold 3)
    const newlyCrossedActions = await WarnAction.findAll({
      where: {
        warnsCount: {
          [Op.gt]: previousWarnCount,
          [Op.lte]: totalWarns,
        },
      },
      order: [['warnsCount', 'DESC']],
    });

    if (newlyCrossedActions.length === 0) return;

    // Take the highest threshold crossed in this transition
    const thresholdAction = newlyCrossedActions[0];

    const botMember = member.guild.members.me || (await member.guild.members.fetchMe().catch(() => null));
    if (!botMember) return;

    if (thresholdAction.action === 'mute') {
      // Check if member is already timed out
      const isAlreadyMuted = member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now();
      if (isAlreadyMuted) {
        return;
      }

      // Check Discord hierarchy permission
      if (!member.moderatable) {
        console.warn(`[Moderation] Impossible d'exclure temporairement (mute) ${member.user?.tag || member.id}: rôle supérieur/égal au bot ou Administrateur.`);
        await logModerationAction(client, {
          action: '⚠️ Erreur Sanction Auto (Hiérarchie Discord)',
          target: member.user || member,
          moderator: botMember.user,
          reason: `Impossible de mute ${member.user?.username || member.id} : son rôle le plus élevé est supérieur ou égal à celui du bot, ou il dispose de la permission Administrateur (Seuil de ${thresholdAction.warnsCount} avertissements atteint, total actuel : ${totalWarns} warns).`,
        });
        return;
      }

      const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
      const requestedMs = (thresholdAction.duration || 86400) * 1000;
      const durationMs = Math.min(requestedMs, MAX_TIMEOUT_MS);

      try {
        await member.timeout(durationMs, `Sanction Automatique (Seuil ${thresholdAction.warnsCount} avertissements atteint) : ${reason}`);
      } catch (timeoutErr) {
        console.error(`[Moderation] Erreur timeout Discord pour ${member.user?.tag || member.id}:`, timeoutErr);
        await logModerationAction(client, {
          action: '⚠️ Erreur Timeout Discord',
          target: member.user || member,
          moderator: botMember.user,
          reason: `Échec de l'exclusion temporaire pour ${member.user?.username || member.id} (${timeoutErr.message}) suite au seuil de ${thresholdAction.warnsCount} avertissements.`,
        });
        return;
      }
      
      // Create sanction entry
      await Sanction.create({
        userId: member.id,
        moderatorId: botMember.id,
        type: 'mute',
        reason: `Sanction Automatique (Seuil ${thresholdAction.warnsCount} avertissements atteint) : ${reason}`,
      });

      // DM
      const durationStr = thresholdAction.duration >= 86400 
        ? `${thresholdAction.duration / 86400} jour(s)` 
        : thresholdAction.duration >= 3600 
          ? `${thresholdAction.duration / 3600} heure(s)` 
          : `${thresholdAction.duration / 60} minute(s)`;

      const dmEmbed = embeds.custom(
        '🔇 Mute Automatique',
        `Vous avez été temporairement exclu (mute) du serveur **${member.guild.name}** pour une durée de **${durationStr}**.\n\n` +
        `**Raison :** Atteinte du seuil de ${thresholdAction.warnsCount} avertissements (total actuel : ${totalWarns}).\n` +
        `**Dernier motif :** ${reason}`,
        embeds.COLORS.ERROR
      );
      await sendDM(member, dmEmbed);

      // Log
      await logModerationAction(client, {
        action: `🔇 Mute Automatique (Seuil ${thresholdAction.warnsCount} Warns)`,
        target: member.user || member,
        moderator: botMember.user,
        reason: `Mute automatique suite à l'atteinte du seuil de ${thresholdAction.warnsCount} avertissements (${reason})`,
        duration: durationStr,
      });

    } else if (thresholdAction.action === 'ban') {
      if (!member.bannable) {
        console.warn(`[Moderation] Impossible de bannir ${member.user?.tag || member.id}: permissions insuffisantes ou rôle supérieur.`);
        await logModerationAction(client, {
          action: '⚠️ Erreur Sanction Auto (Hiérarchie Discord)',
          target: member.user || member,
          moderator: botMember.user,
          reason: `Impossible de bannir ${member.user?.username || member.id} (permissions insuffisantes ou rôle supérieur) suite au seuil de ${thresholdAction.warnsCount} avertissements (total : ${totalWarns} warns).`,
        });
        return;
      }

      // DM before ban
      const dmEmbed = embeds.custom(
        '🔨 Bannissement Automatique',
        `Vous avez été banni définitivement du serveur **${member.guild.name}**.\n\n` +
        `**Raison :** Atteinte du seuil de ${thresholdAction.warnsCount} avertissements (total actuel : ${totalWarns}).\n` +
        `**Dernier motif :** ${reason}`,
        embeds.COLORS.ERROR
      );
      await sendDM(member, dmEmbed);

      await member.ban({ reason: `Sanction Automatique (Seuil ${thresholdAction.warnsCount} avertissements atteint) : ${reason}` });

      // Create sanction entry
      await Sanction.create({
        userId: member.id,
        moderatorId: botMember.id,
        type: 'ban',
        reason: `Sanction Automatique (Seuil ${thresholdAction.warnsCount} avertissements atteint) : ${reason}`,
      });

      // Log
      await logModerationAction(client, {
        action: `🔨 Bannissement Automatique (Seuil ${thresholdAction.warnsCount} Warns)`,
        target: member.user || member,
        moderator: botMember.user,
        reason: `Bannissement automatique suite au seuil de ${thresholdAction.warnsCount} avertissements (${reason})`,
      });
    }
  } catch (error) {
    console.error('Error handling warn thresholds:', error);
  }
}

module.exports = {
  sendDM,
  logModerationAction,
  checkWarnThresholds,
};
