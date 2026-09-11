const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'roleCreate',
  async execute(role, client) {
    if (!role.guild) return;

    try {
      await loggerService.log(client, 'log_discord_server_roles', {
        title: '🛡️ Nouveau Rôle Créé',
        description: `Le rôle **${role.name}** a été créé sur le serveur.`,
        color: role.hexColor !== '#000000' ? role.hexColor : '#2ECC71',
        fields: [
          { name: '🏷️ Nom du Rôle', value: `${role} (\`${role.name}\`)`, inline: true },
          { name: '🎨 Couleur', value: `\`${role.hexColor}\``, inline: true },
          { name: '📌 Affiché séparément', value: role.hoist ? 'Oui' : 'Non', inline: true },
          { name: '🔔 Mentionnable', value: role.mentionable ? 'Oui' : 'Non', inline: true },
          { name: '🆔 ID du Rôle', value: `\`${role.id}\``, inline: true },
        ],
        footer: { text: `Rôle ID: ${role.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur roleCreate:', error);
    }
  },
};
