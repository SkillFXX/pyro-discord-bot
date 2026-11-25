<script>
  import { onMount } from 'svelte';
  import { ChartBar, Plus, Trash2, Pencil, Send, X } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Modal from '../components/Modal.svelte';
  import Toggle from '../components/Toggle.svelte';
  import {
    dashboardData,
    fetchScheduledPolls,
    createScheduledPoll,
    updateScheduledPoll,
    deleteScheduledPoll,
    sendScheduledPollNow,
    fetchPollStats,
  } from '../stores/data';

  const DAY_LABELS = [
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mer' },
    { value: 4, label: 'Jeu' },
    { value: 5, label: 'Ven' },
    { value: 6, label: 'Sam' },
    { value: 0, label: 'Dim' },
  ];

  let polls = [];
  let stats = { summary: { pollsCount: 0, finishedCount: 0, totalVotes: 0, averageVotes: 0 }, results: [] };
  let timezone = '';
  let limits = { question: 300, answerText: 55, minAnswers: 2, maxAnswers: 10, maxDurationHours: 768 };

  let showModal = false;
  let editingId = null;
  let saving = false;

  let channelId = '';
  let question = '';
  let answers = ['', ''];
  let allowMultiselect = false;
  let durationHours = 24;
  let time = '12:00';
  let days = [0, 1, 2, 3, 4, 5, 6];
  let mentionRoleId = '';
  let enabled = true;

  $: textChannels = ($dashboardData.channels?.text || []).filter((c) => !c.forum);
  $: roles = $dashboardData.roles || [];

  async function load() {
    const data = await fetchScheduledPolls();
    polls = data.polls || [];
    timezone = data.timezone || '';
    limits = { ...limits, ...(data.limits || {}) };
    stats = await fetchPollStats();
  }

  function percent(votes, result) {
    return result.totalVotes > 0 ? Math.round((votes / result.totalVotes) * 100) : 0;
  }

  function topVotes(result) {
    return Math.max(...result.answers.map((a) => a.votes));
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  onMount(load);

  function channelName(id) {
    return textChannels.find((c) => c.id === id)?.name || id;
  }

  function formatDays(list) {
    if (list.length === 7) return 'Tous les jours';
    return DAY_LABELS.filter((d) => list.includes(d.value)).map((d) => d.label).join(', ');
  }

  function openCreate() {
    editingId = null;
    channelId = textChannels[0]?.id || '';
    question = '';
    answers = ['', ''];
    allowMultiselect = false;
    durationHours = 24;
    time = '12:00';
    days = [0, 1, 2, 3, 4, 5, 6];
    mentionRoleId = '';
    enabled = true;
    showModal = true;
  }

  function openEdit(poll) {
    editingId = poll.id;
    channelId = poll.channelId;
    question = poll.question;
    answers = poll.answers.map((a) => a.text);
    allowMultiselect = poll.allowMultiselect;
    durationHours = poll.durationHours;
    time = poll.time;
    days = [...poll.days];
    mentionRoleId = poll.mentionRoleId || '';
    enabled = poll.enabled;
    showModal = true;
  }

  function toggleDay(value) {
    days = days.includes(value) ? days.filter((d) => d !== value) : [...days, value];
  }

  function addAnswer() {
    if (answers.length < limits.maxAnswers) answers = [...answers, ''];
  }

  function removeAnswer(index) {
    if (answers.length > limits.minAnswers) answers = answers.filter((_, i) => i !== index);
  }

  async function handleSubmit() {
    saving = true;
    const payload = {
      channelId,
      question,
      answers,
      allowMultiselect,
      durationHours: Number(durationHours),
      time,
      days,
      mentionRoleId: mentionRoleId || null,
      enabled,
    };
    const result = editingId ? await updateScheduledPoll(editingId, payload) : await createScheduledPoll(payload);
    saving = false;
    if (result) {
      showModal = false;
      await load();
    }
  }

  async function handleDelete(poll) {
    if (!confirm(`Supprimer le sondage programmé « ${poll.question} » ?`)) return;
    if (await deleteScheduledPoll(poll.id)) await load();
  }

  async function handleToggle(poll) {
    const payload = { ...poll, answers: poll.answers.map((a) => a.text), enabled: !poll.enabled };
    if (await updateScheduledPoll(poll.id, payload)) await load();
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><ChartBar size={24} class="title-icon" /> Sondages Programmés</h2>
      <p class="section-desc">
        Publiez automatiquement un sondage Discord dans un salon, chaque jour ou certains jours de la semaine.
      </p>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>
      <Plus size={16} style="vertical-align: middle; margin-right: 6px;" />
      Nouveau Sondage
    </button>
  </div>

  <Card
    id="polls-list"
    icon={ChartBar}
    title="Sondages Automatiques"
    subtitle={timezone ? `Les heures sont exprimées dans le fuseau ${timezone}.` : 'Sondages publiés automatiquement par le bot'}
  >
    <DataTable
      headers={['Question', 'Salon', 'Planification', 'Réponses', 'Actif', 'Actions']}
      items={polls}
      emptyMessage="Aucun sondage programmé pour le moment."
    >
      <tr slot="row" let:item>
        <td><strong>{item.question}</strong></td>
        <td># {channelName(item.channelId)}</td>
        <td>
          <div><span class="badge badge-info">🕒 {item.time}</span></div>
          <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">{formatDays(item.days)}</div>
        </td>
        <td>
          {#each item.answers as a}
            <div style="font-size: 0.8rem;">• {a.text}</div>
          {/each}
          <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 4px;">
            {item.allowMultiselect ? 'Choix multiple' : 'Choix unique'} • {item.durationHours} h
          </div>
        </td>
        <td>
          <Toggle id={`poll_enabled_${item.id}`} checked={item.enabled} onChange={() => handleToggle(item)} />
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button
            class="btn btn-secondary"
            style="padding: 0.35rem 0.6rem; font-size: 0.8rem; margin-right: 6px;"
            on:click={() => sendScheduledPollNow(item.id)}
            title="Envoyer ce sondage maintenant"
          >
            <Send size={14} />
          </button>
          <button
            class="btn btn-secondary"
            style="padding: 0.35rem 0.6rem; font-size: 0.8rem; margin-right: 6px;"
            on:click={() => openEdit(item)}
            title="Modifier"
          >
            <Pencil size={14} />
          </button>
          <button
            class="btn btn-danger"
            style="padding: 0.35rem 0.6rem; font-size: 0.8rem;"
            on:click={() => handleDelete(item)}
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
    </DataTable>
  </Card>

  <Card
    id="polls-stats"
    icon={ChartBar}
    title="Statistiques des Sondages"
    subtitle="Résultats des sondages envoyés automatiquement (mis à jour toutes les 5 minutes)"
  >
    <div class="grid-2" style="margin-bottom: 1.25rem;">
      <div class="form-group">
        <span class="form-label">Sondages envoyés</span>
        <strong style="font-size: 1.5rem;">{stats.summary.pollsCount}</strong>
        <small style="color: var(--text-muted);">{stats.summary.finishedCount} terminé(s)</small>
      </div>
      <div class="form-group">
        <span class="form-label">Votes</span>
        <strong style="font-size: 1.5rem;">{stats.summary.totalVotes}</strong>
        <small style="color: var(--text-muted);">≈ {stats.summary.averageVotes} par sondage</small>
      </div>
    </div>

    {#each stats.results as result (result.id)}
      <div style="padding: 1rem 0; border-top: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.6rem;">
          <strong>{result.question}</strong>
          <span style="color: var(--text-muted); font-size: 0.8rem;">
            {formatDate(result.createdAt)} • {result.totalVotes} vote(s) •
            {result.status === 'finalized' ? 'Terminé' : 'En cours'}
          </span>
        </div>
        {#each result.answers as answer}
          <div style="margin-bottom: 0.45rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 3px;">
              <span>{answer.text}{result.totalVotes > 0 && answer.votes === topVotes(result) ? ' 🏆' : ''}</span>
              <span>{answer.votes} ({percent(answer.votes, result)}%)</span>
            </div>
            <div style="height: 8px; border-radius: 4px; background: var(--border); overflow: hidden;">
              <div style="height: 100%; width: {percent(answer.votes, result)}%; background: var(--primary);"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p style="color: var(--text-muted); margin: 0;">
        Aucun résultat pour le moment. Les sondages envoyés à partir de maintenant seront suivis automatiquement.
      </p>
    {/each}
  </Card>

  <Modal bind:open={showModal} title={editingId ? 'Modifier le Sondage' : 'Nouveau Sondage Programmé'}>
    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group">
        <label for="poll_question">Question</label>
        <input id="poll_question" type="text" bind:value={question} maxlength={limits.question} placeholder="Ex : Quel est votre jeu du moment ?" required />
      </div>

      <div class="form-group">
        <span class="form-label">Réponses ({answers.length}/{limits.maxAnswers})</span>
        {#each answers as _, i}
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
            <input type="text" bind:value={answers[i]} maxlength={limits.answerText} placeholder={`Réponse ${i + 1}`} required />
            <button
              type="button"
              class="btn btn-secondary"
              on:click={() => removeAnswer(i)}
              disabled={answers.length <= limits.minAnswers}
              title="Retirer cette réponse"
            >
              <X size={14} />
            </button>
          </div>
        {/each}
        <button type="button" class="btn btn-secondary" on:click={addAnswer} disabled={answers.length >= limits.maxAnswers}>
          <Plus size={14} style="vertical-align: middle; margin-right: 4px;" /> Ajouter une réponse
        </button>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="poll_channel">Salon</label>
          <select id="poll_channel" bind:value={channelId} required>
            {#each textChannels as c}
              <option value={c.id}># {c.name}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label for="poll_role">Mentionner un rôle (optionnel)</label>
          <select id="poll_role" bind:value={mentionRoleId}>
            <option value="">-- Aucune mention --</option>
            {#each roles as r}
              <option value={r.id}>@ {r.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="poll_time">Heure d'envoi{timezone ? ` (${timezone})` : ''}</label>
          <input id="poll_time" type="time" bind:value={time} required />
        </div>
        <div class="form-group">
          <label for="poll_duration">Durée du sondage (heures)</label>
          <input id="poll_duration" type="number" min="1" max={limits.maxDurationHours} bind:value={durationHours} required />
        </div>
      </div>

      <div class="form-group">
        <span class="form-label">Jours d'envoi</span>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          {#each DAY_LABELS as d}
            <button
              type="button"
              class="btn {days.includes(d.value) ? 'btn-primary' : 'btn-secondary'}"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem;"
              on:click={() => toggleDay(d.value)}
            >
              {d.label}
            </button>
          {/each}
        </div>
      </div>

      <Toggle id="poll_multiselect" bind:checked={allowMultiselect} label="Autoriser plusieurs réponses" />
      <div style="margin-top: 0.75rem;">
        <Toggle id="poll_enabled" bind:checked={enabled} label="Sondage actif" />
      </div>

      <div style="display:flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
        <button type="button" class="btn btn-secondary" on:click={() => (showModal = false)}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled={saving}>
          {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Programmer le sondage'}
        </button>
      </div>
    </form>
  </Modal>
</div>
