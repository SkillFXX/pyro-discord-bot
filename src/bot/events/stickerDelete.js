const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'stickerDelete',
  async execute(sticker, client) {
    if (!sticker.guild) return;

    try {
      await loggerService.log(client, 'log_discord_emojis', {
        title: '🗑️ Autocollant Supprimé',
        description: `L'autocollant **${sticker.name}** a été supprimé.`,
        color: '#E74C3C',
        fields: [
          { name: 'Nom Supprimé', value: `\`${sticker.name}\``, inline: true },
          { name: '🆔 ID', value: `\`${sticker.id}\``, inline: true },
        ],
        footer: { text: `Sticker ID: ${sticker.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur stickerDelete:', error);
    }
  },
};
