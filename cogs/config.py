import discord 
from discord import app_commands
from discord.ext import commands
from db import database
import sqlite3

class ConfigCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    # ➡️ Ajouter une règle
    @app_commands.command(name="add_channel_rule", description="Configure rules for a channel")
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
            f"✅ New rule added to {channel.mention}",
            ephemeral=True
        )

    # ➡️ Supprimer une règle
    @app_commands.command(name="delete_channel_rule", description="Delete a rule by its ID")
    @app_commands.describe(rule_id="ID of the rule to delete")
    async def delete_channel_rule(self, interaction: discord.Interaction, rule_id: int):
        if database.delete_rule(interaction.guild_id, rule_id):
            await interaction.response.send_message(f"🗑️ Rule with ID `{rule_id}` deleted successfully.", ephemeral=True)
        else:
            await interaction.response.send_message(f"⚠️ No rule with ID `{rule_id}` found in this server.", ephemeral=True)

    # ➡️ Lister toutes les règles
    @app_commands.command(name="list_channel_rules", description="List all rules of this server")
    async def list_channel_rules(self, interaction: discord.Interaction):
        rows = database.list_rules(interaction.guild_id)

        if not rows:
            await interaction.response.send_message("📭 No rules configured for this server.", ephemeral=True)
            return

        embed = discord.Embed(title="📋 Server Rules", color=discord.Color.blue())
        for row in rows:
            rule_id, channel_id, rule, description, msg_cons, user_cons = row
            channel = interaction.guild.get_channel(channel_id)
            embed.add_field(
                name=f"ID {rule_id} - {channel.mention if channel else '#deleted-channel'}",
                value=f"**Rule:** `{rule}`\n**Desc:** {description}\n**Message:** {msg_cons}\n**User:** {user_cons}",
                inline=False
            )

        await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(ConfigCog(bot))
