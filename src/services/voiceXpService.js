const { ChannelType } = require('discord.js');
const { ConfigHelper } = require('../database');
const { awardUserXP, getMemberRoleMultiplier } = require('../bot/utils/xpHelper');

/**
 * Voice XP Service
 * Periodically awards XP to active members in voice channels based on server configuration.
 */

// Tracks the last timestamp XP was awarded to a member: userId -> timestamp
const lastVoiceXpGiven = new Map();

let serviceInterval = null;

/**
 * Evaluates all voice channels and awards XP to eligible members.
 * @param {import('discord.js').Client} client 
 */
async function processVoiceXP(client) {
  try {
    const isVoiceXpEnabled = await ConfigHelper.get('xp_voice_enabled', false);
    if (!isVoiceXpEnabled) {
      lastVoiceXpGiven.clear();
      return;
    }

    const guildId = process.env.GUILD_ID;
    if (!guildId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    // Load configuration values
    const xpGain = await ConfigHelper.get('xp_voice_gain', 10);
    const intervalSeconds = Math.max(10, await ConfigHelper.get('xp_voice_interval_seconds', 60));
    const minMembers = Math.max(1, await ConfigHelper.get('xp_voice_min_members', 2));
    const ignoreMuted = await ConfigHelper.get('xp_voice_ignore_muted', true);
    const ignoreDeafened = await ConfigHelper.get('xp_voice_ignore_deafened', true);

    const now = Date.now();
    const intervalMs = intervalSeconds * 1000;
    const currentlyActiveUserIds = new Set();

    // Iterate through all voice channels in the guild
    const voiceChannels = guild.channels.cache.filter(
      c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.id !== guild.afkChannelId
    );

    for (const [, channel] of voiceChannels) {
      // Filter non-bot members
      const nonBotMembers = channel.members.filter(m => !m.user.bot);

      // Check min members requirement for the channel
      if (nonBotMembers.size < minMembers) {
        continue;
      }

      for (const [, member] of nonBotMembers) {
        // Anti-AFK checks
        const isMuted = Boolean(member.voice.selfMute || member.voice.serverMute);
        const isDeafened = Boolean(member.voice.selfDeaf || member.voice.serverDeaf);

        if (ignoreMuted && isMuted) continue;
        if (ignoreDeafened && isDeafened) continue;

        currentlyActiveUserIds.add(member.id);

        const lastAward = lastVoiceXpGiven.get(member.id);
        if (!lastAward) {
          // First tick seen active, initialize timestamp
          lastVoiceXpGiven.set(member.id, now);
          continue;
        }

        // Check if member has been in voice for at least the configured interval
        if (now - lastAward >= intervalMs) {
          lastVoiceXpGiven.set(member.id, now);

          // Calculate role multiplier
          const roleMultiplier = await getMemberRoleMultiplier(member);
          const finalGain = Math.max(1, Math.floor(xpGain * roleMultiplier));

          // Award XP and handle level up, rewards & logs
          await awardUserXP({
            client,
            member,
            xpAmount: finalGain,
            source: 'voice',
          }).catch(err => console.error(`[Voice XP] Erreur attribution membre ${member.id}:`, err));
        }
      }
    }

    // Cleanup users who left voice channels or became ineligible
    for (const userId of lastVoiceXpGiven.keys()) {
      if (!currentlyActiveUserIds.has(userId)) {
        lastVoiceXpGiven.delete(userId);
      }
    }
  } catch (error) {
    console.error('[Voice XP Service] Erreur lors du traitement périodique :', error);
  }
}

/**
 * Starts the Voice XP background evaluation loop.
 * @param {import('discord.js').Client} client 
 */
function start(client) {
  if (serviceInterval) {
    clearInterval(serviceInterval);
  }

  // Ticker runs every 15 seconds to check eligible members
  serviceInterval = setInterval(() => {
    processVoiceXP(client);
  }, 15000);
  serviceInterval.unref();

  console.log('[Voice XP Service] Service d\'XP vocal initialisé.');
}

/**
 * Stops the Voice XP background evaluation loop.
 */
function stop() {
  if (serviceInterval) {
    clearInterval(serviceInterval);
    serviceInterval = null;
  }
  lastVoiceXpGiven.clear();
}

module.exports = {
  start,
  stop,
  processVoiceXP,
};
