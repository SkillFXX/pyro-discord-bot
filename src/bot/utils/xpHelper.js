/**
 * XP & Level Calculation Helper
 * Centralizes all leveling logic to ensure consistency across events and commands (DRY).
 */

/**
 * Calculates total XP required to reach a specific level.
 * Formula: 100 * (level ^ 1.5)
 * @param {number} level 
 * @returns {number} Required XP
 */
function getXPNeededForLevel(level) {
  if (level <= 0) return 0;
  return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Calculates current level given a total XP amount.
 * @param {number} xp 
 * @returns {number} Level
 */
function calculateLevelFromXP(xp) {
  if (xp <= 0) return 0;
  let level = 0;
  while (xp >= getXPNeededForLevel(level + 1)) {
    level++;
  }
  return level;
}

/**
 * Generates an ASCII progress bar for Discord embeds.
 * @param {number} current 
 * @param {number} max 
 * @param {number} size 
 * @returns {string} Formatted bar
 */
function makeProgressBar(current, max, size = 12) {
  if (max <= 0) return '`[■■■■■■■■■■■■]` **100%**';
  const percentage = Math.max(0, Math.min(1, current / max));
  const progress = Math.round(size * percentage);
  const emptyProgress = size - progress;
  const progressText = '■'.repeat(progress);
  const emptyProgressText = '□'.repeat(emptyProgress);
  const percentageText = Math.round(percentage * 100);
  return `\`[${progressText}${emptyProgressText}]\` **${percentageText}%**`;
}

module.exports = {
  getXPNeededForLevel,
  calculateLevelFromXP,
  makeProgressBar,
};
