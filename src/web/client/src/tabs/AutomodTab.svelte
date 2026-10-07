<script>
  import { Bot, Plus, Trash2, Pencil, ShieldAlert } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Modal from '../components/Modal.svelte';
  import { dashboardData, addAutomodRule, updateAutomodRule, deleteAutomodRule } from '../stores/data';

  let showModal = false;
  let isEditing = false;
  let editingRuleId = null;

  let channelId = 'global';
  let ruleType = 'spam';
  let scope = 'all_messages';
  let monitoredTypes = 'all';
  let customReason = '';

  // Multi-actions
  let actionDelete = true;
  let actionWarn = false;
  let actionMute = false;
  let actionBan = false;
  let muteDuration = 600;

  function formatDuration(sec) {
    if (!sec) return '10 minute(s)';
    if (sec >= 604800 && sec % 604800 === 0) {
      const weeks = sec / 604800;
      return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
    }
    if (sec >= 86400) return `${Math.floor(sec / 86400)} jour(s)`;
    if (sec >= 3600) return `${Math.floor(sec / 3600)} heure(s)`;
    if (sec >= 60) return `${Math.floor(sec / 60)} minute(s)`;
    return `${sec} seconde(s)`;
  }

  function formatShortDuration(sec) {
    if (!sec) return '10m';
    if (sec >= 604800 && sec % 604800 === 0) return `${sec / 604800}sem`;
    if (sec >= 86400) return `${Math.floor(sec / 86400)}j`;
    if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
    if (sec >= 60) return `${Math.floor(sec / 60)}m`;
    return `${sec}s`;
  }

  // Specific rule params
  let spamMax = 5;
  let spamInterval = 5;
  let duplicateMax = 3;
  let duplicateInterval = 15;
  let wordsList = '';
  let minLength = 50;
  let maxLength = 500;
  let regexPattern = '';
  let regexTestInput = '';

  const REGEX_PRESETS = [
    {
      id: 'discord_invites',
      icon: '🔗',
      name: 'Invitations Discord',
      desc: 'discord.gg/..., discord.com/invite/...',
      pattern: '(?:https?:\\/\\/)?(?:www\\.)?(?:discord\\.(?:gg|io|me|li)|discord(?:app)?\\.com\\/invite)\\/[a-zA-Z0-9_-]+',
      reason: 'Invitations Discord non autorisées',
      example: 'Rejoignez mon serveur https://discord.gg/exempLe12'
    },
    {
      id: 'external_links',
      icon: '🌐',
      name: 'Liens Web (HTTP/HTTPS)',
      desc: 'Tous les liens externes http:// ou https://',
      pattern: 'https?:\\/\\/[^\\s]+',
      reason: 'Liens externes non autorisés',
      example: 'Regardez ce site https://exemple.com'
    },
    {
      id: 'phone_numbers',
      icon: '📞',
      name: 'Numéros de téléphone',
      desc: 'Formats FR & Internationaux (06..., +33...)',
      pattern: '(?:(?:\\+|00)33|0)[1-9](?:[\\s.-]?\\d{2}){4}',
      reason: 'Partage de numéro de téléphone interdit',
      example: 'Mon numéro est le 06 12 34 56 78'
    },
    {
      id: 'email_addresses',
      icon: '📧',
      name: 'Adresses Email',
      desc: 'Protection anti-spam et coordonnées',
      pattern: '[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+',
      reason: 'Partage d\'adresse email interdit',
      example: 'Écris-moi sur contact@mon-site.com'
    },
    {
      id: 'social_media',
      icon: '📱',
      name: 'Réseaux Sociaux',
      desc: 'TikTok, Instagram, Twitter/X, Twitch, YouTube',
      pattern: '(?:https?:\\/\\/)?(?:www\\.)?(?:instagram\\.com|tiktok\\.com|twitter\\.com|x\\.com|twitch\\.tv|youtube\\.com|youtu\\.be)\\/[^\\s]+',
      reason: 'Publicité pour réseaux sociaux interdite',
      example: 'Abonne-toi à https://instagram.com/moncompte'
    },
    {
      id: 'ip_addresses',
      icon: '🖥️',
      name: 'Adresses IP (IPv4)',
      desc: 'Anti-doxxing & sécurité réseau',
      pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
      reason: 'Partage d\'adresse IP interdit',
      example: 'Rejoins le serveur 192.168.1.1'
    },
    {
      id: 'mass_mentions',
      icon: '📢',
      name: 'Mentions @everyone & @here',
      desc: 'Détecte les pings globaux',
      pattern: '@(?:everyone|here)',
      reason: 'Mentions globales @everyone / @here interdites',
      example: 'Attention @everyone annonce importante'
    }
  ];

  function applyRegexPreset(preset) {
    regexPattern = preset.pattern;
    if (!customReason || customReason.trim() === '') {
      customReason = preset.reason;
    }
    regexTestInput = preset.example;
  }

  $: regexValidation = (() => {
    if (!regexPattern || regexPattern.trim() === '') {
      return null;
    }
    try {
      const reg = new RegExp(regexPattern, 'i');
      if (!regexTestInput || regexTestInput.trim() === '') {
        return { valid: true, match: null };
      }
      return { valid: true, match: reg.test(regexTestInput) };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  })();

  $: isSelectedForum = (() => {
    if (channelId === 'global') return false;
    const forum = $dashboardData.channels.forums.find((f) => f.id === channelId);
    return !!forum;
  })();

  $: if (!isSelectedForum && scope === 'new_threads') {
    scope = 'all_messages';
  }

  function parseParams(rule) {
    try {
      return JSON.parse(rule.parameters || '{}');
    } catch (e) {
      return {};
    }
  }

  function parseActions(rule) {
    try {
      return JSON.parse(rule.actions || '[]');
    } catch (e) {
      return [];
    }
  }

  function openCreateModal() {
    isEditing = false;
    editingRuleId = null;
    channelId = 'global';
    ruleType = 'spam';
    scope = 'all_messages';
    monitoredTypes = 'all';
    customReason = '';
    actionDelete = true;
    actionWarn = false;
    actionMute = false;
    actionBan = false;
    muteDuration = 600;
    spamMax = 5;
    spamInterval = 5;
    duplicateMax = 3;
    duplicateInterval = 15;
    wordsList = '';
    minLength = 50;
    maxLength = 500;
    regexPattern = '';
    regexTestInput = '';
    showModal = true;
  }

  function openEditModal(rule) {
    isEditing = true;
    editingRuleId = rule.id;
    channelId = rule.channelId || 'global';
    ruleType = rule.ruleType;
    scope = rule.scope || 'all_messages';
    monitoredTypes = rule.monitoredTypes || 'all';
    customReason = rule.customReason || '';

    const actions = parseActions(rule);
    actionDelete = actions.includes('delete');
    actionWarn = actions.includes('warn');
    actionMute = actions.includes('mute');
    actionBan = actions.includes('ban');
    muteDuration = rule.muteDuration || 600;

    const p = parseParams(rule);
    if (rule.ruleType === 'spam') {
      spamMax = p.maxMessages || 5;
      spamInterval = p.intervalSeconds || 5;
    } else if (rule.ruleType === 'duplicate') {
      duplicateMax = p.maxDuplicates || 3;
      duplicateInterval = p.intervalSeconds || 15;
    } else if (rule.ruleType === 'words_blacklist' || rule.ruleType === 'words_whitelist') {
      wordsList = Array.isArray(p) ? p.join(', ') : '';
    } else if (rule.ruleType === 'min_length') {
      minLength = p.minLength || 50;
    } else if (rule.ruleType === 'max_length') {
      maxLength = p.maxLength || 500;
    } else if (rule.ruleType === 'regex') {
      regexPattern = p.pattern || '';
    }

    regexTestInput = '';
    showModal = true;
  }

  async function handleSubmit() {
    const actions = [];
    if (actionDelete) actions.push('delete');
    if (actionWarn) actions.push('warn');
    if (actionMute) actions.push('mute');
    if (actionBan) actions.push('ban');
    if (actions.length === 0) actions.push('delete');

    const payload = {
      channelId,
      ruleType,
      scope,
      monitoredTypes,
      customReason,
      actions,
      mute_duration: actionMute ? (parseInt(muteDuration, 10) || 600) : null,
      spam_max: spamMax,
      spam_interval: spamInterval,
      duplicate_max: duplicateMax,
      duplicate_interval: duplicateInterval,
      words_list: wordsList,
      min_length: minLength,
      max_length: maxLength,
      regex_pattern: regexPattern,
    };

    let success = false;
    if (isEditing && editingRuleId) {
      success = await updateAutomodRule(editingRuleId, payload);
    } else {
      success = await addAutomodRule(payload);
    }

    if (success) {
      showModal = false;
      isEditing = false;
      editingRuleId = null;
    }
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Bot size={24} class="title-icon" /> Automodération Intelligente (Automod)</h2>
      <p class="section-desc">
        Détectez et sanctionnez automatiquement les abus par salon ou globalement sur le serveur.
      </p>
    </div>
    <button class="btn btn-primary" on:click={openCreateModal}>
      <Plus size={16} style="vertical-align: middle; margin-right: 6px;" />
      Nouvelle Règle
    </button>
  </div>

  <Card id="automod-rules" icon={ShieldAlert} title="Règles d'Automod Configurées" subtitle="Toutes les règles actives surveillées par le bot">
    <DataTable
      headers={['Salon Ciblé', 'Type de Règle', 'Paramètres', 'Actions & Portée', 'Actions']}
      items={$dashboardData.automodRules}
      emptyMessage="Aucune règle d'automodération configurée pour le moment."
    >
      <tr slot="row" let:item>
        <td>
          {#if item.channelId === 'global'}
            <span class="badge badge-info">🌐 Global (Tout le serveur)</span>
          {:else}
            <strong>#{item.channelName || item.channelId}</strong>
          {/if}
        </td>
        <td>
          {#if item.ruleType === 'spam'}
            <span class="badge badge-danger">Anti-Spam</span>
          {:else if item.ruleType === 'duplicate'}
            <span class="badge badge-info">Anti-Doublons</span>
          {:else if item.ruleType === 'words_blacklist'}
            <span class="badge badge-danger">Blacklist Mots</span>
          {:else if item.ruleType === 'words_whitelist'}
            <span class="badge badge-success">Whitelist Mots</span>
          {:else if item.ruleType === 'min_length'}
            <span class="badge badge-warning">Longueur Min.</span>
          {:else if item.ruleType === 'max_length'}
            <span class="badge badge-warning">Longueur Max.</span>
          {:else if item.ruleType === 'regex'}
            <span class="badge badge-info">Regex</span>
          {/if}
        </td>
        <td>
          {#each [parseParams(item)] as p}
            {#if item.ruleType === 'spam'}
              <span style="display:inline-flex; align-items:center; gap:4px;"><span class="num-shape num-shape-accent">{p.maxMessages || 5}</span> msgs / <span class="num-shape">{p.intervalSeconds || 5}s</span></span>
            {:else if item.ruleType === 'duplicate'}
              <span style="display:inline-flex; align-items:center; gap:4px;"><span class="num-shape num-shape-accent">{p.maxDuplicates || 3}</span> doublons / <span class="num-shape">{p.intervalSeconds || 15}s</span></span>
            {:else if item.ruleType === 'words_blacklist' || item.ruleType === 'words_whitelist'}
              <code style="word-break: break-all; font-size: 0.8rem;">
                {Array.isArray(p) ? p.slice(0, 4).join(', ') + (p.length > 4 ? '...' : '') : ''}
              </code>
            {:else if item.ruleType === 'min_length'}
              <span>Min: <span class="num-shape num-shape-accent">{p.minLength}</span> car.</span>
            {:else if item.ruleType === 'max_length'}
              <span>Max: <span class="num-shape num-shape-accent">{p.maxLength}</span> car.</span>
            {:else if item.ruleType === 'regex'}
              <code style="word-break: break-all; font-size: 0.8rem;">{p.pattern}</code>
            {/if}
            {#if item.customReason}
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                Motif: "{item.customReason}"
              </div>
            {/if}
          {/each}
        </td>
        <td>
          {#each [parseActions(item)] as actions}
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;">
              {#each actions as act}
                <span class="badge {act === 'mute' || act === 'ban' ? 'badge-danger' : act === 'warn' ? 'badge-warning' : 'badge-info'}">
                  {act === 'delete' ? 'Suppr.' : act === 'warn' ? 'Warn' : act === 'mute' ? `Mute (${formatShortDuration(item.muteDuration || 600)})` : 'Ban'}
                </span>
              {/each}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              {item.scope === 'new_threads' ? '📌 Nouveaux posts' : '📡 Tous messages'} ·
              {item.monitoredTypes === 'text' ? '✏️ Texte' : item.monitoredTypes === 'attachments' ? '📎 Pièces jointes' : '🔀 Tout'}
            </div>
          {/each}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button
            class="btn btn-secondary"
            style="padding: 0.35rem 0.6rem; font-size: 0.8rem; margin-right: 6px;"
            on:click={() => openEditModal(item)}
            title="Modifier cette règle"
          >
            <Pencil size={14} />
          </button>
          <button
            class="btn btn-danger"
            style="padding: 0.35rem 0.6rem; font-size: 0.8rem;"
            on:click={() => deleteAutomodRule(item.id)}
            title="Supprimer la règle"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
    </DataTable>
  </Card>

  <!-- Modal: Créer ou Modifier une Règle -->
  <Modal bind:open={showModal} title={isEditing ? "Modifier la Règle d'Automodération" : "Créer une Règle d'Automodération"}>
    <form on:submit|preventDefault={handleSubmit}>
      <div class="grid-2">
        <div class="form-group">
          <label for="modal_automod_channel">Salon ciblé</label>
          <select id="modal_automod_channel" bind:value={channelId}>
            <option value="global">🌐 Global (Tous les salons)</option>
            {#if $dashboardData.channels.forums && $dashboardData.channels.forums.length > 0}
              <optgroup label="📑 Salons Forums">
                {#each $dashboardData.channels.forums as f}
                  <option value={f.id}>📑 {f.name}</option>
                {/each}
              </optgroup>
            {/if}
            <optgroup label="💬 Salons Textuels">
              {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
                <option value={c.id}># {c.name}</option>
              {/each}
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="modal_automod_ruletype">Type de Règle</label>
          <select id="modal_automod_ruletype" bind:value={ruleType}>
            <option value="spam">Anti-Spam (Fréquence d'envoi)</option>
            <option value="duplicate">Anti-Doublons (Messages répétés)</option>
            <option value="words_blacklist">Mots interdits (Blacklist)</option>
            <option value="words_whitelist">Mots obligatoires (Whitelist)</option>
            <option value="min_length">Longueur minimum de message</option>
            <option value="max_length">Longueur maximum de message</option>
            <option value="regex">Expression Régulière (Regex)</option>
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="modal_automod_scope">Portée</label>
          <select id="modal_automod_scope" bind:value={scope}>
            <option value="all_messages">Tous les messages</option>
            {#if isSelectedForum}
              <option value="new_threads">Nouveaux sujets de forum uniquement</option>
            {/if}
          </select>
        </div>

        <div class="form-group">
          <label for="modal_automod_monitored">Contenus surveillés</label>
          <select id="modal_automod_monitored" bind:value={monitoredTypes}>
            <option value="all">Tout (Texte et fichiers)</option>
            <option value="text">Texte uniquement</option>
            <option value="attachments">Pièces jointes uniquement</option>
          </select>
        </div>
      </div>

      <!-- Contextual Subfields -->
      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1rem;">
        {#if ruleType === 'spam'}
          <div class="grid-2">
            <div class="form-group" style="margin-bottom:0;">
              <label for="spam_max">Messages maximum</label>
              <input id="spam_max" type="number" bind:value={spamMax} min="2" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label for="spam_interval">Intervalle (secondes)</label>
              <input id="spam_interval" type="number" bind:value={spamInterval} min="1" />
            </div>
          </div>
        {:else if ruleType === 'duplicate'}
          <div class="grid-2">
            <div class="form-group" style="margin-bottom:0;">
              <label for="dup_max">Doublons tolérés</label>
              <input id="dup_max" type="number" bind:value={duplicateMax} min="2" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label for="dup_interval">Intervalle de surveillance (sec)</label>
              <input id="dup_interval" type="number" bind:value={duplicateInterval} min="5" />
            </div>
          </div>
        {:else if ruleType === 'words_blacklist' || ruleType === 'words_whitelist'}
          <div class="form-group" style="margin-bottom:0;">
            <label for="words_input">Mots clés (séparés par des virgules)</label>
            <input id="words_input" type="text" bind:value={wordsList} placeholder="Ex: discord.gg, hack, gratuit" />
            <small style="color:var(--text-muted); font-size:0.75rem;">La comparaison est insensible à la casse.</small>
          </div>
        {:else if ruleType === 'min_length'}
          <div class="form-group" style="margin-bottom:0;">
            <label for="min_len">Longueur minimale requise (caractères)</label>
            <input id="min_len" type="number" bind:value={minLength} min="1" />
          </div>
        {:else if ruleType === 'max_length'}
          <div class="form-group" style="margin-bottom:0;">
            <label for="max_len">Longueur maximale autorisée (caractères)</label>
            <input id="max_len" type="number" bind:value={maxLength} min="1" />
          </div>
        {:else if ruleType === 'regex'}
          <div>
            <div class="form-group" style="margin-bottom:0.75rem;">
              <label for="reg_pattern">Motif Expression Régulière (Regex)</label>
              <input id="reg_pattern" type="text" bind:value={regexPattern} placeholder="Ex: (?:https?:\/\/)?discord\.(?:gg|com\/invite)\/[a-zA-Z0-9_-]+" />
              {#if regexValidation && !regexValidation.valid}
                <small style="color:var(--danger, #ef4444); font-size:0.75rem; margin-top: 4px; display:block;">
                  ⚠️ Expression régulière invalide : {regexValidation.error}
                </small>
              {/if}
            </div>

            <!-- Modèles / Presets cliquables -->
            <div style="margin-bottom: 0.85rem;">
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.45rem;">
                💡 Modèles prédéfinis courants (cliquez pour appliquer) :
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.45rem;">
                {#each REGEX_PRESETS as preset}
                  <button
                    type="button"
                    class="preset-card {regexPattern === preset.pattern ? 'active' : ''}"
                    on:click={() => applyRegexPreset(preset)}
                  >
                    <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
                      <span>{preset.icon}</span>
                      <span>{preset.name}</span>
                    </span>
                    <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 3px; line-height: 1.2;">
                      {preset.desc}
                    </span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Mini-testeur interactif en direct -->
            <div style="background: rgba(0,0,0,0.2); border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 0.75rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem; gap: 0.5rem; flex-wrap: wrap;">
                <label for="reg_test" style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom:0;">
                  🧪 Tester votre filtre en direct :
                </label>
                {#if regexValidation && regexValidation.valid}
                  {#if regexValidation.match === true}
                    <span class="badge badge-danger" style="font-size:0.72rem; padding: 0.2rem 0.5rem;">
                      🚨 Infraction détectée (bloqué)
                    </span>
                  {:else if regexValidation.match === false}
                    <span class="badge badge-success" style="font-size:0.72rem; padding: 0.2rem 0.5rem;">
                      ✅ Aucun match (autorisé)
                    </span>
                  {:else}
                    <span style="font-size: 0.72rem; color: var(--text-muted);">
                      Tapez un texte ci-dessous pour tester
                    </span>
                  {/if}
                {/if}
              </div>
              <input
                id="reg_test"
                type="text"
                bind:value={regexTestInput}
                placeholder="Ex: Rejoins mon discord https://discord.gg/xyz..."
                style="font-size: 0.82rem; padding: 0.45rem 0.65rem;"
              />
            </div>
          </div>
        {/if}
      </div>

      <div class="form-group">
        <label for="custom_reason">Motif personnalisé (optionnel)</label>
        <input id="custom_reason" type="text" bind:value={customReason} placeholder="Ex: Liens d'invitation interdits" />
      </div>

      <!-- Actions to trigger -->
      <div class="form-group">
        <div style="font-size: 0.85rem; font-weight: 500; margin-bottom: 0.35rem; color: var(--text-secondary);">Actions à exécuter</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.5rem; margin-top: 0.35rem;">
          <label class="checkbox-pill">
            <input type="checkbox" bind:checked={actionDelete} />
            <span>Supprimer</span>
          </label>
          <label class="checkbox-pill">
            <input type="checkbox" bind:checked={actionWarn} />
            <span>Avertir (Warn)</span>
          </label>
          <label class="checkbox-pill">
            <input type="checkbox" bind:checked={actionMute} />
            <span>Mute (Timeout)</span>
          </label>
          <label class="checkbox-pill">
            <input type="checkbox" bind:checked={actionBan} />
            <span>Bannir</span>
          </label>
        </div>

        {#if actionMute}
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem; margin-top: 0.75rem;">
            <label for="automod_mute_duration" style="display:block; margin-bottom: 0.35rem; font-size: 0.85rem; font-weight: 500;">
              Durée de l'exclusion (Timeout)
            </label>
            <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
              <input
                id="automod_mute_duration"
                type="number"
                min="10"
                max="2419200"
                bind:value={muteDuration}
                placeholder="600"
                style="width: 140px;"
              />
              <span style="font-size: 0.85rem; color: var(--text-muted);">secondes ({formatDuration(muteDuration)})</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (muteDuration = 60)}>1 min (60s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (muteDuration = 300)}>5 min (300s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (muteDuration = 600)}>10 min (600s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (muteDuration = 3600)}>1 heure (3600s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (muteDuration = 86400)}>1 jour (86400s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (muteDuration = 604800)}>7 jours (604800s)</button>
            </div>
            {#if muteDuration > 2419200}
              <div style="color: var(--danger, #ef4444); font-size: 0.75rem; margin-top: 0.35rem;">
                ⚠️ Discord limite les exclusions temporaires à 28 jours maximum (2 419 200 secondes).
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div style="display:flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
        <button type="button" class="btn btn-secondary" on:click={() => (showModal = false)}>Annuler</button>
        <button type="submit" class="btn btn-primary">
          {isEditing ? "Enregistrer les modifications" : "Enregistrer la règle"}
        </button>
      </div>
    </form>
  </Modal>
</div>

<style>
  .checkbox-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.8rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .checkbox-pill:has(input:checked) {
    border-color: var(--primary);
    background: rgba(255, 107, 53, 0.08);
  }

  .preset-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.5rem 0.65rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }
  .preset-card:hover {
    border-color: var(--primary);
    background: rgba(255, 107, 53, 0.08);
  }
  .preset-card.active {
    border-color: var(--primary);
    background: rgba(255, 107, 53, 0.14);
  }
</style>
