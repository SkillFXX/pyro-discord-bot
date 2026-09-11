const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildScheduledEventUpdate',
  async execute(oldEvent, newEvent, client) {
    try {
      const changes = [];

      if (oldEvent.name !== newEvent.name) {
        changes.push({ name: 'Nom', value: `\`${oldEvent.name}\` ➔ \`${newEvent.name}\``, inline: true });
      }

      if (oldEvent.status !== newEvent.status) {
        changes.push({ name: 'Statut', value: `Statut modifié.`, inline: true });
      }

      if (oldEvent.scheduledStartTimestamp !== newEvent.scheduledStartTimestamp) {
        const newTime = `<t:${Math.floor(newEvent.scheduledStartTimestamp / 1000)}:F>`;
        changes.push({ name: 'Nouvel Horaire', value: newTime, inline: true });
      }

      if (changes.length === 0) return;

      await loggerService.log(client, 'log_discord_scheduled_events', {
        title: '✏️ Événement Planifié Mis à Jour',
        description: `L'événement **${newEvent.name}** a été modifié.`,
        color: '#3498DB',
        thumbnail: newEvent.coverImageURL(),
        fields: changes,
        footer: { text: `Événement ID: ${newEvent.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur guildScheduledEventUpdate:', error);
    }
  },
};
