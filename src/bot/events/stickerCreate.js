const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'stickerCreate',
  async execute(sticker, client) {
    if (!sticker.guild) return;

    try {
      await loggerService.log(client, 'log_discord_emojis', {
        title: '🎨 Nouvel Autocollant Ajouté',
        description: `L'autocollant **${sticker.name}** a été ajouté.`,
        color: '#2ECC71',
        thumbnail: sticker.url,
        fields: [
          { name: 'Nom', value: `\`${sticker.name}\``, inline: true },
          { name: 'Description', value: sticker.description || 'Aucune', inline: true },
          { name: '🆔 ID', value: `\`${sticker.id}\``, inline: true },
        ],
        footer: { text: `Sticker ID: ${sticker.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur stickerCreate:', error);
    }
  },
};
