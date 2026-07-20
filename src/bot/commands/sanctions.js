const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn, Sanction } = require('../../database');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription('Afficher l\'historique complet des sanctions d\'un membre.')
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Le membre à inspecter')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    const target = interaction.options.getUser('membre');
    await interaction.deferReply({ ephemeral: true });

    try {
      // Fetch Warns and Sanctions
      const warns = await Warn.findAll({
        where: { userId: target.id },
        order: [['createdAt', 'DESC']]
      });

      const sanctions = await Sanction.findAll({
        where: { userId: target.id },
        order: [['createdAt', 'DESC']]
      });

      if (warns.length === 0 && sanctions.length === 0) {
        return interaction.editReply({
          embeds: [embeds.info(`L'historique de **${target.username}** est totalement vierge.`)]
        });
      }

      // Merge and sort all items by date
      const history = [];
      
      warns.forEach(w => history.push({
        type: '⚠️ Avertissement (Warn)',
        id: `#${w.id}`,
        moderatorId: w.moderatorId,
        reason: w.reason,
        date: w.createdAt,
      }));

      sanctions.forEach(s => {
        let typeEmoji = '🔨';
        if (s.type === 'mute') typeEmoji = '🔇';
        if (s.type === 'kick') typeEmoji = '👢';

        history.push({
          type: `${typeEmoji} ${s.type.toUpperCase()}`,
          id: `#${s.id}`,
          moderatorId: s.moderatorId,
          reason: s.reason,
          date: s.createdAt,
        });
      });

      // Sort history descending by date
      history.sort((a, b) => b.date - a.date);

      // Limit to last 15 items to fit within Discord Embed limits safely
      const maxDisplay = 15;
      const displayed = history.slice(0, maxDisplay);

      const fields = displayed.map(item => ({
        name: `${item.type} (${item.id})`,
        value: `**Modérateur :** <@${item.moderatorId}>\n**Date :** <t:${Math.floor(item.date.getTime() / 1000)}:R>\n**Motif :** ${item.reason}`,
        inline: false
      }));

      let footerText = `Pyro Bot • Total: ${warns.length} warn(s), ${sanctions.length} sanction(s)`;
      if (history.length > maxDisplay) {
        footerText += ` • (+ ${history.length - maxDisplay} autres archivés)`;
      }

      const historyEmbed = embeds.custom(
        `📜 Historique - ${target.username}`,
        `Voici l'historique récent de modération de ${target} (\`${target.id}\`).`,
        embeds.COLORS.INFO,
        fields,
        target.displayAvatarURL({ dynamic: true }),
        null,
        { text: footerText }
      );

      await interaction.editReply({ embeds: [historyEmbed] });

    } catch (error) {
      console.error('Error fetching sanctions history:', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la récupération de l\'historique.')]
      });
    }
  },
};
