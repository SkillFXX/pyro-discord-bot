const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    // Ignore direct messages or system messages
    if (!message.guild || message.author?.bot) return;

    try {
      const channel = message.channel ? `${message.channel}` : 'Salon Inconnu';
      const author = message.author ? `${message.author} (\`${message.author.tag}\`)` : 'Auteur Non Mis en Cache';
      const content = message.content ? message.content.substring(0, 1020) : '*(Contenu indisponible ou pièce jointe)*';

      const fields = [
        { name: '👤 Auteur', value: author, inline: true },
        { name: '📍 Salon', value: channel, inline: true },
        { name: '📝 Contenu Supprimé', value: content || '*(Vide)*', inline: false },
      ];

      if (message.attachments && message.attachments.size > 0) {
        const attachmentNames = message.attachments.map(a => a.name).join(', ');
        fields.push({
          name: '📎 Pièce(s) Jointe(s)',
          value: attachmentNames.substring(0, 1024),
          inline: false,
        });
      }

      await loggerService.log(client, 'log_discord_message_events', {
        title: '🗑️ Message Supprimé',
        description: `Un message a été supprimé dans ${channel}.`,
        color: '#E74C3C',
        thumbnail: message.author?.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : null,
        fields,
        footer: { text: `Message ID: ${message.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur messageDelete:', error);
    }
  },
};

