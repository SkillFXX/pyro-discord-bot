const { ActivityType } = require('discord.js');
const { ConfigHelper } = require('../../database');
const analyticsService = require('../../services/analyticsService');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[Bot ready] Connecté en tant que ${client.user.tag}!`);

    // Register Guild commands (instantly updates commands in the target guild)
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      console.error('[Bot ready] GUILD_ID non configuré dans le fichier .env !');
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`[Bot ready] Impossible de trouver le serveur avec l'ID ${guildId} dans le cache du bot.`);
      return;
    }

    try {
      const commandsData = client.commands.map(cmd => cmd.data.toJSON());
      await guild.commands.set(commandsData);
      console.log(`[Bot ready] ${commandsData.length} commandes slash enregistrées avec succès pour le serveur : ${guild.name} (${guildId})`);
    } catch (error) {
      console.error('[Bot ready] Erreur lors de l\'enregistrement des commandes slash :', error);
    }

    // Set Bot Status from config
    await updateBotStatus(client);

    // Initialize Voice Analytics for members already in voice
    await analyticsService.initVoiceSessions(client);

    // Send Boot / Startup Log
    try {
      const loggerService = require('../../services/loggerService');
      await loggerService.log(client, 'log_bot_boot', {
        title: '🚀 Pyro Bot est en ligne !',
        description: `Le bot a démarré et s'est synchronisé avec succès sur **${guild.name}**.`,
        color: '#2ECC71',
        thumbnail: client.user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '🤖 Bot', value: `${client.user.tag} (\`${client.user.id}\`)`, inline: true },
          { name: '⚡ Latence WebSocket', value: `\`${client.ws.ping}ms\``, inline: true },
          { name: '👥 Membres', value: `\`${guild.memberCount}\``, inline: true },
          { name: '📁 Salons', value: `\`${guild.channels.cache.size}\``, inline: true },
          { name: '💻 Commandes Slash', value: `\`${client.commands.size}\``, inline: true },
          { name: '⚙️ Node.js', value: `\`${process.version}\``, inline: true },
        ],
        footer: { text: `Pyro Démarrage • PID ${process.pid}` },
      });
    } catch (logErr) {
      console.error('[Bot ready] Erreur lors de l\'envoi du log de démarrage :', logErr);
    }
  },
};

async function updateBotStatus(client) {
  try {
    const statusType = await ConfigHelper.get('bot_status_type', 'PLAYING'); // PLAYING, WATCHING, LISTENING, STREAMING
    const statusText = await ConfigHelper.get('bot_status_text', 'la modération de Pyro');
    
    let activityType;
    switch (statusType.toUpperCase()) {
      case 'WATCHING':
        activityType = ActivityType.Watching;
        break;
      case 'LISTENING':
        activityType = ActivityType.Listening;
        break;
      case 'STREAMING':
        activityType = ActivityType.Streaming;
        break;
      case 'PLAYING':
      default:
        activityType = ActivityType.Playing;
        break;
    }

    client.user.setPresence({
      activities: [{
        name: statusText,
        type: activityType,
        url: statusType === 'STREAMING' ? 'https://twitch.tv/discord' : undefined,
      }],
      status: 'online',
    });
    console.log(`[Bot Status] Statut mis à jour : ${statusType} "${statusText}"`);
  } catch (error) {
    console.error('[Bot Status] Erreur lors de la mise à jour du statut :', error);
  }
}

// Export for use in web dashboard when settings change
module.exports.updateBotStatus = updateBotStatus;
