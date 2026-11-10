const loggerService = require('../../services/loggerService');
const { collectAttachmentFiles } = require('../utils/logMedia');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild || newMessage.author?.bot) return;

    // Media removed from the message while editing it
    const removedAttachments = oldMessage.attachments
      ? [...oldMessage.attachments.values()].filter(a => !newMessage.attachments?.has(a.id))
      : [];

    // Ignore if neither the content nor the media changed (e.g., embed expansion)
    if (oldMessage.content === newMessage.content && removedAttachments.length === 0) return;

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

      let files = [];
      let imageName = null;
      if (removedAttachments.length > 0) {
        const media = await collectAttachmentFiles(removedAttachments, newMessage.guild);
        files = media.files;
        imageName = media.imageName;
        fields.push({ name: '🖼️ Média(s) Retiré(s)', value: media.summary, inline: false });
        if (media.links.length > 0) {
          fields.push({ name: '🔗 Média(s) non copiable(s)', value: media.links.join('\n'), inline: false });
        }
      }

      await loggerService.log(client, 'log_discord_message_events', {
        title: '✏️ Message Modifié',
        description: `Un message a été édité dans ${channel}.`,
        color: '#F1C40F',
        thumbnail: newMessage.author?.displayAvatarURL ? newMessage.author.displayAvatarURL({ dynamic: true }) : null,
        fields,
        image: imageName ? `attachment://${imageName}` : null,
        files,
        footer: { text: `Message ID: ${newMessage.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur messageUpdate:', error);
    }
  },
};

