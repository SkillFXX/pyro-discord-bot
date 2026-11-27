const { PermissionFlagsBits } = require('discord.js');
const { Op } = require('sequelize');
const { sequelize, ScheduledPoll, PollResult, PollVote } = require('../database');

const POLL_TIMEZONE = process.env.POLL_TIMEZONE || 'Europe/Paris';
const CHECK_INTERVAL_MS = 30 * 1000;
const RESULTS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
// A poll missed because the bot was offline is still posted if the bot comes back within this window.
const CATCH_UP_WINDOW_MINUTES = 120;

const LIMITS = { question: 300, answerText: 55, minAnswers: 2, maxAnswers: 10, maxDurationHours: 768 };

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Current date, minutes since midnight and weekday in the poll timezone.
 * @param {Date} [now]
 * @returns {{ date: string, minutes: number, weekday: number }}
 */
function getLocalParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: POLL_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday],
  };
}

function parseTime(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Validates and normalizes a scheduled poll payload coming from the dashboard.
 * @param {object} body
 * @returns {{ error: string } | { value: object }}
 */
function validatePollPayload(body = {}) {
  const question = String(body.question || '').trim();
  if (!question) return { error: 'La question du sondage est requise.' };
  if (question.length > LIMITS.question) return { error: `La question ne peut pas dépasser ${LIMITS.question} caractères.` };

  const answers = (Array.isArray(body.answers) ? body.answers : [])
    .map(a => String(typeof a === 'string' ? a : a?.text || '').trim())
    .filter(Boolean);
  if (answers.length < LIMITS.minAnswers || answers.length > LIMITS.maxAnswers) {
    return { error: `Un sondage doit avoir entre ${LIMITS.minAnswers} et ${LIMITS.maxAnswers} réponses.` };
  }
  if (answers.some(a => a.length > LIMITS.answerText)) {
    return { error: `Chaque réponse est limitée à ${LIMITS.answerText} caractères.` };
  }

  if (!body.channelId) return { error: 'Veuillez choisir un salon.' };
  if (parseTime(body.time) === null) return { error: "L'heure doit être au format HH:MM." };

  const days = [...new Set((Array.isArray(body.days) ? body.days : []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  if (days.length === 0) return { error: 'Sélectionnez au moins un jour de la semaine.' };

  const durationHours = parseInt(body.durationHours, 10);
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > LIMITS.maxDurationHours) {
    return { error: `La durée doit être comprise entre 1 et ${LIMITS.maxDurationHours} heures.` };
  }

  return {
    value: {
      channelId: String(body.channelId),
      question,
      answers: answers.map(text => ({ text })),
      allowMultiselect: Boolean(body.allowMultiselect),
      durationHours,
      time: body.time,
      days: days.sort(),
      mentionRoleId: body.mentionRoleId ? String(body.mentionRoleId) : null,
      enabled: body.enabled !== false,
    },
  };
}

/**
 * Posts a poll to its channel and records it so its votes can be tracked.
 * @returns {Promise<import('discord.js').Channel>} the channel the poll was posted in
 * @throws {Error} with a user-readable message when the poll cannot be posted
 */
async function sendPoll(client, poll) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const channel = guild ? await guild.channels.fetch(poll.channelId).catch(() => null) : null;
  if (!channel || !channel.isTextBased()) throw new Error('Salon introuvable.');

  const me = guild.members.me || await guild.members.fetchMe();
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendPolls])) {
    throw new Error(`Le bot n'a pas la permission « Envoyer des sondages » dans #${channel.name}.`);
  }

  const message = await channel.send({
    content: poll.mentionRoleId ? `<@&${poll.mentionRoleId}>` : undefined,
    allowedMentions: poll.mentionRoleId ? { roles: [poll.mentionRoleId] } : { parse: [] },
    poll: {
      question: { text: poll.question },
      answers: poll.answers.map(a => ({ text: a.text })),
      duration: poll.durationHours,
      allowMultiselect: Boolean(poll.allowMultiselect),
    },
  });

  await PollResult.create({
    scheduledPollId: poll.id,
    messageId: message.id,
    channelId: channel.id,
    question: poll.question,
    answers: poll.answers.map(a => ({ text: a.text, votes: 0 })),
    expiresAt: new Date(Date.now() + poll.durationHours * 60 * 60 * 1000),
  }).catch(err => console.error('[PollScheduler] Résultat non enregistré :', err.message));

  return channel;
}

