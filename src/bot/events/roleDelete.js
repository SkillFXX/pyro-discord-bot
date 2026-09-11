const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'roleDelete',
  async execute(role, client) {
    if (!role.guild) return;

    try {
      await loggerService.log(client, 'log_discord_server_roles', {
        title: '🗑️ Rôle Supprimé',
        description: `Le rôle **@${role.name}** a été supprimé du serveur.`,
        color: '#E74C3C',
        fields: [
          { name: '🏷️ Nom du Rôle Supprimé', value: `\`@${role.name}\``, inline: true },
          { name: '🆔 ID du Rôle', value: `\`${role.id}\``, inline: true },
        ],
        footer: { text: `Rôle ID: ${role.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur roleDelete:', error);
    }
  },
};
