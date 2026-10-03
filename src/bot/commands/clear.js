const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const embeds = require('../utils/embeds');
const loggerService = require('../../services/loggerService');

/**
 * Parses a user input time string into a Date object representing the cutoff timestamp.
 * Supports:
 * - Clock time with minutes: "14:30", "14h30", "09:15", "14h00"
 * - Relative compound duration: "1h30m", "1h30", "2h15"
 * - Relative single duration: "30m", "45min", "2h", "1j", "1d", "60s"
 * - Clock hour only: "14h", "9h"
 * 
 * @param {string} input 
 * @returns {Date|null}
 */
function parseTimeOption(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();

  // 1. Clock time with minutes: "14:30", "14h30", "9h15", "09:00", "14h00"
  const clockWithMinutes = raw.match(/^(\d{1,2})[:h](\d{2})(?:[:m](\d{2}))?$/i);
  if (clockWithMinutes) {
    const hours = parseInt(clockWithMinutes[1], 10);
    const minutes = parseInt(clockWithMinutes[2], 10);
    const seconds = clockWithMinutes[3] ? parseInt(clockWithMinutes[3], 10) : 0;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
      const d = new Date();
      d.setHours(hours, minutes, seconds, 0);
      if (d.getTime() > Date.now()) {
        d.setDate(d.getDate() - 1);
      }
      return d;
    }
  }

  // 2. Relative compound duration: e.g. "1h30m", "1h30", "2h15"
  const compoundRel = raw.match(/^(\d+)\s*h(?:eures?)?\s*(\d+)\s*(?:m|min|minutes?)?$/i);
  if (compoundRel) {
    const hours = parseInt(compoundRel[1], 10);
    const mins = parseInt(compoundRel[2], 10);
    return new Date(Date.now() - (hours * 3600 + mins * 60) * 1000);
  }

  // 3. Single relative duration: "30m", "45min", "2h", "1j", "1d", "60s"
  const singleRel = raw.match(/^(\d+)\s*(s|sec|secondes?|m|min|minutes?|h|heures?|d|j|jours?)$/i);
  if (singleRel) {
    const val = parseInt(singleRel[1], 10);
    const unit = singleRel[2].toLowerCase();
    let ms = 0;
    if (unit.startsWith('s')) ms = val * 1000;
    else if (unit.startsWith('m')) ms = val * 60 * 1000;
    else if (unit.startsWith('h')) ms = val * 3600 * 1000;
    else if (unit.startsWith('d') || unit.startsWith('j')) ms = val * 86400 * 1000;
    return new Date(Date.now() - ms);
  }

  // 4. Clock hour only: "14h", "9h"
  const clockHourOnly = raw.match(/^(\d{1,2})h$/i);
  if (clockHourOnly) {
    const hours = parseInt(clockHourOnly[1], 10);
    if (hours >= 0 && hours <= 23) {
      const d = new Date();
      d.setHours(hours, 0, 0, 0);
      if (d.getTime() > Date.now()) {
        d.setDate(d.getDate() - 1);
      }
      return d;
    }
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Nettoyer des messages ou réinitialiser complètement un salon.')
    .addIntegerOption(option =>
      option
        .setName('nombre')
        .setDescription('Nombre de messages à supprimer (1 à 500)')
        .setMinValue(1)
        .setMaxValue(500)
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('heure')
        .setDescription('Supprimer depuis une heure (ex: 14:30, 14h30) ou une durée (ex: 30m, 2h)')
        .setRequired(false))
    .addBooleanOption(option =>
      option
        .setName('tout')
        .setDescription('Réinitialiser tout le salon en le dupliquant (supprime tous les messages)')
        .setRequired(false))
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Filtrer la suppression pour ne cibler que les messages de ce membre')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        embeds: [embeds.error('Cette commande ne peut être utilisée que sur un serveur.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.channel;
    const botMember = interaction.guild.members.me;

    const count = interaction.options.getInteger('nombre');
    const timeInput = interaction.options.getString('heure');
    const isAll = interaction.options.getBoolean('tout');
    const targetMember = interaction.options.getUser('membre');

    // 1. Validation: At least one cleaning option must be provided
    if (!count && !timeInput && !isAll) {
      return interaction.reply({
        embeds: [
          embeds.warning(
            'Veuillez spécifier au moins une option pour nettoyer le salon :\n\n' +
            '• **`nombre`** : Supprimer un nombre précis de messages (ex: `/clear nombre:50`)\n' +
            '• **`heure`** : Supprimer les messages depuis une heure ou durée (ex: `/clear heure:14:30` ou `/clear heure:1h`)\n' +
            '• **`tout`** : Réinitialiser tout le salon en le dupliquant (ex: `/clear tout:Vrai`)\n' +
            '• **`membre`** *(optionnel)* : Cibler uniquement les messages d\'un membre précis.'
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ==========================================
    // CASE A: RESET WHOLE CHANNEL (/clear tout:true)
    // ==========================================
    if (isAll) {
      // Check permissions for channel management
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          embeds: [embeds.error('Vous devez disposer de la permission `Gérer les salons` pour réinitialiser complètement un salon.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          embeds: [embeds.error('Le bot ne possède pas la permission `Gérer les salons` pour dupliquer et supprimer ce salon.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (channel.isThread() || typeof channel.clone !== 'function') {
        return interaction.reply({
          embeds: [embeds.error('Impossible de dupliquer ce type de salon (ex: fil de discussion). Utilisez plutôt l\'option `nombre`.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: '⏳ Duplication et réinitialisation complète du salon en cours...',
        flags: MessageFlags.Ephemeral,
      });

      try {
        const originalPosition = channel.rawPosition ?? channel.position;
        const channelName = channel.name;
        const oldChannelId = channel.id;

        // Clone the channel with all settings, permissions, topic, category
        const newChannel = await channel.clone({
          name: channel.name,
          permissionOverwrites: channel.permissionOverwrites.cache,
          topic: channel.topic,
          nsfw: channel.nsfw,
          parent: channel.parentId,
          rateLimitPerUser: channel.rateLimitPerUser,
          reason: `Salon réinitialisé (/clear tout) par ${interaction.user.tag}`,
        });

        // Restore original position in channel hierarchy
        await newChannel.setPosition(originalPosition).catch(() => {});

        // Delete the original channel
        await channel.delete(`Salon réinitialisé (/clear tout) par ${interaction.user.tag}`);

        // Post success embed in the clean new channel
        const confirmEmbed = embeds.custom(
          '🧹 Salon Réinitialisé',
          `Ce salon a été entièrement réinitialisé par ${interaction.user}.\nTous les anciens messages ont été effacés.`,
          embeds.COLORS.SUCCESS
        );

        const confirmMsg = await newChannel.send({ embeds: [confirmEmbed] });

        // Auto-delete the confirmation embed after 15 seconds to keep the channel clean
        setTimeout(() => confirmMsg.delete().catch(() => {}), 15000);

        // Moderation Logging
        await loggerService.log(client, 'log_bot_moderation', {
          title: '🧹 Réinitialisation de salon (/clear tout)',
          fields: [
            { name: '📺 Ancien Salon', value: `#${channelName} (\`${oldChannelId}\`)`, inline: true },
            { name: '📺 Nouveau Salon', value: `${newChannel} (\`${newChannel.id}\`)`, inline: true },
            { name: '🛡️ Modérateur', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
          ],
          color: embeds.COLORS.SUCCESS,
        });

      } catch (err) {
        console.error('[Command /clear tout] Erreur :', err);
      }
      return;
    }

    // ==========================================
    // CASE B: DELETE MESSAGES (BY COUNT OR TIME)
    // ==========================================

    // Permission check for bot
    if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [embeds.error('Le bot ne possède pas la permission `Gérer les messages` dans ce salon.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    let timeTarget = null;
    if (timeInput) {
      timeTarget = parseTimeOption(timeInput);
      if (!timeTarget) {
        return interaction.reply({
          embeds: [
            embeds.error(
              'Format d\'heure ou de durée non reconnu.\n\n' +
              '**Exemples valides :**\n' +
              '• Heure précise : `14:30`, `14h30`, `14h`, `09:15`\n' +
              '• Durée relative : `30m`, `45min`, `2h`, `1h30m`, `1j`'
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const cutoffTimestamp = timeTarget ? timeTarget.getTime() : null;
      const targetLimit = count || (timeTarget ? 500 : 100);

      const messagesToDelete = [];
      let lastId = null;
      let skippedOldCount = 0;
      let keepFetching = true;

      while (keepFetching && messagesToDelete.length < targetLimit) {
        const fetchLimit = Math.min(targetLimit - messagesToDelete.length, 100);
        const fetchOptions = { limit: fetchLimit };
        if (lastId) fetchOptions.before = lastId;

        const fetched = await channel.messages.fetch(fetchOptions);
        if (fetched.size === 0) break;

        for (const msg of fetched.values()) {
          // If cutoff time reached, stop fetching older messages
          if (cutoffTimestamp && msg.createdTimestamp < cutoffTimestamp) {
            keepFetching = false;
            break;
          }

          // Check Discord 14-day limit for bulk delete
          const isUnder14Days = (Date.now() - msg.createdTimestamp) < 14 * 24 * 60 * 60 * 1000 - 60000;
          if (!isUnder14Days) {
            skippedOldCount++;
            continue;
          }

          // Target member filter if requested
          if (!targetMember || msg.author.id === targetMember.id) {
            messagesToDelete.push(msg);
            if (messagesToDelete.length >= targetLimit) {
              keepFetching = false;
              break;
            }
          }
        }

        lastId = fetched.lastKey();
        if (fetched.size < fetchLimit) break;
      }

      if (messagesToDelete.length === 0) {
        let msg = 'Aucun message correspondant n\'a été trouvé';
        if (skippedOldCount > 0) {
          msg += ` (${skippedOldCount} message${skippedOldCount > 1 ? 's datent' : ' date'} de plus de 14 jours et ne ${skippedOldCount > 1 ? 'peuvent' : 'peut'} pas être supprimé${skippedOldCount > 1 ? 's' : ''} en masse par Discord. Utilisez \`/clear tout:Vrai\` pour tout réinitialiser).`;
        } else {
          msg += '.';
        }
        return interaction.editReply({ embeds: [embeds.warning(msg)] });
      }

      // Perform deletion in batches of up to 100
      let deletedTotal = 0;
      for (let i = 0; i < messagesToDelete.length; i += 100) {
        const batch = messagesToDelete.slice(i, i + 100);
        if (batch.length === 1) {
          await batch[0].delete().catch(() => null);
          deletedTotal += 1;
        } else {
          const deleted = await channel.bulkDelete(batch, true);
          deletedTotal += deleted.size;
        }
      }

      // Build confirmation feedback
      let desc = `**${deletedTotal}** message${deletedTotal > 1 ? 's ont été supprimés' : ' a été supprimé'} avec succès.`;
      if (targetMember) {
        desc += `\n👤 **Auteur ciblé :** ${targetMember}`;
      }
      if (timeTarget) {
        desc += `\n⏰ **Depuis :** <t:${Math.floor(timeTarget.getTime() / 1000)}:R> (<t:${Math.floor(timeTarget.getTime() / 1000)}:T>)`;
      }
      if (skippedOldCount > 0) {
        desc += `\n\n⚠️ *${skippedOldCount} message${skippedOldCount > 1 ? 's datant' : ' datant'} de plus de 14 jours ${skippedOldCount > 1 ? 'ont' : 'a'} été ignoré${skippedOldCount > 1 ? 's' : ''} (limitation technique de Discord). Pour vider entièrement le salon, utilisez \`/clear tout:Vrai\`.*`;
      }

      await interaction.editReply({
        embeds: [embeds.success(desc, '🧹 Nettoyage terminé')],
      });

      // Moderation Logging
      await loggerService.log(client, 'log_bot_moderation', {
        title: '🧹 Nettoyage de messages (/clear)',
        fields: [
          { name: '📺 Salon', value: `${channel} (\`${channel.id}\`)`, inline: true },
          { name: '🛡️ Modérateur', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
          { name: '🔢 Messages supprimés', value: `\`${deletedTotal}\``, inline: true },
          ...(targetMember ? [{ name: '👤 Membre ciblé', value: `${targetMember} (\`${targetMember.id}\`)`, inline: true }] : []),
          ...(timeTarget ? [{ name: '⏰ Depuis', value: `<t:${Math.floor(timeTarget.getTime() / 1000)}:T>`, inline: true }] : []),
        ],
        color: embeds.COLORS.SUCCESS,
      });

    } catch (err) {
      console.error('[Command /clear] Erreur :', err);
      return interaction.editReply({
        embeds: [embeds.error(err.message || 'Une erreur est survenue lors de la suppression des messages.')],
      });
    }
  },
};
