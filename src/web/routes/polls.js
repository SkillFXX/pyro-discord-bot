const express = require('express');
const { ScheduledPoll, PollResult } = require('../../database');
const { requireAdmin } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const pollScheduler = require('../../services/pollSchedulerService');

function createPollsRouter(client) {
  const router = express.Router();
  router.use(apiLimiter);

  router.get('/api/polls', requireAdmin, async (req, res) => {
    try {
      const polls = await ScheduledPoll.findAll({ order: [['time', 'ASC'], ['id', 'ASC']] });
      return res.json({ polls, timezone: pollScheduler.POLL_TIMEZONE, limits: pollScheduler.LIMITS });
    } catch (err) {
      console.error('[Polls] Erreur liste :', err);
      return res.status(500).json({ error: 'Erreur lors de la récupération des sondages.' });
    }
  });

  router.get('/api/polls/stats', requireAdmin, async (req, res) => {
    try {
      const results = await PollResult.findAll({
        where: { status: ['open', 'finalized'] },
        order: [['createdAt', 'DESC']],
        limit: 100,
      });

      const finished = results.filter(r => r.status === 'finalized');
      const totalVotes = results.reduce((sum, r) => sum + r.totalVotes, 0);

      return res.json({
        summary: {
          pollsCount: results.length,
          finishedCount: finished.length,
          totalVotes,
          averageVotes: results.length ? Math.round((totalVotes / results.length) * 10) / 10 : 0,
        },
        results,
      });
    } catch (err) {
      console.error('[Polls] Erreur stats :', err);
      return res.status(500).json({ error: 'Erreur lors de la récupération des statistiques.' });
    }
  });

  router.post('/api/polls', requireAdmin, async (req, res) => {
    try {
      const { error, value } = pollScheduler.validatePollPayload(req.body);
      if (error) return res.status(400).json({ error });
      const poll = await ScheduledPoll.create(value);
      return res.json({ poll });
    } catch (err) {
      console.error('[Polls] Erreur création :', err);
      return res.status(500).json({ error: 'Erreur lors de la création du sondage.' });
    }
  });

  router.put('/api/polls/:id', requireAdmin, async (req, res) => {
    try {
      const poll = await ScheduledPoll.findByPk(req.params.id);
      if (!poll) return res.status(404).json({ error: 'Sondage introuvable.' });
      const { error, value } = pollScheduler.validatePollPayload(req.body);
      if (error) return res.status(400).json({ error });
      await poll.update(value);
      return res.json({ poll });
    } catch (err) {
      console.error('[Polls] Erreur modification :', err);
      return res.status(500).json({ error: 'Erreur lors de la modification du sondage.' });
    }
  });

  router.delete('/api/polls/:id', requireAdmin, async (req, res) => {
    try {
      const deleted = await ScheduledPoll.destroy({ where: { id: req.params.id } });
      if (!deleted) return res.status(404).json({ error: 'Sondage introuvable.' });
      return res.json({ success: true });
    } catch (err) {
      console.error('[Polls] Erreur suppression :', err);
      return res.status(500).json({ error: 'Erreur lors de la suppression du sondage.' });
    }
  });

  router.post('/api/polls/:id/send', requireAdmin, async (req, res) => {
    try {
      const poll = await ScheduledPoll.findByPk(req.params.id);
      if (!poll) return res.status(404).json({ error: 'Sondage introuvable.' });
      const channel = await pollScheduler.sendPoll(client, poll);
      return res.json({ success: true, channelName: channel.name });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Impossible d'envoyer le sondage." });
    }
  });

  return router;
}

module.exports = createPollsRouter;
