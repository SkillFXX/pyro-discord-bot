const { ChannelType } = require('discord.js');
const loggerService = require('../../services/loggerService');

function formatChannelType(type) {
  switch (type) {
    case ChannelType.GuildText: return '💬 Textuel';
    case ChannelType.GuildVoice: return '🔊 Vocal';
    case ChannelType.GuildCategory: return '📁 Catégorie';
    case ChannelType.GuildAnnouncement: return '📢 Annonce';
    case ChannelType.GuildForum: return '📑 Forum';
    case ChannelType.GuildStageVoice: return '🎙️ Stage / Conférence';
    default: return 'Salon';
  }
}

module.exports = {
  name: 'channelDelete',
  async execute(channel, client) {
    if (!channel.guild) return;

    try {
      const isCategory = channel.type === ChannelType.GuildCategory;

      await loggerService.log(client, 'log_discord_channels', {
        title: isCategory ? '📁 Catégorie Supprimée' : '🗑️ Salon Supprimé',
        description: isCategory 
          ? `La catégorie **${channel.name}** a été supprimée.` 
          : `Le salon **#${channel.name}** a été supprimé.`,
        color: '#E74C3C',
        fields: [
          { name: 'Nom Supprimé', value: `\`${channel.name}\``, inline: true },
          { name: 'Type', value: formatChannelType(channel.type), inline: true },
          { name: 'Catégorie', value: channel.parent ? channel.parent.name : 'Aucune', inline: true },
          { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
        ],
        footer: { text: `Salon ID: ${channel.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur channelDelete:', error);
    }
  },
};
