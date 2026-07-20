const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Envoyer le message d\'ouverture de ticket dans un salon.')
    .addChannelOption(option =>
      option.setName('salon')
        .setDescription('Le salon où envoyer le message de ticket')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const channel = interaction.options.getChannel('salon');

    await interaction.deferReply({ ephemeral: true });

    try {
      const ticketEmbed = embeds.custom(
        '🎫 Support - Ouvrir un Ticket',
        `Besoin d'aide ? Vous rencontrez un problème ?\n` +
        `Cliquez sur le bouton ci-dessous pour ouvrir un ticket et entrer en contact avec notre équipe.`,
        embeds.COLORS.PRIMARY
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket_btn')
          .setLabel('🎫 Créer un Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [ticketEmbed],
        components: [row]
      });

      await interaction.editReply({
        embeds: [embeds.success(`Le système de ticket a été installé avec succès dans le salon ${channel}.`)]
      });

    } catch (error) {
      console.error('Error setting up ticket message:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la configuration du ticket.')]
      });
    }
  },
};
