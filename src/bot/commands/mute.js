const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Sanction } = require('../../database');
const embeds = require('../utils/embeds');
const { sendDM, logModerationAction } = require('../utils/moderationHelper');

// Helper to parse duration string (e.g. 10s, 30m, 2h, 1d)
function parseDuration(durationStr) {
  const regex = /^(\d+)([smhd])$/i;
  const match = durationStr.match(regex);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Exclure temporairement (timeout) un membre du serveur.')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre à exclure temporairement')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duree')
        .setDescription('Durée de l\'exclusion (ex: 30m, 2h, 1d) - Max: 28d')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('motif')
        .setDescription('Raison de l\'exclusion')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    const target = interaction.options.getUser('membre');
    const durationStr = interaction.options.getString('duree');
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
        embeds: [embeds.error('Vous ne pouvez pas exclure un bot.')],
        ephemeral: true
      });
    }

    // Parse duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({
        embeds: [embeds.error('Format de durée invalide. Utilisez par exemple : `30m` (30 mins), `2h` (2 heures), `1d` (1 jour). Units autorisées : s, m, h, d.')],
        ephemeral: true
      });
    }

    // Discord native timeout max is 28 days (2419200000 ms)
    if (durationMs > 2419200000) {
      return interaction.reply({
        embeds: [embeds.error('La durée d\'exclusion maximale autorisée par Discord est de 28 jours (`28d`).')],
        ephemeral: true
      });
    }

    // Role hierarchy check
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas exclure un membre avec un rôle supérieur ou égal au vôtre.')],
        ephemeral: true
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        embeds: [embeds.error('Le bot ne possède pas les permissions nécessaires pour exclure ce membre (permissions insuffisantes ou rôle du membre supérieur).')],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Apply timeout
      await member.timeout(durationMs, `Mute par ${interaction.user.tag} : ${reason}`);

      // Create sanction entry
      await Sanction.create({
        userId: target.id,
        moderatorId: interaction.user.id,
        type: 'mute',
        reason: reason,
      });

      // DM target
      const dmEmbed = embeds.custom(
        '🔇 Vous avez été exclu temporairement',
        `Vous avez été temporairement exclu (timeout) du serveur **${interaction.guild.name}**.\n\n` +
        `**Durée :** ${durationStr}\n` +
        `**Raison :** ${reason}\n` +
        `*Vous ne pourrez plus parler ni rejoindre les salons vocaux pendant cette période.*`,
        embeds.COLORS.ERROR
      );
      const dmSent = await sendDM(member, dmEmbed);

      // Log action
      await logModerationAction(client, {
        action: '🔇 Exclusion (Mute)',
        target: target,
        moderator: interaction.user,
        reason: reason,
        duration: durationStr,
      });

      // Reply Success
      const replyEmbed = embeds.success(
        `**${target.username}** a été exclu temporairement pour **${durationStr}**.\n` +
        `**Motif :** ${reason}\n` +
        `*Statut du DM : ${dmSent ? 'Envoyé avec succès ✅' : 'DMs fermés/bloqués ❌'}*`
      );

      await interaction.editReply({ embeds: [replyEmbed] });

    } catch (error) {
      console.error('Error muting member:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de l\'exclusion du membre.')]
      });
    }
  },
};
