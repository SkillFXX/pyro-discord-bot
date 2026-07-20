const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn } = require('../../database');
const embeds = require('../utils/embeds');
const { logModerationAction } = require('../utils/moderationHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Gérer les avertissements (warns) des membres.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    
    // Subcommand: List
    .addSubcommand(subcommand =>
      subcommand.setName('list')
        .setDescription('Lister les avertissements d\'un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à inspecter')
            .setRequired(true)))
            
    // Subcommand: Remove
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Retirer un avertissement spécifique.')
        .addIntegerOption(option =>
          option.setName('warn_id')
            .setDescription('L\'ID de l\'avertissement à retirer')
            .setRequired(true)))
            
    // Subcommand: Clear
    .addSubcommand(subcommand =>
      subcommand.setName('clear')
        .setDescription('Supprimer tous les avertissements d\'un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à blanchir')
            .setRequired(true))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    // 1. Subcommand List
    if (subcommand === 'list') {
      const target = interaction.options.getUser('membre');
      
      try {
        const warns = await Warn.findAll({
          where: { userId: target.id },
          order: [['id', 'DESC']]
        });

        if (warns.length === 0) {
          return interaction.editReply({
            embeds: [embeds.info(`${target} n'a aucun avertissement enregistré.`)]
          });
        }

        const fields = warns.map(warn => ({
          name: `Avertissement #${warn.id}`,
          value: `**Modérateur :** <@${warn.moderatorId}>\n**Date :** <t:${Math.floor(warn.createdAt.getTime() / 1000)}:R>\n**Motif :** ${warn.reason}`,
          inline: false
        }));

        const listEmbed = embeds.custom(
          `⚠️ Avertissements de ${target.username}`,
          `Total : **${warns.length}** avertissement(s)`,
          embeds.COLORS.WARNING,
          fields,
          target.displayAvatarURL({ dynamic: true })
        );

        await interaction.editReply({ embeds: [listEmbed] });

      } catch (error) {
        console.error('Error listing warns:', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la récupération des avertissements.')]
        });
      }
    }

    // 2. Subcommand Remove
    else if (subcommand === 'remove') {
      const warnId = interaction.options.getInteger('warn_id');

      try {
        const warn = await Warn.findByPk(warnId);
        if (!warn) {
          return interaction.editReply({
            embeds: [embeds.error(`L'avertissement #${warnId} est introuvable.`)]
          });
        }

        const targetUser = await client.users.fetch(warn.userId).catch(() => ({ id: warn.userId, username: 'Inconnu' }));
        await warn.destroy();

        // Log action
        await logModerationAction(client, {
          action: '🗑️ Warn Retiré',
          target: targetUser,
          moderator: interaction.user,
          reason: `Avertissement #${warnId} supprimé. (Raison initiale : ${warn.reason})`,
        });

        await interaction.editReply({
          embeds: [embeds.success(`L'avertissement **#${warnId}** de **${targetUser.username}** a été retiré.`)]
        });

      } catch (error) {
        console.error('Error removing warn:', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la suppression de l\'avertissement.')]
        });
      }
    }

    // 3. Subcommand Clear
    else if (subcommand === 'clear') {
      const target = interaction.options.getUser('membre');

      try {
        const count = await Warn.destroy({
          where: { userId: target.id }
        });

        if (count === 0) {
          return interaction.editReply({
            embeds: [embeds.info(`${target} n'avait aucun avertissement à effacer.`)]
          });
        }

        // Log action
        await logModerationAction(client, {
          action: '🗑️ Warns Effacés',
          target: target,
          moderator: interaction.user,
          reason: `Tous les avertissements (${count}) ont été supprimés par le modérateur.`,
        });

        await interaction.editReply({
          embeds: [embeds.success(`Tous les avertissements (${count}) de **${target.username}** ont été effacés.`)]
        });

      } catch (error) {
        console.error('Error clearing warns:', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la suppression des avertissements.')]
        });
      }
    }
  },
};
