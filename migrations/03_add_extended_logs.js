const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('[Migration 03] Initialisation des clés de configuration étendues des Logs...');

const NEW_LOG_CONFIG = {
  // Bot Boot
  log_bot_boot: true,

  // Discord Extended Events
  log_discord_bot_add: true,
  log_discord_server_roles: true,
  log_discord_channels: true,
  log_discord_invites: true,
  log_discord_guild_update: true,
  log_discord_emojis: true,
  log_discord_scheduled_events: true,
  log_discord_webhooks: true,
};

db.serialize(() => {
  const checkStmt = db.prepare('SELECT value FROM Configs WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO Configs (key, value, createdAt, updatedAt) VALUES (?, ?, datetime("now"), datetime("now"))');

  const entries = Object.entries(NEW_LOG_CONFIG);
  let remaining = entries.length;

  entries.forEach(([key, defaultValue]) => {
    checkStmt.get([key], (err, row) => {
      if (err) {
        console.error(`[Migration 03] Erreur lors de la vérification de ${key}:`, err.message);
      } else if (!row) {
        insertStmt.run([key, JSON.stringify(defaultValue)], (insertErr) => {
          if (insertErr) {
            console.error(`[Migration 03] Erreur insertion ${key}:`, insertErr.message);
          } else {
            console.log(`[Migration 03] Clé ajoutée : ${key} = ${defaultValue}`);
          }
        });
      } else {
        console.log(`[Migration 03] Clé déjà configurée : ${key} = ${row.value}`);
      }

      remaining--;
      if (remaining === 0) {
        checkStmt.finalize();
        insertStmt.finalize(() => {
          db.close((closeErr) => {
            if (closeErr) console.error('[Migration 03] Erreur fermeture base:', closeErr.message);
            else console.log('[Migration 03] Migration terminée avec succès !');
          });
        });
      }
    });
  });
});
