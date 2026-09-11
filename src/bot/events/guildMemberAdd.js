const { ConfigHelper, AutoRole } = require('../../database');
const embeds = require('../utils/embeds');
const analyticsService = require('../../services/analyticsService');
const loggerService = require('../../services/loggerService');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const guild = member.guild;

    // Track member join in analytics
    await analyticsService.recordMemberJoin(member);

    // 1. Auto-Roles
    try {
      const autoRoles = await AutoRole.findAll();
      if (autoRoles.length > 0) {
        const roleIds = autoRoles.map(r => r.roleId);
        const validRoles = [];
        
        for (const roleId of roleIds) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            // Check if the bot can assign this role (its position must be below bot's highest role)
            if (role.position < guild.members.me.roles.highest.position) {
              validRoles.push(role);
            } else {
              console.warn(`[Auto-Role] Cannot assign role ${role.name} (${roleId}) - higher than bot permissions.`);
            }
          }
        }

        if (validRoles.length > 0) {
          await member.roles.add(validRoles, 'Auto-Role de Bienvenue');
          console.log(`[Auto-Role] Attribution de ${validRoles.length} rôle(s) à ${member.user.tag}`);
        }
      }
    } catch (error) {
      console.error('[Auto-Role] Erreur lors de l\'attribution des rôles automatiques :', error);
    }

    // 2. Welcome Message
    try {
      const welcomeChannelId = await ConfigHelper.get('welcome_channel_id');
      const welcomeMessageTemplate = await ConfigHelper.get('welcome_message_template');

      if (welcomeChannelId && welcomeMessageTemplate) {
        const channel = await guild.channels.fetch(welcomeChannelId).catch(() => null);
        if (channel) {
          // Replace placeholders
          const formattedMessage = welcomeMessageTemplate
            .replace(/{user}/g, `${member}`)
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, guild.name)
            .replace(/{memberCount}/g, guild.memberCount.toString());

          const embed = embeds.custom(
            `👋 Nouveau Membre !`,
            formattedMessage,
            embeds.COLORS.SUCCESS,
            null,
            member.user.displayAvatarURL({ dynamic: true })
          );

          await channel.send({ content: `${member}`, embeds: [embed] });
        }
      }
    } catch (error) {
      console.error('[Welcome Event] Erreur lors de l\'envoi du message de bienvenue :', error);
    }

    // 3. Log Discord Member / Bot Join
    try {
      const accountCreatedAt = Math.floor(member.user.createdTimestamp / 1000);
      if (member.user.bot) {
        await loggerService.log(client, 'log_discord_bot_add', {
          title: '🤖 Nouveau Bot / Intégration Ajouté',
          description: `L'application ${member} (\`${member.user.tag}\`) a été ajoutée au serveur.`,
          color: '#9B59B6',
          thumbnail: member.user.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '🤖 Nom de l\'Application', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: '📅 Création du Compte', value: `<t:${accountCreatedAt}:R>`, inline: true },
            { name: '👥 Membres Totaux', value: `${guild.memberCount}`, inline: true },
          ],
          footer: { text: `Bot ID: ${member.id}` }
        });
      } else {
        await loggerService.log(client, 'log_discord_member_join', {
          title: '📥 Nouveau Membre Arrivé',
          description: `${member} (\`${member.user.tag}\`) a rejoint le serveur.`,
          color: '#2ECC71',
          thumbnail: member.user.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '👤 Utilisateur', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: '📅 Création du Compte', value: `<t:${accountCreatedAt}:R>`, inline: true },
            { name: '👥 Membres Totaux', value: `${guild.memberCount}`, inline: true },
          ],
          footer: { text: `Membre ID: ${member.id}` }
        });
      }
    } catch (error) {
      console.error('[LoggerService] Erreur log member join/bot add:', error);
    }
  },
};
