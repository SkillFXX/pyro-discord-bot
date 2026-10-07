const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

// Collections for commands
client.commands = new Collection();

// Forward raw Discord gateway packets to Lavalink for voice server & state updates
client.on('raw', (d) => {
  if (client.lavalink) {
    client.lavalink.sendRawData(d);
  }
});

module.exports = client;
