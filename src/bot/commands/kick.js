const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Sanction } = require('../../database');
const embeds = require('../utils/embeds');
const { sendDM, logModerationAction } = require('../utils/moderationHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulser un membre du serveur.')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre à expulser')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('motif')
        .setDescription('Raison de l\'expulsion')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction, client) {
    const target = interaction.options.getUser('membre');
    const reason = interaction.options.getString('motif') || 'Aucun motif fourni.';
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('Ce membre est introuvable sur le serveur.')],
        ephemeral: true
      });
    }

    if (member.user.bot) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas expulser un bot.')],
        ephemeral: true
      });
    }

    // Role hierarchy check
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas expulser un membre avec un rôle supérieur ou égal au vôtre.')],
        ephemeral: true
      });
    }

    if (!member.kickable) {
      return interaction.reply({
        embeds: [embeds.error('Le bot ne possède pas les permissions nécessaires pour expulser ce membre.')],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // DM target FIRST (before kicking them out)
      const dmEmbed = embeds.custom(
        '👢 Vous avez été expulsé',
        `Vous avez été expulsé du serveur **${interaction.guild.name}**.\n\n` +
        `**Raison :** ${reason}`,
        embeds.COLORS.ERROR
      );
      const dmSent = await sendDM(member, dmEmbed);

      // Kick member
      await member.kick(`Expulsé par ${interaction.user.tag} : ${reason}`);

      // Create sanction entry
      await Sanction.create({
        userId: target.id,
        moderatorId: interaction.user.id,
        type: 'kick',
        reason: reason,
      });

      // Log action
      await logModerationAction(client, {
        action: '👢 Expulsion (Kick)',
        target: target,
        moderator: interaction.user,
        reason: reason,
      });

      // Reply Success
      const replyEmbed = embeds.success(
        `**${target.username}** a été expulsé du serveur.\n` +
        `**Motif :** ${reason}\n` +
        `*Statut du DM : ${dmSent ? 'Envoyé avec succès ✅' : 'DMs fermés/bloqués ❌'}*`
      );

      await interaction.editReply({ embeds: [replyEmbed] });

    } catch (error) {
      console.error('Error kicking member:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de l\'expulsion du membre.')]
      });
    }
  },
};
