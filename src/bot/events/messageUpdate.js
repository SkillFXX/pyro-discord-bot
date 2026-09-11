const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild || newMessage.author?.bot) return;

    // Ignore if content did not change (e.g., embed expansion)
    if (oldMessage.content === newMessage.content) return;

    try {
      const channel = newMessage.channel ? `${newMessage.channel}` : 'Salon Inconnu';
      const author = newMessage.author ? `${newMessage.author} (\`${newMessage.author.tag}\`)` : 'Auteur Inconnu';
      const oldContent = oldMessage.content ? oldMessage.content.substring(0, 1020) : '*(Ancien contenu non mis en cache)*';
      const newContent = newMessage.content ? newMessage.content.substring(0, 1020) : '*(Vide)*';

      const fields = [
        { name: '👤 Auteur', value: author, inline: true },
        { name: '📍 Salon', value: channel, inline: true },
        { name: '🔗 Lien Direct', value: `[Aller au message](${newMessage.url})`, inline: true },
        { name: '⏮️ Avant Modification', value: oldContent || '*(Vide)*', inline: false },
        { name: '⏭️ Après Modification', value: newContent || '*(Vide)*', inline: false },
      ];

      await loggerService.log(client, 'log_discord_message_events', {
        title: '✏️ Message Modifié',
        description: `Un message a été édité dans ${channel}.`,
        color: '#F1C40F',
        thumbnail: newMessage.author?.displayAvatarURL ? newMessage.author.displayAvatarURL({ dynamic: true }) : null,
        fields,
        footer: { text: `Message ID: ${newMessage.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur messageUpdate:', error);
    }
  },
};

