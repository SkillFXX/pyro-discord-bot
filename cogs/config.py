import discord
from discord import app_commands
from discord.ext import commands
from db import database

class ConfigCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="config", description="Configure rules for a channel")
    @app_commands.describe(
        channel="Choose a channel",
        rule_value="Value of the rule",
        description="Description of the rule",
    )
    @app_commands.choices(
        rule_type=[
            app_commands.Choice(name="Minimum number of characters", value="min_char"),
            app_commands.Choice(name="Maximum number of characters", value="max_char"),
            app_commands.Choice(name="Minimum number of media", value="min_media"),
            app_commands.Choice(name="Maximum number of media", value="max_media"),
            app_commands.Choice(name="Keywords to include (separated by commas)", value="keywords"),
            app_commands.Choice(name="Banned keyword (separated by commas)", value="banned_keywords"),
        ],
        message_consequence=[
            app_commands.Choice(name="Keep", value="keep"),
            app_commands.Choice(name="Delete message", value="delete"),
        ],
        user_consequence=[
            app_commands.Choice(name="Nothing", value="nothing"),
            app_commands.Choice(name="Warn MP", value="mp"),
            app_commands.Choice(name="Warn", value="warn"),
            app_commands.Choice(name="Mute", value="mute"),
        ]
    )
    async def config(
        self,
        interaction: discord.Interaction,
        channel: discord.TextChannel | discord.ForumChannel,
        rule_type: app_commands.Choice[str],
        rule_value: str,
        message_consequence: app_commands.Choice[str],
        user_consequence: app_commands.Choice[str],
        description: str,
    ):
        database.create_rule(interaction.guild_id, channel.id, rule_type.value, rule_value, message_consequence.value, user_consequence.value, description)
        await interaction.response.send_message(
            f"✅ New rule added to {channel.mention}"
        )

async def setup(bot):
    await bot.add_cog(ConfigCog(bot))