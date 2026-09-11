const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole, client) {
    if (!newRole.guild) return;

    try {
      const changes = [];

      if (oldRole.name !== newRole.name) {
        changes.push({ name: 'Nom', value: `\`${oldRole.name}\` ➔ \`${newRole.name}\``, inline: true });
      }

      if (oldRole.hexColor !== newRole.hexColor) {
        changes.push({ name: 'Couleur', value: `\`${oldRole.hexColor}\` ➔ \`${newRole.hexColor}\``, inline: true });
      }

      if (oldRole.hoist !== newRole.hoist) {
        changes.push({ name: 'Affichage séparé', value: `${newRole.hoist ? 'Activé' : 'Désactivé'}`, inline: true });
      }

      if (oldRole.mentionable !== newRole.mentionable) {
        changes.push({ name: 'Mentionnable', value: `${newRole.mentionable ? 'Activé' : 'Désactivé'}`, inline: true });
      }

      if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push({ name: 'Permissions', value: 'Les permissions du rôle ont été modifiées.', inline: false });
      }

      if (changes.length === 0) return;

      await loggerService.log(client, 'log_discord_server_roles', {
        title: '✏️ Rôle Modifié',
        description: `Le rôle ${newRole} a été mis à jour.`,
        color: newRole.hexColor !== '#000000' ? newRole.hexColor : '#F1C40F',
        fields: [
          { name: '🏷️ Rôle', value: `${newRole} (\`${newRole.id}\`)`, inline: false },
          ...changes,
        ],
        footer: { text: `Rôle ID: ${newRole.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur roleUpdate:', error);
    }
  },
};
