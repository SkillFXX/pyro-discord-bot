const { showTicketModal, handleTicketModalSubmit, closeTicket, reopenTicket, deleteTicket } = require('../utils/ticketHelper');
const embeds = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(`Error executing command /${interaction.commandName}:`, error);
        
        const errEmbed = embeds.error(
          'Une erreur est survenue lors de l\'exécution de cette commande.',
          '❌ Erreur de Commande'
        );

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // 2. Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId === 'create_ticket_btn') {
        return showTicketModal(interaction);
      }
      
      if (customId === 'ticket_close_btn') {
        return closeTicket(interaction, client);
      }
      
      if (customId === 'ticket_reopen_btn') {
        return reopenTicket(interaction, client);
      }
      
      if (customId === 'ticket_delete_btn') {
        return deleteTicket(interaction, client);
      }
      return;
    }

    // 3. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      if (customId === 'ticket_creation_modal') {
        return handleTicketModalSubmit(interaction, client);
      }
      return;
    }
  },
};
