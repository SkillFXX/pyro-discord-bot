const { ChannelType } = require('discord.js');
const { ConfigHelper } = require('../../database');
const analyticsService = require('../../services/analyticsService');
const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    // Track voice analytics
    await analyticsService.handleVoiceStateUpdate(oldState, newState);

    const triggerChannelId = await ConfigHelper.get('voice_creator_channel_id');
    const categoryId = await ConfigHelper.get('voice_creator_category_id');

    // 1. General Discord Voice Activity Logs
    if (oldState.channelId !== newState.channelId) {
      if (!oldState.channelId && newState.channelId) {
        // Rejoint un salon vocal
        await loggerService.log(client, 'log_discord_voice_activity', {
          title: '🔊 Connexion Vocale',
          description: `${member} a rejoint le salon vocal **#${newState.channel.name}**.`,
          color: '#2ECC71',
          fields: [
            { name: '👤 Utilisateur', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: '📍 Salon', value: `🔊 #${newState.channel.name}`, inline: true },
          ],
          footer: { text: `Membre ID: ${member.id}` },
        });
      } else if (oldState.channelId && !newState.channelId) {
        // Quitte un salon vocal
        await loggerService.log(client, 'log_discord_voice_activity', {
          title: '🔇 Déconnexion Vocale',
          description: `${member} a quitté le salon vocal **#${oldState.channel?.name || 'Inconnu'}**.`,
          color: '#E74C3C',
          fields: [
            { name: '👤 Utilisateur', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: '📍 Salon Quitté', value: `🔊 #${oldState.channel?.name || 'Inconnu'}`, inline: true },
          ],
          footer: { text: `Membre ID: ${member.id}` },
        });
      } else if (oldState.channelId && newState.channelId) {
        // Change de salon vocal
        await loggerService.log(client, 'log_discord_voice_activity', {
          title: '🔄 Changement de Salon Vocal',
          description: `${member} s'est déplacé de salon vocal.`,
          color: '#3498DB',
          fields: [
            { name: '👤 Utilisateur', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: 'De', value: `🔊 #${oldState.channel?.name || 'Inconnu'}`, inline: true },
            { name: 'Vers', value: `🔊 #${newState.channel?.name || 'Inconnu'}`, inline: true },
          ],
          footer: { text: `Membre ID: ${member.id}` },
        });
      }
    }

    if (!triggerChannelId || !categoryId) return;

    // 2. Join Trigger Channel -> Create Temporary Channel
    if (newState.channelId === triggerChannelId) {
      try {
        const guild = newState.guild;
        const category = guild.channels.cache.get(categoryId);

        if (category && category.type === ChannelType.GuildCategory) {
          // Create temporary voice channel
          const tempChannel = await guild.channels.create({
            name: `🔊 ${member.displayName}`,
            type: ChannelType.GuildVoice,
            parent: categoryId,
            permissionOverwrites: [
              {
                id: member.id,
                allow: ['ManageChannels', 'MuteMembers', 'DeafenMembers', 'MoveMembers'],
              }
            ]
          });

          // Move member to the new channel
          await member.voice.setChannel(tempChannel);
          console.log(`[Join-To-Create] Salon créé et membre déplacé : ${tempChannel.name} (${tempChannel.id})`);

          // Log Bot Join-to-Create Action
          await loggerService.log(client, 'log_bot_voice_create', {
            title: '✨ Salon Vocal Éphémère Créé',
            description: `Un salon vocal temporaire a été créé pour **${member.displayName}**.`,
            color: '#FF6B35',
            fields: [
              { name: '👤 Propriétaire', value: `${member} (\`${member.id}\`)`, inline: true },
              { name: '🔊 Salon Créé', value: `${tempChannel.name} (\`${tempChannel.id}\`)`, inline: true },
            ],
            footer: { text: 'Pyro Join-to-Create' },
          });
        }
      } catch (error) {
        console.error('[Join-To-Create] Erreur lors de la création du salon vocal temporaire :', error);
      }
    }

    // 3. Leave Channel -> Delete if Empty (only when member actually left or moved)
    if (oldState.channelId && oldState.channelId !== newState.channelId && oldState.channelId !== triggerChannelId) {
      try {
        const oldChannel = oldState.channel;
        
        // If channel exists and parent category matches our config parent category
        if (oldChannel && oldChannel.parentId === categoryId) {
          // Validate name starts with voice icon or check members size
          if (oldChannel.name.startsWith('🔊') && oldChannel.members.size === 0) {
            const channelName = oldChannel.name;
            const channelIdSaved = oldChannel.id;
            await oldChannel.delete('Salon vocal temporaire vide');
            console.log(`[Join-To-Create] Salon supprimé car vide : ${channelName}`);

            // Log Bot Join-to-Create Deletion
            await loggerService.log(client, 'log_bot_voice_create', {
              title: '🧹 Salon Vocal Éphémère Supprimé',
              description: `Le salon **${channelName}** était vide et a été supprimé automatiquement.`,
              color: '#95A5A6',
              fields: [
                { name: 'Nom du Salon', value: channelName, inline: true },
                { name: 'ID du Salon', value: `\`${channelIdSaved}\``, inline: true },
              ],
              footer: { text: 'Pyro Join-to-Create' },
            });
          }
        }
      } catch (error) {
        console.error('[Join-To-Create] Erreur lors de la suppression du salon vocal temporaire :', error);
      }
    }
  },
};
