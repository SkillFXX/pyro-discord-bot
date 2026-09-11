const { ConfigHelper } = require('../../database');
const embeds = require('../utils/embeds');
const analyticsService = require('../../services/analyticsService');
const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const guild = member.guild;

    // Track member leave in analytics
    await analyticsService.recordMemberLeave(member);

    // Goodbye Message
    try {
      const leaveChannelId = await ConfigHelper.get('leave_channel_id');
      const leaveMessageTemplate = await ConfigHelper.get('leave_message_template');

      if (leaveChannelId && leaveMessageTemplate) {
        const channel = await guild.channels.fetch(leaveChannelId).catch(() => null);
        if (channel) {
          const username = member.user?.username || member.displayName || 'Un membre';
          const avatar = member.user?.displayAvatarURL ? member.user.displayAvatarURL({ dynamic: true }) : null;

          // Replace placeholders (cannot use {user} as mention since they left, but we can do username)
          const formattedMessage = leaveMessageTemplate
            .replace(/{username}/g, username)
            .replace(/{server}/g, guild.name)
            .replace(/{memberCount}/g, guild.memberCount.toString());

          const embed = embeds.custom(
            `📤 Départ du Serveur`,
            formattedMessage,
            embeds.COLORS.ERROR,
            null,
            avatar
          );

          await channel.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error('[Leave Event] Erreur lors de l\'envoi du message de départ :', error);
    }

    // Discord Logs : Membre Parti / Expulsé
    try {
      let isKick = false;
      let kicker = null;
      let kickReason = null;

      if (guild.members.me?.permissions.has('ViewAuditLog')) {
        const fetchedLogs = await guild.fetchAuditLogs({
          limit: 1,
          type: 20, // MemberKick
        }).catch(() => null);

        if (fetchedLogs) {
          const kickLog = fetchedLogs.entries.first();
          if (kickLog && kickLog.target?.id === member.id && (Date.now() - kickLog.createdTimestamp < 5000)) {
            isKick = true;
            kicker = kickLog.executor;
            kickReason = kickLog.reason || 'Aucun motif spécifié';
          }
        }
      }

      if (isKick) {
        await loggerService.log(client, 'log_discord_kicks', {
          title: '👢 Membre Expulsé (Kick)',
          description: `**${member.user?.tag || member.id}** a été expulsé du serveur.`,
          color: '#E74C3C',
          thumbnail: member.user?.displayAvatarURL ? member.user.displayAvatarURL({ dynamic: true }) : null,
          fields: [
            { name: '👤 Utilisateur', value: `${member.user?.tag || 'Inconnu'} (\`${member.id}\`)`, inline: true },
            { name: '🛡️ Expulsé par', value: kicker ? `${kicker.tag} (\`${kicker.id}\`)` : 'Inconnu', inline: true },
            { name: '📝 Motif', value: kickReason, inline: false },
          ],
          footer: { text: `Membre ID: ${member.id}` }
        });
      } else {
        await loggerService.log(client, 'log_discord_member_leave', {
          title: '📤 Membre Parti',
          description: `**${member.user?.tag || member.id}** a quitté le serveur.`,
          color: '#E74C3C',
          thumbnail: member.user?.displayAvatarURL ? member.user.displayAvatarURL({ dynamic: true }) : null,
          fields: [
            { name: '👤 Utilisateur', value: `${member.user?.tag || 'Inconnu'} (\`${member.id}\`)`, inline: true },
            { name: '👥 Membres Restants', value: `${guild.memberCount}`, inline: true },
          ],
          footer: { text: `Membre ID: ${member.id}` }
        });
      }
    } catch (error) {
      console.error('[LoggerService] Erreur log member leave/kick:', error);
    }
  },
};
