const { SlashCommandBuilder } = require('discord.js');
const { UserXP } = require('../../database');
const embeds = require('../utils/embeds');
const { getXPNeededForLevel, makeProgressBar } = require('../utils/xpHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Afficher son niveau et sa progression en XP (ou ceux d\'un tiers).')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre à inspecter')
        .setRequired(false)),

  async execute(interaction, client) {
    const target = interaction.options.getUser('membre') || interaction.user;
    
    if (target.bot) {
      return interaction.reply({
        embeds: [embeds.error('Les bots n\'ont pas de système d\'XP.')],
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const userXP = await UserXP.findByPk(target.id);
      
      const currentXP = userXP ? userXP.xp : 0;
      const currentLevel = userXP ? userXP.level : 0;
      
      const xpForCurrentLevel = getXPNeededForLevel(currentLevel);
      const xpForNextLevel = getXPNeededForLevel(currentLevel + 1);
      
      const xpInThisLevel = currentXP - xpForCurrentLevel;
      const xpNeededForThisLevel = xpForNextLevel - xpForCurrentLevel;

      const progress = makeProgressBar(xpInThisLevel, xpNeededForThisLevel);

      const fields = [
        { name: '⭐ Niveau', value: `\`Niveau ${currentLevel}\``, inline: true },
        { name: '✨ Expérience Totale', value: `\`${currentXP} XP\``, inline: true },
        { name: '📈 Progression', value: `${xpInThisLevel} / ${xpNeededForThisLevel} XP\n${progress}`, inline: false }
      ];

      const xpEmbed = embeds.custom(
        `⭐ Niveau de ${target.username}`,
        null,
        embeds.COLORS.PRIMARY,
        fields,
        target.displayAvatarURL({ dynamic: true })
      );

      await interaction.editReply({ embeds: [xpEmbed] });

    } catch (error) {
      console.error('Error fetching user XP:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la récupération des informations de niveau.')]
      });
    }
  },
};