/**
 * Fetches every voter of every answer of a poll (Discord returns at most 100 per call).
 * @returns {Promise<Array<{ userId: string, answerIndex: number, answerText: string }>>}
 */
async function fetchPollVotes(poll) {
  const votes = [];
  let answerIndex = 0;
  for (const answer of poll.answers.values()) {
    let after;
    for (;;) {
      const voters = await answer.voters.fetch({ after, limit: 100 });
      for (const userId of voters.keys()) {
        votes.push({ userId, answerIndex, answerText: String(answer.text).substring(0, 100) });
      }
      if (voters.size < 100) break;
      after = voters.lastKey();
    }
    answerIndex++;
  }
  return votes;
}

async function storeVotes(result, votes) {
  await sequelize.transaction(async (transaction) => {
    await PollVote.destroy({ where: { pollResultId: result.id }, transaction });
    await PollVote.bulkCreate(votes.map(v => ({ ...v, pollResultId: result.id })), { transaction });
  });
}

/**
 * Refreshes the votes of every poll that is still open, and stores the voters of ended polls.
 * Discord keeps the results after a poll ends, so polls that ended while the bot was offline are still caught.
 */
async function syncPollResults(client) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  const pending = await PollResult.findAll({
    where: { [Op.or]: [{ status: 'open' }, { status: 'finalized', votersSynced: false }] },
  });

  for (const result of pending) {
    try {
      const channel = await guild.channels.fetch(result.channelId).catch(() => null);
      const message = channel ? await channel.messages.fetch(result.messageId).catch(err => (err.code === 10008 ? null : undefined)) : null;

      // undefined = temporary failure (network, permissions): retry on the next pass
      if (message === undefined) continue;

      if (!message || !message.poll) {
        // An ended poll whose message is gone keeps what was stored; an open one is dropped from the stats.
        await result.update(result.status === 'finalized' ? { votersSynced: true } : { status: 'deleted' });
        continue;
      }

      const answers = [...message.poll.answers.values()].map(a => ({ text: a.text, votes: a.voteCount ?? 0 }));
      const status = message.poll.resultsFinalized ? 'finalized' : 'open';
      const changed = JSON.stringify(answers) !== JSON.stringify(result.answers);
      const needsVoters = changed || (status === 'finalized' && !result.votersSynced);

      if (needsVoters) {
        await storeVotes(result, await fetchPollVotes(message.poll));
      }

      await result.update({
        answers,
        totalVotes: answers.reduce((sum, a) => sum + a.votes, 0),
        status,
        votersSynced: status === 'finalized' ? true : result.votersSynced,
      });
    } catch (err) {
      console.error(`[PollScheduler] Suivi du sondage ${result.messageId} impossible :`, err.message);
    }
  }
}

/**
 * Statistics of one recurring poll. Occurrences of a recurring poll are merged together
 * (answers are grouped by their text), different recurring polls are never mixed.
 * @param {object} filters
 * @param {number|string} [filters.pollId] ScheduledPoll id (defaults to the most recently posted one)
 * @param {string} [filters.from] 'YYYY-MM-DD' (inclusive)
 * @param {string} [filters.to] 'YYYY-MM-DD' (inclusive)
 * @param {string} [filters.userId] restrict the votes to one member
 */
