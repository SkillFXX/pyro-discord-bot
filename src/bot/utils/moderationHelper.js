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

/**
 * Logs a moderation action in the configured log channel.
 */
async function logModerationAction(client, { action, target, moderator, reason, duration = null, warnId = null }) {
  const logChannelId = await ConfigHelper.get('log_channel_id');
  if (!logChannelId) return;

  try {
    const channel = await client.channels.fetch(logChannelId);
    if (!channel) return;

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

    const embed = embeds.custom(
      `🔔 Action de Modération : ${action}`,
      null,
      embeds.COLORS.INFO,
      fields
    );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error logging moderation action:', error);
  }
}

/**
 * Checks if a member reached any threshold for automatic punishment
 */
async function checkWarnThresholds(client, member, moderator, reason) {
  try {
    // Count warns
    const warnCount = await Warn.count({ where: { userId: member.id } });
    
    // Find if there is a WarnAction configuration for this count
    const thresholdAction = await WarnAction.findByPk(warnCount);
    if (!thresholdAction) return;

    const botMember = member.guild.members.me;

    if (thresholdAction.action === 'mute') {
      const durationMs = thresholdAction.duration * 1000;
      
      // Native timeout (v14)
      if (!member.moderatable) {
        await logModerationAction(client, {
          action: '⚠️ Erreur Sanction Auto',
          target: member.user,
          moderator: botMember.user,
          reason: `Impossible de mute ${member.user.username} (permissions insuffisantes) suite au warn #${warnCount}.`,
        });
        return;
      }

      await member.timeout(durationMs, `Sanction Automatique (${warnCount} avertissements) : ${reason}`);
      
      // Create sanction entry
      await Sanction.create({
        userId: member.id,
        moderatorId: botMember.id,
        type: 'mute',
        reason: `Sanction Automatique (${warnCount} avertissements) : ${reason}`,
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
        `**Raison :** Atteinte du seuil de ${warnCount} avertissements.\n` +
        `**Dernier avertissement :** ${reason}`,
        embeds.COLORS.ERROR
      );
      await sendDM(member, dmEmbed);

      // Log
      await logModerationAction(client, {
        action: `🔇 Mute Automatique (Seuil ${warnCount} Warns)`,
        target: member.user,
        moderator: botMember.user,
        reason: `Mute automatique suite à l'avertissement #${warnCount} (${reason})`,
        duration: durationStr,
      });

    } else if (thresholdAction.action === 'ban') {
      if (!member.bannable) {
        await logModerationAction(client, {
          action: '⚠️ Erreur Sanction Auto',
          target: member.user,
          moderator: botMember.user,
          reason: `Impossible de bannir ${member.user.username} (permissions insuffisantes) suite au warn #${warnCount}.`,
        });
        return;
      }

      // DM before ban
      const dmEmbed = embeds.custom(
        '🔨 Bannissement Automatique',
        `Vous avez été banni définitivement du serveur **${member.guild.name}**.\n\n` +
        `**Raison :** Atteinte du seuil de ${warnCount} avertissements.\n` +
        `**Dernier avertissement :** ${reason}`,
        embeds.COLORS.ERROR
      );
      await sendDM(member, dmEmbed);

      await member.ban({ reason: `Sanction Automatique (${warnCount} avertissements) : ${reason}` });

      // Create sanction entry
      await Sanction.create({
        userId: member.id,
        moderatorId: botMember.id,
        type: 'ban',
        reason: `Sanction Automatique (${warnCount} avertissements) : ${reason}`,
      });

      // Log
      await logModerationAction(client, {
        action: `🔨 Bannissement Automatique (Seuil ${warnCount} Warns)`,
        target: member.user,
        moderator: botMember.user,
        reason: `Bannissement automatique suite à l'avertissement #${warnCount} (${reason})`,
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
