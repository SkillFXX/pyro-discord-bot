const express = require('express');
const { CustomMessage, FormSubmission } = require('../../database');
const { requireAdmin } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { 
  sendOrUpdateDiscordMessage, 
  deleteDiscordMessage 
} = require('../services/customMessageService');

function createCustomMessagesRouter(client) {
  const router = express.Router();
  router.use(apiLimiter);

  // 1. List all messages
  router.get('/api/messages', requireAdmin, async (req, res) => {
    try {
      const messages = await CustomMessage.findAll({
        order: [['updatedAt', 'DESC']],
      });

      // Fetch submission counts for form messages
      const formIds = messages.filter(m => m.type === 'form').map(m => m.id);
      const submissionCounts = {};
      if (formIds.length > 0) {
        for (const fid of formIds) {
          const count = await FormSubmission.count({ where: { formId: fid } });
          submissionCounts[fid] = count;
        }
      }

      const results = messages.map(m => ({
        ...m.toJSON(),
        submissionsCount: submissionCounts[m.id] || 0,
      }));

      return res.json({ messages: results });
    } catch (err) {
      console.error('[CustomMessages] Erreur liste :', err);
      return res.status(500).json({ error: 'Erreur lors de la récupération des messages.' });
    }
  });

  // 2. Get single message
  router.get('/api/messages/:id', requireAdmin, async (req, res) => {
    try {
      const record = await CustomMessage.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Message introuvable.' });
      }

      const submissionsCount = record.type === 'form' 
        ? await FormSubmission.count({ where: { formId: record.id } }) 
        : 0;

      return res.json({ 
        message: {
          ...record.toJSON(),
          submissionsCount,
        }
      });
    } catch (err) {
      console.error('[CustomMessages] Erreur détails :', err);
      return res.status(500).json({ error: 'Erreur lors de la récupération du message.' });
    }
  });

  // 3. Create message
  router.post('/api/messages', requireAdmin, async (req, res) => {
    try {
      const { 
        name, 
        type = 'embed', 
        channelId, 
        content = '', 
        embedData = {}, 
        formData = {}, 
        sendImmediately = true 
      } = req.body;

      if (!channelId) {
        return res.status(400).json({ error: 'Veuillez sélectionner un salon de destination.' });
      }

      const record = await CustomMessage.create({
        name: (name || 'Nouveau message').trim(),
        type: ['text', 'embed', 'form'].includes(type) ? type : 'embed',
        channelId: String(channelId).trim(),
        content: typeof content === 'string' ? content : '',
        embedData: typeof embedData === 'string' ? embedData : JSON.stringify(embedData || {}),
        formData: typeof formData === 'string' ? formData : JSON.stringify(formData || {}),
        status: 'draft',
      });

      if (sendImmediately) {
        try {
          await sendOrUpdateDiscordMessage(client, record);
        } catch (discordErr) {
          console.warn('[CustomMessages] Erreur envoi immédiat Discord :', discordErr.message);
          return res.status(201).json({ 
            message: record, 
            warning: `Message sauvegardé, mais l'envoi Discord a échoué : ${discordErr.message}` 
          });
        }
      }

      return res.status(201).json({ message: record });
    } catch (err) {
      console.error('[CustomMessages] Erreur création :', err);
      return res.status(500).json({ error: 'Erreur lors de la création du message.' });
    }
  });

  // 4. Update message
  router.put('/api/messages/:id', requireAdmin, async (req, res) => {
    try {
      const record = await CustomMessage.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Message introuvable.' });
      }

      const { 
        name, 
        type, 
        channelId, 
        content, 
        embedData, 
        formData, 
        updateDiscord = true 
      } = req.body;

      if (name !== undefined) record.name = String(name).trim();
      if (type !== undefined && ['text', 'embed', 'form'].includes(type)) record.type = type;
      if (channelId !== undefined) record.channelId = String(channelId).trim();
      if (content !== undefined) record.content = typeof content === 'string' ? content : '';
      if (embedData !== undefined) {
        record.embedData = typeof embedData === 'string' ? embedData : JSON.stringify(embedData || {});
      }
      if (formData !== undefined) {
        record.formData = typeof formData === 'string' ? formData : JSON.stringify(formData || {});
      }

      await record.save();

      // If the message is already sent (or requested to update), update it on Discord
      if (updateDiscord && record.messageId) {
        try {
          await sendOrUpdateDiscordMessage(client, record);
        } catch (discordErr) {
          console.warn('[CustomMessages] Erreur mise à jour Discord :', discordErr.message);
          return res.json({ 
            message: record, 
            warning: `Modifications enregistrées, mais la mise à jour Discord a échoué : ${discordErr.message}` 
          });
        }
      }

      return res.json({ message: record });
    } catch (err) {
      console.error('[CustomMessages] Erreur mise à jour :', err);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du message.' });
    }
  });

  // 5. Send or resend to Discord
  router.post('/api/messages/:id/send', requireAdmin, async (req, res) => {
    try {
      const record = await CustomMessage.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Message introuvable.' });
      }

      await sendOrUpdateDiscordMessage(client, record);
      return res.json({ message: record });
    } catch (err) {
      console.error('[CustomMessages] Erreur envoi manuel :', err);
      return res.status(500).json({ error: err.message || "Erreur lors de l'envoi sur Discord." });
    }
  });

  // 6. Delete message (from Discord and DB)
  router.delete('/api/messages/:id', requireAdmin, async (req, res) => {
    try {
      const record = await CustomMessage.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Message introuvable.' });
      }

      await deleteDiscordMessage(client, record);
      return res.json({ success: true, messageId: req.params.id });
    } catch (err) {
      console.error('[CustomMessages] Erreur suppression :', err);
      return res.status(500).json({ error: 'Erreur lors de la suppression du message.' });
    }
  });

  // 7. Get form submissions
  router.get('/api/messages/:id/submissions', requireAdmin, async (req, res) => {
    try {
      const record = await CustomMessage.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'Formulaire introuvable.' });
      }

      const submissions = await FormSubmission.findAll({
        where: { formId: record.id },
        order: [['createdAt', 'DESC']],
      });

      const parsed = submissions.map(s => {
        let answers = [];
        try {
          answers = typeof s.answers === 'string' ? JSON.parse(s.answers || '[]') : (s.answers || []);
        } catch {
          answers = [];
        }
        return {
          ...s.toJSON(),
          answers,
        };
      });

      return res.json({ submissions: parsed });
    } catch (err) {
      console.error('[CustomMessages] Erreur récupération soumissions :', err);
      return res.status(500).json({ error: 'Erreur lors de la récupération des réponses.' });
    }
  });

  // 8. Delete a single submission
  router.delete('/api/messages/:id/submissions/:subId', requireAdmin, async (req, res) => {
    try {
      await FormSubmission.destroy({
        where: {
          id: req.params.subId,
          formId: req.params.id,
        },
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('[CustomMessages] Erreur suppression soumission :', err);
      return res.status(500).json({ error: 'Erreur lors de la suppression de la réponse.' });
    }
  });

  return router;
}

module.exports = createCustomMessagesRouter;
