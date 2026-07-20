const { ConfigHelper } = require('../../database');
const embeds = require('../utils/embeds');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const guild = member.guild;

    // Goodbye Message
    try {
      const leaveChannelId = await ConfigHelper.get('leave_channel_id');
      const leaveMessageTemplate = await ConfigHelper.get('leave_message_template');

      if (leaveChannelId && leaveMessageTemplate) {
        const channel = await guild.channels.fetch(leaveChannelId).catch(() => null);
        if (channel) {
          // Replace placeholders (cannot use {user} as mention since they left, but we can do username)
          const formattedMessage = leaveMessageTemplate
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, guild.name)
            .replace(/{memberCount}/g, guild.memberCount.toString());

          const embed = embeds.custom(
            `📤 Départ du Serveur`,
            formattedMessage,
            embeds.COLORS.ERROR,
            null,
            member.user.displayAvatarURL({ dynamic: true })
          );

          await channel.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error('[Leave Event] Erreur lors de l\'envoi du message de départ :', error);
    }
  },
};
