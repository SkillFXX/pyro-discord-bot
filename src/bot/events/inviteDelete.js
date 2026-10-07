const loggerService = require('../../services/loggerService');
const inviteService = require('../../services/inviteService');

module.exports = {
  name: 'inviteDelete',
  async execute(invite, client) {
    try {
      inviteService.onInviteDelete(invite);

      const channel = invite.channel ? `${invite.channel} (\`#${invite.channel.name}\`)` : 'Inconnu';

      await loggerService.log(client, 'log_discord_invites', {
        title: '❌ Lien d\'Invitation Supprimé',
        description: `Une invitation a expiré ou a été supprimée du serveur.`,
        color: '#E74C3C',
        fields: [
          { name: '🎟️ Code Supprimé', value: `\`${invite.code}\``, inline: true },
          { name: '📍 Salon Associé', value: channel, inline: true },
        ],
        footer: { text: `Code: ${invite.code}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur inviteDelete:', error);
    }
  },
};
