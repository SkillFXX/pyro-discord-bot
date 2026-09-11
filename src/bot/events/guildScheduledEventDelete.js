const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildScheduledEventDelete',
  async execute(event, client) {
    try {
      await loggerService.log(client, 'log_discord_scheduled_events', {
        title: '🗑️ Événement Planifié Supprimé',
        description: `L'événement planifié **${event.name}** a été annulé ou supprimé.`,
        color: '#E74C3C',
        fields: [
          { name: '📌 Titre', value: `\`${event.name}\``, inline: true },
          { name: '🆔 ID', value: `\`${event.id}\``, inline: true },
        ],
        footer: { text: `Événement ID: ${event.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur guildScheduledEventDelete:', error);
    }
  },
};
