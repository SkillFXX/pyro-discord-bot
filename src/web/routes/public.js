const express = require('express');
const { apiLimiter } = require('../middleware/rateLimiter');
const { getLeaderboardData } = require('../services/leaderboardService');

function createPublicRouter(client) {
  const router = express.Router();

  // Public Leaderboard API endpoint
  router.get('/api/public/leaderboard', apiLimiter, async (req, res) => {
    try {
      const data = await getLeaderboardData(client);
      res.json(data);
    } catch (err) {
      console.error('[Public Router] Erreur leaderboard :', err);
      res.status(500).json({ error: 'Erreur interne lors de la récupération du classement.' });
    }
  });

  return router;
}

module.exports = createPublicRouter;
