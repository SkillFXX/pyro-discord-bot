const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const musicService = require('../../services/musicService');
const { formatMs, createProgressBar } = require('../../services/musicService');
const { ConfigHelper } = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Commandes du lecteur de musique Lavalink')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Lancer une musique ou ajouter une playlist à la file d\'attente')
        .addStringOption((opt) =>
          opt
            .setName('recherche')
            .setDescription('Titre, artiste ou lien URL (YouTube, Spotify, SoundCloud...)')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('skip')
        .setDescription('Passer à la musique suivante')
        .addIntegerOption((opt) =>
          opt.setName('nombre').setDescription('Nombre de musiques à passer (défaut: 1)').setMinValue(1)
        )
    )
    .addSubcommand((sub) => sub.setName('pause').setDescription('Mettre la lecture en pause'))
    .addSubcommand((sub) => sub.setName('resume').setDescription('Reprendre la lecture de la musique'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Arrêter la musique, vider la file et déconnecter le bot'))
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('Afficher la file d\'attente actuelle')
        .addIntegerOption((opt) => opt.setName('page').setDescription('Numéro de la page').setMinValue(1))
    )
    .addSubcommand((sub) => sub.setName('nowplaying').setDescription('Afficher les informations du morceau en cours de lecture'))
    .addSubcommand((sub) =>
      sub
        .setName('volume')
        .setDescription('Régler le volume d\'écoute (1 - 100%)')
        .addIntegerOption((opt) =>
          opt.setName('niveau').setDescription('Niveau sonore en %').setRequired(true).setMinValue(1).setMaxValue(100)
        )
    )
    .addSubcommand((sub) => sub.setName('shuffle').setDescription('Mélanger aléatoirement la file d\'attente'))
    .addSubcommand((sub) =>
      sub
        .setName('loop')
        .setDescription('Activer ou désactiver la répétition')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Mode de boucle souhaité')
            .setRequired(true)
            .addChoices(
              { name: '❌ Désactivé', value: 'off' },
              { name: '🔂 Morceau actuel', value: 'track' },
              { name: '🔁 Toute la file d\'attente', value: 'queue' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Retirer un morceau précis de la file d\'attente')
        .addIntegerOption((opt) =>
          opt.setName('position').setDescription('Numéro du morceau dans la file').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) => sub.setName('clear').setDescription('Vider la file d\'attente sans couper le morceau actuel')),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.member;
    const guild = interaction.guild;
    const voiceChannel = member.voice.channel;

    // 1. Check if Music feature is enabled globally
    const isMusicEnabled = await musicService.isEnabled();
    if (!isMusicEnabled) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📻 Musique Désactivée')
            .setDescription('Le système de musique est actuellement **désactivé** sur ce serveur.\nUn administrateur peut l\'activer depuis le dashboard web.')
            .setColor('#E74C3C'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Check if Lavalink node is connected
    if (musicService.nodeStatus !== 'connected' || !musicService.manager) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ Serveur Audio Inaccessible')
            .setDescription('Le serveur de musique Lavalink n\'est pas connecté ou est injoignable.\nVeuillez vérifier la configuration Lavalink dans le dashboard ou patienter.')
            .setColor('#F1C40F'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 3. User Voice Channel verification
    if (!voiceChannel) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('❌ Vous devez être connecté dans un **salon vocal** pour utiliser les commandes de musique.')
            .setColor('#E74C3C'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 4. Voice Channel Restriction verification
    const isChannelAllowed = await musicService.isVoiceChannelAllowed(voiceChannel.id);
    if (!isChannelAllowed) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🚫 Salon Non Autorisé')
            .setDescription(`La diffusion de musique n'est pas autorisée dans le salon **${voiceChannel.name}**.\nVeuillez vous connecter dans un salon vocal dédié.`)
            .setColor('#E74C3C'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Get existing player
    let player = musicService.manager.getPlayer(guild.id);

    // If bot already playing in a DIFFERENT voice channel
    if (player && player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`❌ Le bot diffuse déjà de la musique dans <#${player.voiceChannelId}>.\nRejoignez ce salon vocal pour écouter et contrôler la musique !`)
            .setColor('#E74C3C'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // DJ Role / Permission checks for control subcommands
    const controlSubcommands = ['skip', 'pause', 'resume', 'stop', 'volume', 'shuffle', 'loop', 'remove', 'clear'];
    if (controlSubcommands.includes(subcommand)) {
      if (!player) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('❌ Aucune musique n\'est actuellement en cours de lecture.').setColor('#E74C3C')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const canControl = await musicService.canControlMusic(member);
      if (!canControl) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🔒 Contrôle Réservé')
              .setDescription('Vous n\'avez pas la permission de contrôler la musique sur ce serveur (Rôle DJ ou Administrateur requis).')
              .setColor('#E74C3C'),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // =========================================================================
    // SUBCOMMAND: PLAY
    // =========================================================================
    if (subcommand === 'play') {
      const query = interaction.options.getString('recherche');
      await interaction.deferReply();

      // Create player if not already existing
      if (!player) {
        const defaultVol = parseInt(await ConfigHelper.get('music_default_volume') || 80, 10);
        player = musicService.manager.createPlayer({
          guildId: guild.id,
          voiceChannelId: voiceChannel.id,
          textChannelId: interaction.channelId,
          selfDeaf: true,
          selfMute: false,
          volume: defaultVol,
        });
        await player.connect();
      } else if (player.voiceChannelId !== voiceChannel.id) {
        player.voiceChannelId = voiceChannel.id;
        await player.connect();
      }

      try {
        const isUrl = /^https?:\/\//i.test(query.trim());
        const searchSource = (await ConfigHelper.get('music_search_provider')) || 'ytsearch';
        let res = null;
        let usedFallback = false;

        try {
          res = await player.search(
            {
              query,
              source: searchSource,
            },
            interaction.user
          );
        } catch (searchErr) {
          const isTimeoutOrNetwork = searchErr.name === 'TimeoutError' || searchErr.message?.includes('timeout') || searchErr.message?.includes('aborted');
          // If YouTube search fails or times out, try SoundCloud as fallback
          if (!isUrl && (searchSource === 'ytsearch' || searchSource === 'ytmsearch')) {
            console.warn(`[Music] Recherche ${searchSource} échouée (${searchErr.message}), basculement automatique sur SoundCloud...`);
            try {
              res = await player.search(
                {
                  query,
                  source: 'scsearch',
                },
                interaction.user
              );
              if (res && res.tracks && res.tracks.length > 0) {
                usedFallback = true;
              }
            } catch (fallbackErr) {
              throw searchErr;
            }
          } else {
            throw searchErr;
          }
        }

        // If search returned empty or error, and we haven't tried SoundCloud yet
        if ((!res || !res.tracks || res.tracks.length === 0 || res.loadType === 'error') && !isUrl && (searchSource === 'ytsearch' || searchSource === 'ytmsearch')) {
          try {
            console.warn(`[Music] Aucun résultat avec ${searchSource}, essai SoundCloud...`);
            const scRes = await player.search(
              {
                query,
                source: 'scsearch',
              },
              interaction.user
            );
            if (scRes && scRes.tracks && scRes.tracks.length > 0 && scRes.loadType !== 'error') {
              res = scRes;
              usedFallback = true;
            }
          } catch (e) {}
        }

        if (!res || !res.tracks || res.tracks.length === 0) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setDescription(`❌ Aucun morceau trouvé pour : \`${query}\`.\n💡 *Astuce : Essayez avec le nom de l'artiste ou utilisez un lien SoundCloud/Spotify.*`)
                .setColor('#E74C3C'),
            ],
          });
        }

        if (res.loadType === 'error') {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setDescription(`❌ Une erreur est survenue lors de la recherche du titre.\n${res.exception?.message ? `\`${res.exception.message}\`` : ''}`)
                .setColor('#E74C3C'),
            ],
          });
        }

        const fallbackNote = usedFallback ? '\n\n🔄 *Recherche basculée automatiquement sur SoundCloud (YouTube bloqué sur ce serveur).*' : '';

        // Playlist loaded
        if (res.loadType === 'playlist') {
          await player.queue.add(res.tracks);
          if (!player.playing && !player.paused) {
            await player.play();
          }

          const playlistName = res.playlist?.title || res.playlist?.name || 'Playlist';
          const totalDuration = res.tracks.reduce((acc, t) => acc + (t.info.duration || t.info.length || 0), 0);

          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('📑 Playlist Ajoutée')
                .setDescription(`**[${playlistName}](${query})**\nAjout de **${res.tracks.length}** morceaux à la file d'attente.${fallbackNote}`)
                .addFields(
                  { name: '⏳ Durée Totale', value: `\`${formatMs(totalDuration)}\``, inline: true },
                  { name: '👤 Demandé par', value: `<@${interaction.user.id}>`, inline: true },
                  { name: '🔊 Salon', value: `<#${voiceChannel.id}>`, inline: true }
                )
                .setColor('#FF6B35')
                .setThumbnail(res.tracks[0]?.info?.artworkUrl || null),
            ],
          });
        }

        // Single track loaded
        const track = res.tracks[0];
        await player.queue.add(track);

        if (!player.playing && !player.paused) {
          await player.play();
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎶 Titre Lancé')
                .setDescription(`**[${track.info.title}](${track.info.uri})**\nArtiste : \`${track.info.author || 'Inconnu'}\`${fallbackNote}`)
                .addFields(
                  { name: '⏳ Durée', value: track.info.isStream ? '🔴 En direct' : `\`${formatMs(track.info.duration || track.info.length)}\``, inline: true },
                  { name: '👤 Demandé par', value: `<@${interaction.user.id}>`, inline: true },
                  { name: '🔊 Salon Vocal', value: `<#${voiceChannel.id}>`, inline: true }
                )
                .setColor('#FF6B35')
                .setThumbnail(track.info.artworkUrl || null),
            ],
          });
        } else {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('➕ Morceau Ajouté à la File')
                .setDescription(`**[${track.info.title}](${track.info.uri})**\nArtiste : \`${track.info.author || 'Inconnu'}\`${fallbackNote}`)
                .addFields(
                  { name: '🔢 Position', value: `\`#${player.queue.tracks.length}\``, inline: true },
                  { name: '⏳ Durée', value: track.info.isStream ? '🔴 En direct' : `\`${formatMs(track.info.duration || track.info.length)}\``, inline: true },
                  { name: '👤 Demandé par', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setColor('#FF6B35')
                .setThumbnail(track.info.artworkUrl || null),
            ],
          });
        }
      } catch (err) {
        console.error('[Music /play Error]:', err);
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        let errorDesc = `❌ Erreur lors du chargement : ${err.message}`;
        if (isTimeout) {
          errorDesc = `⏳ **Le serveur Lavalink a mis trop de temps à répondre (Délai d'attente dépassé).**\n\nCela se produit généralement lorsque YouTube ralentit ou bloque l'adresse IP du serveur d'hébergement.\n\n💡 **Que faire :**\n• Essayez de rechercher avec un lien **SoundCloud** ou **Spotify**.\n• Définissez **SoundCloud** comme moteur par défaut dans le Dashboard web.\n• Vérifiez l'état de votre serveur Lavalink dans le Dashboard.`;
        }
        return interaction.editReply({
          embeds: [new EmbedBuilder().setDescription(errorDesc).setColor('#E74C3C')],
        });
      }
    }

    // =========================================================================
    // SUBCOMMAND: SKIP
    // =========================================================================
    if (subcommand === 'skip') {
      const skipAmount = interaction.options.getInteger('nombre') || 1;
      const queueLength = player.queue.tracks.length;

      if (queueLength === 0) {
        await player.stopPlaying();
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('⏭️ Morceau passé. **Fin de la file d\'attente.**').setColor('#FF6B35')],
        });
      }

      if (skipAmount > 1) {
        const count = Math.min(skipAmount, queueLength);
        await player.skip(count - 1, false);
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`⏭️ **${count}** morceaux ont été passés avec succès.`).setColor('#FF6B35')],
        });
      } else {
        const skippedTrack = player.queue.current;
        await player.skip(0, false);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`⏭️ Morceau passé : **${skippedTrack ? skippedTrack.info.title : 'Titre actuel'}**`)
              .setColor('#FF6B35'),
          ],
        });
      }
    }

    // =========================================================================
    // SUBCOMMAND: PAUSE
    // =========================================================================
    if (subcommand === 'pause') {
      if (player.paused) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('ℹ️ La musique est **déjà en pause**. Utilisez `/music resume` pour reprendre.').setColor('#F1C40F')],
          flags: MessageFlags.Ephemeral,
        });
      }
      await player.pause();
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription('⏸️ **Lecture mise en pause.**').setColor('#FF6B35')],
      });
    }

    // =========================================================================
    // SUBCOMMAND: RESUME
    // =========================================================================
    if (subcommand === 'resume') {
      if (!player.paused) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('ℹ️ La musique est **déjà en cours de lecture**.').setColor('#F1C40F')],
          flags: MessageFlags.Ephemeral,
        });
      }
      await player.resume();
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription('▶️ **Lecture reprise.**').setColor('#FF6B35')],
      });
    }

    // =========================================================================
    // SUBCOMMAND: STOP
    // =========================================================================
    if (subcommand === 'stop') {
      await player.destroy('user_stopped');
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('⏹️ **Musique arrêtée, file d\'attente vidée et bot déconnecté.**')
            .setColor('#E74C3C'),
        ],
      });
    }

    // =========================================================================
    // SUBCOMMAND: VOLUME
    // =========================================================================
    if (subcommand === 'volume') {
      const volume = interaction.options.getInteger('niveau');
      await player.setVolume(volume);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`🔊 Volume de lecture ajusté à **${volume}%**.`)
            .setColor('#FF6B35'),
        ],
      });
    }

    // =========================================================================
    // SUBCOMMAND: SHUFFLE
    // =========================================================================
    if (subcommand === 'shuffle') {
      if (player.queue.tracks.length < 2) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('❌ Il faut au moins **2 morceaux** dans la file d\'attente pour la mélanger.').setColor('#E74C3C')],
          flags: MessageFlags.Ephemeral,
        });
      }
      await player.queue.shuffle();
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`🔀 **File d'attente mélangée avec succès !** (${player.queue.tracks.length} morceaux)`)
            .setColor('#FF6B35'),
        ],
      });
    }

    // =========================================================================
    // SUBCOMMAND: LOOP
    // =========================================================================
    if (subcommand === 'loop') {
      const mode = interaction.options.getString('mode');
      await player.setRepeatMode(mode);

      const labels = {
        off: '❌ Désactivé',
        track: '🔂 Morceau actuel',
        queue: '🔁 Toute la file d\'attente',
      };

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`🔁 Mode de répétition réglé sur : **${labels[mode] || mode}**`)
            .setColor('#FF6B35'),
        ],
      });
    }

    // =========================================================================
    // SUBCOMMAND: REMOVE
    // =========================================================================
    if (subcommand === 'remove') {
      const position = interaction.options.getInteger('position');
      const index = position - 1;

      if (index < 0 || index >= player.queue.tracks.length) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`❌ Position invalide. La file contient **${player.queue.tracks.length}** morceaux.`).setColor('#E74C3C')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const removed = player.queue.tracks[index];
      await player.queue.remove(index);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`🗑️ Morceau retiré de la file : **${removed.info.title}**`)
            .setColor('#FF6B35'),
        ],
      });
    }

    // =========================================================================
    // SUBCOMMAND: CLEAR
    // =========================================================================
    if (subcommand === 'clear') {
      const count = player.queue.tracks.length;
      player.queue.tracks.splice(0, player.queue.tracks.length);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`🧹 **File d'attente vidée (${count} morceaux retirés).** Le morceau en cours continue de jouer.`)
            .setColor('#FF6B35'),
        ],
      });
    }

    // =========================================================================
    // SUBCOMMAND: NOWPLAYING
    // =========================================================================
    if (subcommand === 'nowplaying') {
      const current = player.queue.current;
      if (!current) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('❌ Aucun morceau n\'est actuellement en cours de lecture.').setColor('#E74C3C')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const currentMs = player.position || 0;
      const totalMs = current.info.duration || current.info.length || 0;
      const progressBar = createProgressBar(currentMs, totalMs, 14);
      const loopLabel = player.repeatMode === 'track' ? '🔂 Morceau' : player.repeatMode === 'queue' ? '🔁 File' : 'Désactivé';

      const embed = new EmbedBuilder()
        .setTitle('🎶 Morceau en cours de lecture')
        .setDescription(`**[${current.info.title}](${current.info.uri})**\nArtiste : \`${current.info.author || 'Inconnu'}\`\n\n\`${formatMs(currentMs)}\` ${progressBar} \`${current.info.isStream ? 'LIVE' : formatMs(totalMs)}\``)
        .addFields(
          { name: '👤 Demandé par', value: current.requester ? `<@${current.requester.id || current.requester}>` : 'Inconnu', inline: true },
          { name: '🔊 Volume', value: `\`${player.volume}%\``, inline: true },
          { name: '🔁 Répétition', value: `\`${loopLabel}\``, inline: true }
        )
        .setColor('#FF6B35');

      if (current.info.artworkUrl) {
        embed.setThumbnail(current.info.artworkUrl);
      }

      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_toggle_pause').setEmoji('⏯️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [buttonsRow] });
    }

    // =========================================================================
    // SUBCOMMAND: QUEUE
    // =========================================================================
    if (subcommand === 'queue') {
      const current = player.queue.current;
      const tracks = player.queue.tracks;

      if (!current && tracks.length === 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setDescription('ℹ️ La file d\'attente est actuellement **vide**. Lancez de la musique avec `/music play` !').setColor('#888888')],
        });
      }

      const requestedPage = interaction.options.getInteger('page') || 1;
      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
      const page = Math.min(Math.max(1, requestedPage), totalPages);

      const startIndex = (page - 1) * pageSize;
      const pageTracks = tracks.slice(startIndex, startIndex + pageSize);

      let description = '';
      if (current) {
        const curDur = current.info.isStream ? '🔴 Live' : formatMs(current.info.duration || current.info.length);
        description += `**En cours de lecture :**\n🎶 [${current.info.title}](${current.info.uri}) - \`${curDur}\` (<@${current.requester?.id || current.requester}>)\n\n`;
      }

      if (tracks.length > 0) {
        description += `**À suivre :**\n`;
        description += pageTracks
          .map((t, idx) => {
            const num = startIndex + idx + 1;
            const dur = t.info.isStream ? '🔴 Live' : formatMs(t.info.duration || t.info.length);
            return `\`${num}.\` [${t.info.title}](${t.info.uri}) - \`${dur}\``;
          })
          .join('\n');
      } else {
        description += `*Aucun morceau en attente après celui-ci.*`;
      }

      const totalQueueDuration = tracks.reduce((acc, t) => acc + (t.info.duration || t.info.length || 0), 0);

      const embed = new EmbedBuilder()
        .setTitle(`📑 File d'attente • ${guild.name}`)
        .setDescription(description)
        .setFooter({ text: `Page ${page}/${totalPages} • ${tracks.length} morceau(x) en attente • Durée totale : ${formatMs(totalQueueDuration)}` })
        .setColor('#FF6B35');

      return interaction.reply({ embeds: [embed] });
    }
  },
};

