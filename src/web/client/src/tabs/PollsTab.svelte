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
  let stats = { polls: [], selected: null };
  let statsPollId = '';
  let statsPeriod = '30';
  let statsFrom = '';
  let statsTo = '';
  let statsUserId = '';
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
    await loadStats();
  }

  function dayString(daysAgo) {
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function loadStats() {
    const custom = statsPeriod === 'custom';
    const from = custom ? statsFrom : statsPeriod === 'all' ? '' : dayString(Number(statsPeriod));
    const to = custom ? statsTo : '';
    stats = await fetchPollStats({ pollId: statsPollId, from, to, userId: statsUserId });
    // Keep the selection in sync with what the server resolved (default = most recent recurring poll)
    if (stats.selected) statsPollId = String(stats.selected.id);
  }

  async function selectStatsPoll() {
    statsUserId = '';
    await loadStats();
  }

  function memberName(id) {
    return ($dashboardData.members || []).find((m) => m.id === id)?.name || id;
  }

  $: statsVoters = (stats.selected?.voters || [])
    .map((id) => ({ id, name: memberName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function percent(votes, total) {
    return total > 0 ? Math.round((votes / total) * 100) : 0;
  }

  function winner(entry) {
    const best = Math.max(0, ...entry.answers.map((a) => a.votes));
    return best > 0 ? entry.answers.filter((a) => a.votes === best).map((a) => a.text).join(' / ') : '—';
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
    title="Statistiques par Sondage"
    subtitle="Chaque sondage récurrent a ses propres statistiques, regroupées sur la période choisie (mises à jour toutes les 5 minutes)"
  >
    {#if stats.polls.length === 0}
      <p style="color: var(--text-muted); margin: 0;">
        Aucun résultat pour le moment. Les sondages envoyés à partir de maintenant seront suivis automatiquement.
      </p>
    {:else}
      <div class="grid-2">
        <div class="form-group">
          <label for="stats_poll">Sondage récurrent</label>
          <select id="stats_poll" bind:value={statsPollId} on:change={selectStatsPoll}>
            {#each stats.polls as p}
              <option value={String(p.id)}>{p.question}{p.deleted ? ' (supprimé)' : ''}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label for="stats_period">Période</label>
          <select id="stats_period" bind:value={statsPeriod} on:change={loadStats}>
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
            <option value="all">Depuis le début</option>
            <option value="custom">Dates personnalisées</option>
          </select>
        </div>
      </div>

      {#if statsPeriod === 'custom'}
        <div class="grid-2">
          <div class="form-group">
            <label for="stats_from">Du</label>
            <input id="stats_from" type="date" bind:value={statsFrom} on:change={loadStats} />
          </div>
          <div class="form-group">
            <label for="stats_to">Au</label>
            <input id="stats_to" type="date" bind:value={statsTo} on:change={loadStats} />
          </div>
        </div>
      {/if}

      <div class="form-group">
        <label for="stats_member">Membre</label>
        <select id="stats_member" bind:value={statsUserId} on:change={loadStats}>
          <option value="">Tous les membres (vue d'ensemble)</option>
          {#each statsVoters as v}
            <option value={v.id}>{v.name}</option>
          {/each}
        </select>
      </div>

      {#if stats.selected}
        {@const sel = stats.selected}
        <div class="grid-2" style="margin: 1rem 0;">
          <div class="form-group">
            <span class="form-label">Sondages envoyés sur la période</span>
            <strong style="font-size: 1.5rem;">{sel.occurrences}</strong>
          </div>
          <div class="form-group">
            <span class="form-label">Votes</span>
            <strong style="font-size: 1.5rem;">{sel.totalVotes}</strong>
            <small style="color: var(--text-muted);">≈ {sel.averageVotes} par sondage</small>
          </div>
        </div>

        {#if sel.member}
          <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem;">
            <strong>Votes de {memberName(sel.member.userId)}</strong>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 0.75rem;">
              A participé à {sel.member.participated} sondage(s) sur {sel.member.occurrences}
              ({percent(sel.member.participated, sel.member.occurrences)}%)
            </div>
            {#each sel.member.answers as answer}
              <div style="margin-bottom: 0.45rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 3px;">
                  <span>{answer.text}</span>
                  <span>{answer.count} fois ({answer.percent}%)</span>
                </div>
                <div style="height: 8px; border-radius: 4px; background: var(--border); overflow: hidden;">
                  <div style="height: 100%; width: {answer.percent}%; background: var(--primary);"></div>
                </div>
              </div>
            {:else}
              <p style="color: var(--text-muted); margin: 0;">Aucun vote de ce membre sur la période.</p>
            {/each}
          </div>
        {/if}

        <h4 style="font-size: 0.95rem; margin: 1rem 0 0.6rem;">Ce que votent les gens en moyenne</h4>
        {#each sel.answers as answer}
          <div style="margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 3px;">
              <span>{answer.text}</span>
              <span>{answer.votes} votes ({answer.percent}%) • gagne {answer.wins} fois</span>
            </div>
            <div style="height: 8px; border-radius: 4px; background: var(--border); overflow: hidden;">
              <div style="height: 100%; width: {answer.percent}%; background: var(--primary);"></div>
            </div>
          </div>
        {:else}
          <p style="color: var(--text-muted); margin: 0;">Aucun sondage sur cette période.</p>
        {/each}

        {#if sel.timeline.length > 0}
          <h4 style="font-size: 0.95rem; margin: 1.25rem 0 0.6rem;">Historique</h4>
          <DataTable headers={['Date', 'Votes', 'Réponse gagnante', 'Statut']} items={[...sel.timeline].reverse()}>
            <tr slot="row" let:item>
              <td>{formatDate(item.date)}</td>
              <td>{item.totalVotes}</td>
              <td>{winner(item)}</td>
              <td>{item.status === 'finalized' ? 'Terminé' : 'En cours'}</td>
            </tr>
          </DataTable>
        {/if}
      {/if}
    {/if}
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