async function getPollStats({ pollId, from, to, userId } = {}) {
  const all = await PollResult.findAll({
    where: { status: ['open', 'finalized'] },
    order: [['createdAt', 'DESC']],
  });

  const groups = new Map();
  for (const r of all) {
    if (!groups.has(r.scheduledPollId)) groups.set(r.scheduledPollId, r);
  }
  const schedules = await ScheduledPoll.findAll({ where: { id: [...groups.keys()].filter(id => id !== null) } });
  const polls = [...groups.entries()].map(([id, latest]) => ({
    id,
    question: schedules.find(sp => sp.id === id)?.question || latest.question,
    deleted: !schedules.some(sp => sp.id === id),
  }));

  const selectedId = pollId !== undefined && pollId !== '' ? Number(pollId) : polls[0]?.id;
  const selectedPoll = polls.find(p => p.id === selectedId);
  if (!selectedPoll) return { polls, selected: null };

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
  const results = all
    .filter(r => r.scheduledPollId === selectedId)
    .filter(r => (!fromDate || r.createdAt >= fromDate) && (!toDate || r.createdAt <= toDate))
    .reverse(); // chronological

  const answerTotals = new Map();
  for (const r of results) {
    const best = Math.max(0, ...r.answers.map(a => a.votes));
    for (const a of r.answers) {
      const entry = answerTotals.get(a.text) || { text: a.text, votes: 0, wins: 0 };
      entry.votes += a.votes;
      if (best > 0 && a.votes === best) entry.wins++;
      answerTotals.set(a.text, entry);
    }
  }
  const totalVotes = results.reduce((sum, r) => sum + r.totalVotes, 0);
  const percentOf = (votes, total) => (total > 0 ? Math.round((votes / total) * 1000) / 10 : 0);

  const resultIds = results.map(r => r.id);
  const votes = resultIds.length
    ? await PollVote.findAll({ where: { pollResultId: resultIds }, attributes: ['pollResultId', 'userId', 'answerText'] })
    : [];

  let member = null;
  if (userId) {
    const memberVotes = votes.filter(v => v.userId === userId);
    const byAnswer = new Map();
    for (const v of memberVotes) byAnswer.set(v.answerText, (byAnswer.get(v.answerText) || 0) + 1);
    member = {
      userId,
      participated: new Set(memberVotes.map(v => v.pollResultId)).size,
      occurrences: results.length,
      answers: [...byAnswer.entries()]
        .map(([text, count]) => ({ text, count, percent: percentOf(count, memberVotes.length) }))
        .sort((a, b) => b.count - a.count),
    };
  }

  return {
    polls,
    selected: {
      id: selectedPoll.id,
      question: selectedPoll.question,
      occurrences: results.length,
      totalVotes,
      averageVotes: results.length ? Math.round((totalVotes / results.length) * 10) / 10 : 0,
      answers: [...answerTotals.values()]
        .map(a => ({ ...a, percent: percentOf(a.votes, totalVotes) }))
        .sort((a, b) => b.votes - a.votes),
      timeline: results.map(r => ({
        id: r.id,
        date: r.createdAt,
        status: r.status,
        totalVotes: r.totalVotes,
        answers: r.answers,
      })),
      voters: [...new Set(votes.map(v => v.userId))],
      member,
    },
  };
}

async function runDuePolls(client) {
  const { date, minutes, weekday } = getLocalParts();
  const polls = await ScheduledPoll.findAll({ where: { enabled: true } });

  for (const poll of polls) {
    const scheduled = parseTime(poll.time);
    const isDue = scheduled !== null
      && poll.days.includes(weekday)
      && poll.lastRunDate !== date
      && minutes >= scheduled
      && minutes - scheduled <= CATCH_UP_WINDOW_MINUTES;
    if (!isDue) continue;

    // Mark first so a slow send or a failure never results in duplicate polls.
    await poll.update({ lastRunDate: date });
    try {
      await sendPoll(client, poll);
    } catch (err) {
      console.error(`[PollScheduler] Sondage #${poll.id} non envoyé :`, err.message);
    }
  }
}

function start(client) {
  const tick = () => runDuePolls(client).catch(err => console.error('[PollScheduler] Erreur :', err));
  setTimeout(tick, 10 * 1000).unref();
  setInterval(tick, CHECK_INTERVAL_MS).unref();

  const syncResults = () => syncPollResults(client).catch(err => console.error('[PollScheduler] Erreur suivi résultats :', err));
  setTimeout(syncResults, 30 * 1000).unref();
  setInterval(syncResults, RESULTS_SYNC_INTERVAL_MS).unref();
  console.log(`[PollScheduler] Planificateur de sondages démarré (fuseau ${POLL_TIMEZONE}).`);
}

module.exports = { start, runDuePolls, syncPollResults, getPollStats, sendPoll, validatePollPayload, getLocalParts, POLL_TIMEZONE, LIMITS };
