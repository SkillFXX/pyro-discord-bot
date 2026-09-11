const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'threadCreate',
  async execute(thread, newlyCreated, client) {
    // Only log newly created threads
    if (!newlyCreated) return;

    try {
      const parent = thread.parent ? `#${thread.parent.name}` : 'Inconnu';
      const isForumPost = thread.parent && thread.parent.isThreadOnly ? thread.parent.isThreadOnly() : false;

      await loggerService.log(client, 'log_discord_threads', {
        title: isForumPost ? '💬 Nouveau Post de Forum' : '🧵 Nouveau Thread Créé',
        description: `Un nouveau fil a été ouvert : ${thread}`,
        color: '#3498DB',
        fields: [
          { name: 'Nom du Thread', value: `\`${thread.name}\``, inline: true },
          { name: 'Salon Parent', value: parent, inline: true },
          { name: 'Auteur', value: thread.ownerId ? `<@${thread.ownerId}>` : 'Inconnu', inline: true },
        ],
        footer: { text: `Thread ID: ${thread.id}` },
      });
    } catch (error) {
      console.error('[LoggerService] Erreur threadCreate:', error);
    }
  },
};

