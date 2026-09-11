const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban, client) {
    try {
      const user = ban.user;
      const reason = ban.reason || 'Aucun motif renseigné';

      await loggerService.log(client, 'log_discord_bans', {
        title: '🔨 Membre Banni de Discord',
        description: `**${user.tag}** a été banni du serveur.`,
        color: '#E74C3C',
        thumbnail: user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '👤 Utilisateur', value: `${user.tag} (\`${user.id}\`)`, inline: true },
          { name: '📝 Motif', value: reason, inline: false },
        ],
        footer: { text: `ID: ${user.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur guildBanAdd:', error);
    }
  },
};

