import discord
from discord.ext import commands
from db import database
import asyncio

class ListenerCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    def check_rules(self, guild_id, channel_id, content):
        content_lower = content.lower()
        violated_rules = []

        rules = database.get_listener_rules(guild_id, channel_id)
        print(rules)

    @commands.Cog.listener()
    async def on_thread_create(self, thread):
        try:
            await asyncio.sleep(1)
            async for message in thread.history(limit=1, oldest_first=True):
                if message.author.bot:
                    return
            
            guild_id = thread.guild.id if thread.guild else None
            channel_id = thread.parent.id if thread.parent else None

            full_content = f"{thread.name} {message.content}"
            self.check_rules(guild_id, channel_id, full_content)

        except Exception as e:
            print(f"Error [on_thread_create | cogs/listener.py ] : {e}")

    @commands.Cog.listener()
    async def on_message(self, message):
        # Ignorer les messages du bot lui-même
        print()
        
        
      


       
        
async def setup(bot):
    await bot.add_cog(ListenerCog(bot))