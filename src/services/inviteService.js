const { UserInvite, MemberInvite } = require('../database');

/**
 * Service de gestion et suivi des invitations Discord
 */
class InviteService {
  constructor() {
    // guildId -> Map(code, { uses, inviterId, maxUses })
    this.guildInvitesCache = new Map();
    // guildId -> number (vanity uses)
    this.vanityUsesCache = new Map();
    this.client = null;
  }

  /**
   * Initialise le cache des invitations pour tous les serveurs du bot
   * @param {import('discord.js').Client} client
   */
  async init(client) {
    this.client = client;
    console.log('[InviteService] Initialisation du cache des invitations...');

    for (const guild of client.guilds.cache.values()) {
      await this.cacheGuildInvites(guild);
    }

    console.log(`[InviteService] Cache initialisé pour ${this.guildInvitesCache.size} serveur(s).`);
  }

  /**
   * Met en cache les invitations et vanity pour un serveur donné
   * @param {import('discord.js').Guild} guild
   */
  async cacheGuildInvites(guild) {
    if (!guild) return;

    try {
      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!me || !me.permissions.has('ManageGuild')) {
        console.warn(`[InviteService] Permission 'Gérer le serveur' (ManageGuild) manquante sur ${guild.name} (${guild.id}) pour suivre les invitations.`);
        return;
      }

      const invites = await guild.invites.fetch().catch(err => {
        console.warn(`[InviteService] Erreur fetch invites sur ${guild.name}:`, err.message);
        return null;
      });

      if (invites) {
        const inviteMap = new Map();
        for (const [code, inv] of invites) {
          inviteMap.set(code, {
            uses: inv.uses || 0,
            inviterId: inv.inviter ? inv.inviter.id : null,
            maxUses: inv.maxUses || 0,
          });
        }
        this.guildInvitesCache.set(guild.id, inviteMap);
      }

      // Cache Vanity URL si supporté
      if (guild.features.includes('VANITY_URL')) {
        const vanity = await guild.fetchVanityData().catch(() => null);
        if (vanity) {
          this.vanityUsesCache.set(guild.id, vanity.uses || 0);
        }
      }
    } catch (error) {
      console.error(`[InviteService] Erreur cacheGuildInvites pour ${guild.id}:`, error);
    }
  }

  /**
   * Enregistre une nouvelle invitation dans le cache
   * @param {import('discord.js').Invite} invite
   */
  onInviteCreate(invite) {
    if (!invite || !invite.guild) return;
    const guildId = invite.guild.id;
    const map = this.guildInvitesCache.get(guildId) || new Map();
    map.set(invite.code, {
      uses: invite.uses || 0,
      inviterId: invite.inviter ? invite.inviter.id : null,
      maxUses: invite.maxUses || 0,
    });
    this.guildInvitesCache.set(guildId, map);
  }

  /**
   * Retire une invitation supprimée du cache
   * @param {import('discord.js').Invite} invite
   */
  onInviteDelete(invite) {
    if (!invite || !invite.guild) return;
    const guildId = invite.guild.id;
    const map = this.guildInvitesCache.get(guildId);
    if (map) {
      map.delete(invite.code);
    }
  }

  /**
   * Identifie quelle invitation a été utilisée lors de l'arrivée d'un membre
   * et met à jour les données dans la base de données.
   * @param {import('discord.js').GuildMember} member
   * @returns {Promise<{ inviter: import('discord.js').User|null, inviterMember: import('discord.js').GuildMember|null, inviteCode: string|null, isVanity: boolean, isFake: boolean, totalInvites: number }>}
   */
  async findInviterOnJoin(member) {
    const guild = member.guild;
    const guildId = guild.id;

    // Résultat par défaut
    const defaultResult = {
      inviter: null,
      inviterMember: null,
      inviteCode: null,
      isVanity: false,
      isFake: false,
      totalInvites: 0,
    };

    if (member.user.bot) {
      // Les bots rejoignent via OAuth2, pas via des invitations membres
      return defaultResult;
    }

    try {
      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!me || !me.permissions.has('ManageGuild')) {
        console.warn(`[InviteService] Permission 'ManageGuild' manquante sur ${guild.name} lors de l'arrivée de ${member.user.tag}`);
        return defaultResult;
      }

      const cachedInvites = this.guildInvitesCache.get(guildId) || new Map();
      const newInvites = await guild.invites.fetch().catch(err => {
        console.warn(`[InviteService] Erreur récupération invites à l'arrivée:`, err.message);
        return null;
      });

      let usedInvite = null;
      let usedCode = null;
      let inviterId = null;
      let isVanity = false;

      if (newInvites) {
        // 1. Recherche d'une invitation dont le compteur 'uses' a augmenté
        for (const [code, inv] of newInvites) {
          const cached = cachedInvites.get(code);
          if (cached && inv.uses > cached.uses) {
            usedInvite = inv;
            usedCode = code;
            inviterId = inv.inviter ? inv.inviter.id : cached.inviterId;
            break;
          }
        }

        // 2. Si non trouvée, recherche d'une invitation à usage unique (maxUses === 1) supprimée dès son utilisation
        if (!usedInvite) {
          for (const [code, cached] of cachedInvites) {
            if (!newInvites.has(code)) {
              if (cached.maxUses === 1 || (cached.maxUses > 0 && cached.uses + 1 >= cached.maxUses)) {
                usedCode = code;
                inviterId = cached.inviterId;
                break;
              }
            }
          }
        }

        // 3. Si toujours non trouvée, vérification du Vanity URL
        if (!usedCode && guild.features.includes('VANITY_URL')) {
          const cachedVanityUses = this.vanityUsesCache.get(guildId) || 0;
          const currentVanity = await guild.fetchVanityData().catch(() => null);
          if (currentVanity && currentVanity.uses > cachedVanityUses) {
            isVanity = true;
            usedCode = currentVanity.code || 'Vanity';
            this.vanityUsesCache.set(guildId, currentVanity.uses);
          }
        }

        // Met à jour le cache avec la liste actuelle
        const updatedMap = new Map();
        for (const [code, inv] of newInvites) {
          updatedMap.set(code, {
            uses: inv.uses || 0,
            inviterId: inv.inviter ? inv.inviter.id : null,
            maxUses: inv.maxUses || 0,
          });
        }
        this.guildInvitesCache.set(guildId, updatedMap);
      }

      // Gestion de la suspicion de faux compte / compte créé récemment (< 3 jours) ou auto-invitation
      let isFake = false;
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < 3) {
        isFake = true;
      }
      if (inviterId && inviterId === member.id) {
        isFake = true; // Auto-invitation
      }

      // Enregistrement en base de données
      let inviterUser = null;
      let inviterMember = null;
      let totalInvites = 0;

      if (inviterId) {
        inviterUser = await this.client.users.fetch(inviterId).catch(() => null);
        inviterMember = await guild.members.fetch(inviterId).catch(() => null);

        // Vérifier si le membre avait déjà rejoint par le passé (re-join)
        const existingMemberInvite = await MemberInvite.findOne({
          where: { guildId, userId: member.id },
        });

        const [userInviteRecord] = await UserInvite.findOrCreate({
          where: { guildId, userId: inviterId },
          defaults: { regular: 0, bonus: 0, leaves: 0, fake: 0 },
        });

        if (existingMemberInvite && existingMemberInvite.leftAt) {
          // Re-join après être parti
          if (existingMemberInvite.inviterId === inviterId) {
            // Même inviteur : on annule le leave comptabilisé précédemment
            if (userInviteRecord.leaves > 0) {
              userInviteRecord.leaves -= 1;
            }
          } else {
            // Nouvel inviteur : on lui attribue une invitation
            if (isFake) {
              userInviteRecord.fake += 1;
            } else {
              userInviteRecord.regular += 1;
            }
          }

          existingMemberInvite.inviterId = inviterId;
          existingMemberInvite.inviteCode = usedCode;
          existingMemberInvite.isVanity = isVanity;
          existingMemberInvite.isFake = isFake;
          existingMemberInvite.joinedAt = new Date();
          existingMemberInvite.leftAt = null;
          await existingMemberInvite.save();
        } else if (!existingMemberInvite) {
          // Nouveau membre
          await MemberInvite.create({
            guildId,
            userId: member.id,
            inviterId,
            inviteCode: usedCode,
            isVanity,
            isFake,
            joinedAt: new Date(),
            leftAt: null,
          });

          if (isFake) {
            userInviteRecord.fake += 1;
          } else {
            userInviteRecord.regular += 1;
          }
        }

        await userInviteRecord.save();
        totalInvites = Math.max(0, userInviteRecord.regular + userInviteRecord.bonus - userInviteRecord.leaves);
      } else {
        // Enregistrer quand même le membre (Vanity ou inconnu)
        await MemberInvite.upsert({
          guildId,
          userId: member.id,
          inviterId: null,
          inviteCode: usedCode,
          isVanity,
          isFake: false,
          joinedAt: new Date(),
          leftAt: null,
        });
      }

      return {
        inviter: inviterUser,
        inviterMember,
        inviteCode: usedCode,
        isVanity,
        isFake,
        totalInvites,
      };
    } catch (error) {
      console.error('[InviteService] Erreur lors de la détection de l\'inviteur à l\'arrivée :', error);
      return defaultResult;
    }
  }

  /**
   * Traite le départ d'un membre et décrémente les statistiques de son inviteur
   * @param {import('discord.js').GuildMember} member
   * @returns {Promise<{ inviter: import('discord.js').User|null, totalInvites: number, stats: any }|null>}
   */
  async onMemberLeave(member) {
    const guildId = member.guild.id;

    try {
      const memberInvite = await MemberInvite.findOne({
        where: { guildId, userId: member.id },
      });

      if (!memberInvite || !memberInvite.inviterId) {
        return null;
      }

      // Marquer la date de départ
      memberInvite.leftAt = new Date();
      await memberInvite.save();

      // Mettre à jour l'inviteur
      const [userInviteRecord] = await UserInvite.findOrCreate({
        where: { guildId, userId: memberInvite.inviterId },
        defaults: { regular: 0, bonus: 0, leaves: 0, fake: 0 },
      });

      userInviteRecord.leaves += 1;
      await userInviteRecord.save();

      const inviterUser = this.client
        ? await this.client.users.fetch(memberInvite.inviterId).catch(() => null)
        : null;

      const total = Math.max(0, userInviteRecord.regular + userInviteRecord.bonus - userInviteRecord.leaves);

      return {
        inviter: inviterUser,
        inviterId: memberInvite.inviterId,
        totalInvites: total,
        stats: {
          regular: userInviteRecord.regular,
          bonus: userInviteRecord.bonus,
          leaves: userInviteRecord.leaves,
          fake: userInviteRecord.fake,
          total,
        },
      };
    } catch (error) {
      console.error('[InviteService] Erreur onMemberLeave :', error);
      return null;
    }
  }

  /**
   * Récupère les statistiques d'invitation d'un utilisateur
   * @param {string} guildId
   * @param {string} userId
   */
  async getUserStats(guildId, userId) {
    const [record] = await UserInvite.findOrCreate({
      where: { guildId, userId },
      defaults: { regular: 0, bonus: 0, leaves: 0, fake: 0 },
    });

    const total = Math.max(0, record.regular + record.bonus - record.leaves);

    return {
      regular: record.regular,
      bonus: record.bonus,
      leaves: record.leaves,
      fake: record.fake,
      total,
    };
  }

  /**
   * Récupère les informations d'origine d'arrivée d'un membre
   * @param {string} guildId
   * @param {string} userId
   */
  async getMemberOrigin(guildId, userId) {
    return MemberInvite.findOne({
      where: { guildId, userId },
    });
  }

  /**
   * Récupère le classement des meilleurs inviteurs d'un serveur
   * @param {string} guildId
   * @param {number} limit
   */
  async getTopInviters(guildId, limit = 10) {
    const allRecords = await UserInvite.findAll({
      where: { guildId },
    });

    const list = allRecords.map(r => {
      const total = Math.max(0, r.regular + r.bonus - r.leaves);
      return {
        userId: r.userId,
        regular: r.regular,
        bonus: r.bonus,
        leaves: r.leaves,
        fake: r.fake,
        total,
      };
    });

    // Trier par total décroissant, puis réelles décroissant
    list.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.regular - a.regular;
    });

    return list.slice(0, limit);
  }

  /**
   * Modifie administrativement les invitations d'un membre (bonus)
   * @param {string} guildId
   * @param {string} userId
   * @param {'add'|'remove'|'set'} action
   * @param {number} amount
   */
  async adminModifyInvites(guildId, userId, action, amount) {
    const [record] = await UserInvite.findOrCreate({
      where: { guildId, userId },
      defaults: { regular: 0, bonus: 0, leaves: 0, fake: 0 },
    });

    const oldTotal = Math.max(0, record.regular + record.bonus - record.leaves);

    if (action === 'add') {
      record.bonus += amount;
    } else if (action === 'remove') {
      record.bonus -= amount;
    } else if (action === 'set') {
      // Définir le total exact désiré
      const effective = record.regular - record.leaves;
      record.bonus = amount - effective;
    }

    await record.save();

    const newTotal = Math.max(0, record.regular + record.bonus - record.leaves);

    return {
      oldTotal,
      newTotal,
      regular: record.regular,
      bonus: record.bonus,
      leaves: record.leaves,
      fake: record.fake,
    };
  }
}

module.exports = new InviteService();

