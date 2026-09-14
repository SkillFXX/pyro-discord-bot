const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const analyticsService = require('../../services/analyticsService');

function createAnalyticsRouter(client) {
  const router = express.Router();

  router.get('/api/analytics', isAuthenticated, async (req, res) => {
    try {
      const guildId = process.env.GUILD_ID;
      const guild = client.guilds.cache.get(guildId);
      const { range, startDate, endDate, channelId, roleId, userId } = req.query;

      const data = await analyticsService.getAnalytics({
        range: range || '7d',
        startDate,
        endDate,
        channelId,
        roleId,
        userId,
        guild,
      });

      res.json(data);
    } catch (error) {
      console.error('[API Analytics] Error:', error);
      res.status(500).json({ error: 'Erreur lors du calcul des analyses' });
    }
  });

  router.get('/api/analytics/export', isAuthenticated, async (req, res) => {
    try {
      const guildId = process.env.GUILD_ID;
      const guild = client.guilds.cache.get(guildId);
      const { range, startDate, endDate, channelId, roleId, userId } = req.query;

      const csv = await analyticsService.exportCSV({
        range: range || '7d',
        startDate,
        endDate,
        channelId,
        roleId,
        userId,
        guild,
      });

      res.header('Content-Type', 'text/csv');
      res.attachment(`pyro-analytics-${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('[API Analytics Export] Error:', error);
      res.status(500).send('Erreur lors de l\'exportation CSV');
    }
  });

  return router;
}

module.exports = createAnalyticsRouter;

