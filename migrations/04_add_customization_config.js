const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('[Migration 04] Initialisation des clés de personnalisation...');

const CUSTOMIZATION_CONFIG = {
  embed_footer_text: 'Pyro Bot • Modération & Utilitaires',
  embed_footer_icon_url: '',
  embed_color: '#FF6B35',
  bot_status_state: 'online',
  bot_status_url: '',
};

db.serialize(() => {
  const checkStmt = db.prepare('SELECT value FROM Configs WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO Configs (key, value, createdAt, updatedAt) VALUES (?, ?, datetime("now"), datetime("now"))');

  const entries = Object.entries(CUSTOMIZATION_CONFIG);
  let remaining = entries.length;

  entries.forEach(([key, defaultValue]) => {
    checkStmt.get([key], (err, row) => {
      if (err) {
        console.error(`[Migration 04] Erreur lors de la vérification de ${key}:`, err.message);
      } else if (!row) {
        insertStmt.run([key, JSON.stringify(defaultValue)], (insertErr) => {
          if (insertErr) {
            console.error(`[Migration 04] Erreur insertion ${key}:`, insertErr.message);
          } else {
            console.log(`[Migration 04] Clé ajoutée : ${key} = ${defaultValue}`);
          }
        });
      } else {
        console.log(`[Migration 04] Clé déjà configurée : ${key} = ${row.value}`);
      }

      remaining--;
      if (remaining === 0) {
        checkStmt.finalize();
        insertStmt.finalize(() => {
          db.close((closeErr) => {
            if (closeErr) console.error('[Migration 04] Erreur fermeture base:', closeErr.message);
            else console.log('[Migration 04] Migration terminée avec succès !');
          });
        });
      }
    });
  });
});
