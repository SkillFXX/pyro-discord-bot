const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildBanRemove',
  async execute(ban, client) {
    try {
      const user = ban.user;

      await loggerService.log(client, 'log_discord_bans', {
        title: '🤝 Membre Débanni de Discord',
        description: `Le bannissement de **${user.tag}** a été levé.`,
        color: '#2ECC71',
        thumbnail: user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '👤 Utilisateur', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        ],
        footer: { text: `ID: ${user.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur guildBanRemove:', error);
    }
  },
};

