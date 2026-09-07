require('dotenv').config();
const { sequelize } = require('./database');
const { initBot } = require('./bot');
const { startWebServer } = require('./web/server');

async function main() {
  console.log('[System] Démarrage du système...');

  // 1. Sync Database
  try {
    await sequelize.sync({ alter: true });
    console.log('[Database] Base de données SQLite synchronisée avec succès !');
  } catch (error) {
    console.error('[Database] Impossible de synchroniser la base de données :', error);
    process.exit(1);
  }

  // 2. Validate Environment Variables
  const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
  const missingEnv = requiredEnv.filter(key => !process.env[key]);

  if (missingEnv.length > 0) {
    console.error(`[System] Erreur : Variables d'environnement manquantes dans le fichier .env : ${missingEnv.join(', ')}`);
    console.error('[System] Référez-vous au fichier .env.example pour le configurer.');
    process.exit(1);
  }

  // 3. Initialize Discord Client
  console.log('[Bot] Initialisation du client Discord...');
  const client = initBot(process.env.DISCORD_TOKEN);

  // 4. Start Web Server
  const port = process.env.PORT || 3000;
  console.log('[Dashboard Web] Initialisation du serveur...');
  startWebServer(client, port);
}

const analyticsService = require('./services/analyticsService');

// Global exception safety
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Anti-Crash] Rejet non géré à :', promise, 'raison :', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Anti-Crash] Exception non capturée :', error);
});

async function gracefulShutdown() {
  console.log('[System] Arrêt en cours, sauvegarde des sessions vocales actives...');
  await analyticsService.closeAllVoiceSessions();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

main();
