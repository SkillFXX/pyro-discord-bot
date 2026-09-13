const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Sanction } = require('../../database');
const embeds = require('../utils/embeds');
const { sendDM, logModerationAction } = require('../utils/moderationHelper');

// Helper to parse duration string (e.g. 10s, 30m, 2h, 1d/1j, 1w/1sem)
function parseDuration(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return null;
  const regex = /^(\d+)\s*(s|sec|m|min|h|d|j|w|sem)$/i;
  const match = durationStr.trim().match(regex);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (isNaN(value) || value <= 0) return null;
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
    case 'sec':
      return value * 1000;
    case 'm':
    case 'min':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
    case 'j':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
    case 'sem':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
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
        .setDescription('Durée de l\'exclusion (ex: 30m, 2h, 1j, 1w) - Max: 28 jours (4 semaines)')
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
        flags: MessageFlags.Ephemeral
      });
    }

    if (member.user.bot) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas exclure un bot.')],
        flags: MessageFlags.Ephemeral
      });
    }

    // Parse duration
    const durationMs = parseDuration(durationStr);
    if (!durationMs || durationMs < 10000) {
      return interaction.reply({
        embeds: [embeds.error('Format de durée invalide ou inférieur à 10 secondes. Utilisez par exemple : `30m`, `2h`, `1j` (ou `1d`), `1w` (ou `1sem`). Unités : s, m, h, j/d, w/sem.')],
        flags: MessageFlags.Ephemeral
      });
    }

    // Discord native timeout max is 28 days (2419200000 ms = 4 weeks)
    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 2419200000 ms
    if (durationMs > MAX_TIMEOUT_MS) {
      return interaction.reply({
        embeds: [embeds.error('La durée d\'exclusion maximale autorisée par l\'API Discord est de **28 jours** (soit 4 semaines maximum / `28d` ou `4w`).')],
        flags: MessageFlags.Ephemeral
      });
    }

    // Role hierarchy check
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        embeds: [embeds.error('Vous ne pouvez pas exclure un membre avec un rôle supérieur ou égal au vôtre.')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        embeds: [embeds.error('Le bot ne possède pas les permissions nécessaires pour exclure ce membre (permissions insuffisantes ou rôle du membre supérieur).')],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
