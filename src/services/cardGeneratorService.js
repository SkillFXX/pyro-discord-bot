const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { ConfigHelper } = require('../database');

// Register custom bundled fonts
try {
  const figtreePath = path.resolve(__dirname, '../../node_modules/@fontsource/figtree/files/figtree-latin-700-normal.woff');
  if (fs.existsSync(figtreePath)) {
    GlobalFonts.registerFromPath(figtreePath, 'Figtree');
  }
  const synePath = path.resolve(__dirname, '../../node_modules/@fontsource/syne/files/syne-latin-700-normal.woff');
  if (fs.existsSync(synePath)) {
    GlobalFonts.registerFromPath(synePath, 'Syne');
  }
} catch (err) {
  console.warn('[CardGenerator] Font registration notice:', err.message);
}

/**
 * Default configurations for each card type
 */
const DEFAULT_CARD_CONFIGS = {
  welcome: {
    enabled: false,
    sendMode: 'embed', // 'embed' | 'standalone'
    width: 900,
    height: 400,
    borderRadius: 24,
    background: {
      type: 'gradient', // 'color' | 'gradient' | 'image'
      color: '#12131a',
      gradient: {
        type: 'linear',
        angle: 135,
        colors: ['#0d0c1d', '#1f1538', '#110c22'],
      },
      imageUrl: '',
      overlayColor: '#000000',
      overlayOpacity: 0.45,
    },
    border: {
      enabled: true,
      color: '#ef490b',
      width: 2,
      glow: true,
      glowColor: 'rgba(239, 73, 11, 0.35)',
      glowBlur: 14,
    },
    avatar: {
      enabled: true,
      x: 450,
      y: 135,
      size: 130,
      shape: 'circle', // 'circle' | 'rounded' | 'square'
      borderRadius: 24,
      borderWidth: 4,
      borderColor: '#ef490b',
      glow: true,
      glowColor: 'rgba(239, 73, 11, 0.45)',
      glowBlur: 18,
    },
    texts: [
      {
        id: 'title',
        text: 'BIENVENUE !',
        x: 450,
        y: 245,
        align: 'center',
        fontSize: 34,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#ffffff',
        shadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 8,
      },
      {
        id: 'subtitle',
        text: '{username} vient de rejoindre le serveur',
        x: 450,
        y: 290,
        align: 'center',
        fontSize: 22,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#ef490b',
        shadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.6)',
        shadowBlur: 6,
      },
      {
        id: 'details',
        text: 'Nous sommes désormais {memberCount} membres sur {server}',
        x: 450,
        y: 335,
        align: 'center',
        fontSize: 16,
        fontFamily: 'Figtree',
        fontWeight: 'normal',
        color: '#94a3b8',
        shadow: false,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 4,
      },
    ],
  },

  leave: {
    enabled: false,
    sendMode: 'embed',
    width: 900,
    height: 400,
    borderRadius: 24,
    background: {
      type: 'gradient',
      color: '#1a1215',
      gradient: {
        type: 'linear',
        angle: 135,
        colors: ['#1c0c11', '#2c121c', '#15080f'],
      },
      imageUrl: '',
      overlayColor: '#000000',
      overlayOpacity: 0.5,
    },
    border: {
      enabled: true,
      color: '#e74c3c',
      width: 2,
      glow: true,
      glowColor: 'rgba(231, 76, 60, 0.35)',
      glowBlur: 14,
    },
    avatar: {
      enabled: true,
      x: 450,
      y: 135,
      size: 130,
      shape: 'circle',
      borderRadius: 24,
      borderWidth: 4,
      borderColor: '#e74c3c',
      glow: true,
      glowColor: 'rgba(231, 76, 60, 0.45)',
      glowBlur: 18,
    },
    texts: [
      {
        id: 'title',
        text: 'AU REVOIR...',
        x: 450,
        y: 245,
        align: 'center',
        fontSize: 34,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#ffffff',
        shadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 8,
      },
      {
        id: 'subtitle',
        text: '{username} a quitté le serveur',
        x: 450,
        y: 290,
        align: 'center',
        fontSize: 22,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#e74c3c',
        shadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.6)',
        shadowBlur: 6,
      },
      {
        id: 'details',
        text: 'Plus que {memberCount} membres sur {server}',
        x: 450,
        y: 335,
        align: 'center',
        fontSize: 16,
        fontFamily: 'Figtree',
        fontWeight: 'normal',
        color: '#94a3b8',
        shadow: false,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 4,
      },
    ],
  },

  levelup: {
    enabled: false,
    sendMode: 'embed',
    width: 900,
    height: 400,
    borderRadius: 24,
    background: {
      type: 'gradient',
      color: '#1a1711',
      gradient: {
        type: 'linear',
        angle: 135,
        colors: ['#1a1505', '#332709', '#151004'],
      },
      imageUrl: '',
      overlayColor: '#000000',
      overlayOpacity: 0.45,
    },
    border: {
      enabled: true,
      color: '#f1c40f',
      width: 2,
      glow: true,
      glowColor: 'rgba(241, 196, 15, 0.4)',
      glowBlur: 16,
    },
    avatar: {
      enabled: true,
      x: 450,
      y: 130,
      size: 130,
      shape: 'circle',
      borderRadius: 24,
      borderWidth: 4,
      borderColor: '#f1c40f',
      glow: true,
      glowColor: 'rgba(241, 196, 15, 0.5)',
      glowBlur: 18,
    },
    texts: [
      {
        id: 'title',
        text: 'PASSAGE DE NIVEAU !',
        x: 450,
        y: 240,
        align: 'center',
        fontSize: 32,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#ffffff',
        shadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 8,
      },
      {
        id: 'subtitle',
        text: 'Félicitations {username} !',
        x: 450,
        y: 285,
        align: 'center',
        fontSize: 22,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#f1c40f',
        shadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.6)',
        shadowBlur: 6,
      },
      {
        id: 'details',
        text: 'Tu viens d\'atteindre le Niveau {level} ({xp} XP)',
        x: 450,
        y: 330,
        align: 'center',
        fontSize: 18,
        fontFamily: 'Figtree',
        fontWeight: 'bold',
        color: '#ffffff',
        shadow: false,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 4,
      },
    ],
  },
};

