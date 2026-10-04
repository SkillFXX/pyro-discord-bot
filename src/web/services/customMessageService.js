const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder 
} = require('discord.js');
const { CustomMessage, FormSubmission, ConfigHelper } = require('../../database');

const BUTTON_STYLES = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

/**
 * Builds the Discord message payload (content, embeds, components) from a CustomMessage record.
 * 
 * @param {object} record 
 * @returns {object}
 */
function buildDiscordPayload(record) {
  const type = record.type || 'text';
  let embedData = {};
  let formData = {};

  try {
    embedData = typeof record.embedData === 'string' ? JSON.parse(record.embedData || '{}') : (record.embedData || {});
  } catch {
    embedData = {};
  }

  try {
    formData = typeof record.formData === 'string' ? JSON.parse(record.formData || '{}') : (record.formData || {});
  } catch {
    formData = {};
  }

  const payload = {};

  // 1. Text Content
  if (record.content && record.content.trim()) {
    payload.content = record.content.trim();
  }

  // 2. Embed Content (for 'embed' and 'form' types)
  if (type === 'embed' || type === 'form') {
    const defaultColor = ConfigHelper.getSync('embed_color', '#FF6B35');
    const embed = new EmbedBuilder();

    // Color
    const color = embedData.color || defaultColor;
    try {
      embed.setColor(color);
    } catch {
      embed.setColor('#FF6B35');
    }

    // Title & URL
    if (embedData.title && embedData.title.trim()) {
      embed.setTitle(embedData.title.trim().slice(0, 256));
      if (embedData.url && embedData.url.trim().startsWith('http')) {
        embed.setURL(embedData.url.trim());
      }
    }

    // Description
    if (embedData.description && embedData.description.trim()) {
      embed.setDescription(embedData.description.trim().slice(0, 4096));
    }

    // Author
    if (embedData.author && embedData.author.name && embedData.author.name.trim()) {
      embed.setAuthor({
        name: embedData.author.name.trim().slice(0, 256),
        iconURL: embedData.author.iconURL && embedData.author.iconURL.trim().startsWith('http') ? embedData.author.iconURL.trim() : undefined,
        url: embedData.author.url && embedData.author.url.trim().startsWith('http') ? embedData.author.url.trim() : undefined,
      });
    }

    // Fields
    if (Array.isArray(embedData.fields) && embedData.fields.length > 0) {
      const validFields = embedData.fields
        .filter(f => f && f.name && f.name.trim() && f.value && f.value.trim())
        .slice(0, 25)
        .map(f => ({
          name: f.name.trim().slice(0, 256),
          value: f.value.trim().slice(0, 1024),
          inline: Boolean(f.inline),
        }));

      if (validFields.length > 0) {
        embed.addFields(validFields);
      }
    }

    // Media
    if (embedData.thumbnail && embedData.thumbnail.trim().startsWith('http')) {
      embed.setThumbnail(embedData.thumbnail.trim());
    }
    if (embedData.image && embedData.image.trim().startsWith('http')) {
      embed.setImage(embedData.image.trim());
    }

    // Footer
    if (embedData.footer && embedData.footer.text && embedData.footer.text.trim()) {
      embed.setFooter({
        text: embedData.footer.text.trim().slice(0, 2048),
        iconURL: embedData.footer.iconURL && embedData.footer.iconURL.trim().startsWith('http') ? embedData.footer.iconURL.trim() : undefined,
      });
    }

    // Timestamp
    if (embedData.timestamp) {
      embed.setTimestamp();
    }

    payload.embeds = [embed];
  }

  // 3. Form Component (Button opening the modal)
  if (type === 'form') {
    const buttonLabel = (formData.buttonLabel || 'Remplir le formulaire').trim().slice(0, 80);
    const chosenStyle = BUTTON_STYLES[formData.buttonStyle] || ButtonStyle.Primary;

    const button = new ButtonBuilder()
      .setCustomId(`custom_form_open_${record.id}`)
      .setLabel(buttonLabel)
      .setStyle(chosenStyle);

    if (formData.buttonEmoji && formData.buttonEmoji.trim()) {
      button.setEmoji(formData.buttonEmoji.trim());
    }

    const row = new ActionRowBuilder().addComponents(button);
    payload.components = [row];
  } else {
    payload.components = [];
  }

  return payload;
}

/**
 * Sends or updates the message on Discord.
 * 
 * @param {import('discord.js').Client} client 
 * @param {CustomMessage} record 
 * @returns {Promise<CustomMessage>}
 */
async function sendOrUpdateDiscordMessage(client, record) {
  if (!record.channelId) {
    throw new Error('Salon Discord non spécifié.');
  }

  const channel = client.channels.cache.get(record.channelId) || 
    await client.channels.fetch(record.channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Le salon Discord (${record.channelId}) est introuvable ou n'est pas un salon textuel.`);
  }

  const payload = buildDiscordPayload(record);

  // If already sent, attempt to edit existing message
  if (record.messageId) {
    try {
      const existingMessage = await channel.messages.fetch(record.messageId);
      if (existingMessage) {
        await existingMessage.edit(payload);
        record.status = 'sent';
        record.lastError = null;
        await record.save();
        return record;
      }
    } catch (err) {
      console.warn(`[CustomMessageService] Message ${record.messageId} introuvable sur Discord, envoi d'un nouveau message :`, err.message);
    }
  }

  // Send new message
  try {
    const sentMessage = await channel.send(payload);
    record.messageId = sentMessage.id;
    record.status = 'sent';
    record.lastError = null;
    await record.save();
    return record;
  } catch (err) {
    record.status = 'error';
    record.lastError = err.message;
    await record.save();
    throw new Error(`Échec de l'envoi Discord : ${err.message}`);
  }
}

/**
 * Deletes the message from Discord and from the database.
 * 
 * @param {import('discord.js').Client} client 
 * @param {CustomMessage} record 
 */
async function deleteDiscordMessage(client, record) {
  if (record.channelId && record.messageId) {
    try {
      const channel = client.channels.cache.get(record.channelId) || 
        await client.channels.fetch(record.channelId).catch(() => null);

      if (channel && channel.isTextBased()) {
        const message = await channel.messages.fetch(record.messageId).catch(() => null);
        if (message) {
          await message.delete().catch(() => null);
        }
      }
    } catch (err) {
      console.warn(`[CustomMessageService] Impossible de supprimer le message sur Discord (${record.messageId}) :`, err.message);
    }
  }

  // Remove submissions
  await FormSubmission.destroy({ where: { formId: record.id } }).catch(() => {});

  // Remove record
  await record.destroy();
}

module.exports = {
  buildDiscordPayload,
  sendOrUpdateDiscordMessage,
  deleteDiscordMessage,
};
