const { RoleReward, RoleXPMultiplier, UserXP, ConfigHelper } = require('../../database');

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

/**
 * Determines which role IDs a member should retain based on their current level
 * and the `replacePreviousRole` settings across all configured rewards.
 * 
 * Logic:
 * - Eligible rewards are those where `level <= currentLevel`.
 * - Traversed from highest level to lowest:
 *   - The reward is retained as long as its level > cutoffLevel.
 *   - If the reward has `replacePreviousRole: true`, all rewards strictly lower
 *     than this level are excluded (cutoffLevel is set).
 * 
 * @param {number} currentLevel 
 * @param {Array<{level: number, roleId: string, replacePreviousRole: boolean}>} rewards 
 * @returns {Set<string>} Set of role IDs that should be active
 */
function getExpectedRoleIds(currentLevel, rewards) {
  const eligible = rewards.filter(r => r.level <= currentLevel);
  if (eligible.length === 0) return new Set();

  const expectedRoleIds = new Set();
  let cutoffLevel = 0;

  // Sort descending by level: highest reward first
  const sorted = [...eligible].sort((a, b) => b.level - a.level);
  for (const reward of sorted) {
    if (reward.level > cutoffLevel) {
      expectedRoleIds.add(reward.roleId);
      if (reward.replacePreviousRole) {
        cutoffLevel = Math.max(cutoffLevel, reward.level);
      }
    }
  }

  return expectedRoleIds;
}

/**
 * Handles role rewards for a guild member according to their current level.
 * Correctly adds new roles and strips superseded lower roles (without ever re-adding them).
 * 
 * @param {import('discord.js').GuildMember} member 
 * @param {number} currentLevel 
 */
async function handleRoleRewards(member, currentLevel) {
  try {
    if (!member || !member.guild) return;
    const guild = member.guild;
    const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!botMember) return;

    // Fetch all configured rewards sorted by level ascending
    const rewards = await RoleReward.findAll({
      order: [['level', 'ASC']],
    });

    if (rewards.length === 0) return;

    // Compute expected role IDs based on current level and replacement settings
    const expectedRoleIds = getExpectedRoleIds(currentLevel, rewards);

    const rolesToAdd = [];
    const rolesToRemove = [];
    const memberRoleIds = new Set(member.roles.cache.keys());

    for (const reward of rewards) {
      const role = guild.roles.cache.get(reward.roleId);
      if (!role) continue;

      // Skip roles higher than or equal to bot's highest role (Discord permission constraint)
      if (role.position >= botMember.roles.highest.position) {
        console.warn(`[XP Rewards] Impossible de gérer le rôle "${role.name}" (${role.id}) : position supérieure ou égale au rôle le plus élevé du bot.`);
        continue;
      }

      const shouldHaveRole = expectedRoleIds.has(reward.roleId);
      const currentlyHasRole = memberRoleIds.has(reward.roleId);

      if (shouldHaveRole && !currentlyHasRole) {
        if (!rolesToAdd.some(r => r.id === role.id)) {
          rolesToAdd.push(role);
        }
      } else if (!shouldHaveRole && currentlyHasRole) {
        if (!rolesToRemove.some(r => r.id === role.id)) {
          rolesToRemove.push(role);
        }
      }
    }

    // Apply role removals first to clean up superseded tiers
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove, `XP Remplacement Rôles Inférieurs (Niveau ${currentLevel})`);
      console.log(`[XP Rewards] Retrait de ${rolesToRemove.length} rôle(s) à ${member.user?.tag || member.id} : ${rolesToRemove.map(r => r.name).join(', ')}`);
    }

    // Apply role additions
    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd, `XP Récompense Niveau ${currentLevel}`);
      console.log(`[XP Rewards] Attribution de ${rolesToAdd.length} rôle(s) à ${member.user?.tag || member.id} : ${rolesToAdd.map(r => r.name).join(', ')}`);
    }

  } catch (error) {
    console.error('[XP Rewards] Erreur lors de la gestion des récompenses de rôles :', error);
  }
}

/**
 * Resolves the highest XP multiplier applicable to a member based on their Discord roles.
 * @param {import('discord.js').GuildMember} member 
 * @returns {Promise<number>} Multiplier (minimum 1.0)
 */
