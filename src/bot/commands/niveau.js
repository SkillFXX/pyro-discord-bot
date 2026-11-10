const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { UserXP } = require('../../database');
const embeds = require('../utils/embeds');
const { getXPNeededForLevel, makeProgressBar } = require('../utils/xpHelper');
const cardGeneratorService = require('../../services/cardGeneratorService');

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
        flags: MessageFlags.Ephemeral
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

      if (await cardGeneratorService.isEnabled('niveau')) {
        const cardConfig = await cardGeneratorService.getConfig('niveau');
        const rank = (await UserXP.count({ where: { xp: { [Op.gt]: currentXP } } })) + 1;
        const cardBuffer = await cardGeneratorService.generateCard('niveau', {
          username: target.username,
          userMention: `${target}`,
          userTag: target.tag || target.username,
          serverName: interaction.guild?.name,
          memberCount: interaction.guild?.memberCount,
          level: currentLevel,
          xp: currentXP,
          xpInLevel: xpInThisLevel,
          xpNeeded: xpNeededForThisLevel,
          progress: xpNeededForThisLevel > 0 ? xpInThisLevel / xpNeededForThisLevel : 0,
          rank,
          avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
        });

        if (cardBuffer) {
          const file = new AttachmentBuilder(cardBuffer, { name: 'niveau-card.png' });
          if (cardConfig.sendMode === 'embed') {
            const cardEmbed = embeds.custom(`⭐ Niveau de ${target.username}`, null, embeds.COLORS.PRIMARY);
            cardEmbed.setImage('attachment://niveau-card.png');
            return await interaction.editReply({ embeds: [cardEmbed], files: [file] });
          }
          return await interaction.editReply({ files: [file] });
        }
      }

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
