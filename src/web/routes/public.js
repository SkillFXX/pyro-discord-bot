const express = require('express');
const { apiLimiter } = require('../middleware/rateLimiter');
const { getLeaderboardData } = require('../services/leaderboardService');

function createPublicRouter(client) {
  const router = express.Router();

  // Public Leaderboard API endpoint
  router.get('/api/public/leaderboard', apiLimiter, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      const data = await getLeaderboardData(client, { limit, offset, search });
      res.json(data);
    } catch (err) {
      console.error('[Public Router] Erreur leaderboard :', err);
      res.status(500).json({ error: 'Erreur interne lors de la récupération du classement.' });
    }
  });

  return router;
}

module.exports = createPublicRouter;
