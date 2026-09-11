const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'webhookUpdate',
  async execute(channel, client) {
    if (!channel.guild) return;

    try {
      await loggerService.log(client, 'log_discord_webhooks', {
        title: '🪝 Webhooks Mis à Jour',
        description: `Un webhook a été créé, modifié ou supprimé dans le salon ${channel}.`,
        color: '#3498DB',
        fields: [
          { name: '📍 Salon', value: `${channel} (\`#${channel.name}\`)`, inline: true },
          { name: '🆔 ID du Salon', value: `\`${channel.id}\``, inline: true },
        ],
        footer: { text: 'Pyro Surveillance Webhooks' },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur webhookUpdate:', error);
    }
  },
};