/**
 * Returns a cloned default card configuration for the specified type.
 */
function getDefaultCardConfig(type) {
  const base = DEFAULT_CARD_CONFIGS[type] || DEFAULT_CARD_CONFIGS.welcome;
  return JSON.parse(JSON.stringify(base));
}

/**
 * Formats a text string by replacing variable placeholders with context data.
 */
function formatVariables(text, context = {}) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/{user}/g, context.userMention || context.username || 'Membre')
    .replace(/{username}/g, context.username || 'Membre')
    .replace(/{tag}/g, context.userTag || context.username || 'Membre')
    .replace(/{server}/g, context.serverName || 'Serveur')
    .replace(/{memberCount}/g, (context.memberCount ?? 0).toString())
    .replace(/{level}/g, (context.level ?? 0).toString())
    .replace(/{oldLevel}/g, (context.oldLevel ?? 0).toString())
    .replace(/{xp}/g, (context.xp ?? 0).toLocaleString('fr-FR'))
    .replace(/{inviter}/g, context.inviter || 'Inconnu')
    .replace(/{inviterUsername}/g, context.inviterUsername || context.inviter || 'Inconnu')
    .replace(/{inviterTag}/g, context.inviterTag || context.inviter || 'Inconnu')
    .replace(/{invites}/g, (context.invitesCount ?? 0).toString())
    .replace(/{inviteCount}/g, (context.invitesCount ?? 0).toString());
}

/**
 * Helper to calculate linear gradient start/end coordinates based on angle.
 */
function getGradientCoordinates(angleDeg, width, height) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const length = Math.abs(width * Math.cos(angleRad)) + Math.abs(height * Math.sin(angleRad));
  const halfLen = length / 2;

  const x0 = cx - Math.cos(angleRad) * halfLen;
  const y0 = cy - Math.sin(angleRad) * halfLen;
  const x1 = cx + Math.cos(angleRad) * halfLen;
  const y1 = cy + Math.sin(angleRad) * halfLen;

  return { x0, y0, x1, y1 };
}

/**
 * Main rendering function using @napi-rs/canvas.
 * @param {Object} rawConfig Card configuration
 * @param {Object} context Context data (user, guild, xp, etc.)
 * @returns {Promise<Buffer>} Rendered PNG buffer
 */
