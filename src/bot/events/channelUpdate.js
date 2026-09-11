const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    try {
      const changes = [];

      if (oldChannel.name !== newChannel.name) {
        changes.push({ name: 'Nom', value: `\`#${oldChannel.name}\` ➔ \`#${newChannel.name}\``, inline: true });
      }

      if (oldChannel.topic !== newChannel.topic) {
        changes.push({ 
          name: 'Sujet / Description', 
          value: `\`${(oldChannel.topic || 'Aucun').substring(0, 100)}\` ➔ \`${(newChannel.topic || 'Aucun').substring(0, 100)}\``, 
          inline: false 
        });
      }

      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push({ 
          name: 'Mode Lent (Slowmode)', 
          value: `\`${oldChannel.rateLimitPerUser || 0}s\` ➔ \`${newChannel.rateLimitPerUser || 0}s\``, 
          inline: true 
        });
      }

      if (oldChannel.parentId !== newChannel.parentId) {
        const oldParent = oldChannel.parent ? oldChannel.parent.name : 'Aucune';
        const newParent = newChannel.parent ? newChannel.parent.name : 'Aucune';
        changes.push({ name: 'Catégorie', value: `\`${oldParent}\` ➔ \`${newParent}\``, inline: true });
      }

      if (oldChannel.nsfw !== newChannel.nsfw) {
        changes.push({ name: 'Filtre NSFW (+18)', value: `${newChannel.nsfw ? 'Activé' : 'Désactivé'}`, inline: true });
      }

      if (changes.length === 0) return;

      await loggerService.log(client, 'log_discord_channels', {
        title: '✏️ Salon Mis à Jour',
        description: `Le salon ${newChannel} a été modifié.`,
        color: '#3498DB',
        fields: [
          { name: '📍 Salon', value: `${newChannel} (\`${newChannel.id}\`)`, inline: false },
          ...changes,
        ],
        footer: { text: `Salon ID: ${newChannel.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur channelUpdate:', error);
    }
  },
};
