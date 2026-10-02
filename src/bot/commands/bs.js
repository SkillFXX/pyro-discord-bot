const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
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
        .setDescription('Lier son compte Discord à un profil Brawl Stars.')
        .addStringOption(option =>
          option
            .setName('tag')
            .setDescription('Votre tag joueur Brawl Stars (ex: #2YQ0U9P9 ou 2YQ0U9P9)')
            .setRequired(true))
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('(Admin uniquement) Lier le profil pour un autre membre')
            .setRequired(false)))

    // Subcommand: profil
    .addSubcommand(subcommand =>
      subcommand
        .setName('profil')
        .setDescription('Afficher la carte de profil complète et la grille des brawlers d\'un joueur.')
        .addUserOption(option =>
          option
            .setName('membre')
            .setDescription('Le membre dont vous souhaitez inspecter le profil Brawl Stars (défaut: vous)')
            .setRequired(false)))

    // Subcommand: graph
    .addSubcommand(subcommand =>
      subcommand
        .setName('graph')
        .setDescription('Afficher un graphique avec courbe lissée de l\'évolution des trophées jour par jour.')
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
            .setRequired(false))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const accentColor = ConfigHelper.getSync('embed_color', embeds.COLORS.PRIMARY) || '#FF6B35';

    // ==========================================
    // 1. SUBCOMMAND: LINK
    // ==========================================
    if (subcommand === 'link') {
      const inputTag = interaction.options.getString('tag');
      const targetUser = interaction.options.getUser('membre') || interaction.user;

      // Check admin permission if linking for another user
      if (targetUser.id !== interaction.user.id) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({
            embeds: [embeds.error('Vous devez disposer de la permission `Gérer le serveur` pour lier le profil d\'un autre membre.')],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const cleanTag = brawlStarsService.normalizePlayerTag(inputTag);
        const playerData = await brawlStarsService.fetchPlayerData(cleanTag);

        // Save or update user link
        await BrawlStarsUser.upsert({
          userId: targetUser.id,
          playerTag: cleanTag,
          playerName: playerData.name || 'Brawler',
          lastTrophies: playerData.trophies || 0,
          highestTrophies: playerData.highestTrophies || 0,
          lastRankedRank: playerData.highestRank || playerData.soloLeagueRank || 0,
          lastCheckedAt: new Date(),
        });

        // Record trophy snapshot
        await brawlStarsService.recordTrophySnapshot(targetUser.id, cleanTag, playerData.trophies || 0);

        // Sync guild roles based on trophies and ranked tiers
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

        const linkEmbed = embeds.custom(
          '🎮 Compte Brawl Stars Lié !',
          `Le compte Discord de ${targetUser} a été lié avec succès au joueur Brawl Stars **${playerData.name}** (\`${cleanTag}\`).\n\n` +
          `**🏆 Trophées actuels :** ${Number(playerData.trophies || 0).toLocaleString('fr-FR')}\n` +
          `**👑 Record :** ${Number(playerData.highestTrophies || 0).toLocaleString('fr-FR')}\n` +
          `**⚔️ Victoires 3v3 :** ${Number(playerData['3vs3Victories'] || 0).toLocaleString('fr-FR')}\n\n` +
          `**Gestion des Rôles :**\n${roleSummary}`,
          embeds.COLORS.SUCCESS,
          null,
          `https://cdn.brawlify.com/profile-icons/regular/${playerData.icon?.id || 28000000}.png`
        );

        return interaction.editReply({ embeds: [linkEmbed] });

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
      const targetUser = interaction.options.getUser('membre') || interaction.user;
      await interaction.deferReply();

      try {
        const linkedUser = await BrawlStarsUser.findByPk(targetUser.id);
        if (!linkedUser) {
          const isSelf = targetUser.id === interaction.user.id;
          const msg = isSelf
            ? 'Vous n\'avez pas encore lié votre compte Brawl Stars. Utilisez d\'abord la commande `/bs link <tag>`.'
            : `${targetUser} n'a pas encore lié son profil Brawl Stars sur ce serveur.`;
          return interaction.editReply({ embeds: [embeds.warning(msg)] });
        }

        // Fetch fresh player data
        const playerData = await brawlStarsService.fetchPlayerData(linkedUser.playerTag);

        // Update stored stats & snapshot
        await linkedUser.update({
          playerName: playerData.name || linkedUser.playerName,
          lastTrophies: playerData.trophies || 0,
          highestTrophies: playerData.highestTrophies || 0,
          lastCheckedAt: new Date(),
        });
        await brawlStarsService.recordTrophySnapshot(targetUser.id, linkedUser.playerTag, playerData.trophies || 0);

        // Sync member roles in background
        const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (guildMember) {
          brawlStarsService.syncUserRoles(client, guildMember, playerData).catch(() => {});
        }

        // Generate profile card canvas
        const cardBuffer = await brawlStarsService.generateProfileCard(playerData, accentColor);
        const attachment = new AttachmentBuilder(cardBuffer, { name: `brawlstars-${linkedUser.playerTag.replace('#', '')}.png` });

        const creationYear = brawlStarsService.estimateAccountCreationYear(playerData.tag || '');
        const rankedInfo = brawlStarsService.resolveRankedInfo(playerData);
        const challengeWins = brawlStarsService.resolveChallengeWins(playerData);
        const totalBrawlers = playerData.brawlers?.length || 0;

        const embed = embeds.custom(
          `🎮 Profil Brawl Stars — ${playerData.name}`,
          `**Joueur :** ${targetUser} • **Tag :** \`${playerData.tag}\`\n` +
          `📅 **Création :** Compte ${creationYear} • 🏆 **Trophées :** ${Number(playerData.trophies || 0).toLocaleString('fr-FR')} (Max: ${Number(playerData.highestTrophies || 0).toLocaleString('fr-FR')})\n` +
          `👑 **Classé :** ${rankedInfo.name} • 🎯 **Brawlers :** ${totalBrawlers} / ${brawlStarsService.TOTAL_AVAILABLE_BRAWLERS} • 🏅 **Défi :** ${challengeWins}`,
          accentColor,
          null,
          null,
          `attachment://brawlstars-${linkedUser.playerTag.replace('#', '')}.png`
        );

        return interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });

      } catch (err) {
        console.error('[Command /bs profil] Erreur :', err);
        return interaction.editReply({
          embeds: [embeds.error(err.message || 'Une erreur est survenue lors de la génération de la carte de profil.')],
        });
      }
    }

    // ==========================================
    // 3. SUBCOMMAND: GRAPH
    // ==========================================
    else if (subcommand === 'graph') {
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
          await brawlStarsService.recordTrophySnapshot(targetUser.id, linkedUser.playerTag, freshData.trophies || 0);
          linkedUser.playerName = freshData.name || linkedUser.playerName;
        } catch (_) {}

        // Query historical trophy logs
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const logs = await BrawlStarsTrophyLog.findAll({
          where: {
            userId: targetUser.id,
            recordedAt: { [Op.gte]: startDate },
          },
          order: [['recordedAt', 'ASC']],
        });

        // Generate smoothed graph canvas
        const graphBuffer = await brawlStarsService.generateTrophyGraph(
          linkedUser.playerName || targetUser.username,
          linkedUser.playerTag,
          logs,
          days,
          accentColor
        );

        const attachment = new AttachmentBuilder(graphBuffer, { name: `trophy-evolution-${linkedUser.playerTag.replace('#', '')}.png` });

        const embed = embeds.custom(
          `📈 Évolution des Trophées — ${linkedUser.playerName || targetUser.username}`,
          `Période : les **${days} derniers jours** • Tag : \`${linkedUser.playerTag}\``,
          accentColor,
          null,
          null,
          `attachment://trophy-evolution-${linkedUser.playerTag.replace('#', '')}.png`
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
  },
};
