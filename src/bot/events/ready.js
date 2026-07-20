const { ActivityType } = require('discord.js');
const { ConfigHelper } = require('../../database');

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
