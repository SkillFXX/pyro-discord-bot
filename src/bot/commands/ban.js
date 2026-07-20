const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Sanction } = require('../../database');
const embeds = require('../utils/embeds');
const { sendDM, logModerationAction } = require('../utils/moderationHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannir définitivement un membre du serveur.')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre à bannir')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('motif')
        .setDescription('Raison du bannissement')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction, client) {
    const target = interaction.options.getUser('membre');
    const reason = interaction.options.getString('motif') || 'Aucun motif fourni.';
    
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    // If member exists in server, check hierarchy
    if (member) {
      if (member.user.bot) {
        return interaction.reply({
          embeds: [embeds.error('Vous ne pouvez pas bannir un bot.')],
          ephemeral: true
        });
      }

      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({
          embeds: [embeds.error('Vous ne pouvez pas bannir un membre avec un rôle supérieur ou égal au vôtre.')],
          ephemeral: true
        });
      }

      if (!member.bannable) {
        return interaction.reply({
          embeds: [embeds.error('Le bot ne possède pas les permissions nécessaires pour bannir ce membre.')],
          ephemeral: true
        });
      }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      let dmSent = false;
      
      // DM target FIRST (if they are in the server)
      if (member) {
        const dmEmbed = embeds.custom(
          '🔨 Vous avez été banni',
          `Vous avez été banni définitivement du serveur **${interaction.guild.name}**.\n\n` +
          `**Raison :** ${reason}`,
          embeds.COLORS.ERROR
        );
        dmSent = await sendDM(member, dmEmbed);
      }

      // Ban member
      await interaction.guild.members.ban(target.id, {
        reason: `Banni par ${interaction.user.tag} : ${reason}`,
        deleteMessageSeconds: 7 * 24 * 60 * 60 // Delete 7 days of messages
      });

      // Create sanction entry
      await Sanction.create({
        userId: target.id,
        moderatorId: interaction.user.id,
        type: 'ban',
        reason: reason,
      });

      // Log action
      await logModerationAction(client, {
        action: '🔨 Bannissement (Ban)',
        target: target,
        moderator: interaction.user,
        reason: reason,
      });

      // Reply Success
      const replyEmbed = embeds.success(
        `**${target.username}** a été banni définitivement.\n` +
        `**Motif :** ${reason}\n` +
        `*Statut du DM : ${member ? (dmSent ? 'Envoyé avec succès ✅' : 'DMs fermés/bloqués ❌') : 'Non applicable (pas dans le serveur) ⚠️'}*`
      );

      await interaction.editReply({ embeds: [replyEmbed] });

    } catch (error) {
      console.error('Error banning user:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors du bannissement de l\'utilisateur.')]
      });
    }
  },
};
