import discord
from discord.ext import commands
from db import database
import asyncio
import datetime

class ListenerCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    def check_rules(self, guild_id, channel_id, message):
        content_lower = message.content.lower()
        media_count = len(message.attachments)  # Comptage des médias
        violated_rule = None

        rules = database.get_listener_rules(guild_id, channel_id)

        for rule in rules:
            rule_value = rule['rule']

            if rule_value.startswith("min_char"):
                min_len = int(rule_value.split(":")[1])
                if len(content_lower.strip()) < min_len:
                    violated_rule = rule
                    break

            elif rule_value.startswith("max_char"):
                max_len = int(rule_value.split(":")[1])
                if len(content_lower.strip()) > max_len:
                    violated_rule = rule
                    break

            elif rule_value.startswith("keywords"):
                keywords = [k.strip().lower() for k in rule_value.split(":")[1].split(",")]
                if not any(keyword in content_lower for keyword in keywords):
                    violated_rule = rule
                    break

            elif rule_value.startswith("banned_keywords"):
                banned_keywords = [k.strip().lower() for k in rule_value.split(":")[1].split(",")]
                if any(keyword in content_lower for keyword in banned_keywords):
                    violated_rule = rule
                    break

            elif rule_value.startswith("min_media"):
                min_media = int(rule_value.split(":")[1])
                if media_count < min_media:
                    violated_rule = rule
                    break

            elif rule_value.startswith("max_media"):
                max_media = int(rule_value.split(":")[1])
                if media_count > max_media:
                    violated_rule = rule
                    break

        return violated_rule


    async def apply_consequences(self, message_or_thread, rule, user=None):
        if isinstance(message_or_thread, (discord.Message, discord.Thread)):
            guild = message_or_thread.guild
        else:
            return

        if not guild:
            return

        if rule.get('message_consequence') == "delete":
            try:
                if isinstance(message_or_thread, discord.Thread):
                    await message_or_thread.delete()
                    print(f"Thread '{message_or_thread.name}' supprimé.")
                elif isinstance(message_or_thread, discord.Message):
                    await message_or_thread.delete()
                    print(f"Message de {message_or_thread.author} supprimé.")
            except Exception as e:
                print(f"Failed to delete: {e}")

        if not user:
            if isinstance(message_or_thread, discord.Message):
                user = message_or_thread.author
            else:
                return

        if rule.get('user_consequence') == "mp":
            try:
                await user.send(f"⚠️ Votre message a enfreint une règle: {rule.get('description', '')}")
            except Exception as e:
                print(f"Failed to send MP: {e}")

        elif rule.get('user_consequence') == "warn":
            try:
                channel = getattr(message_or_thread, 'channel', None)
                if channel:
                    await channel.send(f"⚠️ {user.mention}, attention : {rule.get('description', '')}")
            except Exception as e:
                print(f"Failed to warn user: {e}")

        elif rule.get('user_consequence') == "mute":
            try:
                if isinstance(user, discord.Member):
                    await user.timeout(datetime.timedelta(minutes=10), reason=rule.get('description', ''))
            except Exception as e:
                print(f"Failed to mute user: {e}")


    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot:
            return

        violated_rule = self.check_rules(
            message.guild.id, 
            message.channel.id, 
            message  
        )
        if violated_rule:
            await self.apply_consequences(message, violated_rule)


    @commands.Cog.listener()
    async def on_thread_create(self, thread):
        await asyncio.sleep(1)
        async for message in thread.history(limit=1, oldest_first=True):
            if message.author.bot:
                return

            violated_rule = self.check_rules(
                thread.guild.id, 
                thread.parent.id, 
                message
            )

            if violated_rule:
                await self.apply_consequences(thread, violated_rule, user=message.author)



        
async def setup(bot):
    await bot.add_cog(ListenerCog(bot))