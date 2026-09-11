const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('[Migration 02] Initialisation des clés de configuration des Logs...');

const DEFAULT_LOG_CONFIG = {
  // Bot Logs
  log_bot_tickets: true,
  log_bot_sanctions: true,
  log_bot_moderation: true,
  log_bot_voice_create: true,
  log_bot_xp: true,
  log_bot_automod: true,

  // Discord Logs
  log_discord_member_join: true,
  log_discord_member_leave: true,
  log_discord_nickname_update: true,
  log_discord_role_update: true,
  log_discord_timeouts: true,
  log_discord_bans: true,
  log_discord_kicks: true,
  log_discord_voice_activity: false,
  log_discord_threads: true,
  log_discord_message_events: true,
};

db.serialize(() => {
  // Ensure Configs table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS Configs (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT,
      createdAt DATETIME,
      updatedAt DATETIME
    )
  `, (err) => {
    if (err) {
      console.error('[Migration 02] Erreur lors de la vérification de la table Configs:', err);
      return db.close();
    }

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO Configs (key, value, createdAt, updatedAt)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `);

    let completed = 0;
    const entries = Object.entries(DEFAULT_LOG_CONFIG);

    entries.forEach(([key, val]) => {
      stmt.run(key, JSON.stringify(val), (runErr) => {
        if (runErr) {
          console.error(`[Migration 02] Erreur insertion clé ${key}:`, runErr);
        }
        completed++;
        if (completed === entries.length) {
          stmt.finalize();
          console.log(`[Migration 02] Succès : ${entries.length} clés de configuration de logs configurées.`);
          db.close();
        }
      });
    });
  });
});

