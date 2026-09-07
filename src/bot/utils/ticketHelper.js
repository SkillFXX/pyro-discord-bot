const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { ConfigHelper } = require('../../database');
const embeds = require('./embeds');
const { logModerationAction } = require('./moderationHelper');

/**
 * Opens the Ticket creation modal for a user.
 */
async function showTicketModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_creation_modal')
    .setTitle('Créer un Ticket');

  const subjectInput = new TextInputBuilder()
    .setCustomId('ticket_subject')
    .setLabel('Sujet de votre demande')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Expliquez brièvement votre problème...')
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(200);

  const row = new ActionRowBuilder().addComponents(subjectInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Handles the ticket creation modal submission.
 */
async function handleTicketModalSubmit(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user = interaction.user;
  const subject = interaction.fields.getTextInputValue('ticket_subject');

  // Fetch ticket configurations
  const categoryId = await ConfigHelper.get('ticket_category_id');
  const staffRoleId = await ConfigHelper.get('ticket_staff_role_id');

  if (!categoryId) {
    return interaction.editReply({
      embeds: [embeds.error('Le système de tickets n\'est pas encore configuré (catégorie manquante). Veuillez contacter un administrateur.')]
    });
  }

  try {
    const category = await guild.channels.fetch(categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return interaction.editReply({
        embeds: [embeds.error('La catégorie configurée pour les tickets est introuvable ou invalide.')]
      });
    }

    // Permission Overwrites
    const permissionOverwrites = [
      {
        id: guild.id, // @everyone
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id, // The ticket author
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: guild.members.me.id, // The bot itself
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

    // Add Staff role permissions if configured
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

    // Create the channel
    const channelName = `ticket-${user.username.substring(0, 15)}-${user.id.substring(user.id.length - 4)}`;
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Ticket de ${user.username} | Auteur ID: ${user.id} | Sujet: ${subject} | Membres ajoutés: `,
      permissionOverwrites,
    });

    // Send control panel in the ticket channel
    const controlEmbed = embeds.custom(
      `🎫 Ticket - ${user.username}`,
      `Bienvenue dans votre ticket.\n\n` +
      `**Sujet :** ${subject}\n\n` +
      `Un membre du staff va s'occuper de vous. En attendant, veuillez détailler votre demande.\n` +
      `Vous pouvez utiliser les boutons ci-dessous pour gérer ce ticket.`,
      embeds.COLORS.PRIMARY,
      null,
      null,
      null,
      { text: `ID Auteur: ${user.id}` }
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
      content: `${user} | ${staffRoleId ? `<@&${staffRoleId}>` : 'Staff'}`,
      embeds: [controlEmbed],
      components: [row]
    });

    // Notify user of success
    await interaction.editReply({
      embeds: [embeds.success(`Votre ticket a été créé avec succès : ${ticketChannel}`)]
    });

    // Log the creation
    await logModerationAction(client, {
      action: '🎫 Ticket Créé',
      target: user,
      moderator: user,
      reason: `Salon: #${channelName} | Sujet: ${subject}`,
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    await interaction.editReply({
      embeds: [embeds.error('Une erreur est survenue lors de la création du ticket.')]
    });
  }
}

/**
 * Closes the ticket by removing the user's access and added members
 */
async function closeTicket(interaction, client) {
  const channel = interaction.channel;
  
  // Extract Author ID from topic
  const match = channel.topic ? channel.topic.match(/Auteur ID: (\d+)/) : null;
  const authorId = match ? match[1] : null;

  // Extract added members from topic
  const membersMatch = channel.topic ? channel.topic.match(/Membres ajoutés: (.+)$/) : null;
  const addedMembersStr = membersMatch ? membersMatch[1].trim() : '';
  const addedMembers = addedMembersStr ? addedMembersStr.split(',').map(id => id.trim()).filter(id => id !== '') : [];

  if (!authorId) {
    return interaction.reply({
      embeds: [embeds.error('Impossible d\'identifier l\'auteur du ticket dans la description du salon.')],
      ephemeral: true
    });
  }

  // Authorization check: only the author or staff/admin can close
  const staffRoleId = await ConfigHelper.get('ticket_staff_role_id');
  const isStaffOrAdmin = 
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    (staffRoleId && interaction.member.roles.cache.has(staffRoleId));

  const isAuthor = interaction.user.id === authorId;

  if (!isAuthor && !isStaffOrAdmin) {
    return interaction.reply({
      embeds: [embeds.error('Seul l\'auteur du ticket ou un membre du staff est autorisé à fermer ce ticket.')],
      ephemeral: true
    });
  }

  await interaction.deferReply();

  try {
    // Remove view channel permission for author
    await channel.permissionOverwrites.edit(authorId, {
      ViewChannel: false
    });

    // Remove view channel permission for all added members
    for (const memberId of addedMembers) {
      if (memberId !== authorId) {
        await channel.permissionOverwrites.edit(memberId, {
          ViewChannel: false
        }).catch(() => {});
      }
    }

    const closeEmbed = embeds.custom(
      '🔒 Ticket Fermé',
      `Ce ticket a été fermé par **${interaction.user.username}**.\n` +
      `L'auteur du ticket et les membres ajoutés n'ont plus accès à ce salon.`,
      embeds.COLORS.WARNING
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen_btn')
        .setLabel('🔓 Réouvrir')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_delete_btn')
        .setLabel('🗑️ Supprimer')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [closeEmbed],
      components: [row]
    });

    // Log closure
    await logModerationAction(client, {
      action: '🔒 Ticket Fermé',
      target: { id: authorId, toString: () => `<@${authorId}>` },
      moderator: interaction.user,
      reason: `Salon: #${channel.name}`,
    });

  } catch (error) {
    console.error('Error closing ticket:', error);
    await interaction.editReply({
      embeds: [embeds.error('Une erreur est survenue lors de la fermeture du ticket.')]
    });
  }
}

/**
 * Reopens the ticket by restoring the user's access and added members
 */
async function reopenTicket(interaction, client) {
  const channel = interaction.channel;
  
  // Extract Author ID from topic
  const match = channel.topic ? channel.topic.match(/Auteur ID: (\d+)/) : null;
  const authorId = match ? match[1] : null;

  // Extract added members from topic
  const membersMatch = channel.topic ? channel.topic.match(/Membres ajoutés: (.+)$/) : null;
  const addedMembersStr = membersMatch ? membersMatch[1].trim() : '';
  const addedMembers = addedMembersStr ? addedMembersStr.split(',').map(id => id.trim()).filter(id => id !== '') : [];

  if (!authorId) {
    return interaction.reply({
      embeds: [embeds.error('Impossible d\'identifier l\'auteur du ticket.')],
      ephemeral: true
    });
  }

  // Authorization check: only staff/admin can reopen tickets
  const staffRoleId = await ConfigHelper.get('ticket_staff_role_id');
  const isStaffOrAdmin = 
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    (staffRoleId && interaction.member.roles.cache.has(staffRoleId));

  if (!isStaffOrAdmin) {
    return interaction.reply({
      embeds: [embeds.error('Seul un membre du staff ou un administrateur peut réouvrir ce ticket.')],
      ephemeral: true
    });
  }

  await interaction.deferReply();

  try {
    // Restore view channel permission for author
    await channel.permissionOverwrites.edit(authorId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    });

    // Restore view channel permission for all added members
    for (const memberId of addedMembers) {
      if (memberId !== authorId) {
        await channel.permissionOverwrites.edit(memberId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
        }).catch(() => {});
      }
    }

    // Delete old reopening message components
    await interaction.message.delete().catch(() => {});

    const reopenEmbed = embeds.custom(
      '🔓 Ticket Réouvert',
      `Ce ticket a été réouvert par **${interaction.user.username}**.\n` +
      `L'auteur et les membres ajoutés ont de nouveau accès au salon.`,
      embeds.COLORS.SUCCESS
    );

    await interaction.editReply({
      embeds: [reopenEmbed]
    });

    // Log reopening
    await logModerationAction(client, {
      action: '🔓 Ticket Réouvert',
      target: { id: authorId, toString: () => `<@${authorId}>` },
      moderator: interaction.user,
      reason: `Salon: #${channel.name}`,
    });

  } catch (error) {
    console.error('Error reopening ticket:', error);
    await interaction.editReply({
      embeds: [embeds.error('Une erreur est survenue lors de la réouverture du ticket.')]
    });
  }
}

