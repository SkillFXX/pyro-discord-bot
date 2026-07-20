const { EmbedBuilder } = require('discord.js');

const COLORS = {
  PRIMARY: '#FF6B35', // Pyro Orange
  SUCCESS: '#2ECC71',
  ERROR: '#E74C3C',
  INFO: '#3498DB',
  WARNING: '#F1C40F',
};

function createEmbed({ title, description, fields, color = COLORS.PRIMARY, footer, thumbnail, image }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  
  if (footer) {
    embed.setFooter({ text: footer.text, iconURL: footer.iconURL });
  } else {
    embed.setFooter({ text: 'Pyro Bot • Modération & Utilitaires' });
  }

  return embed;
}

module.exports = {
  COLORS,
  success: (description, title = '✅ Succès') => createEmbed({ title, description, color: COLORS.SUCCESS }),
  error: (description, title = '❌ Erreur') => createEmbed({ title, description, color: COLORS.ERROR }),
  info: (description, title = 'ℹ️ Information') => createEmbed({ title, description, color: COLORS.INFO }),
  warning: (description, title = '⚠️ Avertissement') => createEmbed({ title, description, color: COLORS.WARNING }),
  custom: (title, description, color = COLORS.PRIMARY, fields = null, thumbnail = null, image = null, footer = null) => 
    createEmbed({ title, description, color, fields, thumbnail, image, footer }),
};
