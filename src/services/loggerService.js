const { EmbedBuilder } = require('discord.js');
const { ConfigHelper, LOG_CONFIG_KEYS } = require('../database');

// Default fallback configuration mapping
const defaultKeyMap = new Map(LOG_CONFIG_KEYS.map(item => [item.key, item.default]));

/**
 * Checks if a specific log event is enabled in configuration.
 * @param {string} eventKey
 * @returns {Promise<boolean>}
 */
async function isEventEnabled(eventKey) {
  const defaultVal = defaultKeyMap.has(eventKey) ? defaultKeyMap.get(eventKey) : true;
  return await ConfigHelper.get(eventKey, defaultVal);
}

/**
 * Retrieves the configured Discord log channel.
 * @param {import('discord.js').Client} client
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function getLogChannel(client) {
  const logChannelId = await ConfigHelper.get('log_channel_id');
  if (!logChannelId) return null;

  try {
    const channel = await client.channels.fetch(logChannelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      return channel;
    }
  } catch (err) {
    console.warn('[LoggerService] Impossible de récupérer le salon de logs:', err.message);
  }
  return null;
}

/**
 * Sends a log embed to the configured logs channel if the event is enabled.
 * 
 * @param {import('discord.js').Client} client 
 * @param {string} eventKey Clé de configuration (ex: 'log_bot_tickets')
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {string} [options.color='#FF6B35']
 * @param {Array<{name: string, value: string, inline?: boolean}>} [options.fields]
 * @param {{name?: string, iconURL?: string}} [options.author]
 * @param {string} [options.thumbnail]
 * @param {string} [options.image]
 * @param {{text: string, iconURL?: string}} [options.footer]
 * @returns {Promise<boolean>} True si le log a été envoyé
 */
async function log(client, eventKey, {
  title,
  description,
  color = '#FF6B35',
  fields = [],
  author = null,
  thumbnail = null,
  image = null,
  footer = null,
}) {
  try {
    // 1. Check if event is enabled
    const enabled = await isEventEnabled(eventKey);
    if (!enabled) return false;

    // 2. Fetch destination channel
    const channel = await getLogChannel(client);
    if (!channel) return false;

    // 3. Build Embed
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTimestamp();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (fields && fields.length > 0) {
      // Filter out empty or undefined fields to prevent Discord API errors
      const validFields = fields
        .filter(f => f && f.name && f.value)
        .map(f => ({
          name: String(f.name).substring(0, 256),
          value: String(f.value).substring(0, 1024),
          inline: Boolean(f.inline),
        }));
      if (validFields.length > 0) {
        embed.addFields(validFields);
      }
    }
    if (author) embed.setAuthor(author);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);

    const customFooterText = ConfigHelper.getSync('embed_footer_text', null);
    const customFooterIcon = ConfigHelper.getSync('embed_footer_icon_url', null) || undefined;

    if (footer) {
      embed.setFooter({
        text: footer.text,
        iconURL: footer.iconURL || customFooterIcon,
      });
    } else {
      embed.setFooter({
        text: customFooterText || 'Pyro Logs • Surveillance Serveur',
        iconURL: customFooterIcon,
      });
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(`[LoggerService] Erreur lors de l'envoi du log (${eventKey}):`, error.message);
    return false;
  }
}

module.exports = {
  isEventEnabled,
  getLogChannel,
  log,
};