/**
 * Deletes the ticket channel
 */
async function deleteTicket(interaction, client) {
  const channel = interaction.channel;
  
  // Extract Author ID from topic
  const match = channel.topic ? channel.topic.match(/Auteur ID: (\d+)/) : null;
  const authorId = match ? match[1] : null;

  // Authorization check: only staff/admin can delete tickets
  const staffRoleId = await ConfigHelper.get('ticket_staff_role_id');
  const isStaffOrAdmin = 
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    (staffRoleId && interaction.member.roles.cache.has(staffRoleId));

  if (!isStaffOrAdmin) {
    return interaction.reply({
      embeds: [embeds.error('Seul un membre du staff ou un administrateur est autorisé à supprimer ce ticket.')],
      ephemeral: true
    });
  }

  await interaction.reply({
    embeds: [embeds.warning('Ce salon sera définitivement supprimé dans 5 secondes.')]
  });

  // Log deletion
  await logModerationAction(client, {
    action: '🗑️ Ticket Supprimé',
    target: authorId ? { id: authorId, toString: () => `<@${authorId}>` } : { id: 'inconnu', toString: () => 'Inconnu' },
    moderator: interaction.user,
    reason: `Salon: #${channel.name}`,
  });

  setTimeout(async () => {
    try {
      await channel.delete();
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  }, 5000);
}

module.exports = {
  showTicketModal,
  handleTicketModalSubmit,
  closeTicket,
  reopenTicket,
  deleteTicket,
};
