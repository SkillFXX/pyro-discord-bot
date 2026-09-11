const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'emojiCreate',
  async execute(emoji, client) {
    if (!emoji.guild) return;

    try {
      await loggerService.log(client, 'log_discord_emojis', {
        title: '😀 Nouvel Émoji Ajouté',
        description: `L'émoji ${emoji} (\`:${emoji.name}:\`) a été ajouté au serveur.`,
        color: '#2ECC71',
        thumbnail: emoji.imageURL(),
        fields: [
          { name: 'Nom', value: `\`:${emoji.name}:\``, inline: true },
          { name: 'Animé', value: emoji.animated ? 'Oui' : 'Non', inline: true },
          { name: '🆔 ID', value: `\`${emoji.id}\``, inline: true },
        ],
        footer: { text: `Émoji ID: ${emoji.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur emojiCreate:', error);
    }
  },
};
