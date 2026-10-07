const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const inviteService = require('../../services/inviteService');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Voir le nombre de membres invités par un membre.')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à consulter (par défaut: vous-même)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({
        embeds: [embeds.error('Cette commande ne peut être utilisée que dans un serveur.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      const target = interaction.options.getUser('membre') || interaction.user;
      const stats = await inviteService.getUserStats(guild.id, target.id);
      const origin = await inviteService.getMemberOrigin(guild.id, target.id);

      let originFieldText = '❓ Inconnu / Non enregistré';
      if (origin) {
        if (origin.inviterId) {
          originFieldText = `<@${origin.inviterId}> (Code : \`${origin.inviteCode || 'N/A'}\`)`;
        } else if (origin.isVanity) {
          originFieldText = '🔗 URL Personnalisée (Vanity)';
        }
      }

      const fields = [
        {
          name: '🎯 Total d\'invitations',
          value: `**${stats.total}** invitation${stats.total > 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: '📥 Rejoints',
          value: `\`${stats.regular}\``,
          inline: true,
        },
        {
          name: '📤 Départs',
          value: `\`${stats.leaves}\``,
          inline: true,
        },
        {
          name: '🔗 Rejoint grâce à',
          value: originFieldText,
          inline: false,
        },
      ];

      const userEmbed = embeds.custom(
        `📨 Invitations • ${target.displayName || target.username}`,
        `Statistiques détaillées des invitations de <@${target.id}> sur **${guild.name}** :`,
        embeds.COLORS.PRIMARY,
        fields,
        target.displayAvatarURL({ dynamic: true }),
        null,
        { text: `Demandé par ${interaction.user.tag}` }
      );

      await interaction.editReply({ embeds: [userEmbed] });
    } catch (error) {
      console.error('[Command /invite] Erreur :', error);
      await interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de la consultation des invitations du membre.')],
      });
    }
  },
};

