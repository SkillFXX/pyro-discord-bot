const { ChannelType } = require('discord.js');
const { ConfigHelper } = require('../../database');
const analyticsService = require('../../services/analyticsService');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const member = newState.member || oldState.member;
    if (!member) return;

    // Track voice analytics
    await analyticsService.handleVoiceStateUpdate(oldState, newState);

    const triggerChannelId = await ConfigHelper.get('voice_creator_channel_id');
    const categoryId = await ConfigHelper.get('voice_creator_category_id');

    if (!triggerChannelId || !categoryId) return;

    // 1. Join Trigger Channel -> Create Temporary Channel
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
        }
      } catch (error) {
        console.error('[Join-To-Create] Erreur lors de la création du salon vocal temporaire :', error);
      }
    }

    // 2. Leave Channel -> Delete if Empty
    if (oldState.channelId && oldState.channelId !== triggerChannelId) {
      try {
        const oldChannel = oldState.channel;
        
        // If channel exists and parent category matches our config parent category
        if (oldChannel && oldChannel.parentId === categoryId) {
          // Validate name starts with voice icon or check members size
          if (oldChannel.name.startsWith('🔊') && oldChannel.members.size === 0) {
            await oldChannel.delete('Salon vocal temporaire vide');
            console.log(`[Join-To-Create] Salon supprimé car vide : ${oldChannel.name}`);
          }
        }
      } catch (error) {
        console.error('[Join-To-Create] Erreur lors de la suppression du salon vocal temporaire :', error);
      }
    }
  },
};
