const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'inviteCreate',
  async execute(invite, client) {
    try {
      const inviter = invite.inviter ? `${invite.inviter} (\`${invite.inviter.tag}\`)` : 'Inconnu';
      const channel = invite.channel ? `${invite.channel} (\`#${invite.channel.name}\`)` : 'Inconnu';
      const expires = invite.expiresAt ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : 'Jamais';
      const maxUses = invite.maxUses === 0 ? 'Illimité' : `${invite.maxUses}`;

      await loggerService.log(client, 'log_discord_invites', {
        title: '🔗 Nouvelle Invitation Créée',
        description: `Un lien d'invitation a été généré pour le serveur.`,
        color: '#2ECC71',
        fields: [
          { name: '🎟️ Code', value: `\`${invite.code}\` ([Lien Direct](${invite.url}))`, inline: true },
          { name: '👤 Créateur', value: inviter, inline: true },
          { name: '📍 Salon', value: channel, inline: true },
          { name: '⏳ Expiration', value: expires, inline: true },
          { name: '👥 Utilisations Max', value: maxUses, inline: true },
          { name: '🚪 Accès Temporaire', value: invite.temporary ? 'Oui' : 'Non', inline: true },
        ],
        footer: { text: `Code: ${invite.code}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur inviteCreate:', error);
    }
  },
};
