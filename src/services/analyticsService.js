const { Op, fn, col } = require('sequelize');
const { MessageLog, VoiceLog, MemberLog, UserSnapshot } = require('../database');

// In-memory active voice sessions: userId -> { channelId, guildId, joinedAt, roleIds }
const activeVoiceSessions = new Map();

/**
 * Format duration in seconds to human readable string (e.g. "3h 24m" or "45s")
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format Date to MM/DD
 */
function formatDateKey(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

const analyticsService = {
  // ==========================================
  // TRACKING FUNCTIONS
  // ==========================================

  /**
   * Record an incoming message event
   */
  async recordMessage(message) {
    try {
      if (!message || message.author?.bot || !message.guild) return;

      const userId = message.author.id;
      const channelId = message.channel.id;
      const guildId = message.guild.id;
      const content = message.content || '';
      const messageLength = content.length;
      const wordCount = content.trim().length > 0 ? content.trim().split(/\s+/).length : 0;
      const roleIds = message.member ? [...message.member.roles.cache.keys()] : [];

      // 1. Create message log
      await MessageLog.create({
        userId,
        channelId,
        guildId,
        messageLength,
        wordCount,
        roleIds: JSON.stringify(roleIds),
      });

      // 2. Upsert user snapshot
      await UserSnapshot.upsert({
        userId,
        username: message.author.tag || message.author.username,
        displayName: message.member ? message.member.displayName : message.author.username,
        avatarUrl: message.author.displayAvatarURL({ dynamic: true, size: 64 }),
        roles: JSON.stringify(roleIds),
        lastSeenAt: new Date(),
      });
    } catch (error) {
      console.error('[Analytics] Error recording message:', error);
    }
  },

  /**
   * Handle Discord voiceStateUpdate events
   */
  async handleVoiceStateUpdate(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      const userId = member.id;
      const guildId = (newState.guild || oldState.guild).id;
      const oldChannelId = oldState.channelId;
      const newChannelId = newState.channelId;

      // 1. User switched or left a voice channel -> close previous session
      if (oldChannelId && oldChannelId !== newChannelId) {
        const session = activeVoiceSessions.get(userId);
        const joinedAt = session ? session.joinedAt : (Date.now() - 1000);
        const durationSeconds = Math.max(1, Math.round((Date.now() - joinedAt) / 1000));
        const roleIds = session ? session.roleIds : [...member.roles.cache.keys()];

        await VoiceLog.create({
          userId,
          channelId: oldChannelId,
          guildId,
          durationSeconds,
          roleIds: JSON.stringify(roleIds),
          joinedAt: new Date(joinedAt),
          leftAt: new Date(),
        });

        activeVoiceSessions.delete(userId);
      }

      // 2. User joined a new voice channel -> start new session
      if (newChannelId && oldChannelId !== newChannelId) {
        const roleIds = [...member.roles.cache.keys()];
        activeVoiceSessions.set(userId, {
          channelId: newChannelId,
          guildId,
          joinedAt: Date.now(),
          roleIds,
        });

        // Update user snapshot
        await UserSnapshot.upsert({
          userId,
          username: member.user.tag || member.user.username,
          displayName: member.displayName,
          avatarUrl: member.user.displayAvatarURL({ dynamic: true, size: 64 }),
          roles: JSON.stringify(roleIds),
          lastSeenAt: new Date(),
        });
      }
    } catch (error) {
      console.error('[Analytics] Error handling voice state:', error);
    }
  },

  /**
   * Initialize voice tracking for members already in voice channels when the bot launches
   */
  async initVoiceSessions(client) {
    try {
      const guildId = process.env.GUILD_ID;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      let count = 0;
      for (const channel of guild.channels.cache.values()) {
        if (channel.isVoiceBased()) {
          for (const [memberId, member] of channel.members) {
            if (!member.user.bot) {
              const roleIds = [...member.roles.cache.keys()];
              activeVoiceSessions.set(memberId, {
                channelId: channel.id,
                guildId: guild.id,
                joinedAt: Date.now(),
                roleIds,
              });

              UserSnapshot.upsert({
                userId: memberId,
                username: member.user.tag || member.user.username,
                displayName: member.displayName,
                avatarUrl: member.user.displayAvatarURL({ dynamic: true, size: 64 }),
                roles: JSON.stringify(roleIds),
                lastSeenAt: new Date(),
              }).catch(() => {});

              count++;
            }
          }
        }
      }

      if (count > 0) {
        console.log(`[Analytics] Voice tracking initialized: ${count} active voice member(s) found.`);
      }
    } catch (error) {
      console.error('[Analytics] Error initializing voice sessions:', error);
    }
  },

  /**
   * Close and persist all active voice sessions upon bot shutdown
   */
  async closeAllVoiceSessions() {
    try {
      const now = Date.now();
      const entries = [...activeVoiceSessions.entries()];
      activeVoiceSessions.clear();

      for (const [userId, session] of entries) {
        const durationSeconds = Math.max(1, Math.round((now - session.joinedAt) / 1000));
        await VoiceLog.create({
          userId,
          channelId: session.channelId,
          guildId: session.guildId,
          durationSeconds,
          roleIds: JSON.stringify(session.roleIds),
          joinedAt: new Date(session.joinedAt),
          leftAt: new Date(now),
        });
      }
      if (entries.length > 0) {
        console.log(`[Analytics] Flushed ${entries.length} active voice session(s) to database.`);
      }
    } catch (error) {
      console.error('[Analytics] Error closing voice sessions on shutdown:', error);
    }
  },

  /**
   * Record a member join event
   */
  async recordMemberJoin(member) {
    try {
      if (!member || member.user?.bot) return;

      const roleIds = [...member.roles.cache.keys()];
      await MemberLog.create({
        userId: member.id,
        guildId: member.guild.id,
        eventType: 'join',
      });

      await UserSnapshot.upsert({
        userId: member.id,
        username: member.user.tag || member.user.username,
        displayName: member.displayName,
        avatarUrl: member.user.displayAvatarURL({ dynamic: true, size: 64 }),
        roles: JSON.stringify(roleIds),
        lastSeenAt: new Date(),
      });
    } catch (error) {
      console.error('[Analytics] Error recording member join:', error);
    }
  },

  /**
   * Record a member leave event
   */
  async recordMemberLeave(member) {
    try {
      if (!member || member.user?.bot) return;

      await MemberLog.create({
        userId: member.id,
        guildId: member.guild.id,
        eventType: 'leave',
      });
    } catch (error) {
      console.error('[Analytics] Error recording member leave:', error);
    }
  },

  // ==========================================
  // QUERY & AGGREGATION ENGINE
  // ==========================================

  /**
   * Parse date range filters into [startDate, endDate]
   */
  parseDateRange(range = '7d', customStart = null, customEnd = null) {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date(now);

    if (range === 'today') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '14d') {
      startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (range === 'all') {
      startDate = new Date(0); // 1970
    } else if (range === 'custom') {
      if (customStart) {
        startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      if (customEnd) {
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  },

  /**
   * Core multi-criteria analytics calculation
   */
  async getAnalytics({
    range = '7d',
    startDate: customStart = null,
    endDate: customEnd = null,
    channelId = null,
    roleId = null,
    userId = null,
    guild = null,
  } = {}) {
    const { startDate, endDate } = this.parseDateRange(range, customStart, customEnd);

    // Common WHERE filters
    const msgWhere = {
      createdAt: { [Op.between]: [startDate, endDate] },
    };
    const voiceWhere = {
      joinedAt: { [Op.between]: [startDate, endDate] },
    };
    const memberWhere = {
      createdAt: { [Op.between]: [startDate, endDate] },
    };

    if (channelId && channelId !== 'all') {
      msgWhere.channelId = channelId;
      voiceWhere.channelId = channelId;
    }

    if (userId && userId !== 'all') {
      msgWhere.userId = userId;
      voiceWhere.userId = userId;
      memberWhere.userId = userId;
    }

    // Fetch records
    let [messages, voiceLogs, memberLogs, snapshots] = await Promise.all([
      MessageLog.findAll({ where: msgWhere, raw: true }),
      VoiceLog.findAll({ where: voiceWhere, raw: true }),
      MemberLog.findAll({ where: memberWhere, order: [['createdAt', 'DESC']], raw: true }),
      UserSnapshot.findAll({ raw: true }),
    ]);

    // Build snapshot cache: userId -> snapshot
    const userMap = new Map();
    for (const s of snapshots) {
      userMap.set(s.userId, s);
    }

    // Role filtering (if specified)
    if (roleId && roleId !== 'all') {
      messages = messages.filter((m) => {
        try {
          const roles = JSON.parse(m.roleIds || '[]');
          return roles.includes(roleId);
        } catch {
          return false;
        }
      });

      voiceLogs = voiceLogs.filter((v) => {
        try {
          const roles = JSON.parse(v.roleIds || '[]');
          return roles.includes(roleId);
        } catch {
          return false;
        }
      });
    }

    // Helper: user details resolver
    const resolveUser = (uid) => {
      if (guild) {
        const mem = guild.members.cache.get(uid);
        if (mem) {
          return {
            userId: uid,
            username: mem.user.tag || mem.user.username,
            displayName: mem.displayName,
            avatarUrl: mem.user.displayAvatarURL({ dynamic: true, size: 64 }),
            roles: [...mem.roles.cache.values()]
              .filter((r) => r.id !== guild.id)
              .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
          };
        }
      }
      const snap = userMap.get(uid);
      if (snap) {
        let rolesArray = [];
        try {
          const rIds = JSON.parse(snap.roles || '[]');
          if (guild) {
            rolesArray = rIds
              .map((rid) => guild.roles.cache.get(rid))
              .filter(Boolean)
              .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }));
          }
        } catch {}
        return {
          userId: uid,
          username: snap.username || uid,
          displayName: snap.displayName || snap.username || uid,
          avatarUrl: snap.avatarUrl || '/public/logo.png',
          roles: rolesArray,
        };
      }
      return {
        userId: uid,
        username: `Utilisateur (${uid.slice(0, 6)}...)`,
        displayName: `Utilisateur (${uid.slice(0, 6)}...)`,
        avatarUrl: '/public/logo.png',
        roles: [],
      };
    };

    // Helper: channel details resolver
    const resolveChannel = (cid, isVoice = false) => {
      if (guild) {
        const ch = guild.channels.cache.get(cid);
        if (ch) {
          return { id: cid, name: ch.name, type: isVoice ? 'voice' : 'text' };
        }
      }
      return { id: cid, name: `salon-inconnu-${cid.slice(0, 4)}`, type: isVoice ? 'voice' : 'text' };
    };

    // ==========================================
    // 1. KPI SUMMARY COMPUTATIONS
    // ==========================================
    const totalMessages = messages.length;
    const totalCharacters = messages.reduce((acc, m) => acc + (m.messageLength || 0), 0);
    const totalWords = messages.reduce((acc, m) => acc + (m.wordCount || 0), 0);
    const avgMessageLength = totalMessages > 0 ? Math.round(totalCharacters / totalMessages) : 0;
    const avgWordsPerMessage = totalMessages > 0 ? Number((totalWords / totalMessages).toFixed(1)) : 0;

    const totalVoiceSeconds = voiceLogs.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
    const totalVoiceHours = Number((totalVoiceSeconds / 3600).toFixed(1));
    const formattedVoiceTime = formatDuration(totalVoiceSeconds);

    const activeUserIds = new Set([
      ...messages.map((m) => m.userId),
      ...voiceLogs.map((v) => v.userId),
    ]);
    const totalActiveMembers = activeUserIds.size;

    const joinsCount = memberLogs.filter((l) => l.eventType === 'join').length;
    const leavesCount = memberLogs.filter((l) => l.eventType === 'leave').length;
    const netGrowth = joinsCount - leavesCount;

    // Peak Hour Computation (0-23)
    const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i}h`,
      messages: 0,
      voiceMinutes: 0,
      totalWeight: 0,
    }));

    for (const m of messages) {
      const h = new Date(m.createdAt).getHours();
      hourlyActivity[h].messages += 1;
      hourlyActivity[h].totalWeight += 1;
    }

    for (const v of voiceLogs) {
      const h = new Date(v.joinedAt).getHours();
      const mins = Math.round(v.durationSeconds / 60);
      hourlyActivity[h].voiceMinutes += mins;
      hourlyActivity[h].totalWeight += Math.max(1, Math.round(mins / 2));
    }

    let peakHourIndex = 0;
    let maxActivity = -1;
    for (let i = 0; i < 24; i++) {
      if (hourlyActivity[i].totalWeight > maxActivity) {
        maxActivity = hourlyActivity[i].totalWeight;
        peakHourIndex = i;
      }
    }

    const peakHourText =
      maxActivity > 0
        ? `${peakHourIndex}h00 - ${peakHourIndex + 1}h00 (${hourlyActivity[peakHourIndex].messages} msgs, ${hourlyActivity[peakHourIndex].voiceMinutes}m vocal)`
        : 'Pas assez de données';

    // ==========================================
    // 2. TIMELINE DATA (Trend chart)
    // ==========================================
    const isHourlyTimeline = range === 'today' || (endDate - startDate <= 28 * 60 * 60 * 1000);
    const timelineMap = new Map();

    if (isHourlyTimeline) {
      const cur = new Date(startDate);
      while (cur <= endDate) {
        const key = `${String(cur.getHours()).padStart(2, '0')}h`;
        timelineMap.set(key, { label: key, messages: 0, voiceMinutes: 0, joins: 0, leaves: 0 });
        cur.setHours(cur.getHours() + 1);
      }
      for (const m of messages) {
        const key = `${String(new Date(m.createdAt).getHours()).padStart(2, '0')}h`;
        if (timelineMap.has(key)) timelineMap.get(key).messages += 1;
      }
      for (const v of voiceLogs) {
        const key = `${String(new Date(v.joinedAt).getHours()).padStart(2, '0')}h`;
        if (timelineMap.has(key)) timelineMap.get(key).voiceMinutes += Math.round(v.durationSeconds / 60);
      }
      for (const l of memberLogs) {
        const key = `${String(new Date(l.createdAt).getHours()).padStart(2, '0')}h`;
        if (timelineMap.has(key)) {
          if (l.eventType === 'join') timelineMap.get(key).joins += 1;
          else timelineMap.get(key).leaves += 1;
        }
      }
    } else {
      const cur = new Date(startDate);
      cur.setHours(0, 0, 0, 0);
      const endLimit = new Date(endDate);
      endLimit.setHours(23, 59, 59, 999);

      while (cur <= endLimit) {
        const key = formatDateKey(cur);
        timelineMap.set(key, { label: key, messages: 0, voiceMinutes: 0, joins: 0, leaves: 0 });
        cur.setDate(cur.getDate() + 1);
      }

      for (const m of messages) {
        const key = formatDateKey(m.createdAt);
        if (timelineMap.has(key)) timelineMap.get(key).messages += 1;
      }
      for (const v of voiceLogs) {
        const key = formatDateKey(v.joinedAt);
        if (timelineMap.has(key)) timelineMap.get(key).voiceMinutes += Math.round(v.durationSeconds / 60);
      }
      for (const l of memberLogs) {
        const key = formatDateKey(l.createdAt);
        if (timelineMap.has(key)) {
          if (l.eventType === 'join') timelineMap.get(key).joins += 1;
          else timelineMap.get(key).leaves += 1;
        }
      }
    }

    const timeline = Array.from(timelineMap.values());

    // ==========================================
    // 3. TOP MEMBERS LEADERBOARD
    // ==========================================
    const memberStats = new Map();
    for (const uid of activeUserIds) {
      memberStats.set(uid, {
        userId: uid,
        messagesCount: 0,
        voiceSeconds: 0,
        totalChars: 0,
        totalWords: 0,
      });
    }

    for (const m of messages) {
      const s = memberStats.get(m.userId);
      if (s) {
        s.messagesCount += 1;
        s.totalChars += m.messageLength || 0;
        s.totalWords += m.wordCount || 0;
      }
    }

    for (const v of voiceLogs) {
      const s = memberStats.get(v.userId);
      if (s) {
        s.voiceSeconds += v.durationSeconds || 0;
      }
    }

    const topMembers = Array.from(memberStats.values())
      .map((s) => {
        const user = resolveUser(s.userId);
        return {
          ...user,
          messagesCount: s.messagesCount,
          voiceSeconds: s.voiceSeconds,
          voiceFormatted: formatDuration(s.voiceSeconds),
          avgMessageLength: s.messagesCount > 0 ? Math.round(s.totalChars / s.messagesCount) : 0,
          avgWords: s.messagesCount > 0 ? Number((s.totalWords / s.messagesCount).toFixed(1)) : 0,
          activityScore: s.messagesCount + Math.round(s.voiceSeconds / 60),
        };
      })
      .sort((a, b) => b.activityScore - a.activityScore);

    // ==========================================
    // 4. TOP ROLES CORRELATION
    // ==========================================
    const roleStats = new Map();

    if (guild) {
      for (const role of guild.roles.cache.values()) {
        if (role.id === guild.id || role.managed) continue;
        roleStats.set(role.id, {
          roleId: role.id,
          roleName: role.name,
          color: role.hexColor === '#000000' ? '#99aab5' : role.hexColor,
          messagesCount: 0,
          voiceSeconds: 0,
          totalChars: 0,
          membersSet: new Set(),
        });
      }
    }

    for (const m of messages) {
      let rIds = [];
      try {
        rIds = JSON.parse(m.roleIds || '[]');
      } catch {}
      for (const rid of rIds) {
        if (!roleStats.has(rid)) {
          const rName = guild?.roles.cache.get(rid)?.name || `Rôle (${rid.slice(0, 4)}...)`;
          const rColor = guild?.roles.cache.get(rid)?.hexColor || '#99aab5';
          roleStats.set(rid, {
            roleId: rid,
            roleName: rName,
            color: rColor,
            messagesCount: 0,
            voiceSeconds: 0,
            totalChars: 0,
            membersSet: new Set(),
          });
        }
        const rs = roleStats.get(rid);
        rs.messagesCount += 1;
        rs.totalChars += m.messageLength || 0;
        rs.membersSet.add(m.userId);
      }
    }

    for (const v of voiceLogs) {
      let rIds = [];
      try {
        rIds = JSON.parse(v.roleIds || '[]');
      } catch {}
      for (const rid of rIds) {
        if (roleStats.has(rid)) {
          const rs = roleStats.get(rid);
          rs.voiceSeconds += v.durationSeconds || 0;
          rs.membersSet.add(v.userId);
        }
      }
    }

    const topRoles = Array.from(roleStats.values())
      .filter((r) => r.messagesCount > 0 || r.voiceSeconds > 0)
      .map((r) => ({
        roleId: r.roleId,
        roleName: r.roleName,
        color: r.color,
        messagesCount: r.messagesCount,
        voiceSeconds: r.voiceSeconds,
        voiceFormatted: formatDuration(r.voiceSeconds),
        avgMessageLength: r.messagesCount > 0 ? Math.round(r.totalChars / r.messagesCount) : 0,
        activeMembersCount: r.membersSet.size,
      }))
      .sort((a, b) => b.messagesCount - a.messagesCount);

    // ==========================================
    // 5. TOP CHAT ROOMS / CHANNELS
    // ==========================================
    const textChannelStats = new Map();
    for (const m of messages) {
      if (!textChannelStats.has(m.channelId)) {
        textChannelStats.set(m.channelId, {
          channelId: m.channelId,
          messagesCount: 0,
          totalChars: 0,
          usersSet: new Set(),
        });
      }
      const cs = textChannelStats.get(m.channelId);
      cs.messagesCount += 1;
      cs.totalChars += m.messageLength || 0;
      cs.usersSet.add(m.userId);
    }

    const topTextChannels = Array.from(textChannelStats.values())
      .map((c) => {
        const chInfo = resolveChannel(c.channelId, false);
        return {
          channelId: c.channelId,
          channelName: chInfo.name,
          messagesCount: c.messagesCount,
          avgMessageLength: c.messagesCount > 0 ? Math.round(c.totalChars / c.messagesCount) : 0,
          uniqueUsersCount: c.usersSet.size,
        };
      })
      .sort((a, b) => b.messagesCount - a.messagesCount);

    const voiceChannelStats = new Map();
    for (const v of voiceLogs) {
      if (!voiceChannelStats.has(v.channelId)) {
        voiceChannelStats.set(v.channelId, {
          channelId: v.channelId,
          sessionsCount: 0,
          voiceSeconds: 0,
          usersSet: new Set(),
        });
      }
      const vs = voiceChannelStats.get(v.channelId);
      vs.sessionsCount += 1;
      vs.voiceSeconds += v.durationSeconds || 0;
      vs.usersSet.add(v.userId);
    }

    const topVoiceChannels = Array.from(voiceChannelStats.values())
      .map((c) => {
        const chInfo = resolveChannel(c.channelId, true);
        return {
          channelId: c.channelId,
          channelName: chInfo.name,
          sessionsCount: c.sessionsCount,
          voiceSeconds: c.voiceSeconds,
          voiceFormatted: formatDuration(c.voiceSeconds),
          uniqueUsersCount: c.usersSet.size,
        };
      })
      .sort((a, b) => b.voiceSeconds - a.voiceSeconds);

    // ==========================================
    // 6. MEMBER FLOW LOGS
    // ==========================================
    const memberEvents = memberLogs.slice(0, 50).map((l) => {
      const user = resolveUser(l.userId);
      return {
        id: l.id,
        eventType: l.eventType,
        userId: l.userId,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        timestamp: l.createdAt,
        formattedDate: new Date(l.createdAt).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    });

    return {
      filters: {
        range,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        channelId: channelId || 'all',
        roleId: roleId || 'all',
        userId: userId || 'all',
      },
      kpi: {
        totalMessages,
        totalCharacters,
        totalWords,
        avgMessageLength,
        avgWordsPerMessage,
        totalVoiceSeconds,
        totalVoiceHours,
        formattedVoiceTime,
        totalActiveMembers,
        joinsCount,
        leavesCount,
        netGrowth,
        peakHourText,
        peakHourIndex,
      },
      peakHours: hourlyActivity,
      timeline,
      topMembers: topMembers.slice(0, 25),
      topRoles: topRoles.slice(0, 25),
      topTextChannels: topTextChannels.slice(0, 25),
      topVoiceChannels: topVoiceChannels.slice(0, 25),
      memberEvents,
    };
  },

  /**
   * Export activity dataset to CSV string
   */
  async exportCSV(options) {
    const data = await this.getAnalytics(options);
    const rows = [];

    // Header metadata
    rows.push(['# RAPPORT ANALYTIQUE PYRO DISCORD BOT']);
    rows.push([`# Periode: ${data.filters.startDate} au ${data.filters.endDate}`]);
    rows.push([`# Messages Totaux: ${data.kpi.totalMessages}`]);
    rows.push([`# Temps Vocal Total: ${data.kpi.formattedVoiceTime}`]);
    rows.push([`# Longueur Moyenne Message: ${data.kpi.avgMessageLength} caracteres`]);
    rows.push([`# Membres Actifs: ${data.kpi.totalActiveMembers}`]);
    rows.push([`# Flux Membres: +${data.kpi.joinsCount} / -${data.kpi.leavesCount} (Net: ${data.kpi.netGrowth})`]);
    rows.push([]);

    // 1. Top Membres
    rows.push(['--- TOP MEMBRES ---']);
    rows.push(['Rang', 'ID Utilisateur', 'Nom d\'affichage', 'Identifiant', 'Messages', 'Temps Vocal', 'Longueur Moy.']);
    data.topMembers.forEach((m, idx) => {
      rows.push([
        idx + 1,
        `"${m.userId}"`,
        `"${m.displayName.replace(/"/g, '""')}"`,
        `"${m.username.replace(/"/g, '""')}"`,
        m.messagesCount,
        `"${m.voiceFormatted}"`,
        m.avgMessageLength,
      ]);
    });
    rows.push([]);

    // 2. Top Salons Textuels
    rows.push(['--- SALONS TEXTUELS ---']);
    rows.push(['Rang', 'ID Salon', 'Nom du Salon', 'Messages', 'Longueur Moy.', 'Membres Uniques']);
    data.topTextChannels.forEach((c, idx) => {
      rows.push([
        idx + 1,
        `"${c.channelId}"`,
        `"#${c.channelName.replace(/"/g, '""')}"`,
        c.messagesCount,
        c.avgMessageLength,
        c.uniqueUsersCount,
      ]);
    });
    rows.push([]);

    // 3. Top Salons Vocaux
    rows.push(['--- SALONS VOCAUX ---']);
    rows.push(['Rang', 'ID Salon', 'Nom du Salon', 'Temps Vocal', 'Sessions', 'Membres Uniques']);
    data.topVoiceChannels.forEach((c, idx) => {
      rows.push([
        idx + 1,
        `"${c.channelId}"`,
        `"🔊 ${c.channelName.replace(/"/g, '""')}"`,
        `"${c.voiceFormatted}"`,
        c.sessionsCount,
        c.uniqueUsersCount,
      ]);
    });
    rows.push([]);

    // 4. Heures de Pointe
    rows.push(['--- REPARTITION HORAIRE (HEURES DE POINTE) ---']);
    rows.push(['Heure', 'Messages', 'Minutes Vocales']);
    data.peakHours.forEach((h) => {
      rows.push([`${h.hour}h00`, h.messages, h.voiceMinutes]);
    });

    return rows.map((r) => r.join(',')).join('\n');
  },
};

module.exports = analyticsService;

