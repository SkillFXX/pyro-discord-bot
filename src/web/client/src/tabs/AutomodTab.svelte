<script>
  import { Bot, Plus, Trash2, ShieldAlert, CheckSquare, Settings } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Modal from '../components/Modal.svelte';
  import { dashboardData, addAutomodRule, deleteAutomodRule } from '../stores/data';

  let showModal = false;

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

  // Specific rule params
  let spamMax = 5;
  let spamInterval = 5;
  let duplicateMax = 3;
  let duplicateInterval = 15;
  let wordsList = '';
  let minLength = 50;
  let maxLength = 500;
  let regexPattern = '';

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

  async function handleSubmit() {
    const actions = [];
    if (actionDelete) actions.push('delete');
    if (actionWarn) actions.push('warn');
    if (actionMute) actions.push('mute');
    if (actionBan) actions.push('ban');
    if (actions.length === 0) actions.push('delete');

    const success = await addAutomodRule({
      channelId,
      ruleType,
      scope,
      monitoredTypes,
      customReason,
      actions,
      spam_max: spamMax,
      spam_interval: spamInterval,
      duplicate_max: duplicateMax,
      duplicate_interval: duplicateInterval,
      words_list: wordsList,
      min_length: minLength,
      max_length: maxLength,
      regex_pattern: regexPattern,
    });

    if (success) {
      showModal = false;
      // Reset form defaults
      ruleType = 'spam';
      customReason = '';
      wordsList = '';
      regexPattern = '';
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
    <button class="btn btn-primary" on:click={() => (showModal = true)}>
      <Plus size={16} style="vertical-align: middle; margin-right: 6px;" />
      Nouvelle Règle
    </button>
  </div>

  <Card id="automod-rules" icon={ShieldAlert} title="Règles d'Automod Configurées" subtitle="Toutes les règles actives surveillées par le bot">
    <DataTable
      headers={['Salon Ciblé', 'Type de Règle', 'Paramètres', 'Actions & Portée', 'Suppr.']}
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
                  {act === 'delete' ? 'Suppr.' : act === 'warn' ? 'Warn' : act === 'mute' ? 'Mute' : 'Ban'}
                </span>
              {/each}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              {item.scope === 'new_threads' ? '📌 Nouveaux posts' : '📡 Tous messages'} ·
              {item.monitoredTypes === 'text' ? '✏️ Texte' : item.monitoredTypes === 'attachments' ? '📎 Pièces jointes' : '🔀 Tout'}
            </div>
          {/each}
        </td>
        <td style="text-align: right;">
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

  <!-- Modal: Créer une Règle -->
  <Modal bind:open={showModal} title="Créer une Règle d'Automodération">
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
          <div class="form-group" style="margin-bottom:0;">
            <label for="reg_pattern">Motif Expression Régulière (Regex)</label>
            <input id="reg_pattern" type="text" bind:value={regexPattern} placeholder="Ex: ^https?:\/\/" />
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
      </div>

      <div style="display:flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
        <button type="button" class="btn btn-secondary" on:click={() => (showModal = false)}>Annuler</button>
        <button type="submit" class="btn btn-primary">Enregistrer la règle</button>
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
</style>
