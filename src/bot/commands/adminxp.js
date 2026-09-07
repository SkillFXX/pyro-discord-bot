const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { UserXP } = require('../../database');
const embeds = require('../utils/embeds');
const { calculateLevelFromXP } = require('../utils/xpHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminxp')
    .setDescription('Gérer l\'XP et les niveaux des membres.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    
    // Subcommand: Add
    .addSubcommand(subcommand =>
      subcommand.setName('add')
        .setDescription('Ajouter de l\'XP à un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à créditer')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('montant')
            .setDescription('Le montant d\'XP à ajouter')
            .setRequired(true)
            .setMinValue(1)))
            
    // Subcommand: Remove
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Retirer de l\'XP à un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à débiter')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('montant')
            .setDescription('Le montant d\'XP à retirer')
            .setRequired(true)
            .setMinValue(1))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');

    if (target.bot) {
      return interaction.reply({
        embeds: [embeds.error('Les bots ne peuvent pas posséder d\'XP.')],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Find or create record
      let [record, created] = await UserXP.findOrCreate({
        where: { userId: target.id },
        defaults: { xp: 0, level: 0 }
      });

      const originalXP = record.xp;
      const originalLevel = record.level;
      let newXP = originalXP;

      if (subcommand === 'add') {
        newXP += amount;
      } else if (subcommand === 'remove') {
        newXP = Math.max(0, originalXP - amount);
      }

      // Recalculate level using shared helper
      const newLevel = calculateLevelFromXP(newXP);

      record.xp = newXP;
      record.level = newLevel;
      await record.save();

      const successEmbed = embeds.success(
        `L'XP de ${target} a été modifiée avec succès.\n\n` +
        `**Ancien XP :** \`${originalXP} XP\` (Niveau ${originalLevel})\n` +
        `**Nouvel XP :** \`${newXP} XP\` (Niveau ${newLevel})\n` +
        `**Différence :** \`${subcommand === 'add' ? '+' : '-'}${amount} XP\``
      );

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Error modifying admin XP:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la modification de l\'XP.')]
      });
    }
  },
};
