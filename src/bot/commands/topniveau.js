const { SlashCommandBuilder } = require('discord.js');
const { UserXP } = require('../../database');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('topniveau')
    .setDescription('Afficher le classement des 10 membres ayant le plus d\'XP.'),

  async execute(interaction, client) {
    await interaction.deferReply();

    try {
      const topUsers = await UserXP.findAll({
        order: [['xp', 'DESC']],
        limit: 10
      });

      if (topUsers.length === 0) {
        return interaction.editReply({
          embeds: [embeds.info('Aucun membre n\'a encore gagné d\'XP sur ce serveur.')]
        });
      }

      let description = '';
      
      for (let i = 0; i < topUsers.length; i++) {
        const record = topUsers[i];
        let medal = '';
        
        if (i === 0) medal = '🥇 ';
        else if (i === 1) medal = '🥈 ';
        else if (i === 2) medal = '🥉 ';
        else medal = `\`#${i + 1}\` `;

        description += `${medal} <@${record.userId}> • **Niveau ${record.level}** (${record.xp} XP)\n`;
      }

      const leaderboardEmbed = embeds.custom(
        '🏆 Classement XP du Serveur',
        description,
        embeds.COLORS.PRIMARY,
        null,
        interaction.guild.iconURL({ dynamic: true })
      );

      await interaction.editReply({ embeds: [leaderboardEmbed] });

    } catch (error) {
      console.error('Error fetching XP leaderboard:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors du chargement du classement.')]
      });
    }
  },
};
