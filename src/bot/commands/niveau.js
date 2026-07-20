const { SlashCommandBuilder } = require('discord.js');
const { UserXP } = require('../../database');
const embeds = require('../utils/embeds');

function getXPNeededForLevel(level) {
  if (level <= 0) return 0;
  return Math.floor(100 * Math.pow(level, 1.5));
}

function makeProgressBar(current, max, size = 12) {
  if (max <= 0) return '\`[■■■■■■■■■■■■]\` **100%**';
  const percentage = Math.max(0, Math.min(1, current / max));
  const progress = Math.round(size * percentage);
  const emptyProgress = size - progress;
  const progressText = '■'.repeat(progress);
  const emptyProgressText = '□'.repeat(emptyProgress);
  const percentageText = Math.round(percentage * 100);
  return `\`[${progressText}${emptyProgressText}]\` **${percentageText}%**`;
}

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
