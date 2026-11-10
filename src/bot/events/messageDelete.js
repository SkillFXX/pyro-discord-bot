const loggerService = require('../../services/loggerService');
const { collectAttachmentFiles } = require('../utils/logMedia');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    // Ignore direct messages or system messages
    if (!message.guild || message.author?.bot) return;

    try {
      const channel = message.channel ? `${message.channel}` : 'Salon Inconnu';
      const author = message.author ? `${message.author} (\`${message.author.tag}\`)` : 'Auteur Non Mis en Cache';
      const hasAttachments = message.attachments && message.attachments.size > 0;
      const content = message.content
        ? message.content.substring(0, 1020)
        : (message.partial ? '*(Message non mis en cache : envoyé avant le dernier démarrage du bot)*' : '*(Aucun texte)*');

      const fields = [
        { name: '👤 Auteur', value: author, inline: true },
        { name: '📍 Salon', value: channel, inline: true },
        { name: '📝 Contenu Supprimé', value: content || '*(Vide)*', inline: false },
      ];

      let files = [];
      let imageName = null;
      if (hasAttachments) {
        const media = await collectAttachmentFiles(message.attachments.values(), message.guild);
        files = media.files;
        imageName = media.imageName;
        fields.push({ name: '📎 Média(s) Supprimé(s)', value: media.summary, inline: false });
        if (media.links.length > 0) {
          fields.push({ name: '🔗 Média(s) non copiable(s)', value: media.links.join('\n'), inline: false });
        }
      }

      await loggerService.log(client, 'log_discord_message_events', {
        title: '🗑️ Message Supprimé',
        description: `Un message a été supprimé dans ${channel}.`,
        color: '#E74C3C',
        thumbnail: message.author?.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : null,
        fields,
        image: imageName ? `attachment://${imageName}` : null,
        files,
        footer: { text: `Message ID: ${message.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur messageDelete:', error);
    }
  },
};

