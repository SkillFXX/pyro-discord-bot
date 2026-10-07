const { LavalinkManager } = require('lavalink-client');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { ConfigHelper } = require('../database');
const embeds = require('../bot/utils/embeds');

function formatMs(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createProgressBar(currentMs, totalMs, size = 14) {
  if (!totalMs || totalMs <= 0) return '🔘' + '▬'.repeat(size);
  const progress = Math.min(Math.max(currentMs / totalMs, 0), 1);
  const progressIndex = Math.min(Math.round(progress * size), size);
  let bar = '';
  for (let i = 0; i <= size; i++) {
    if (i === progressIndex) {
      bar += '🔘';
    } else {
      bar += '▬';
    }
  }
  return bar;
}

class MusicService {
  constructor() {
    this.client = null;
    this.manager = null;
    this.nodeStatus = 'disabled'; // 'connected' | 'connecting' | 'disconnected' | 'disabled' | 'error'
    this.lastError = null;
    this.nodeInfo = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the music service with the Discord Client.
   * Safe initialization: will not crash if Lavalink is offline or credentials invalid.
   */
  async init(client) {
    this.client = client;
    this.isInitialized = true;
    await this.reconfigure(client);
  }

  /**
   * Reconfigures Lavalink manager from current database settings.
   */
  async reconfigure(client) {
    if (!this.client && client) {
      this.client = client;
    }
    const targetClient = this.client;
    if (!targetClient) return;

    const enabled = (await ConfigHelper.get('music_enabled')) ?? false;

    // If disabled, cleanly tear down any existing manager
    if (!enabled) {
      this.nodeStatus = 'disabled';
      this.lastError = null;
      if (this.manager) {
        try {
          for (const player of this.manager.players.values()) {
            player.destroy('music_disabled').catch(() => {});
          }
          this.manager.nodeManager.nodes.clear();
        } catch (e) {}
        this.manager = null;
        targetClient.lavalink = null;
      }
      return;
    }

    const host = (await ConfigHelper.get('music_lavalink_host')) || 'localhost';
    const port = parseInt(await ConfigHelper.get('music_lavalink_port') || 2333, 10);
    const pass = (await ConfigHelper.get('music_lavalink_pass')) || 'youshallnotpass';
    const secure = (await ConfigHelper.get('music_lavalink_secure')) ?? false;
    const defaultSearchPlatform = (await ConfigHelper.get('music_search_provider')) || 'ytsearch';

    // Destroy old manager players if reconfiguring
    if (this.manager) {
      try {
        for (const player of this.manager.players.values()) {
          player.destroy('music_reconfigured').catch(() => {});
        }
        this.manager.nodeManager.nodes.clear();
      } catch (e) {}
    }

    this.nodeStatus = 'connecting';
    this.lastError = null;

    try {
      this.manager = new LavalinkManager({
        nodes: [
          {
            id: 'pyro-main-node',
            host,
            port,
            authorization: pass,
            secure,
            retryAmount: 10,
            retryDelay: 8000,
          },
        ],
        sendToShard: (guildId, payload) => {
          const guild = targetClient.guilds.cache.get(guildId);
          if (guild) {
            guild.shard.send(payload);
          }
        },
        client: {
          id: targetClient.user.id,
          username: targetClient.user.username,
        },
        autoSkip: true,
        playerOptions: {
          clientBasedPositionUpdateInterval: 250,
          defaultSearchPlatform,
          onEmptyQueue: {
            destroyAfterMs: 30000,
          },
        },
      });

      targetClient.lavalink = this.manager;
      this.setupEvents();
      await this.manager.init(targetClient.user);
    } catch (err) {
      console.error('[Music] Erreur d\'initialisation Lavalink :', err.message);
      this.nodeStatus = 'error';
      this.lastError = err.message;
    }
  }

  setupEvents() {
    if (!this.manager) return;

    // Node Lifecycle Events
    this.manager.nodeManager.on('connect', (node) => {
      this.nodeStatus = 'connected';
      this.lastError = null;
      this.nodeInfo = {
        host: node.options.host,
        port: node.options.port,
        secure: node.options.secure,
      };
      console.log(`[Music] Nœud Lavalink connecté avec succès : ${node.options.host}:${node.options.port}`);
    });

    this.manager.nodeManager.on('disconnect', (node, reason) => {
      this.nodeStatus = 'disconnected';
      console.warn(`[Music] Nœud Lavalink déconnecté : ${reason?.message || reason || 'Inconnu'}`);
    });

    this.manager.nodeManager.on('error', (node, error) => {
      this.nodeStatus = 'error';
      this.lastError = error.message;
      console.warn(`[Music] Erreur sur le nœud Lavalink (${node.options.host}) :`, error.message);
    });

    this.manager.nodeManager.on('reconnecting', (node) => {
      this.nodeStatus = 'connecting';
    });

    // Track Events
    this.manager.on('trackStart', async (player, track) => {
      try {
        const textChannel = this.client.channels.cache.get(player.textChannelId);
        if (!textChannel) return;

        const durationStr = track.info.isStream ? '🔴 En direct' : formatMs(track.info.duration || track.info.length);
        const requesterTag = track.requester?.id
          ? `<@${track.requester.id}>`
          : track.requester?.username
          ? `@${track.requester.username}`
          : 'Membre';

        const embed = new EmbedBuilder()
          .setTitle('🎶 En cours de lecture')
          .setDescription(`**[${track.info.title}](${track.info.uri})**\nArtiste : \`${track.info.author || 'Inconnu'}\``)
          .addFields(
            { name: '⏳ Durée', value: durationStr, inline: true },
            { name: '👤 Demandé par', value: requesterTag, inline: true },
            { name: '🔊 Volume', value: `${player.volume}%`, inline: true }
          )
          .setColor('#FF6B35')
          .setFooter({ text: 'Pyro Music Player • Utilisez les boutons pour contrôler la lecture' });

        if (track.info.artworkUrl) {
          embed.setThumbnail(track.info.artworkUrl);
        }

        const buttonsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('music_toggle_pause').setEmoji('⏯️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
        );

        await textChannel.send({ embeds: [embed], components: [buttonsRow] }).catch(() => {});
      } catch (err) {
        console.error('[Music] Error in trackStart event:', err);
      }
    });

    this.manager.on('queueEnd', async (player) => {
      try {
        const textChannel = this.client.channels.cache.get(player.textChannelId);
        if (textChannel) {
          const embed = new EmbedBuilder()
            .setDescription('⏹️ **File d\'attente terminée.** Ajoutez de nouveaux morceaux avec `/music play` !')
            .setColor('#888888');
          await textChannel.send({ embeds: [embed] }).catch(() => {});
        }
      } catch (e) {}
    });

    this.manager.on('trackError', async (player, track, payload) => {
      try {
        console.warn(`[Music] Erreur lors de la lecture du morceau : ${track.info.title}`, payload);
        const textChannel = this.client.channels.cache.get(player.textChannelId);
        if (textChannel) {
          const embed = new EmbedBuilder()
            .setTitle('⚠️ Erreur de Lecture')
            .setDescription(`Impossible de lire le morceau : **${track.info.title}** (${payload?.message || 'Erreur audio Lavalink'})\nPassage au morceau suivant...`)
            .setColor('#E74C3C');
          await textChannel.send({ embeds: [embed] }).catch(() => {});
        }
      } catch (e) {}
    });
  }

  /**
   * Check if music feature is enabled in settings.
   */
  async isEnabled() {
    return (await ConfigHelper.get('music_enabled')) === true;
  }

  /**
   * Check if member is authorized to control music (DJ or Admin).
   */
  async canControlMusic(member) {
    if (!member) return false;
    // Server administrators always have full control
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return true;
    }

    const allowedRoles = await ConfigHelper.get('music_allowed_roles');
    const rolesArray = Array.isArray(allowedRoles)
      ? allowedRoles
      : typeof allowedRoles === 'string'
      ? JSON.parse(allowedRoles || '[]')
      : [];

    // If no specific DJ roles are configured, all members can control
    if (rolesArray.length === 0) {
      return true;
    }

    return member.roles.cache.some((r) => rolesArray.includes(r.id));
  }

  /**
   * Check if a voice channel is allowed for music.
   */
  async isVoiceChannelAllowed(channelId) {
    const allowedChannels = await ConfigHelper.get('music_allowed_channels');
    const chanArray = Array.isArray(allowedChannels)
      ? allowedChannels
      : typeof allowedChannels === 'string'
      ? JSON.parse(allowedChannels || '[]')
      : [];

    // If no specific channels configured, all voice channels are allowed
    if (chanArray.length === 0) {
      return true;
    }

    return chanArray.includes(channelId);
  }

  /**
   * Handle interactive music buttons (⏯️, ⏭️, ⏹️, 🔀, 🔁)
   */
  async handleButtonInteraction(interaction) {
    const member = interaction.member;
    const guild = interaction.guild;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ Vous devez être connecté dans un salon vocal pour utiliser les contrôles de musique.',
        ephemeral: true,
      });
    }

    const player = this.manager?.getPlayer(guild.id);
    if (!player) {
      return interaction.reply({
        content: '❌ Aucune musique n\'est actuellement en cours de lecture.',
        ephemeral: true,
      });
    }

    if (player.voiceChannelId !== voiceChannel.id) {
      return interaction.reply({
        content: `❌ Vous devez être dans le même salon vocal que le bot (<#${player.voiceChannelId}>) pour contrôler la musique.`,
        ephemeral: true,
      });
    }

    const hasPermission = await this.canControlMusic(member);
    if (!hasPermission) {
      return interaction.reply({
        content: '❌ Vous n\'avez pas la permission de contrôler la musique (Rôle DJ requis).',
        ephemeral: true,
      });
    }

    const customId = interaction.customId;

    if (customId === 'music_toggle_pause') {
      if (player.paused) {
        await player.resume();
        return interaction.reply({ content: '▶️ **Musique reprise.**', ephemeral: true });
      } else {
        await player.pause();
        return interaction.reply({ content: '⏸️ **Musique mise en pause.**', ephemeral: true });
      }
    }

    if (customId === 'music_skip') {
      if (player.queue.tracks.length > 0) {
        await player.skip(0, false);
        return interaction.reply({ content: '⏭️ **Morceau passé.**', ephemeral: true });
      } else {
        await player.stopPlaying();
        return interaction.reply({ content: '⏹️ **File terminée, lecture arrêtée.**', ephemeral: true });
      }
    }

    if (customId === 'music_stop') {
      await player.destroy('stopped_by_button');
      return interaction.reply({ content: '⏹️ **Musique arrêtée et déconnexion du salon vocal.**', ephemeral: true });
    }

    if (customId === 'music_shuffle') {
      if (player.queue.tracks.length < 2) {
        return interaction.reply({ content: '❌ Il faut au moins 2 morceaux dans la file d\'attente pour mélanger.', ephemeral: true });
      }
      await player.queue.shuffle();
      return interaction.reply({ content: '🔀 **File d\'attente mélangée avec succès !**', ephemeral: true });
    }

    if (customId === 'music_loop') {
      const current = player.repeatMode || 'off';
      let nextMode = 'track';
      let label = '🔂 Morceau en cours';

      if (current === 'track') {
        nextMode = 'queue';
        label = '🔁 Toute la file d\'attente';
      } else if (current === 'queue') {
        nextMode = 'off';
        label = '❌ Désactivé';
      }

      await player.setRepeatMode(nextMode);
      return interaction.reply({ content: `🔁 **Mode de répétition : ${label}**`, ephemeral: true });
    }
  }

  /**
   * Return live system status for Dashboard display.
   */
  getStatus() {
    const isOnline = this.nodeStatus === 'connected';
    const playersCount = this.manager?.players?.size || 0;
    const playingCount = this.manager ? [...this.manager.players.values()].filter((p) => p.playing).length : 0;

    return {
      enabled: this.nodeStatus !== 'disabled',
      nodeStatus: this.nodeStatus,
      lastError: this.lastError,
      nodeInfo: this.nodeInfo,
      playersCount,
      playingCount,
    };
  }

  /**
   * Test connection to a Lavalink server via HTTP REST /version endpoint.
   */
  async testNode({ host, port, pass, secure }) {
    const protocol = secure ? 'https:' : 'http:';
    const url = `${protocol}//${host}:${port}/version`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const startTime = Date.now();
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Authorization: pass || 'youshallnotpass' },
      });
      clearTimeout(timeout);
      const ping = Date.now() - startTime;

      if (res.ok) {
        const version = await res.text();
        return {
          success: true,
          ping,
          version: version.trim() || 'v4.x',
        };
      } else {
        return {
          success: false,
          ping,
          error: `Erreur HTTP ${res.status}: ${res.statusText}`,
        };
      }
    } catch (err) {
      clearTimeout(timeout);
      return {
        success: false,
        error: err.name === 'AbortError' ? 'Délai d\'attente dépassé (timeout 4.5s)' : err.message,
      };
    }
  }
}

const musicServiceInstance = new MusicService();

module.exports = musicServiceInstance;
module.exports.formatMs = formatMs;
module.exports.createProgressBar = createProgressBar;

