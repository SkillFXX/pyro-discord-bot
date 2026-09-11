const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildScheduledEventCreate',
  async execute(event, client) {
    try {
      const startTime = event.scheduledStartTimestamp ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>` : 'Indéterminée';
      const location = event.channel ? `${event.channel} (\`#${event.channel.name}\`)` : (event.entityMetadata?.location || 'Lieu Externe');

      await loggerService.log(client, 'log_discord_scheduled_events', {
        title: '📅 Nouvel Événement Planifié',
        description: `L'événement **${event.name}** a été planifié sur le serveur.`,
        color: '#2ECC71',
        thumbnail: event.coverImageURL(),
        fields: [
          { name: '📌 Titre', value: `\`${event.name}\``, inline: true },
          { name: '⏰ Début prévu', value: startTime, inline: true },
          { name: '📍 Lieu / Salon', value: location, inline: true },
          { name: '📝 Description', value: event.description ? event.description.substring(0, 500) : 'Aucune description', inline: false },
        ],
        footer: { text: `Événement ID: ${event.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur guildScheduledEventCreate:', error);
    }
  },
};
