const client = require('./client');
const loadHandlers = require('./handler');

function initBot(token) {
  if (!token) {
    throw new Error('Bot token is required to initialize.');
  }

  // Load all command and event handlers
  loadHandlers(client);

  // Login
  client.login(token).catch(err => {
    console.error('Failed to log in to Discord:', err);
  });

  return client;
}

module.exports = {
  initBot,
  client,
};
