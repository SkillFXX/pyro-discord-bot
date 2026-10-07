const { ConfigHelper } = require('../../database');
const embeds = require('../utils/embeds');
const analyticsService = require('../../services/analyticsService');
const loggerService = require('../../services/loggerService');
const memberCounterService = require('../../services/memberCounterService');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const guild = member.guild;

    // Track member leave in analytics
    await analyticsService.recordMemberLeave(member);

    // Update member counter channel (rate-limit safe)
    memberCounterService.updateMemberCounter(guild).catch(() => {});

    // 1. Invite Tracking on Leave
    let leaveInviteData = null;
    try {
      const inviteService = require('../../services/inviteService');
      leaveInviteData = await inviteService.onMemberLeave(member);
    } catch (invErr) {
      console.error('[GuildMemberRemove] Erreur suivi invitation départ :', invErr);
    }

    const inviterMention = leaveInviteData?.inviter
      ? `<@${leaveInviteData.inviter.id}>`
      : (leaveInviteData?.inviterId ? `<@${leaveInviteData.inviterId}>` : 'Inconnu');

    const inviterUsername = leaveInviteData?.inviter
      ? (leaveInviteData.inviter.displayName || leaveInviteData.inviter.username)
      : 'Inconnu';

    const inviterTag = leaveInviteData?.inviter
      ? (leaveInviteData.inviter.tag || leaveInviteData.inviter.username)
      : 'Inconnu';

    const invitesCount = (leaveInviteData?.totalInvites ?? 0).toString();

    // 2. Goodbye Message
    try {
      const leaveChannelId = await ConfigHelper.get('leave_channel_id');
      const leaveMessageTemplate = await ConfigHelper.get('leave_message_template');

      if (leaveChannelId && leaveMessageTemplate) {
        const channel = await guild.channels.fetch(leaveChannelId).catch(() => null);
        if (channel) {
          const username = member.user?.username || member.displayName || 'Un membre';
          const avatar = member.user?.displayAvatarURL ? member.user.displayAvatarURL({ dynamic: true }) : null;

          // Replace placeholders
          const formattedMessage = leaveMessageTemplate
            .replace(/{user}/g, username)
            .replace(/{username}/g, username)
            .replace(/{server}/g, guild.name)
            .replace(/{memberCount}/g, guild.memberCount.toString())
            .replace(/{inviter}/g, inviterMention)
            .replace(/{inviterUsername}/g, inviterUsername)
            .replace(/{inviterTag}/g, inviterTag)
            .replace(/{invites}/g, invitesCount)
            .replace(/{inviteCount}/g, invitesCount);

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

    // 3. Discord Logs : Membre Parti / Expulsé
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

      const inviteLeaveField = leaveInviteData?.inviterId ? [
        { name: '🔗 Invité à l\'origine par', value: `${inviterMention} (A désormais **${invitesCount}** invites)`, inline: true }
      ] : [];

      if (isKick) {
        await loggerService.log(client, 'log_discord_kicks', {
          title: '👢 Membre Expulsé (Kick)',
          description: `**${member.user?.tag || member.id}** a été expulsé du serveur.`,
          color: '#E74C3C',
          thumbnail: member.user?.displayAvatarURL ? member.user.displayAvatarURL({ dynamic: true }) : null,
          fields: [
            { name: '👤 Utilisateur', value: `${member.user?.tag || 'Inconnu'} (\`${member.id}\`)`, inline: true },
            { name: '🛡️ Expulsé par', value: kicker ? `${kicker.tag} (\`${kicker.id}\`)` : 'Inconnu', inline: true },
            ...inviteLeaveField,
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
            ...inviteLeaveField,
          ],
          footer: { text: `Membre ID: ${member.id}` }
        });
      }
    } catch (error) {
      console.error('[LoggerService] Erreur log member leave/kick:', error);
    }
  },
};
