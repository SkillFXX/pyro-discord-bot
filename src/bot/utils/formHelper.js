const { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  EmbedBuilder, 
  MessageFlags 
} = require('discord.js');
const { CustomMessage, FormSubmission, ConfigHelper } = require('../../database');

/**
 * Handles the click on the Discord button that opens a custom form modal.
 * 
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleCustomFormButton(interaction) {
  try {
    const customId = interaction.customId;
    const formId = parseInt(customId.replace('custom_form_open_', ''), 10);
    if (!formId || isNaN(formId)) {
      return interaction.reply({
        content: '❌ Identifiant de formulaire invalide.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const record = await CustomMessage.findByPk(formId);
    if (!record || record.type !== 'form') {
      return interaction.reply({
        content: "❌ Ce formulaire n'est plus disponible ou a été supprimé.",
        flags: MessageFlags.Ephemeral,
      });
    }

    let formData = {};
    try {
      formData = typeof record.formData === 'string' ? JSON.parse(record.formData || '{}') : (record.formData || {});
    } catch {
      formData = {};
    }

    const fields = Array.isArray(formData.fields) ? formData.fields.slice(0, 5) : [];
    if (fields.length === 0) {
      return interaction.reply({
        content: "❌ Aucun champ n'a été configuré pour ce formulaire.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modalTitle = (formData.modalTitle || record.name || 'Formulaire').slice(0, 45);
    const modal = new ModalBuilder()
      .setCustomId(`custom_form_submit_${formId}`)
      .setTitle(modalTitle);

    fields.forEach((field, index) => {
      const fieldId = `field_${index}`;
      const label = (field.label || `Question ${index + 1}`).slice(0, 45);
      const isParagraph = field.style === 'paragraph';

      const input = new TextInputBuilder()
        .setCustomId(fieldId)
        .setLabel(label)
        .setStyle(isParagraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(field.required !== false);

      if (field.placeholder) {
        input.setPlaceholder(String(field.placeholder).slice(0, 100));
      }
      if (field.minLength && parseInt(field.minLength, 10) > 0) {
        input.setMinLength(parseInt(field.minLength, 10));
      }
      if (field.maxLength && parseInt(field.maxLength, 10) > 0) {
        input.setMaxLength(parseInt(field.maxLength, 10));
      }

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
    });

    await interaction.showModal(modal);
  } catch (error) {
    console.error('[FormHelper] Erreur ouverture modal :', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Une erreur est survenue lors de l'ouverture du formulaire.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

/**
 * Handles the submission of a custom form modal by a Discord member.
 * 
 * @param {import('discord.js').ModalSubmitInteraction} interaction 
 * @param {import('discord.js').Client} client 
 */
async function handleCustomFormSubmit(interaction, client) {
  try {
    const customId = interaction.customId;
    const formId = parseInt(customId.replace('custom_form_submit_', ''), 10);
    if (!formId || isNaN(formId)) {
      return interaction.reply({
        content: '❌ Identifiant de formulaire invalide.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Acknowledge immediately to avoid Discord 3s timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const record = await CustomMessage.findByPk(formId);
    if (!record) {
      return interaction.editReply({
        content: "❌ Ce formulaire n'existe plus en base de données.",
      });
    }

    let formData = {};
    let embedData = {};
    try {
      formData = typeof record.formData === 'string' ? JSON.parse(record.formData || '{}') : (record.formData || {});
      embedData = typeof record.embedData === 'string' ? JSON.parse(record.embedData || '{}') : (record.embedData || {});
    } catch {
      formData = {};
      embedData = {};
    }

    const fields = Array.isArray(formData.fields) ? formData.fields.slice(0, 5) : [];
    const answers = fields.map((field, index) => {
      const fieldId = `field_${index}`;
      let value = '';
      try {
        value = interaction.fields.getTextInputValue(fieldId);
      } catch {
        value = '';
      }
      return {
        id: field.id || `q_${index}`,
        label: field.label || `Question ${index + 1}`,
        value: value || '*Non renseigné*',
      };
    });

    const userAvatar = interaction.user.displayAvatarURL({ size: 128, extension: 'png' });

    // 1. Persist submission in database
    await FormSubmission.create({
      formId,
      userId: interaction.user.id,
      username: interaction.user.tag || interaction.user.username,
      userAvatar,
      answers: JSON.stringify(answers),
    });

    // 2. Dispatch response to the target submissions channel
    const targetChannelId = formData.submissionsChannelId || record.channelId;
    const submissionsChannel = client.channels.cache.get(targetChannelId) || 
      await client.channels.fetch(targetChannelId).catch(() => null);

    if (submissionsChannel && submissionsChannel.isTextBased()) {
      const defaultColor = ConfigHelper.getSync('embed_color', '#FF6B35');
      const responseEmbed = new EmbedBuilder()
        .setTitle(`📋 Nouvelle réponse : ${formData.modalTitle || record.name}`)
        .setDescription(`Soumis par <@${interaction.user.id}> (**${interaction.user.tag || interaction.user.username}**)`)
        .setColor(embedData.color || defaultColor)
        .setThumbnail(userAvatar)
        .setTimestamp()
        .setFooter({ text: `ID Membre : ${interaction.user.id} • Formulaire #${formId}` });

      for (const ans of answers) {
        const val = ans.value.length > 1024 ? ans.value.slice(0, 1021) + '...' : ans.value;
        responseEmbed.addFields({
          name: ans.label.slice(0, 256),
          value: val || '*Vide*',
          inline: false,
        });
      }

      const content = formData.mentionRoleId ? `<@&${formData.mentionRoleId}>` : undefined;
      await submissionsChannel.send({
        content,
        embeds: [responseEmbed],
      }).catch((err) => {
        console.error('[FormHelper] Erreur envoi vers salon de réception :', err);
      });
    }

    // 3. Confirm to the user
    const thankYouText = formData.thankYouMessage || '✅ Votre formulaire a bien été transmis avec succès ! Merci pour votre réponse.';
    await interaction.editReply({
      content: thankYouText,
    });
  } catch (error) {
    console.error('[FormHelper] Erreur soumission formulaire :', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: "❌ Une erreur est survenue lors de l'enregistrement de votre réponse.",
      }).catch(() => {});
    }
  }
}

module.exports = {
  handleCustomFormButton,
  handleCustomFormSubmit,
};
