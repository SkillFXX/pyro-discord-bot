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
        message_consequence TEXT,
        user_consequence TEXT
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

def create_rule(guild_id:int, channel_id:int, rule_type:str, rule_value:str, message_consequence:str, user_consequence:str, description:str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO listener_rules (guild_id, channel_id, rule, description, message_consequence, user_consequence)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (guild_id, channel_id, f"{rule_type}:{rule_value}", description, message_consequence, user_consequence))
    conn.commit()
    conn.close()

def delete_rule(guild_id: int, rule_id: int) -> bool:
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM listener_rules WHERE id = ? AND guild_id = ?", (rule_id, guild_id))
    conn.commit()
    deleted = c.rowcount > 0
    conn.close()
    return deleted

def list_rules(guild_id: int):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, channel_id, rule, description, message_consequence, user_consequence FROM listener_rules WHERE guild_id = ?", (guild_id,))
    rows = c.fetchall()
    conn.close()
    return rows

