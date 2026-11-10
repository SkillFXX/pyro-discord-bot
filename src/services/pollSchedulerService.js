const { PermissionFlagsBits } = require('discord.js');
const { ScheduledPoll } = require('../database');

const POLL_TIMEZONE = process.env.POLL_TIMEZONE || 'Europe/Paris';
const CHECK_INTERVAL_MS = 30 * 1000;
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
 * Posts a poll to its channel.
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

  await channel.send({
    content: poll.mentionRoleId ? `<@&${poll.mentionRoleId}>` : undefined,
    allowedMentions: poll.mentionRoleId ? { roles: [poll.mentionRoleId] } : { parse: [] },
    poll: {
      question: { text: poll.question },
      answers: poll.answers.map(a => ({ text: a.text })),
      duration: poll.durationHours,
      allowMultiselect: Boolean(poll.allowMultiselect),
    },
  });
  return channel;
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
  console.log(`[PollScheduler] Planificateur de sondages démarré (fuseau ${POLL_TIMEZONE}).`);
}

module.exports = { start, runDuePolls, sendPoll, validatePollPayload, getLocalParts, POLL_TIMEZONE, LIMITS };
