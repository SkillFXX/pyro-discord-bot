const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild, client) {
    try {
      const changes = [];

      if (oldGuild.name !== newGuild.name) {
        changes.push({ name: 'Nom du Serveur', value: `\`${oldGuild.name}\` ➔ \`${newGuild.name}\``, inline: false });
      }

      if (oldGuild.icon !== newGuild.icon) {
        changes.push({ name: 'Icône du Serveur', value: 'L\'icône du serveur a été modifiée.', inline: true });
      }

      if (oldGuild.banner !== newGuild.banner) {
        changes.push({ name: 'Bannière', value: 'La bannière du serveur a été modifiée.', inline: true });
      }

      if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
        const oldAfk = oldGuild.afkChannel ? `#${oldGuild.afkChannel.name}` : 'Aucun';
        const newAfk = newGuild.afkChannel ? `#${newGuild.afkChannel.name}` : 'Aucun';
        changes.push({ name: 'Salon AFK', value: `\`${oldAfk}\` ➔ \`${newAfk}\``, inline: true });
      }

      if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) {
        const oldRules = oldGuild.rulesChannel ? `#${oldGuild.rulesChannel.name}` : 'Aucun';
        const newRules = newGuild.rulesChannel ? `#${newGuild.rulesChannel.name}` : 'Aucun';
        changes.push({ name: 'Salon du Règlement', value: `\`${oldRules}\` ➔ \`${newRules}\``, inline: true });
      }

      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.push({ 
          name: 'Niveau de Vérification', 
          value: `Niveau ${oldGuild.verificationLevel} ➔ Niveau ${newGuild.verificationLevel}`, 
          inline: true 
        });
      }

      if (changes.length === 0) return;

      await loggerService.log(client, 'log_discord_guild_update', {
        title: '⚙️ Paramètres du Serveur Modifiés',
        description: `Les paramètres généraux de **${newGuild.name}** ont été mis à jour.`,
        color: '#3498DB',
        thumbnail: newGuild.iconURL({ dynamic: true }),
        fields: changes,
        footer: { text: `Serveur ID: ${newGuild.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur guildUpdate:', error);
    }
  },
};
