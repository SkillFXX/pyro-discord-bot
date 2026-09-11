const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'threadDelete',
  async execute(thread, client) {
    try {
      const parent = thread.parent ? `#${thread.parent.name}` : 'Inconnu';

      await loggerService.log(client, 'log_discord_threads', {
        title: '🗑️ Thread / Post Supprimé',
        description: `Le fil **#${thread.name}** a été supprimé.`,
        color: '#E74C3C',
        fields: [
          { name: 'Nom du Thread', value: `\`${thread.name}\``, inline: true },
          { name: 'Salon Parent', value: parent, inline: true },
        ],
        footer: { text: `Thread ID: ${thread.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur threadDelete:', error);
    }
  },
};

