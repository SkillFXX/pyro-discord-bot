const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration: Add customReason to AutomodRules');

db.serialize(() => {
  db.all("PRAGMA table_info(AutomodRules)", (err, rows) => {
    let tableName = 'AutomodRules';
    if (err || rows.length === 0) {
        tableName = 'AutomodRule';
    }
    
    db.all("PRAGMA table_info(" + tableName + ")", (err, rows) => {
        if (err || !rows) {
             console.error('Error fetching table info for', tableName, err);
             return db.close();
        }
        const hasCustomReason = rows.some(col => col.name === 'customReason');

        if (!hasCustomReason) {
          db.run("ALTER TABLE " + tableName + " ADD COLUMN customReason VARCHAR(255) NULL", (err) => {
            if (err) {
              console.error('Error adding column customReason:', err);
            } else {
              console.log('Migration successful: customReason added to AutomodRule.');
            }
            db.close();
          });
        } else {
          console.log('Migration skipped: customReason already exists.');
          db.close();
        }
    });
  });
});
