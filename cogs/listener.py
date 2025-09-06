import discord
from discord.ext import commands

class ListenerCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_thread_create(self, thread):
        if thread.author.bot:
            return

    @commands.Cog.listener()
    async def on_message(self, message):
        # Ignorer les messages du bot lui-même
        if message.author.bot:
            return

       
        
async def setup(bot):
    await bot.add_cog(ListenerCog(bot))