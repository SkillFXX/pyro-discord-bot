import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    TOKEN = os.getenv("TOKEN")
    DB_PATH = os.getenv("DB_PATH", "./db/bot_data.sqlite3")