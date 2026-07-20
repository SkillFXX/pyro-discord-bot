const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn } = require('../../database');
const embeds = require('../utils/embeds');
const { sendDM, logModerationAction, checkWarnThresholds } = require('../utils/moderationHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Donner un avertissement (warn) à un membre.')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre à avertir')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('motif')
        .setDescription('La raison de l\'avertissement')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    const target = interaction.options.getUser('membre');
    const reason = interaction.options.getString('motif');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('Ce membre est introuvable sur le serveur.')],
        ephemeral: true
      });
    }

    if (member.user.bot) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas avertir un bot.')],
        ephemeral: true
      });
    }

    // Role hierarchy check
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas avertir un membre avec un rôle supérieur ou égal au vôtre.')],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Create warn in DB
      const warn = await Warn.create({
        userId: target.id,
        moderatorId: interaction.user.id,
        reason: reason,
      });

      // DM target
      const dmEmbed = embeds.custom(
        '⚠️ Avertissement reçu',
        `Vous avez reçu un avertissement officiel sur le serveur **${interaction.guild.name}**.\n\n` +
        `**Modérateur :** ${interaction.user.username}\n` +
        `**Raison :** ${reason}`,
        embeds.COLORS.WARNING
      );
      const dmSent = await sendDM(member, dmEmbed);

      // Log action
      await logModerationAction(client, {
        action: '⚠️ Avertissement (Warn)',
        target: target,
        moderator: interaction.user,
        reason: reason,
        warnId: warn.id,
      });

      // Response Embed
      const replyEmbed = embeds.success(
        `L'avertissement **#${warn.id}** a été attribué à ${target}.\n` +
        `**Raison :** ${reason}\n` +
        `*Statut du DM : ${dmSent ? 'Envoyé avec succès ✅' : 'DMs fermés/bloqués ❌'}*`
      );

      await interaction.editReply({ embeds: [replyEmbed] });

      // Check automated thresholds
      await checkWarnThresholds(client, member, interaction.member, reason);

    } catch (error) {
      console.error('Error warning member:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la création de l\'avertissement.')]
      });
    }
  },
};
