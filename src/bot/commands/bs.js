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

          // Remove from database
          await BrawlStarsUser.destroy({ where: { userId: targetUser.id } });
          await BrawlStarsTrophyLog.destroy({ where: { userId: targetUser.id } });

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
        const bestRank = Math.max(
          existingUser?.highestRankedRank || 0,
          existingUser?.lastRankedRank || 0,
          playerData?.highestRankedRank || 0,
          playerData?.rankedRank || 0
        );

        if (playerData) {
          playerData.highestRankedRank = bestRank;
          playerData.rankedRank = bestRank;
          playerData.highestRank = bestRank;

          // Save or update user link with fresh official data
          await BrawlStarsUser.upsert({
            userId: targetUser.id,
            playerTag: cleanTag,
            playerName: playerData.name || 'Brawler',
            lastTrophies: playerData.trophies || 0,
            highestTrophies: playerData.highestTrophies || 0,
            lastRankedRank: bestRank,
            highestRankedRank: bestRank,
            lastCheckedAt: new Date(),
          });

          // Record trophy snapshot
          await brawlStarsService.recordTrophySnapshot(targetUser.id, cleanTag, playerData.trophies || 0);

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

