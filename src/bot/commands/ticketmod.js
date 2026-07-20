const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ConfigHelper } = require('../../database');
const embeds = require('../utils/embeds');
const { logModerationAction } = require('../utils/moderationHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketmod')
    .setDescription('Commandes de modération et gestion des tickets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    
    // Subcommand: Add
    .addSubcommand(subcommand =>
      subcommand.setName('add')
        .setDescription('Ajouter un membre dans le ticket actuel.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à ajouter')
            .setRequired(true)))
            
    // Subcommand: Remove
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Retirer un membre du ticket actuel.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre à retirer')
            .setRequired(true)))
            
    // Subcommand: Open
    .addSubcommand(subcommand =>
      subcommand.setName('open')
        .setDescription('Ouvrir manuellement un ticket pour un membre.')
        .addUserOption(option =>
          option.setName('membre')
            .setDescription('Le membre pour qui ouvrir le ticket')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('sujet')
            .setDescription('Sujet du ticket')
            .setRequired(false))),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser('membre');

    // For Add and Remove, verify we are inside a ticket channel
    if (subcommand === 'add' || subcommand === 'remove') {
      const channel = interaction.channel;
      const isTicket = channel.name.startsWith('ticket-') && channel.type === ChannelType.GuildText;

      if (!isTicket) {
        return interaction.reply({
          embeds: [embeds.error('Cette commande doit être exécutée à l\'intérieur d\'un salon de ticket.')],
          ephemeral: true
        });
      }

      await interaction.deferReply();

      try {
        if (subcommand === 'add') {
          await channel.permissionOverwrites.edit(target.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          });

          await interaction.editReply({
            embeds: [embeds.success(`${target} a été ajouté au ticket.`)]
          });

          await logModerationAction(client, {
            action: '🎫 Ticket - Membre Ajouté',
            target: target,
            moderator: interaction.user,
            reason: `Salon: #${channel.name}`,
          });
        } 
        else if (subcommand === 'remove') {
          // Prevent removing the ticket owner if they are still tracked
          const match = channel.topic ? channel.topic.match(/Auteur ID: (\d+)/) : null;
          const authorId = match ? match[1] : null;

          if (target.id === authorId) {
            return interaction.editReply({
              embeds: [embeds.error('Vous ne pouvez pas retirer l\'auteur d\'origine du ticket. Utilisez plutôt la fermeture du ticket.')]
            });
          }

          await channel.permissionOverwrites.edit(target.id, {
            ViewChannel: false,
          });

          await interaction.editReply({
            embeds: [embeds.success(`${target} a été retiré du ticket.`)]
          });

          await logModerationAction(client, {
            action: '🎫 Ticket - Membre Retiré',
            target: target,
            moderator: interaction.user,
            reason: `Salon: #${channel.name}`,
          });
        }
      } catch (error) {
        console.error('Error modifying ticket permissions:', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de la modification des permissions.')]
        });
      }
    }

    // Subcommand: Open
    else if (subcommand === 'open') {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const subject = interaction.options.getString('sujet') || 'Ouverture manuelle par la modération';
      
      const categoryId = await ConfigHelper.get('ticket_category_id');
      const staffRoleId = await ConfigHelper.get('ticket_staff_role_id');

      if (!categoryId) {
        return interaction.editReply({
          embeds: [embeds.error('Le système de tickets n\'est pas encore configuré (catégorie manquante).')]
        });
      }

      try {
        const category = await guild.channels.fetch(categoryId).catch(() => null);
        if (!category) {
          return interaction.editReply({
            embeds: [embeds.error('La catégorie configurée pour les tickets est introuvable ou invalide.')]
          });
        }

        // Permissions overwrites
        const permissionOverwrites = [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: target.id, // The ticket target
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
            ],
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageRoles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          }
        ];

        if (staffRoleId) {
          permissionOverwrites.push({
            id: staffRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
            ],
          });
        }

        const channelName = `ticket-${target.username.substring(0, 15)}-${target.id.substring(target.id.length - 4)}`;
        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId,
          topic: `Ticket de ${target.username} | Auteur ID: ${target.id} | Sujet: ${subject} (Modérateur: ${interaction.user.username})`,
          permissionOverwrites,
        });

        const controlEmbed = embeds.custom(
          `🎫 Ticket - ${target.username}`,
          `Ce ticket a été ouvert par le modérateur **${interaction.user.username}** pour ${target}.\n\n` +
          `**Sujet :** ${subject}\n\n` +
          `Vous pouvez utiliser les boutons ci-dessous pour gérer ce ticket.`,
          embeds.COLORS.PRIMARY,
          null,
          null,
          null,
          { text: `ID Auteur: ${target.id}` }
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_close_btn')
            .setLabel('🔒 Fermer')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('ticket_delete_btn')
            .setLabel('🗑️ Supprimer')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          content: `${target} | ${staffRoleId ? `<@&${staffRoleId}>` : 'Staff'}`,
          embeds: [controlEmbed],
          components: [row]
        });

        await interaction.editReply({
          embeds: [embeds.success(`Le ticket a été créé avec succès : ${ticketChannel}`)]
        });

        await logModerationAction(client, {
          action: '🎫 Ticket Ouvert par Staff',
          target: target,
          moderator: interaction.user,
          reason: `Salon: #${channelName} | Sujet: ${subject}`,
        });

      } catch (error) {
        console.error('Error opening ticket for user:', error);
        await interaction.editReply({
          embeds: [embeds.error('Une erreur est survenue lors de l\'ouverture du ticket.')]
        });
      }
    }
  },
};
