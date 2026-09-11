const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    // Ignore bots
    if (newMember.user.bot) return;

    // 1. Changement de pseudo / surnom
    if (oldMember.nickname !== newMember.nickname) {
      const oldNick = oldMember.nickname || oldMember.user.username;
      const newNick = newMember.nickname || newMember.user.username;

      await loggerService.log(client, 'log_discord_nickname_update', {
        title: '✏️ Pseudo Modifié',
        description: `${newMember} a mis à jour son surnom sur le serveur.`,
        color: '#3498DB',
        thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '👤 Utilisateur', value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: false },
          { name: 'Ancien Surnom', value: `\`${oldNick}\``, inline: true },
          { name: 'Nouveau Surnom', value: `\`${newNick}\``, inline: true },
        ],
        footer: { text: `Membre ID: ${newMember.id}` },
      });
    }

    // 2. Changement de rôles
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    if (oldRoles.size !== newRoles.size) {
      const addedRoles = newRoles.filter(r => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
      const removedRoles = oldRoles.filter(r => !newRoles.has(r.id) && r.id !== newMember.guild.id);

      if (addedRoles.size > 0 || removedRoles.size > 0) {
        const fields = [
          { name: '👤 Utilisateur', value: `${newMember} (\`${newMember.id}\`)`, inline: false },
        ];

        if (addedRoles.size > 0) {
          fields.push({
            name: '➕ Rôle(s) Ajouté(s)',
            value: addedRoles.map(r => `${r} (\`${r.name}\`)`).join(', '),
            inline: false,
          });
        }

        if (removedRoles.size > 0) {
          fields.push({
            name: '➖ Rôle(s) Retiré(s)',
            value: removedRoles.map(r => `${r} (\`${r.name}\`)`).join(', '),
            inline: false,
          });
        }

        await loggerService.log(client, 'log_discord_role_update', {
          title: '🎭 Rôles Mis à Jour',
          description: `Les rôles de ${newMember} ont été modifiés.`,
          color: addedRoles.size > 0 ? '#2ECC71' : '#E74C3C',
          thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
          fields,
          footer: { text: `Membre ID: ${newMember.id}` },
        });
      }
    }

    // 3. Timeouts / Mutes Discord
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (oldTimeout !== newTimeout) {
      if (newTimeout && newTimeout > Date.now()) {
        // Timeout appliqué
        const untilSeconds = Math.floor(newTimeout / 1000);
        await loggerService.log(client, 'log_discord_timeouts', {
          title: '🔇 Membre Exclu Temporairement (Timeout Discord)',
          description: `${newMember} a été mis en sourdine/timeout sur Discord.`,
          color: '#F1C40F',
          thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '👤 Utilisateur', value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
            { name: '⏳ Expire le', value: `<t:${untilSeconds}:F> (<t:${untilSeconds}:R>)`, inline: true },
          ],
          footer: { text: `Membre ID: ${newMember.id}` },
        });
      } else if (oldTimeout && (!newTimeout || newTimeout <= Date.now())) {
        // Timeout révoqué
        await loggerService.log(client, 'log_discord_timeouts', {
          title: '🔊 Fin du Timeout Discord',
          description: `Le timeout de ${newMember} a été retiré ou a expiré.`,
          color: '#2ECC71',
          thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '👤 Utilisateur', value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
          ],
          footer: { text: `Membre ID: ${newMember.id}` },
        });
      }
    }
  },
};

