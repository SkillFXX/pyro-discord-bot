const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const analyticsService = require('../../services/analyticsService');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('Consulter les analyses avancées de l\'activité du serveur (messages, vocal, rôles, membres).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    
    // Subcommand: vue-d-ensemble (overview)
    .addSubcommand(subcommand =>
      subcommand
        .setName('vue-d-ensemble')
        .setDescription('Afficher un aperçu analytique global du serveur.')
        .addStringOption(option =>
          option
            .setName('periode')
            .setDescription('Période d\'analyse')
            .setRequired(false)
            .addChoices(
              { name: 'Dernières 24 heures', value: 'today' },
              { name: '7 derniers jours', value: '7d' },
              { name: '30 derniers jours', value: '30d' },
              { name: 'Tout l\'historique', value: 'all' }
            )
        )
    )

    // Subcommand: classement (leaderboard)
    .addSubcommand(subcommand =>
      subcommand
        .setName('classement')
        .setDescription('Afficher les classements d\'activité (membres, rôles, salons).')
        .addStringOption(option =>
          option
            .setName('categorie')
            .setDescription('Catégorie du classement')
            .setRequired(true)
            .addChoices(
              { name: '💬 Messages (Membres)', value: 'messages' },
              { name: '🎙️ Temps Vocal (Membres)', value: 'vocal' },
              { name: '🏷️ Rôles les plus actifs', value: 'roles' },
              { name: '💬 Salons textuels', value: 'text_channels' },
              { name: '🔊 Salons vocaux', value: 'voice_channels' }
            )
        )
        .addStringOption(option =>
          option
            .setName('periode')
            .setDescription('Période d\'analyse')
            .setRequired(false)
            .addChoices(
              { name: 'Dernières 24 heures', value: 'today' },
              { name: '7 derniers jours', value: '7d' },
              { name: '30 derniers jours', value: '30d' },
              { name: 'Tout l\'historique', value: 'all' }
            )
        )
    )

    // Subcommand: membre (user deep-dive)
    .addSubcommand(subcommand =>
      subcommand
        .setName('membre')
        .setDescription('Afficher l\'activité détaillée d\'un membre.')
        .addUserOption(option =>
          option
            .setName('utilisateur')
            .setDescription('Le membre à analyser')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('periode')
            .setDescription('Période d\'analyse')
            .setRequired(false)
            .addChoices(
              { name: 'Dernières 24 heures', value: 'today' },
              { name: '7 derniers jours', value: '7d' },
              { name: '30 derniers jours', value: '30d' },
              { name: 'Tout l\'historique', value: 'all' }
            )
        )
    ),

  async execute(interaction, client) {
    // Vérification de sécurité des permissions administrateur
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [embeds.error('Vous devez posséder la permission **Administrateur** pour accéder aux analytics.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const subcommand = interaction.options.getSubcommand();
      const periode = interaction.options.getString('periode') || '7d';
      const guild = interaction.guild;

      const periodLabels = {
        today: 'Dernières 24 heures',
        '7d': '7 derniers jours',
        '30d': '30 derniers jours',
        all: 'Tout l\'historique',
      };
      const periodLabel = periodLabels[periode] || '7 derniers jours';

      // 1. VUE D'ENSEMBLE
      if (subcommand === 'vue-d-ensemble') {
        const data = await analyticsService.getAnalytics({
          range: periode,
          guild,
        });

        const topMember = data.topMembers[0] 
          ? `<@${data.topMembers[0].userId}> (${data.topMembers[0].messagesCount} msgs)` 
          : 'Aucun';
        
        const topVoice = data.topMembers.find(m => m.voiceSeconds > 0)
          ? `<@${data.topMembers.find(m => m.voiceSeconds > 0).userId}> (${data.topMembers.find(m => m.voiceSeconds > 0).voiceFormatted})`
          : 'Aucun';

        const topTextChannel = data.topTextChannels[0]
          ? `<#${data.topTextChannels[0].channelId}> (${data.topTextChannels[0].messagesCount} msgs)`
          : 'Aucun';

        const topVoiceChannel = data.topVoiceChannels[0]
          ? `🔊 **${data.topVoiceChannels[0].channelName}** (${data.topVoiceChannels[0].voiceFormatted})`
          : 'Aucun';

        const growthSign = data.kpi.netGrowth >= 0 ? '+' : '';

        const overviewEmbed = embeds.custom(
          `📊 Analyse d'Activité • ${guild.name}`,
          `Période sélectionnée : **${periodLabel}**\n*Données synchronisées en temps réel.*`,
          embeds.COLORS.PRIMARY,
          [
            {
              name: '💬 Messages Émis',
              value: `**${data.kpi.totalMessages.toLocaleString('fr-FR')}** messages\n*Moy. ${data.kpi.avgMessageLength} caractères / msg*`,
              inline: true,
            },
            {
              name: '🎙️ Temps Vocal',
              value: `**${data.kpi.formattedVoiceTime}**\n*(${data.kpi.totalVoiceHours}h au total)*`,
              inline: true,
            },
            {
              name: '👥 Membres Actifs',
              value: `**${data.kpi.totalActiveMembers}** membre(s)`,
              inline: true,
            },
            {
              name: '📈 Flux de Membres',
              value: `**+${data.kpi.joinsCount}** / **-${data.kpi.leavesCount}**\n*(Net : ${growthSign}${data.kpi.netGrowth})*`,
              inline: true,
            },
            {
              name: '⏰ Heure de Pointe',
              value: `**${data.kpi.peakHourIndex}h00**\n*${data.kpi.peakHourText}*`,
              inline: true,
            },
            {
              name: '🏷️ Rôles Actifs',
              value: `**${data.topRoles.length}** rôle(s) impliqué(s)`,
              inline: true,
            },
            {
              name: '🥇 Top Contributeur Texte',
              value: topMember,
              inline: true,
            },
            {
              name: '🎙️ Top Contributeur Vocal',
              value: topVoice,
              inline: true,
            },
            {
              name: '💬 Top Salons',
              value: `${topTextChannel}\n${topVoiceChannel}`,
              inline: true,
            },
          ],
          guild.iconURL({ dynamic: true })
        );

        return interaction.editReply({ embeds: [overviewEmbed] });
      }

      // 2. CLASSEMENTS (TOP)
      if (subcommand === 'classement') {
        const categorie = interaction.options.getString('categorie');
        const data = await analyticsService.getAnalytics({
          range: periode,
          guild,
        });

        let title = '';
        let description = `Période : **${periodLabel}**\n\n`;

        if (categorie === 'messages') {
          title = '🏆 Classement des Membres • Messages';
          const topList = data.topMembers.slice(0, 10);
          if (topList.length === 0) {
            description += 'Aucun message enregistré pour cette période.';
          } else {
            topList.forEach((m, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              description += `${medal} <@${m.userId}> — **${m.messagesCount.toLocaleString('fr-FR')}** messages *(moy. ${m.avgMessageLength} car.)*\n`;
            });
          }
        } else if (categorie === 'vocal') {
          title = '🎙️ Classement des Membres • Temps Vocal';
          const topList = [...data.topMembers].filter(m => m.voiceSeconds > 0).sort((a, b) => b.voiceSeconds - a.voiceSeconds).slice(0, 10);
          if (topList.length === 0) {
            description += 'Aucun temps vocal enregistré pour cette période.';
          } else {
            topList.forEach((m, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              description += `${medal} <@${m.userId}> — **${m.voiceFormatted}** en vocal\n`;
            });
          }
        } else if (categorie === 'roles') {
          title = '🏷️ Rôles les Plus Actifs';
          const topList = data.topRoles.slice(0, 10);
          if (topList.length === 0) {
            description += 'Aucune activité de rôle enregistrée pour cette période.';
          } else {
            topList.forEach((r, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              description += `${medal} <@&${r.roleId}> — **${r.messagesCount.toLocaleString('fr-FR')}** msgs | **${r.voiceFormatted}** vocal *(moy. ${r.avgMessageLength} car.)*\n`;
            });
          }
        } else if (categorie === 'text_channels') {
          title = '💬 Salons Textuels les Plus Actifs';
          const topList = data.topTextChannels.slice(0, 10);
          if (topList.length === 0) {
            description += 'Aucun salon textuel actif pour cette période.';
          } else {
            topList.forEach((c, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              description += `${medal} <#${c.channelId}> — **${c.messagesCount.toLocaleString('fr-FR')}** msgs *(moy. ${c.avgMessageLength} car., ${c.uniqueUsersCount} membres)*\n`;
            });
          }
        } else if (categorie === 'voice_channels') {
          title = '🔊 Salons Vocaux les Plus Fréquentés';
          const topList = data.topVoiceChannels.slice(0, 10);
          if (topList.length === 0) {
            description += 'Aucun salon vocal actif pour cette période.';
          } else {
            topList.forEach((v, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              description += `${medal} 🔊 **${v.channelName}** — **${v.voiceFormatted}** *( ${v.sessionsCount} sessions, ${v.uniqueUsersCount} membres)*\n`;
            });
          }
        }

        const leaderboardEmbed = embeds.custom(
          title,
          description,
          embeds.COLORS.PRIMARY,
          null,
          guild.iconURL({ dynamic: true })
        );

        return interaction.editReply({ embeds: [leaderboardEmbed] });
      }

      // 3. MEMBRE (USER DEEP-DIVE)
      if (subcommand === 'membre') {
        const targetUser = interaction.options.getUser('utilisateur');
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        const data = await analyticsService.getAnalytics({
          range: periode,
          userId: targetUser.id,
          guild,
        });

        const userStats = data.topMembers.find(m => m.userId === targetUser.id) || {
          messagesCount: 0,
          voiceSeconds: 0,
          voiceFormatted: '0s',
          avgMessageLength: 0,
          avgWords: 0,
        };

        const rolesList = targetMember
          ? [...targetMember.roles.cache.values()]
              .filter(r => r.id !== guild.id)
              .map(r => `<@&${r.id}>`)
              .slice(0, 8)
              .join(' ')
          : 'Aucun';

        const favoriteTextChannel = data.topTextChannels[0] 
          ? `<#${data.topTextChannels[0].channelId}> (${data.topTextChannels[0].messagesCount} msgs)`
          : 'Aucun';

        const favoriteVoiceChannel = data.topVoiceChannels[0]
          ? `🔊 **${data.topVoiceChannels[0].channelName}** (${data.topVoiceChannels[0].voiceFormatted})`
          : 'Aucun';

        const memberEmbed = embeds.custom(
          `👤 Profil Analytique • ${targetMember?.displayName || targetUser.username}`,
          `Statistiques sur la période : **${periodLabel}**`,
          embeds.COLORS.INFO,
          [
            {
              name: '💬 Messages Envoyés',
              value: `**${userStats.messagesCount.toLocaleString('fr-FR')}** messages\n*Mots totaux : ${data.kpi.totalWords.toLocaleString('fr-FR')}*`,
              inline: true,
            },
            {
              name: '🎙️ Temps Vocal',
              value: `**${userStats.voiceFormatted}**\n*(${userStats.voiceSeconds} secondes)*`,
              inline: true,
            },
            {
              name: '📏 Longueur Moyenne',
              value: `**${userStats.avgMessageLength}** caractères\n*${userStats.avgWords} mots / msg*`,
              inline: true,
            },
            {
              name: '💬 Salon Textuel Préféré',
              value: favoriteTextChannel,
              inline: true,
            },
            {
              name: '🔊 Salon Vocal Préféré',
              value: favoriteVoiceChannel,
              inline: true,
            },
            {
              name: '⏰ Heure de Fréquentation',
              value: `**${data.kpi.peakHourIndex}h00**\n*${data.kpi.peakHourText}*`,
              inline: true,
            },
            {
              name: '🏷️ Rôles du Membre',
              value: rolesList || 'Aucun rôle',
              inline: false,
            },
          ],
          targetUser.displayAvatarURL({ dynamic: true, size: 128 })
        );

        return interaction.editReply({ embeds: [memberEmbed] });
      }

    } catch (error) {
      console.error('[Command /analytics] Error:', error);
      return interaction.editReply({
        embeds: [embeds.error('Une erreur est survenue lors de l\'analyse des données.')],
      });
    }
  },
};