async function renderCardCanvas(rawConfig, context = {}) {
  const config = {
    ...getDefaultCardConfig(context.type || 'welcome'),
    ...rawConfig,
  };

  const width = Math.max(400, Math.min(1920, parseInt(config.width || 900, 10)));
  const height = Math.max(200, Math.min(1080, parseInt(config.height || 400, 10)));
  const borderRadius = Math.max(0, parseInt(config.borderRadius ?? 24, 10));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Clip card rounded corners
  ctx.save();
  ctx.beginPath();
  if (borderRadius > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, width, height, borderRadius);
  } else {
    ctx.rect(0, 0, width, height);
  }
  ctx.clip();

  // 2. Render Background
  const bg = config.background || {};
  if (bg.type === 'color') {
    ctx.fillStyle = bg.color || '#14161b';
    ctx.fillRect(0, 0, width, height);
  } else if (bg.type === 'image' && bg.imageUrl) {
    let bgImg = null;
    try {
      bgImg = await loadImage(bg.imageUrl);
    } catch (e) {
      console.warn('[CardGenerator] Failed to load background image:', e.message);
    }

    if (bgImg) {
      // Draw image "cover"
      const imgRatio = bgImg.width / bgImg.height;
      const canvasRatio = width / height;
      let renderWidth = width;
      let renderHeight = height;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasRatio > imgRatio) {
        renderHeight = width / imgRatio;
        offsetY = (height - renderHeight) / 2;
      } else {
        renderWidth = height * imgRatio;
        offsetX = (width - renderWidth) / 2;
      }

      ctx.drawImage(bgImg, offsetX, offsetY, renderWidth, renderHeight);
    } else {
      ctx.fillStyle = bg.color || '#14161b';
      ctx.fillRect(0, 0, width, height);
    }

    // Apply dark overlay
    const overlayOpacity = Math.max(0, Math.min(1, parseFloat(bg.overlayOpacity ?? 0.45)));
    if (overlayOpacity > 0) {
      ctx.fillStyle = bg.overlayColor || '#000000';
      ctx.globalAlpha = overlayOpacity;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1.0;
    }
  } else {
    // Default: Gradient
    const gradConfig = bg.gradient || {};
    const angle = parseInt(gradConfig.angle ?? 135, 10);
    const { x0, y0, x1, y1 } = getGradientCoordinates(angle, width, height);
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

    const colors = Array.isArray(gradConfig.colors) && gradConfig.colors.length > 0
      ? gradConfig.colors
      : ['#0d0c1d', '#1f1538', '#110c22'];

    colors.forEach((col, idx) => {
      const stop = idx / (colors.length - 1 || 1);
      gradient.addColorStop(stop, col);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Render Card Border / Stroke
  const border = config.border || {};
  if (border.enabled && border.width > 0) {
    ctx.save();
    ctx.lineWidth = border.width;
    ctx.strokeStyle = border.color || '#ef490b';

    if (border.glow) {
      ctx.shadowColor = border.glowColor || border.color || '#ef490b';
      ctx.shadowBlur = border.glowBlur || 14;
    }

    ctx.beginPath();
    if (borderRadius > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(border.width / 2, border.width / 2, width - border.width, height - border.width, borderRadius);
    } else {
      ctx.rect(border.width / 2, border.width / 2, width - border.width, height - border.width);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 4. Render Avatar
  const av = config.avatar || {};
  if (av.enabled !== false) {
    const avX = av.x ?? width / 2;
    const avY = av.y ?? 135;
    const avSize = Math.max(30, Math.min(400, av.size ?? 130));
    const halfSize = avSize / 2;
    const shape = av.shape || 'circle';

    // Fetch avatar
    let avatarImg = null;
    const avatarUrl = context.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    try {
      avatarImg = await loadImage(avatarUrl);
    } catch (e) {
      console.warn('[CardGenerator] Avatar fetch error, fallback used:', e.message);
    }

    // Avatar Glow
    if (av.glow && av.glowBlur > 0) {
      ctx.save();
      ctx.shadowColor = av.glowColor || av.borderColor || '#ef490b';
      ctx.shadowBlur = av.glowBlur || 16;
      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(avX, avY, halfSize + 1, 0, Math.PI * 2);
      } else if (shape === 'rounded') {
        const r = av.borderRadius ?? 24;
        ctx.roundRect(avX - halfSize - 1, avY - halfSize - 1, avSize + 2, avSize + 2, r);
      } else {
        ctx.rect(avX - halfSize - 1, avY - halfSize - 1, avSize + 2, avSize + 2);
      }
      ctx.fillStyle = av.borderColor || '#ef490b';
      ctx.fill();
      ctx.restore();
    }

    // Clip & Draw Avatar Image
    ctx.save();
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(avX, avY, halfSize, 0, Math.PI * 2);
    } else if (shape === 'rounded') {
      const r = av.borderRadius ?? 24;
      ctx.roundRect(avX - halfSize, avY - halfSize, avSize, avSize, r);
    } else {
      ctx.rect(avX - halfSize, avY - halfSize, avSize, avSize);
    }
    ctx.clip();

    if (avatarImg) {
      ctx.drawImage(avatarImg, avX - halfSize, avY - halfSize, avSize, avSize);
    } else {
      // Stylized default avatar fallback
      ctx.fillStyle = '#2c2f33';
      ctx.fillRect(avX - halfSize, avY - halfSize, avSize, avSize);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(avSize * 0.45)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (context.username || 'P').charAt(0).toUpperCase();
      ctx.fillText(initial, avX, avY);
    }
    ctx.restore();

    // Avatar Border
    if (av.borderWidth > 0) {
      ctx.save();
      ctx.lineWidth = av.borderWidth;
      ctx.strokeStyle = av.borderColor || '#ef490b';
      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(avX, avY, halfSize, 0, Math.PI * 2);
      } else if (shape === 'rounded') {
        const r = av.borderRadius ?? 24;
        ctx.roundRect(avX - halfSize, avY - halfSize, avSize, avSize, r);
      } else {
        ctx.rect(avX - halfSize, avY - halfSize, avSize, avSize);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 5. Render Text Layers
  const texts = Array.isArray(config.texts) ? config.texts : [];
  for (const item of texts) {
    if (!item.text) continue;
    const parsedText = formatVariables(item.text, context);
    const fontSize = Math.max(10, Math.min(100, item.fontSize ?? 24));
    const fontFamily = item.fontFamily || 'Figtree';
    const fontWeight = item.fontWeight || 'normal';

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", -apple-system, sans-serif`;
    ctx.textAlign = item.align || 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = item.color || '#ffffff';

    if (item.shadow) {
      ctx.shadowColor = item.shadowColor || 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = item.shadowBlur || 8;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
    }

    ctx.fillText(parsedText, item.x ?? width / 2, item.y ?? 200);
    ctx.restore();
  }

  ctx.restore(); // Restore global card clip

  return canvas.toBuffer('image/png');
}

/**
 * Service singleton
 */
class CardGeneratorService {
  getDefaults(type) {
    return getDefaultCardConfig(type);
  }

  /**
   * Retrieves card configuration from database for given type.
   */
  async getConfig(type) {
    const raw = await ConfigHelper.get(`card_${type}`);
    if (!raw) {
      return getDefaultCardConfig(type);
    }
    // Deep merge with defaults
    return {
      ...getDefaultCardConfig(type),
      ...raw,
    };
  }

  /**
   * Saves card configuration to database for given type.
   */
  async saveConfig(type, config) {
    return await ConfigHelper.set(`card_${type}`, config);
  }

  /**
   * Check if card generation is enabled for given type.
   */
  async isEnabled(type) {
    const cfg = await this.getConfig(type);
    return cfg.enabled === true;
  }

  /**
   * Generates a card PNG buffer from stored configuration and live Discord context.
   */
  async generateCard(type, context = {}) {
    try {
      const config = await this.getConfig(type);
      return await renderCardCanvas(config, { ...context, type });
    } catch (err) {
      console.error(`[CardGenerator] Error generating ${type} card:`, err);
      return null;
    }
  }

  /**
   * Renders preview buffer directly from arbitrary passed configuration.
   */
  async renderPreview(config, mockContext = {}) {
    return await renderCardCanvas(config, mockContext);
  }
}

module.exports = new CardGeneratorService();

