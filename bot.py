import discord
from discord.ext import commands
from config import Config
from db import database


TOKEN = Config.TOKEN

class MyBot(commands.Bot):
    async def setup_hook(self):
        for extension in ['listener', 'config']:
            await self.load_extension(f'cogs.{extension}')

    async def on_ready(self):
        synced = await bot.tree.sync()
        print(f"{len(synced)} globally synchronized commands")
        print(f"Logged as {self.user} (ID : {self.user.id})")

intents = discord.Intents.all()
bot = MyBot(command_prefix='%', intents=intents)
database.init_db()


bot.run(token=TOKEN) 