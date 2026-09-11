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
  name: 'channelCreate',
  async execute(channel, client) {
    if (!channel.guild) return;

    try {
      const parentName = channel.parent ? channel.parent.name : 'Aucune catégorie';
      const isCategory = channel.type === ChannelType.GuildCategory;

      await loggerService.log(client, 'log_discord_channels', {
        title: isCategory ? '📁 Nouvelle Catégorie Créée' : '📢 Nouveau Salon Créé',
        description: isCategory 
          ? `La catégorie **${channel.name}** a été créée.` 
          : `Le salon ${channel} (**#${channel.name}**) a été créé.`,
        color: '#2ECC71',
        fields: [
          { name: 'Nom', value: `\`${channel.name}\``, inline: true },
          { name: 'Type', value: formatChannelType(channel.type), inline: true },
          { name: 'Catégorie Parente', value: parentName, inline: true },
          { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
        ],
        footer: { text: `Salon ID: ${channel.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur channelCreate:', error);
    }
  },
};