async function getMemberRoleMultiplier(member) {
  if (!member || !member.roles || !member.roles.cache) return 1.0;
  try {
    const roleMultipliers = await RoleXPMultiplier.findAll();
    if (!roleMultipliers || roleMultipliers.length === 0) return 1.0;

    let highestMultiplier = 1.0;
    for (const rm of roleMultipliers) {
      if (member.roles.cache.has(rm.roleId)) {
        if (rm.multiplier > highestMultiplier) {
          highestMultiplier = rm.multiplier;
        }
      }
    }
    return highestMultiplier;
  } catch (error) {
    console.error('[XP Multiplier] Erreur lors de la récupération du multiplicateur de rôle :', error);
    return 1.0;
  }
}

/**
 * Awards XP to a member, updates their record, handles level ups, sends announcements and assigns role rewards.
 * @param {Object} params
 * @param {import('discord.js').Client} params.client
 * @param {import('discord.js').GuildMember} params.member
 * @param {number} params.xpAmount
 * @param {'message'|'voice'|'admin'} [params.source='message']
 * @param {import('discord.js').TextChannel} [params.textChannel=null]
 * @returns {Promise<{ oldXP: number, newXP: number, oldLevel: number, newLevel: number, levelUp: boolean, xpGained: number }|null>}
 */
async function awardUserXP({ client, member, xpAmount, source = 'message', textChannel = null }) {
  if (!member || !member.user || member.user.bot) return null;
  const userId = member.user.id;
  const guild = member.guild;

  const [userRecord] = await UserXP.findOrCreate({
    where: { userId },
    defaults: { xp: 0, level: 0 },
  });

  const oldXP = userRecord.xp;
  const oldLevel = userRecord.level;
  const newXP = oldXP + xpAmount;
  const newLevel = calculateLevelFromXP(newXP);
  const levelUp = newLevel > oldLevel;

  userRecord.xp = newXP;
  userRecord.level = newLevel;
  if (source === 'message') {
    userRecord.lastMessageTimestamp = new Date();
  }
  await userRecord.save();

  if (levelUp) {
    // 1. Announce Level Up
    const levelChannelId = await ConfigHelper.get('xp_announcement_channel_id');
    let channelToAnnounce = null;
    if (levelChannelId) {
      channelToAnnounce = await guild.channels.fetch(levelChannelId).catch(() => null);
    } else if (textChannel) {
      channelToAnnounce = textChannel;
    }

    if (channelToAnnounce) {
      const embeds = require('./embeds');
      const levelEmbed = embeds.custom(
        '🎉 Passage de Niveau !',
        `Félicitations ${member}, tu viens de passer au **Niveau ${newLevel}** ! 🚀`,
        embeds.COLORS.SUCCESS,
        null,
        member.user.displayAvatarURL({ dynamic: true })
      );
      await channelToAnnounce.send({ embeds: [levelEmbed] }).catch(() => null);
    }

    // 2. Centralized Logger
    const loggerService = require('../../services/loggerService');
    await loggerService.log(client, 'log_bot_xp', {
      title: '⭐ Montée de Niveau (Level Up)',
      description: `**${member.user.tag}** a progressé jusqu'au **Niveau ${newLevel}** ! (${source === 'voice' ? 'Vocal' : 'Texte'})`,
      color: '#F1C40F',
      thumbnail: member.user.displayAvatarURL({ dynamic: true }),
      fields: [
        { name: '👤 Membre', value: `${member} (\`${member.id}\`)`, inline: true },
        { name: 'Niveau Précédent', value: `${oldLevel}`, inline: true },
        { name: 'Nouveau Niveau', value: `${newLevel}`, inline: true },
        { name: 'XP Totale', value: `${newXP} XP`, inline: true },
        { name: 'Source', value: `${source === 'voice' ? '🎙️ Salon Vocal' : '💬 Salon Textuel'}`, inline: true },
      ],
      footer: { text: 'Pyro Niveaux & XP' },
    });

    // 3. Distribute / adjust Role Rewards
    await handleRoleRewards(member, newLevel);
  }

  return { oldXP, newXP, oldLevel, newLevel, levelUp, xpGained: xpAmount };
}

module.exports = {
  getXPNeededForLevel,
  calculateLevelFromXP,
  makeProgressBar,
  getExpectedRoleIds,
  handleRoleRewards,
  getMemberRoleMultiplier,
  awardUserXP,
};
