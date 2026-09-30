const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { UserXP } = require('../../database');
const embeds = require('../utils/embeds');
const { calculateLevelFromXP, getXPNeededForLevel, handleRoleRewards } = require('../utils/xpHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminxp')
    .setDescription('Gérer l\'XP et les niveaux des membres.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    
    // Subcommand: Add
    .addSubcommand(subcommand =>
      subcommand.setName('add')
        .setDescription('Ajouter de l\'XP ou des niveaux à un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à créditer')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('montant')
            .setDescription('Le montant à ajouter')
            .setRequired(true)
            .setMinValue(1))
        .addStringOption(option =>
          option.setName('unite')
            .setDescription('Unité à ajouter (par défaut: XP)')
            .setRequired(false)
            .addChoices(
              { name: 'XP (points d\'expérience)', value: 'xp' },
              { name: 'Niveaux', value: 'level' }
            )))
            
    // Subcommand: Remove
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Retirer de l\'XP ou des niveaux à un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à débiter')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('montant')
            .setDescription('Le montant à retirer')
            .setRequired(true)
            .setMinValue(1))
        .addStringOption(option =>
          option.setName('unite')
            .setDescription('Unité à retirer (par défaut: XP)')
            .setRequired(false)
            .addChoices(
              { name: 'XP (points d\'expérience)', value: 'xp' },
              { name: 'Niveaux', value: 'level' }
            )))

    // Subcommand: Set
    .addSubcommand(subcommand =>
      subcommand.setName('set')
        .setDescription('Définir le niveau ou l\'XP d\'un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre ciblé')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('valeur')
            .setDescription('La valeur exacte à attribuer')
            .setRequired(true)
            .setMinValue(0))
        .addStringOption(option =>
          option.setName('unite')
            .setDescription('Unité à définir (par défaut: Niveaux)')
            .setRequired(false)
            .addChoices(
              { name: 'Niveaux', value: 'level' },
              { name: 'XP (points d\'expérience)', value: 'xp' }
            ))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser('membre');

    if (target.bot) {
      return interaction.reply({
        embeds: [embeds.error('Les bots ne peuvent pas posséder d\'XP.')],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Find or create record
      let [record] = await UserXP.findOrCreate({
        where: { userId: target.id },
        defaults: { xp: 0, level: 0 }
      });

      const originalXP = record.xp;
      const originalLevel = record.level;
      let newXP = originalXP;
      let newLevel = originalLevel;
      let actionLabel = '';

      if (subcommand === 'add') {
        const amount = interaction.options.getInteger('montant');
        const unit = interaction.options.getString('unite') || 'xp';

        if (unit === 'level') {
          newLevel = originalLevel + amount;
          newXP = getXPNeededForLevel(newLevel);
          actionLabel = `Ajout de \`+${amount} niveau(x)\``;
        } else {
          newXP = originalXP + amount;
          newLevel = calculateLevelFromXP(newXP);
          actionLabel = `Ajout de \`+${amount} XP\``;
        }
      } else if (subcommand === 'remove') {
        const amount = interaction.options.getInteger('montant');
        const unit = interaction.options.getString('unite') || 'xp';

        if (unit === 'level') {
          newLevel = Math.max(0, originalLevel - amount);
          newXP = getXPNeededForLevel(newLevel);
          actionLabel = `Retrait de \`-${amount} niveau(x)\``;
        } else {
          newXP = Math.max(0, originalXP - amount);
          newLevel = calculateLevelFromXP(newXP);
          actionLabel = `Retrait de \`-${amount} XP\``;
        }
      } else if (subcommand === 'set') {
        const val = interaction.options.getInteger('valeur');
        const unit = interaction.options.getString('unite') || 'level';

        if (unit === 'level') {
          newLevel = Math.max(0, val);
          newXP = getXPNeededForLevel(newLevel);
          actionLabel = `Définition au niveau \`${newLevel}\``;
        } else {
          newXP = Math.max(0, val);
          newLevel = calculateLevelFromXP(newXP);
          actionLabel = `Définition à \`${newXP} XP\``;
        }
      }

      record.xp = newXP;
      record.level = newLevel;
      await record.save();

      // Synchronize role rewards for target member
      const targetMember = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;
      if (targetMember) {
        await handleRoleRewards(targetMember, newLevel);
      }

      const successEmbed = embeds.success(
        `L'XP et le niveau de ${target} ont été mis à jour avec succès.\n\n` +
        `**Action :** ${actionLabel}\n` +
        `**Avant :** Niveau \`${originalLevel}\` (\`${originalXP} XP\`)\n` +
        `**Après :** Niveau \`${newLevel}\` (\`${newXP} XP\`)`
      );

      await interaction.editReply({ embeds: [successEmbed] });

      // Log Admin XP modification
      const loggerService = require('../../services/loggerService');
      await loggerService.log(client, 'log_bot_xp', {
        title: '⭐ Modification Manuelle d\'XP & Niveaux',
        description: `L'XP / Niveau de **${target.tag}** a été ajusté par ${interaction.user}.`,
        color: '#F39C12',
        thumbnail: target.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '👤 Membre', value: `${target} (\`${target.id}\`)`, inline: true },
          { name: '🛡️ Modérateur', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
          { name: 'Action', value: actionLabel, inline: true },
          { name: 'Niveau Précédent', value: `Niveau ${originalLevel} (\`${originalXP} XP\`)`, inline: true },
          { name: 'Nouveau Niveau', value: `Niveau ${newLevel} (\`${newXP} XP\`)`, inline: true },
        ],
        footer: { text: `Pyro XP Management` },
      });

    } catch (error) {
      console.error('Error modifying admin XP:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la modification de l\'XP.')]
      });
    }
  },
};
