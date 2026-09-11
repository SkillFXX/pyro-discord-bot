const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', 'database.sqlite'),
  logging: false,
});

// Define Models

// 1. Config: Global settings key-value store
const Config = sequelize.define('Config', {
  key: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

// 2. Warn: User warnings
const Warn = sequelize.define('Warn', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  moderatorId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

// 3. WarnAction: Configurable automated punishments at warns count threshold
const WarnAction = sequelize.define('WarnAction', {
  warnsCount: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  action: {
    type: DataTypes.STRING, // 'mute' | 'ban'
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER, // in seconds (for mutes), null for bans
    allowNull: true,
  },
});

// 4. Sanction: Logs for moderation actions (mute, kick, ban)
const Sanction = sequelize.define('Sanction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  moderatorId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING, // 'mute' | 'kick' | 'ban'
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

// 5. UserXP: XP tracking
const UserXP = sequelize.define('UserXP', {
  userId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  xp: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  lastMessageTimestamp: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

// 6. RoleReward: Level roles rewards
const RoleReward = sequelize.define('RoleReward', {
  level: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  roleId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  replacePreviousRole: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

// 7. AutomodRule: Configuration for auto-moderation per channel
const AutomodRule = sequelize.define('AutomodRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  channelId: {
    type: DataTypes.STRING, // Guild channel ID (or 'global')
    allowNull: false,
  },
  ruleType: {
    type: DataTypes.STRING, // 'spam' | 'duplicate' | 'words_blacklist' | 'words_whitelist'
    allowNull: false,
  },
  parameters: {
    type: DataTypes.TEXT, // JSON serialized array of words/settings
    defaultValue: '[]',
  },
  actions: {
    type: DataTypes.TEXT, // JSON serialized array of actions, e.g. ['delete', 'warn']
    defaultValue: '[]',
  },
  customReason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  scope: {
    type: DataTypes.STRING, // 'all_messages' | 'new_threads'
    defaultValue: 'all_messages',
  },
  monitoredTypes: {
    type: DataTypes.STRING, // 'all' | 'text' | 'attachments'
    defaultValue: 'all',
  },
});

// 8. AutoRole: Roles given automatically to newcomers
const AutoRole = sequelize.define('AutoRole', {
  roleId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
});

// 9. XPMultiplier: Custom XP multiplier per channel
const XPMultiplier = sequelize.define('XPMultiplier', {
  channelId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  multiplier: {
    type: DataTypes.FLOAT,
    defaultValue: 1.0,
  },
});

// 10. MessageLog: Tracks messages for analytics
const MessageLog = sequelize.define('MessageLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  channelId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  guildId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  messageLength: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  wordCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  roleIds: {
    type: DataTypes.TEXT, // JSON serialized array of role IDs
    defaultValue: '[]',
  },
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['channelId'] },
    { fields: ['createdAt'] },
  ],
});

// 11. VoiceLog: Tracks completed voice sessions for analytics
const VoiceLog = sequelize.define('VoiceLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  channelId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  guildId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  roleIds: {
    type: DataTypes.TEXT, // JSON serialized array of role IDs
    defaultValue: '[]',
  },
  joinedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  leftAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['channelId'] },
    { fields: ['joinedAt'] },
    { fields: ['createdAt'] },
  ],
});

// 12. MemberLog: Tracks server joins and leaves for analytics
const MemberLog = sequelize.define('MemberLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  guildId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  eventType: {
    type: DataTypes.STRING, // 'join' | 'leave'
    allowNull: false,
  },
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['eventType'] },
    { fields: ['createdAt'] },
  ],
});

