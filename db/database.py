import sqlite3
from config import Config

def get_connection():
    conn = sqlite3.connect(Config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS listener_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER,
        channel_id INTEGER,
        rule TEXT,
        description TEXT,
        consequence TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)


    conn.commit()
    conn.close()

def get_listener_rules(guild_id: int, channel_id: int):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM listener_rules
        WHERE guild_id = ? AND channel_id = ?
    """, (guild_id, channel_id))
    rows = c.fetchall()
    conn.close()
    
    # retourne une liste de dictionnaires
    return [dict(row) for row in rows]
