const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'emojiDelete',
  async execute(emoji, client) {
    if (!emoji.guild) return;

    try {
      await loggerService.log(client, 'log_discord_emojis', {
        title: '🗑️ Émoji Supprimé',
        description: `L'émoji **:${emoji.name}:** a été supprimé du serveur.`,
        color: '#E74C3C',
        fields: [
          { name: 'Nom Supprimé', value: `\`:${emoji.name}:\``, inline: true },
          { name: '🆔 ID', value: `\`${emoji.id}\``, inline: true },
        ],
        footer: { text: `Émoji ID: ${emoji.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur emojiDelete:', error);
    }
  },
};
