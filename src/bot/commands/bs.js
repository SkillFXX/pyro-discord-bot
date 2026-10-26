const { 
  SlashCommandBuilder, 
  AttachmentBuilder, 
  MessageFlags, 
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const { Op } = require('sequelize');
const { BrawlStarsUser, BrawlStarsTrophyLog, ConfigHelper } = require('../../database');
const brawlStarsService = require('../../services/brawlStarsService');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bs')
    .setDescription('Commandes Brawl Stars : profil, liaison de compte et graphique d\'évolution.')

    // Subcommand: link
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('Lier son compte Discord (ou laisser le tag vide pour dissocier).')
        .addStringOption(option =>
          option
            .setName('tag')
            .setDescription('Votre tag joueur Brawl Stars (ex: #2YQ0U9P9). Laissez vide pour dissocier.')
            .setRequired(false))
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('(Admin uniquement) Membre Discord cible')
            .setRequired(false)))

    // Subcommand: profil
    .addSubcommand(subcommand =>
      subcommand
        .setName('profil')
        .setDescription('Afficher la carte de profil Brawl Stars d\'un joueur.')
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('Le membre Discord dont vous souhaitez inspecter le profil (défaut: vous)')
            .setRequired(false))
        .addStringOption(option =>
          option
            .setName('tag')
            .setDescription('Tag Brawl Stars du joueur à inspecter directement (ex: #GGUGPYJRV)')
            .setRequired(false))
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Type de carte à afficher (défaut: Trophées)')
            .setRequired(false)
            .addChoices(
              { name: '🏆 Trophées & Général', value: 'trophies' },
              { name: '🎖️ Rangs & Prestiges', value: 'ranks' },
              { name: '⭐ Maîtrise des Brawlers', value: 'mastery' },
              { name: '👑 Trophées Maximum (TR Max)', value: 'trmax' },
            )))

    // Subcommand: graph
    .addSubcommand(subcommand =>
      subcommand
        .setName('graph')
        .setDescription('Afficher un graphique d\'évolution (Trophées généraux ou Points Ranked).')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Type de graphique (Trophées généraux ou Points Ranked)')
            .setRequired(false)
            .addChoices(
              { name: '🏆 Trophées généraux', value: 'trophies' },
              { name: '🎖️ Points Ranked (Compétitif)', value: 'ranked' }
            ))
        .addIntegerOption(option =>
          option
            .setName('jours')
            .setDescription('Nombre de jours d\'historique à afficher (défaut : 30 jours)')
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(false))
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('Le membre à inspecter (défaut: vous)')
            .setRequired(false)))

    // Subcommand: top
    .addSubcommand(subcommand =>
      subcommand
        .setName('top')
        .setDescription('Afficher les classements Brawl Stars (Trophées, Ranked et Évolution de trophées de la semaine).')
        .addStringOption(option =>
          option
            .setName('categorie')
            .setDescription('Catégorie de classement à afficher (défaut : Vue d\'ensemble)')
            .setRequired(false)
            .addChoices(
              { name: '🌐 Vue d\'ensemble (Tous les tops)', value: 'overview' },
              { name: '🏆 Top Trophées', value: 'trophies' },
              { name: '🎖️ Top Ranked', value: 'ranked' },
              { name: '📈 Meilleure Évolution Trophées (Semaine)', value: 'gain_trophies' },
            ))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const accentColor = ConfigHelper.getSync('embed_color', embeds.COLORS.PRIMARY) || '#FF6B35';

    // ==========================================
    // 1. SUBCOMMAND: LINK (ou UNLINK si tag vide)
    // ==========================================
    if (subcommand === 'link') {
      const inputTag = interaction.options.getString('tag');
      const targetUser = interaction.options.getUser('membre') || interaction.user;

      // Check admin permission if linking or unlinking for another user
      if (targetUser.id !== interaction.user.id) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({
            embeds: [embeds.error('Vous devez disposer de la permission `Gérer le serveur` pour gérer le profil d\'un autre membre.')],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Si le tag n'est pas renseigné, on dissocie (unlink)
      if (!inputTag || !inputTag.trim()) {
        try {
          const linkedUser = await BrawlStarsUser.findByPk(targetUser.id);
          if (!linkedUser) {
            const isSelf = targetUser.id === interaction.user.id;
            const msg = isSelf
              ? 'Vous n\'avez aucun compte Brawl Stars lié actuellement.'
              : `${targetUser} n'a aucun compte Brawl Stars lié.`;
            return interaction.editReply({ embeds: [embeds.warning(msg)] });
          }

          const tag = linkedUser.playerTag;

          // Remove account link from database
          await BrawlStarsUser.destroy({ where: { userId: targetUser.id } });

          // Clean up managed Brawl Stars roles from member
          const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (guildMember) {
            await brawlStarsService.syncUserRoles(client, guildMember, {
              trophies: 0,
              highestTrophies: 0,
              rankedRank: 0,
              highestRankedRank: 0,
            });
          }

          const isSelf = targetUser.id === interaction.user.id;
          const desc = isSelf
            ? `Votre compte Discord a bien été dissocié du profil Brawl Stars (\`${tag}\`). Les rôles associés ont été retirés.`
            : `Le compte Brawl Stars (\`${tag}\`) de ${targetUser} a bien été dissocié. Les rôles associés ont été retirés.`;

          const embed = embeds.custom(
            '🔓 Compte Brawl Stars Dissocié',
            desc,
            embeds.COLORS.SUCCESS
          );

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          console.error('[Command /bs link (unlink)] Erreur :', err);
          return interaction.editReply({
            embeds: [embeds.error(err.message || 'Erreur lors de la dissociation du compte.')],
          });
        }
      }

      try {
        const cleanTag = brawlStarsService.normalizePlayerTag(inputTag);
        let playerData = null;

        try {
          playerData = await brawlStarsService.fetchPlayerData(cleanTag);
        } catch (apiErr) {
          // If official API throws 403 or missing key, verify tag existence via SpotLight CDN
          const isValidViaSpotlight = await brawlStarsService.validatePlayerTagViaSpotlight(cleanTag);
          if (!isValidViaSpotlight) {
            throw apiErr;
          }
        }

        const existingUser = await BrawlStarsUser.findByPk(targetUser.id);
        const bestRank = playerData?.highestRankedRank ?? existingUser?.highestRankedRank ?? 0;

        if (playerData) {
          playerData.highestRankedRank = bestRank;
          playerData.rankedRank = bestRank;
          playerData.highestRank = bestRank;

          const currentWeek = brawlStarsService.getIsoWeekKey();
          const trophies = playerData.trophies || 0;
          const isSameWeek = existingUser?.weekKey === currentWeek;

          // Save or update user link with fresh official data.
          // If newly linking mid-week, initialize weekly baseline at current trophies/ranked so weekly gain starts at 0.
          await BrawlStarsUser.upsert({
            userId: targetUser.id,
            playerTag: cleanTag,
            playerName: playerData.name || 'Brawler',
            lastTrophies: trophies,
            highestTrophies: playerData.highestTrophies || 0,
            lastRankedRank: bestRank,
            highestRankedRank: bestRank,
            weekKey: currentWeek,
            weekStartTrophies: isSameWeek ? (existingUser.weekStartTrophies ?? trophies) : trophies,
            weekStartRankedRank: isSameWeek ? (existingUser.weekStartRankedRank ?? bestRank) : bestRank,
            weeklyTrophyGain: isSameWeek ? (trophies - (existingUser.weekStartTrophies ?? trophies)) : 0,
            weeklyRankedGain: isSameWeek ? (bestRank - (existingUser.weekStartRankedRank ?? bestRank)) : 0,
            lastCheckedAt: new Date(),
          });

          // Record trophy & ranked snapshot
          await brawlStarsService.recordTrophySnapshot(targetUser.id, cleanTag, trophies, bestRank);

          // Sync guild roles based on trophies and peak ranked tiers
          const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          let roleSummary = 'Aucun nouveau rôle attribué.';

          if (guildMember) {
            const syncResult = await brawlStarsService.syncUserRoles(client, guildMember, playerData);
            if (syncResult.added.length > 0 || syncResult.removed.length > 0) {
              const parts = [];
              if (syncResult.added.length > 0) parts.push(`➕ Rôles obtenus : **${syncResult.added.join(', ')}**`);
              if (syncResult.removed.length > 0) parts.push(`➖ Rôles retirés : **${syncResult.removed.join(', ')}**`);
              roleSummary = parts.join('\n');
            }
          }

          const rankTierObj = brawlStarsService.RANKED_TIERS.find(t => t.id === bestRank);
          const rankLabel = rankTierObj ? rankTierObj.name : (bestRank > 0 ? `Rang ${bestRank}` : 'Non classé');

          const linkEmbed = embeds.custom(
            '🎮 Compte Brawl Stars Lié !',
            `Le compte Discord de ${targetUser} a été lié avec succès au joueur Brawl Stars **${playerData.name}** (\`${cleanTag}\`).\n\n` +
            `**🏆 Trophées actuels :** ${Number(playerData.trophies || 0).toLocaleString('fr-FR')}\n` +
            `**👑 Record de trophées :** ${Number(playerData.highestTrophies || 0).toLocaleString('fr-FR')}\n` +
            `**🎖️ Meilleur rang Ranked :** ${rankLabel}\n` +
            `**⚔️ Victoires 3v3 :** ${Number(playerData['3vs3Victories'] || 0).toLocaleString('fr-FR')}\n\n` +
            `**Gestion des Rôles :**\n${roleSummary}`,
            embeds.COLORS.SUCCESS,
            null,
            `https://cdn.brawlify.com/profile-icons/regular/${playerData.icon?.id || 28000000}.png`
          );

          return interaction.editReply({ embeds: [linkEmbed] });
        } else {
          // Linked via fallback (Tag validated via SpotLight)
          await BrawlStarsUser.upsert({
            userId: targetUser.id,
            playerTag: cleanTag,
            playerName: 'Brawler',
            lastTrophies: 0,
            highestTrophies: 0,
            lastRankedRank: bestRank,
            highestRankedRank: bestRank,
            lastCheckedAt: new Date(),
          });

          const linkEmbed = embeds.custom(
            '🎮 Compte Brawl Stars Lié !',
            `Le compte Discord de ${targetUser} a été lié avec succès au tag joueur \`${cleanTag}\`.\n\n` +
            `🌟 **Profils opérationnels :** Vous pouvez dès à présent afficher votre carte avec la commande \`/bs profil\` !\n\n` +
            `ℹ️ **Note pour les rôles automatiques & graphiques :**\n` +
            `Pour activer la synchronisation automatique des rôles sur le serveur, ajoutez l'adresse IP du serveur (**193.51.159.240**) dans les paramètres de votre clé d'API sur https://developer.brawlstars.com/.`,
            embeds.COLORS.SUCCESS
          );

          return interaction.editReply({ embeds: [linkEmbed] });
        }

      } catch (err) {
        console.error('[Command /bs link] Erreur :', err);
        return interaction.editReply({
          embeds: [embeds.error(err.message || 'Impossible de vérifier le profil Brawl Stars.')],
        });
      }
    }

    // ==========================================
    // 2. SUBCOMMAND: PROFIL
    // ==========================================
    else if (subcommand === 'profil') {
      const explicitTag = interaction.options.getString('tag');
      const targetUser = interaction.options.getUser('membre') || interaction.user;
      const cardType = interaction.options.getString('type') || 'trophies';

      await interaction.deferReply();

      try {
        let playerTag = null;

        if (explicitTag) {
          playerTag = brawlStarsService.normalizePlayerTag(explicitTag);
        } else {
          const linkedUser = await BrawlStarsUser.findByPk(targetUser.id);
          if (!linkedUser) {
            const isSelf = targetUser.id === interaction.user.id;
            const msg = isSelf
              ? 'Vous n\'avez pas encore lié votre compte Brawl Stars. Utilisez `/bs link <tag>` ou spécifiez directement votre tag avec `/bs profil tag:<tag>`.'
              : `${targetUser} n'a pas encore lié son profil Brawl Stars sur ce serveur. Vous pouvez utiliser \`/bs profil tag:<tag>\`.`;
            return interaction.editReply({ embeds: [embeds.warning(msg)] });
          }
          playerTag = linkedUser.playerTag;
        }

        const cardBuffer = await brawlStarsService.fetchSpotlightCard(playerTag, cardType);
        const cleanTag = playerTag.replace('#', '');
        const filename = `spotlight-${cleanTag}-${cardType}.png`;
        const attachment = new AttachmentBuilder(cardBuffer, { name: filename });

        const typeTitles = {
          trophies: 'Trophées & Général',
          ranks: 'Rangs & Prestiges',
          mastery: 'Maîtrise des Brawlers',
          trmax: 'Trophées Maximum (TR Max)',
        };
        const titleType = typeTitles[cardType] || 'Profil';

        const embed = embeds.custom(
          `🎮 Brawl Stars — ${titleType}`,
          `**Joueur :** ${explicitTag ? `\`${playerTag}\`` : targetUser} • **Tag :** \`${playerTag}\``,
          accentColor,
          null,
          null,
          `attachment://${filename}`
        );

        return interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });

      } catch (err) {
        console.error('[Command /bs profil] Erreur :', err);
        return interaction.editReply({
          embeds: [embeds.error(err.message || 'Une erreur est survenue lors de la récupération de la carte de profil.')],
        });
      }
    }

    // ==========================================
    // 3. SUBCOMMAND: GRAPH
    // ==========================================
    else if (subcommand === 'graph') {
      const graphType = interaction.options.getString('type') || 'trophies';
      const targetUser = interaction.options.getUser('membre') || interaction.user;
      const days = interaction.options.getInteger('jours') || 30;

      await interaction.deferReply();

      try {
        const linkedUser = await BrawlStarsUser.findByPk(targetUser.id);
        if (!linkedUser) {
          const isSelf = targetUser.id === interaction.user.id;
          const msg = isSelf
            ? 'Vous n\'avez pas encore lié votre compte Brawl Stars. Utilisez d\'abord la commande `/bs link <tag>`.'
            : `${targetUser} n'a pas encore lié son profil Brawl Stars.`;
          return interaction.editReply({ embeds: [embeds.warning(msg)] });
        }

        // Fetch fresh player data to ensure current point is fresh
        try {
          const freshData = await brawlStarsService.fetchPlayerData(linkedUser.playerTag);
          const currentRankedPoints = freshData.currentRankedPoints || 0;
          const freshRank = freshData.highestRankedRank ?? linkedUser.highestRankedRank ?? 0;
          await brawlStarsService.recordTrophySnapshot(targetUser.id, linkedUser.playerTag, freshData.trophies || 0, freshRank, currentRankedPoints);
          await brawlStarsService.updateUserWeeklyStats(linkedUser, freshData.trophies || 0, freshRank);
          linkedUser.playerName = freshData.name || linkedUser.playerName;
        } catch (_) {}

        // Query historical trophy logs
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const logs = await BrawlStarsTrophyLog.findAll({
          where: {
            userId: targetUser.id,
            playerTag: linkedUser.playerTag,
            recordedAt: { [Op.gte]: startDate },
          },
          order: [['recordedAt', 'ASC']],
        });

        // Query the most recent baseline snapshot before startDate to know starting trophies/ranked points
        const baselineLog = await BrawlStarsTrophyLog.findOne({
          where: {
            userId: targetUser.id,
            playerTag: linkedUser.playerTag,
            recordedAt: { [Op.lt]: startDate },
          },
          order: [['recordedAt', 'DESC']],
        });

        if (baselineLog) {
          logs.unshift({
            trophies: baselineLog.trophies,
            rankedPoints: baselineLog.rankedPoints || 0,
            recordedAt: startDate,
          });
        }

        // Generate smoothed graph canvas (Trophies or Ranked)
        const isRanked = graphType === 'ranked';
        const graphBuffer = isRanked
          ? await brawlStarsService.generateRankedGraph(
              linkedUser.playerName || targetUser.username,
              linkedUser.playerTag,
              logs,
              days
            )
          : await brawlStarsService.generateTrophyGraph(
              linkedUser.playerName || targetUser.username,
              linkedUser.playerTag,
              logs,
              days,
              accentColor
            );

        let periodDesc = `les **${days} derniers jours**`;
        if (logs.length > 0) {
          const firstDate = new Date(logs[0].recordedAt);
          const daysDiff = Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / (24 * 60 * 60 * 1000)));
          if (daysDiff < days) {
            periodDesc = daysDiff === 1 ? `**aujourd'hui**` : `les **${daysDiff} derniers jours**`;
          }
        }

        const filePrefix = isRanked ? 'ranked-evolution' : 'trophy-evolution';
        const filename = `${filePrefix}-${linkedUser.playerTag.replace('#', '')}.png`;
        const attachment = new AttachmentBuilder(graphBuffer, { name: filename });

        const embedTitle = isRanked
          ? `🎖️ Évolution des Points Ranked — ${linkedUser.playerName || targetUser.username}`
          : `📈 Évolution des Trophées — ${linkedUser.playerName || targetUser.username}`;

        const embedColor = isRanked ? '#A855F7' : accentColor;

        const embed = embeds.custom(
          embedTitle,
          `Période : ${periodDesc} • Tag : \`${linkedUser.playerTag}\``,
          embedColor,
          null,
          null,
          `attachment://${filename}`
        );

        return interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });

      } catch (err) {
        console.error('[Command /bs graph] Erreur :', err);
        return interaction.editReply({
          embeds: [embeds.error(err.message || 'Une erreur est survenue lors de la génération du graphique d\'évolution.')],
        });
      }
    }

    // ==========================================
    // 4. SUBCOMMAND: TOP
    // ==========================================
    else if (subcommand === 'top') {
      const initialCategory = interaction.options.getString('categorie') || 'overview';
      await interaction.deferReply();

      try {
        const leaderboards = await brawlStarsService.getLeaderboards(interaction.guild);
        const trophyGrowthRoleId = await ConfigHelper.get('brawlstars_top_trophies_growth_role_id');
        const activeWinnerId = await ConfigHelper.get('brawlstars_trophy_growth_winner_user_id');
        const activeWinnerGain = parseInt(await ConfigHelper.get('brawlstars_trophy_growth_winner_gain', '0'), 10) || 0;
        const activeWinnerWeek = await ConfigHelper.get('brawlstars_trophy_growth_winner_from_week');

        if (!leaderboards || leaderboards.totalPlayers === 0) {
          const emptyEmbed = embeds.custom(
            '🏆 Classement Brawl Stars',
            'Aucun membre de ce serveur n\'a encore lié son compte Brawl Stars.\n\n' +
            '👉 Utilisez la commande `/bs link <votre_tag>` pour lier votre profil et participer aux classements du serveur !',
            accentColor
          );
          return interaction.editReply({ embeds: [emptyEmbed] });
        }

        const medals = ['🥇', '🥈', '🥉'];
        const formatRankNum = (idx) => medals[idx] || `**#${idx + 1}**`;
        const getRankLabel = (tierId) => {
          const tier = brawlStarsService.RANKED_TIERS.find(t => t.id === tierId);
          return tier ? tier.name : (tierId > 0 ? `Rang ${tierId}` : 'Non classé');
        };

        const renderEmbed = (category) => {
          let embed;

          if (category === 'trophies') {
            const list = leaderboards.topTrophies.slice(0, 10);
            const lines = list.map((p, idx) => {
              return `${formatRankNum(idx)} <@${p.userId}> (**${p.playerName}**) • \`${p.playerTag}\`\n┗ **${p.trophies.toLocaleString('fr-FR')}** 🏆`;
            });
            embed = embeds.custom(
              '🏆 Classement : Top Trophées',
              `Top des joueurs les plus hauts en trophées sur le serveur (${leaderboards.totalPlayers} joueurs liés) :\n\n` +
              lines.join('\n\n'),
              '#F59E0B'
            );
          } else if (category === 'ranked') {
            const list = leaderboards.topRanked.slice(0, 10);
            const lines = list.map((p, idx) => {
              const peakLabel = p.highestRankedRank > p.rankedRank ? ` *(Record: ${getRankLabel(p.highestRankedRank)})*` : '';
              return `${formatRankNum(idx)} <@${p.userId}> (**${p.playerName}**) • \`${p.playerTag}\`\n┗ Rang : **${getRankLabel(p.rankedRank)}**${peakLabel} • ${p.trophies.toLocaleString('fr-FR')} 🏆`;
            });
            embed = embeds.custom(
              '🎖️ Classement : Top Ranked',
              `Top des joueurs les plus hauts en Ranked (Power League) sur le serveur :\n\n` +
              lines.join('\n\n'),
              '#A855F7'
            );
          } else if (category === 'gain_trophies') {
            const list = leaderboards.topTrophyGain.slice(0, 10);
            const roleMention = trophyGrowthRoleId ? `<@&${trophyGrowthRoleId}>` : null;
            const winnerBadge = (activeWinnerId && roleMention)
              ? `👑 **Détenteur du rôle cette semaine (${roleMention}) :** <@${activeWinnerId}> *(+${activeWinnerGain.toLocaleString('fr-FR')} 🏆 en semaine ${activeWinnerWeek || 'passée'})*\n\n`
              : '';

            const lines = list.map((p, idx) => {
              const gainSign = p.weeklyTrophyGain > 0 ? '+' : '';
              const gainFormatted = `${gainSign}${p.weeklyTrophyGain.toLocaleString('fr-FR')} 🏆`;
              const isLeader = idx === 0 && p.weeklyTrophyGain > 0;
              const leaderBadge = isLeader ? ' 🏃 *(Leader provisoire)*' : '';
              return `${formatRankNum(idx)} <@${p.userId}> (**${p.playerName}**) : **${gainFormatted}**${leaderBadge}\n┗ Début semaine : *${p.weekStartTrophies.toLocaleString('fr-FR')}* ➔ Actuel : **${p.trophies.toLocaleString('fr-FR')}** 🏆`;
            });

            embed = embeds.custom(
              '📈 Course à l\'Évolution Trophées (Semaine en cours)',
              `${winnerBadge}**Course en cours (${leaderboards.weekKey}) :**\n` +
              `*Le joueur à la 1ère place ce dimanche soir à 23h59 remportera le rôle ${roleMention || 'exclusif'} pour toute la semaine prochaine !*\n\n` +
              lines.join('\n\n'),
              '#10B981'
            );
          } else {
            // Overview (Global)
            const top3Trophies = leaderboards.topTrophies.slice(0, 3).map((p, idx) => 
              `${formatRankNum(idx)} <@${p.userId}> (**${p.playerName}**) — **${p.trophies.toLocaleString('fr-FR')}** 🏆`
            ).join('\n') || '*Aucun joueur*';

            const top3Ranked = leaderboards.topRanked.slice(0, 3).map((p, idx) => 
              `${formatRankNum(idx)} <@${p.userId}> (**${p.playerName}**) — **${getRankLabel(p.rankedRank)}**`
            ).join('\n') || '*Aucun joueur*';

            const top3TrophyGain = leaderboards.topTrophyGain.slice(0, 3).map((p, idx) => {
              const sign = p.weeklyTrophyGain > 0 ? '+' : '';
              const leaderMark = idx === 0 && p.weeklyTrophyGain > 0 ? ' 🏃 *(Leader)*' : '';
              return `${formatRankNum(idx)} <@${p.userId}> (**${p.playerName}**) — **${sign}${p.weeklyTrophyGain.toLocaleString('fr-FR')}** 🏆${leaderMark}`;
            }).join('\n') || '*Aucune progression*';

            const winnerSummary = (activeWinnerId && trophyGrowthRoleId)
              ? `\n👑 Rôle détenu cette semaine par <@${activeWinnerId}>`
              : '';

            embed = embeds.custom(
              '🎮 Classements Brawl Stars — Vue d\'ensemble',
              `Statistiques globales et progressions de la semaine (**${leaderboards.weekKey}**) :\n\n` +
              `🏆 **Top 3 Trophées**\n${top3Trophies}\n\n` +
              `🎖️ **Top 3 Ranked**\n${top3Ranked}\n\n` +
              `📈 **Course Évolution Trophées (Semaine)**${winnerSummary}\n${top3TrophyGain}`,
              accentColor
            );
          }

          embed.setFooter({
            text: `Semaine ${leaderboards.weekKey} • ${leaderboards.totalPlayers} joueurs liés • Cliquez sur les boutons pour explorer`,
          });
          return embed;
        };

        const buildActionRow = (currentCat) => {
          return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('bs_top_overview')
              .setLabel('Vue Globale')
              .setEmoji('🌐')
              .setStyle(currentCat === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('bs_top_trophies')
              .setLabel('Trophées')
              .setEmoji('🏆')
              .setStyle(currentCat === 'trophies' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('bs_top_ranked')
              .setLabel('Ranked')
              .setEmoji('🎖️')
              .setStyle(currentCat === 'ranked' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('bs_top_gain_trophies')
              .setLabel('Évol. Trophées')
              .setEmoji('📈')
              .setStyle(currentCat === 'gain_trophies' ? ButtonStyle.Primary : ButtonStyle.Secondary),
          );
        };

        let currentCategory = initialCategory;
        const reply = await interaction.editReply({
          embeds: [renderEmbed(currentCategory)],
          components: [buildActionRow(currentCategory)],
        });

        // Interactive collector for category navigation buttons
        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 300_000, // 5 minutes
        });

        collector.on('collect', async (btnInt) => {
          const mapping = {
            bs_top_overview: 'overview',
            bs_top_trophies: 'trophies',
            bs_top_ranked: 'ranked',
            bs_top_gain_trophies: 'gain_trophies',
          };
          const nextCategory = mapping[btnInt.customId];
          if (nextCategory) {
            currentCategory = nextCategory;
            await btnInt.update({
              embeds: [renderEmbed(currentCategory)],
              components: [buildActionRow(currentCategory)],
            }).catch(() => {});
          }
        });

        collector.on('end', async () => {
          const disabledRow = buildActionRow(currentCategory);
          disabledRow.components.forEach(btn => btn.setDisabled(true));
          await reply.edit({ components: [disabledRow] }).catch(() => {});
        });

      } catch (err) {
        console.error('[Command /bs top] Erreur :', err);
        return interaction.editReply({
          embeds: [embeds.error(err.message || 'Une erreur est survenue lors de la récupération des classements.')],
        });
      }
    }
  },
};

