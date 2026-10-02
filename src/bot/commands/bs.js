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
            .setName('style')
            .setDescription('Style de la carte : Spotlight (complet) ou Canvas Pyro')
            .setRequired(false)
            .addChoices(
              { name: '🌟 Spotlight (Winstreak, Gloire, Rangs, Prestiges)', value: 'spotlight' },
              { name: '🎨 Pyro Bot (Canvas HD personnalisé)', value: 'custom' },
            ))
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Type de carte Spotlight (défaut: Trophées)')
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

        if (playerData) {
          // Save or update user link with fresh official data
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
        } else {
          // Linked via fallback (Tag validated via SpotLight)
          await BrawlStarsUser.upsert({
            userId: targetUser.id,
            playerTag: cleanTag,
            playerName: 'Brawler',
            lastTrophies: 0,
            highestTrophies: 0,
            lastRankedRank: 0,
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
      const style = interaction.options.getString('style') || 'spotlight';
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

        // --- OPTION A : CARTE SPOTLIGHT (Recommandée : Winstreak, Gloire, Date 2023, Score...) ---
        if (style === 'spotlight') {
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
            `**Joueur :** ${explicitTag ? `\`${playerTag}\`` : targetUser} • **Tag :** \`${playerTag}\`\n` +
            `*Données complètes via SpotLight (Winstreak, Gloire, Prestiges). Pour la carte Pyro HD, ajoutez l'option \`style: Pyro Bot\`.*`,
            accentColor,
            null,
            null,
            `attachment://${filename}`
          );

          return interaction.editReply({
            embeds: [embed],
            files: [attachment],
          });
        }

        // --- OPTION B : CARTE CANVAS LOCALE PYRO BOT ---
        const playerData = await brawlStarsService.fetchPlayerData(playerTag);

        // Update stored stats & snapshot if applicable
        const linkedUser = await BrawlStarsUser.findByPk(targetUser.id);
        if (linkedUser && linkedUser.playerTag === playerTag) {
          await linkedUser.update({
            playerName: playerData.name || linkedUser.playerName,
            lastTrophies: playerData.trophies || 0,
            highestTrophies: playerData.highestTrophies || 0,
            lastCheckedAt: new Date(),
          });
          await brawlStarsService.recordTrophySnapshot(targetUser.id, linkedUser.playerTag, playerData.trophies || 0);

          const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (guildMember) {
            brawlStarsService.syncUserRoles(client, guildMember, playerData).catch(() => {});
          }
        }

        // Generate custom profile card canvas
        const cardBuffer = await brawlStarsService.generateProfileCard(playerData, accentColor);
        const attachment = new AttachmentBuilder(cardBuffer, { name: `brawlstars-${playerTag.replace('#', '')}.png` });

        const creationYear = brawlStarsService.estimateAccountCreationYear(playerData.tag || '');
        const rankedInfo = brawlStarsService.resolveRankedInfo(playerData);
        const challengeWins = brawlStarsService.resolveChallengeWins(playerData);
        const totalBrawlers = playerData.brawlers?.length || 0;

        const embed = embeds.custom(
          `🎮 Profil Brawl Stars — ${playerData.name}`,
          `**Joueur :** ${explicitTag ? `\`${playerTag}\`` : targetUser} • **Tag :** \`${playerData.tag}\`\n` +
          `📅 **Création :** Compte ${creationYear} • 🏆 **Trophées :** ${Number(playerData.trophies || 0).toLocaleString('fr-FR')} (Max: ${Number(playerData.highestTrophies || 0).toLocaleString('fr-FR')})\n` +
          `👑 **Classé :** ${rankedInfo.name} • 🎯 **Brawlers :** ${totalBrawlers} / ${brawlStarsService.TOTAL_AVAILABLE_BRAWLERS} • 🏅 **Défi :** ${challengeWins}`,
          accentColor,
          null,
          null,
          `attachment://brawlstars-${playerTag.replace('#', '')}.png`
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
