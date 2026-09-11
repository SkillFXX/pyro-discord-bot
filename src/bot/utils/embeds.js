const { EmbedBuilder } = require('discord.js');
const { ConfigHelper } = require('../../database');

const COLORS = {
  PRIMARY: '#FF6B35', // Pyro Orange
  SUCCESS: '#2ECC71',
  ERROR: '#E74C3C',
  INFO: '#3498DB',
  WARNING: '#F1C40F',
};

function createEmbed({ title, description, fields, color = null, footer, thumbnail, image }) {
  const customColor = ConfigHelper.getSync('embed_color', null);
  const defaultPrimary = customColor || COLORS.PRIMARY;
  const finalColor = color || defaultPrimary;

  const embed = new EmbedBuilder()
    .setColor(finalColor)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  
  const customFooterText = ConfigHelper.getSync('embed_footer_text', null);
  const customFooterIcon = ConfigHelper.getSync('embed_footer_icon_url', null) || undefined;

  if (footer) {
    embed.setFooter({
      text: footer.text || customFooterText || 'Pyro Bot • Modération & Utilitaires',
      iconURL: footer.iconURL || customFooterIcon,
    });
  } else {
    embed.setFooter({
      text: customFooterText || 'Pyro Bot • Modération & Utilitaires',
      iconURL: customFooterIcon,
    });
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