// 13. UserSnapshot: Cache of member details for rich analytics displays
const UserSnapshot = sequelize.define('UserSnapshot', {
  userId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  roles: {
    type: DataTypes.TEXT, // JSON serialized array of role IDs
    defaultValue: '[]',
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// Helper functions for Config key-value store
const ConfigHelper = {
  async get(key, defaultValue = null) {
    try {
      const record = await Config.findByPk(key);
      if (!record) return defaultValue;
      return JSON.parse(record.value);
    } catch (e) {
      console.error(`Error reading config for key ${key}:`, e);
      return defaultValue;
    }
  },

  async set(key, value) {
    try {
      await Config.upsert({
        key,
        value: JSON.stringify(value),
      });
      return true;
    } catch (e) {
      console.error(`Error setting config for key ${key}:`, e);
      return false;
    }
  },
  
  async delete(key) {
    try {
      const record = await Config.findByPk(key);
      if (record) {
        await record.destroy();
      }
      return true;
    } catch (e) {
      console.error(`Error deleting config for key ${key}:`, e);
      return false;
    }
  }
};

/**
 * Configure SQLite high-performance PRAGMAs:
 * - WAL mode (Write-Ahead Logging): allows concurrent reads during writes, prevents SQLITE_BUSY
 * - synchronous = NORMAL: faster writes while retaining durability in WAL mode
 * - cache_size = -64000: 64MB memory page cache
 * - temp_store = MEMORY: stores temporary tables in RAM
 */
async function initDatabasePragmas() {
  try {
    await sequelize.query('PRAGMA journal_mode = WAL;');
    await sequelize.query('PRAGMA synchronous = NORMAL;');
    await sequelize.query('PRAGMA cache_size = -64000;');
    await sequelize.query('PRAGMA temp_store = MEMORY;');
    await sequelize.query('PRAGMA foreign_keys = ON;');
  } catch (err) {
    console.warn('[Database] Warning applying SQLite PRAGMAs:', err.message);
  }
}

// Log Event Configuration Keys and Definitions
const LOG_CONFIG_KEYS = [
  // Bot Logs
  { key: 'log_bot_tickets', label: 'Tickets', description: 'Ouverture, fermeture, réouverture, suppression et membres ajoutés/retirés', category: 'bot', default: true },
  { key: 'log_bot_sanctions', label: 'Sanctions & Avertissements', description: 'Avertissements (/warn) et sanctions automatiques par seuil', category: 'bot', default: true },
  { key: 'log_bot_moderation', label: 'Modération du Staff', description: 'Actions manuelles exécutées via le bot (/mute, /kick, /ban)', category: 'bot', default: true },
  { key: 'log_bot_voice_create', label: 'Salons Vocaux Temporaires', description: 'Création et suppression des salons Join-to-Create', category: 'bot', default: true },
  { key: 'log_bot_xp', label: 'XP & Niveaux', description: 'Passage de niveau (Level Up), rôles récompenses et commandes /adminxp', category: 'bot', default: true },
  { key: 'log_bot_automod', label: 'Automodération', description: 'Infractions détectées par l\'automod (spam, doublons, mots interdits, regex)', category: 'bot', default: true },
  { key: 'log_bot_boot', label: 'Démarrage & Boot du Bot', description: 'Notification au démarrage et redémarrage de Pyro (ping, stats système)', category: 'bot', default: true },

  // Discord Logs
  { key: 'log_discord_member_join', label: 'Arrivée de Membre', description: 'Nouveaux membres rejoignant le serveur', category: 'discord', default: true },
  { key: 'log_discord_member_leave', label: 'Départ de Membre', description: 'Membres quittant le serveur', category: 'discord', default: true },
  { key: 'log_discord_bot_add', label: 'Ajout de Bots & Intégrations', description: 'Nouveaux bots ou intégrations ajoutés au serveur', category: 'discord', default: true },
  { key: 'log_discord_nickname_update', label: 'Changement de Pseudo', description: 'Modifications de surnom ou pseudo de membre', category: 'discord', default: true },
  { key: 'log_discord_role_update', label: 'Changement de Rôles Membres', description: 'Rôles ajoutés ou retirés aux membres', category: 'discord', default: true },
  { key: 'log_discord_server_roles', label: 'Rôles du Serveur', description: 'Création, suppression ou modification des rôles sur le serveur', category: 'discord', default: true },
  { key: 'log_discord_channels', label: 'Salons & Catégories', description: 'Création, suppression ou modification de salons et catégories', category: 'discord', default: true },
  { key: 'log_discord_invites', label: 'Liens d\'Invitation', description: 'Création et révocation d\'invitations sur le serveur', category: 'discord', default: true },
  { key: 'log_discord_timeouts', label: 'Timeouts / Mutes Discord', description: 'Exclusions temporaires appliquées ou levées', category: 'discord', default: true },
  { key: 'log_discord_bans', label: 'Bannissements & Débannissements', description: 'Membres bannis ou débannis sur Discord', category: 'discord', default: true },
  { key: 'log_discord_kicks', label: 'Expulsions (Kicks)', description: 'Membres expulsés du serveur', category: 'discord', default: true },
  { key: 'log_discord_voice_activity', label: 'Activité Vocale', description: 'Connexion, déconnexion ou changement de salon vocal', category: 'discord', default: false },
  { key: 'log_discord_threads', label: 'Threads & Posts Forum', description: 'Création ou suppression de fils de discussion ou posts forum', category: 'discord', default: true },
  { key: 'log_discord_message_events', label: 'Messages Supprimés & Modifiés', description: 'Suppression ou édition de messages avec historique', category: 'discord', default: true },
  { key: 'log_discord_guild_update', label: 'Paramètres du Serveur', description: 'Modifications du nom, icône, bannière, salon AFK, niveau de sécurité', category: 'discord', default: true },
  { key: 'log_discord_emojis', label: 'Émojis & Autocollants', description: 'Ajout, suppression ou renommage d\'émojis et stickers personnalisés', category: 'discord', default: true },
  { key: 'log_discord_scheduled_events', label: 'Événements Planifiés', description: 'Création, modification ou annulation d\'événements du serveur', category: 'discord', default: true },
  { key: 'log_discord_webhooks', label: 'Webhooks de Salons', description: 'Création, modification ou suppression de webhooks dans les salons', category: 'discord', default: true },
];

module.exports = {
  sequelize,
  initDatabasePragmas,
  Config,
  Warn,
  WarnAction,
  Sanction,
  UserXP,
  RoleReward,
  AutomodRule,
  AutoRole,
  XPMultiplier,
  MessageLog,
  VoiceLog,
  MemberLog,
  UserSnapshot,
  ConfigHelper,
  LOG_CONFIG_KEYS,
};
