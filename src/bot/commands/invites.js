const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const inviteService = require('../../services/inviteService');
const embeds = require('../utils/embeds');
const loggerService = require('../../services/loggerService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Système de suivi des invitations du serveur.')

    // Subcommand: Top
    .addSubcommand(subcommand =>
      subcommand
        .setName('top')
        .setDescription('Afficher le classement des 10 membres ayant le plus d\'invitations.')
    )

    // Subcommand: Membre
    .addSubcommand(subcommand =>
      subcommand
        .setName('membre')
        .setDescription('Voir le nombre de membres invités par un membre.')
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('Le membre à consulter (par défaut: vous-même)')
            .setRequired(false)
        )
    )

    // Subcommand: Admin
    .addSubcommand(subcommand =>
      subcommand
        .setName('admin')
        .setDescription('Ajouter, retirer ou définir le nombre d\'invitations d\'un membre.')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action à effectuer')
            .setRequired(true)
            .addChoices(
              { name: 'Ajouter (+)', value: 'add' },
              { name: 'Retirer (-)', value: 'remove' },
              { name: 'Définir (=)', value: 'set' },
            )
        )
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('Le membre ciblé')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('montant')
            .setDescription('Le nombre d\'invitations')
            .setRequired(true)
            .setMinValue(0)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({
        embeds: [embeds.error('Cette commande ne peut être utilisée que dans un serveur.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 1. SUBCOMMAND: TOP
    if (subcommand === 'top') {
      await interaction.deferReply();

      try {
        const topList = await inviteService.getTopInviters(guild.id, 10);

        if (topList.length === 0) {
          return interaction.editReply({
            embeds: [embeds.info('Aucun membre n\'a encore enregistré d\'invitations actives sur ce serveur.')],
          });
        }

        let description = '';

        for (let i = 0; i < topList.length; i++) {
          const item = topList[i];
          let medal = `\`#${i + 1}\` `;
          if (i === 0) medal = '🥇 ';
          else if (i === 1) medal = '🥈 ';
          else if (i === 2) medal = '🥉 ';

          description += `${medal} <@${item.userId}> • **${item.total}** invitation${item.total > 1 ? 's' : ''}\n`;
        }

        const topEmbed = embeds.custom(
          '🏆 Classement des Invitations',
          description,
          embeds.COLORS.PRIMARY,
          null,
          guild.iconURL({ dynamic: true }),
          null,
          { text: `Serveur ${guild.name} • Top 10 Inviteurs` }
        );

        await interaction.editReply({ embeds: [topEmbed] });
      } catch (error) {
        console.error('[Command /invites top] Erreur :', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la récupération du classement des invitations.')],
        });
      }
      return;
    }

    // 2. SUBCOMMAND: MEMBRE
    if (subcommand === 'membre') {
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
          `Statistiques des invitations de <@${target.id}> sur **${guild.name}** :`,
          embeds.COLORS.PRIMARY,
          fields,
          target.displayAvatarURL({ dynamic: true }),
          null,
          { text: `Demandé par ${interaction.user.tag}` }
        );

        await interaction.editReply({ embeds: [userEmbed] });
      } catch (error) {
        console.error('[Command /invites membre] Erreur :', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la consultation des invitations du membre.')],
        });
      }
      return;
    }

    // 3. SUBCOMMAND: ADMIN
    if (subcommand === 'admin') {
      // Vérification permissions staff (ManageGuild ou Administrateur)
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [embeds.error('Vous devez avoir la permission **Gérer le serveur** pour exécuter cette commande.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();

      const action = interaction.options.getString('action');
      const target = interaction.options.getUser('membre');
      const amount = interaction.options.getInteger('montant');

      try {
        const result = await inviteService.adminModifyInvites(guild.id, target.id, action, amount);

        let actionDesc = '';
        if (action === 'add') {
          actionDesc = `Ajout de **+${amount}** invitation(s) pour <@${target.id}>.`;
        } else if (action === 'remove') {
          actionDesc = `Retrait de **-${amount}** invitation(s) pour <@${target.id}>.`;
        } else if (action === 'set') {
          actionDesc = `Le total des invitations de <@${target.id}> a été défini sur **${amount}**.`;
        }

        const adminEmbed = embeds.success(
          `${actionDesc}\n\n` +
          `• **Ancien total** : \`${result.oldTotal}\`\n` +
          `• **Nouveau total** : **${result.newTotal}** invitation(s)\n` +
          `• **Détails internes** : \`${result.regular}\` réelles, \`${result.bonus >= 0 ? `+${result.bonus}` : result.bonus}\` rectification staff, \`${result.leaves}\` départs`,
          '⚙️ Rectification des Invitations (Admin)'
        );

        await interaction.editReply({ embeds: [adminEmbed] });

        // Journalisation dans les logs de modération
        try {
          await loggerService.log(client, 'log_bot_moderation', {
            title: '⚙️ Modification d\'Invitations (Admin)',
            description: `<@${interaction.user.id}> a modifié les invitations de <@${target.id}>.`,
            color: '#3498DB',
            fields: [
              { name: '👤 Modérateur', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
              { name: '🎯 Membre Ciblé', value: `${target.tag} (\`${target.id}\`)`, inline: true },
              { name: '📝 Action', value: `\`${action}\` (${amount})`, inline: true },
              { name: '📊 Nouveau Total', value: `**${result.newTotal}** (Bonus: \`${result.bonus}\`)`, inline: true },
            ],
            footer: { text: `Modération Invitations • Pyro` },
          });
        } catch (logErr) {
          console.warn('[Command /invites admin] Erreur loggerService:', logErr.message);
        }
      } catch (error) {
        console.error('[Command /invites admin] Erreur :', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la mise à jour des invitations du membre.')],
        });
      }
    }
  },
};

