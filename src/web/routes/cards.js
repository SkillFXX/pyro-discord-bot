const express = require('express');
const { AttachmentBuilder } = require('discord.js');
const cardGeneratorService = require('../../services/cardGeneratorService');
const { requireAdmin } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ConfigHelper } = require('../../database');

function createCardsRouter(client) {
  const router = express.Router();
  router.use(apiLimiter);

  const VALID_TYPES = ['welcome', 'leave', 'levelup'];

  /**
   * GET /api/cards/:type
   * Returns saved or default configuration for card type
   */
  router.get('/api/cards/:type', requireAdmin, async (req, res) => {
    try {
      const type = req.params.type;
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Type de carte invalide' });
      }
      const config = await cardGeneratorService.getConfig(type);
      res.json({ success: true, config });
    } catch (err) {
      console.error('[API Cards] Error fetching card config:', err);
      res.status(500).json({ error: 'Erreur lors du chargement de la configuration' });
    }
  });

  /**
   * POST /api/cards/:type
   * Saves configuration for card type
   */
  router.post('/api/cards/:type', requireAdmin, async (req, res) => {
    try {
      const type = req.params.type;
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Type de carte invalide' });
      }
      await cardGeneratorService.saveConfig(type, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error('[API Cards] Error saving card config:', err);
      res.status(500).json({ error: 'Erreur lors de la sauvegarde de la carte' });
    }
  });

  /**
   * POST /api/cards/:type/preview
   * Renders preview PNG on the fly from received cardConfig and mock context
   */
  router.post('/api/cards/:type/preview', requireAdmin, async (req, res) => {
    try {
      const type = req.params.type;
      const cardConfig = req.body.config || cardGeneratorService.getDefaults(type);
      const mockContext = req.body.context || {};

      // Ensure mock values
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      const enrichedContext = {
        type,
        username: mockContext.username || req.session?.user?.username || 'MembreExemple',
        userMention: mockContext.userMention || `@${mockContext.username || req.session?.user?.username || 'MembreExemple'}`,
        userTag: mockContext.userTag || req.session?.user?.username || 'MembreExemple#0001',
        serverName: guild ? guild.name : 'Pyro Community',
        memberCount: guild ? guild.memberCount : 150,
        level: mockContext.level || 5,
        oldLevel: (mockContext.level || 5) - 1,
        xp: mockContext.xp || 1250,
        inviter: mockContext.inviter || 'InviteurAmi',
        inviterUsername: mockContext.inviterUsername || 'InviteurAmi',
        invitesCount: mockContext.invitesCount || 3,
        avatarUrl: mockContext.avatarUrl || req.session?.user?.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
      };

      const buffer = await cardGeneratorService.renderPreview(cardConfig, enrichedContext);
      if (!buffer) {
        return res.status(500).json({ error: 'Impossible de générer l\'image d\'aperçu' });
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(buffer);
    } catch (err) {
      console.error('[API Cards Preview] Error:', err);
      res.status(500).json({ error: 'Erreur lors de la génération de l\'aperçu' });
    }
  });

  /**
   * POST /api/cards/:type/test-send
   * Generates card and sends it to specified Discord channel for real test
   */
  router.post('/api/cards/:type/test-send', requireAdmin, async (req, res) => {
    try {
      const type = req.params.type;
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Type de carte invalide' });
      }

      let channelId = req.body.channelId;
      if (!channelId) {
        if (type === 'welcome') {
          channelId = await ConfigHelper.get('welcome_channel_id');
        } else if (type === 'leave') {
          channelId = await ConfigHelper.get('leave_channel_id');
        } else if (type === 'levelup') {
          channelId = await ConfigHelper.get('xp_announcement_channel_id');
        }
      }

      if (!channelId) {
        return res.status(400).json({ error: 'Aucun salon cible configuré ou sélectionné pour le test.' });
      }

      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) {
        return res.status(500).json({ error: 'Serveur Discord introuvable dans le cache du bot.' });
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return res.status(404).json({ error: 'Salon Discord introuvable.' });
      }

      const cardConfig = req.body.config || (await cardGeneratorService.getConfig(type));
      const testContext = {
        type,
        username: req.session?.user?.username || 'MembreTest',
        userMention: `@${req.session?.user?.username || 'MembreTest'}`,
        userTag: req.session?.user?.username || 'MembreTest#0001',
        serverName: guild.name,
        memberCount: guild.memberCount,
        level: 10,
        oldLevel: 9,
        xp: 3200,
        inviter: 'StaffPyro',
        inviterUsername: 'StaffPyro',
        invitesCount: 5,
        avatarUrl: req.session?.user?.avatarUrl || client.user?.displayAvatarURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
      };

      const buffer = await cardGeneratorService.renderPreview(cardConfig, testContext);
      if (!buffer) {
        return res.status(500).json({ error: 'Échec du rendu de la carte image.' });
      }

      const attachment = new AttachmentBuilder(buffer, { name: `${type}-card.png` });
      const titles = {
        welcome: '👋 Test de Carte de Bienvenue',
        leave: '📤 Test de Carte d\'Au revoir',
        levelup: '⭐ Test de Carte de Montée de Niveau',
      };

      await channel.send({
        content: `🧪 **${titles[type] || 'Test de Carte Visuelle'}** *(Envoyé depuis le Dashboard)*`,
        files: [attachment],
      });

      res.json({ success: true, channelName: channel.name });
    } catch (err) {
      console.error('[API Cards Test Send] Error:', err);
      res.status(500).json({ error: err.message || 'Erreur lors de l\'envoi du test' });
    }
  });

  return router;
}

module.exports = createCardsRouter;

