const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'emojiUpdate',
  async execute(oldEmoji, newEmoji, client) {
    if (!newEmoji.guild) return;

    try {
      if (oldEmoji.name !== newEmoji.name) {
        await loggerService.log(client, 'log_discord_emojis', {
          title: '✏️ Émoji Renommé',
          description: `L'émoji ${newEmoji} a été renommé.`,
          color: '#F1C40F',
          thumbnail: newEmoji.imageURL(),
          fields: [
            { name: 'Ancien Nom', value: `\`:${oldEmoji.name}:\``, inline: true },
            { name: 'Nouveau Nom', value: `\`:${newEmoji.name}:\``, inline: true },
            { name: '🆔 ID', value: `\`${newEmoji.id}\``, inline: true },
          ],
          footer: { text: `Émoji ID: ${newEmoji.id}` },
        });
      }
    } catch (error) {
      console.error('[LoggerService] Erreur emojiUpdate:', error);
    }
  },
};
