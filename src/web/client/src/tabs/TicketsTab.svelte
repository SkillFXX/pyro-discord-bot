<script>
  import { Ticket, Send, Save, MessageSquare, LayoutTemplate, Tag } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import { dashboardData, saveConfig, deployTicketMessage } from '../stores/data';

  let savingConfig = false;
  let deploying = false;
  let deployChannelId = '';

  const defaultPanelTitle = '🎫 Support - Ouvrir un Ticket';
  const defaultPanelMessage = "Besoin d'aide ? Vous rencontrez un problème ?\nCliquez sur le bouton ci-dessous pour ouvrir un ticket et entrer en contact avec notre équipe.";

  const defaultEmbedTitle = '🎫 Ticket - {username}';
  const defaultEmbedMessage = "Bienvenue dans votre ticket {user}.\n\n**Sujet :** {subject}\n\nUn membre du staff va s'occuper de vous. En attendant, veuillez détailler votre demande.\nVous pouvez utiliser les boutons ci-dessous pour gérer ce ticket.";

  $: config = $dashboardData.config || {};
  $: embedColor = config.embed_color || 'var(--accent, #ff6b35)';

  $: panelTitlePreview = config.ticket_panel_title || defaultPanelTitle;
  $: panelMessagePreview = config.ticket_panel_message || defaultPanelMessage;

  $: embedTitlePreview = (config.ticket_embed_title || defaultEmbedTitle)
    .replace(/{user}/g, 'UtilisateurExemple')
    .replace(/{username}/g, 'UtilisateurExemple')
    .replace(/{server}/g, $dashboardData.guildName || 'Pyro Community')
    .replace(/{subject}/g, "Demande d'assistance")
    .replace(/{authorId}/g, '1234567890');

  $: embedMessagePreview = (config.ticket_embed_message || defaultEmbedMessage)
    .replace(/{user}/g, '@UtilisateurExemple')
    .replace(/{username}/g, 'UtilisateurExemple')
    .replace(/{server}/g, $dashboardData.guildName || 'Pyro Community')
    .replace(/{subject}/g, "Demande d'assistance")
    .replace(/{authorId}/g, '1234567890');

  function formatDiscordMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }

  function insertVariable(variable) {
    const current = config.ticket_embed_message ?? defaultEmbedMessage;
    dashboardData.update((d) => ({
      ...d,
      config: {
        ...d.config,
        ticket_embed_message: current ? `${current} ${variable}` : variable,
      },
    }));
  }

  async function handleSave() {
    savingConfig = true;
    await saveConfig('tickets', {
      ticket_category_id: config.ticket_category_id || '',
      ticket_staff_role_id: config.ticket_staff_role_id || '',
      ticket_panel_title: config.ticket_panel_title || '',
      ticket_panel_message: config.ticket_panel_message || '',
      ticket_embed_title: config.ticket_embed_title || '',
      ticket_embed_message: config.ticket_embed_message || '',
    });
    savingConfig = false;
  }

  async function handleDeploy() {
    if (!deployChannelId) return;
    deploying = true;
    const success = await deployTicketMessage(deployChannelId);
    if (success) {
      deployChannelId = '';
    }
    deploying = false;
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Ticket size={24} class="title-icon" /> Système de Tickets & Support</h2>
      <p class="section-desc">
        Configurez les salons, personnalisez le texte du panneau d'ouverture et de l'embed, puis déployez le système.
      </p>
    </div>
  </div>

  <form on:submit|preventDefault={handleSave}>
    <!-- Salons & Accès -->
    <Card id="tickets-config" icon={Ticket} title="Configuration des Salons & Rôles" subtitle="Emplacement des nouveaux tickets et rôles autorisés">
      <div class="grid-2">
        <div class="form-group">
          <label for="ticket_category">Catégorie des Tickets</label>
          <select id="ticket_category" bind:value={config.ticket_category_id}>
            <option value="">-- Désactivé (Aucune catégorie) --</option>
            {#each $dashboardData.channels.categories as cat}
              <option value={cat.id}>📁 {cat.name}</option>
            {/each}
          </select>
          <small class="help-text">Les nouveaux salons de tickets seront automatiquement créés sous cette catégorie.</small>
        </div>

        <div class="form-group">
          <label for="ticket_staff">Rôle Staff (Accès aux tickets)</label>
          <select id="ticket_staff" bind:value={config.ticket_staff_role_id}>
            <option value="">-- Aucun rôle spécifique --</option>
            {#each $dashboardData.roles as r}
              <option value={r.id}>@{r.name}</option>
            {/each}
          </select>
          <small class="help-text">Ce rôle bénéficiera des permissions d'accès et d'écriture dans chaque ticket créé.</small>
        </div>
      </div>
    </Card>

    <!-- Panneau d'ouverture -->
    <Card id="tickets-panel" icon={LayoutTemplate} title="Panneau d'Ouverture de Ticket" subtitle="Message public déployé dans votre salon de support contenant le bouton de création">
      <div class="card-split">
        <div class="inputs-col">
          <div class="form-group">
            <label for="ticket_panel_title">Titre du Panneau d'Ouverture</label>
            <input
              id="ticket_panel_title"
              type="text"
              bind:value={config.ticket_panel_title}
              placeholder={defaultPanelTitle}
            />
            <small class="help-text">Titre affiché en haut de l'embed public de support.</small>
          </div>

          <div class="form-group">
            <label for="ticket_panel_message">Texte du Panneau d'Ouverture</label>
            <textarea
              id="ticket_panel_message"
              rows="6"
              bind:value={config.ticket_panel_message}
              placeholder={defaultPanelMessage}
            ></textarea>
            <small class="help-text">Description explicative accompagnant le bouton d'ouverture dans le salon.</small>
          </div>
        </div>

        <div class="preview-col">
          <div class="preview-label">Aperçu en Direct du Panneau</div>
          <div class="discord-msg-preview">
            <div class="discord-bot-header">
              <img src={$dashboardData.bot?.avatarUrl || '/icon.svg'} alt="" class="discord-bot-avatar" />
              <div class="discord-bot-info">
                <span class="discord-bot-name">{$dashboardData.bot?.username || 'Pyro'}</span>
                <span class="discord-bot-badge">BOT</span>
                <span class="discord-bot-time">Aujourd'hui à 12:00</span>
              </div>
            </div>
            <div class="discord-embed" style="border-left-color: {embedColor};">
              <div class="discord-embed-title">{panelTitlePreview}</div>
              <div class="discord-embed-desc">{@html formatDiscordMarkdown(panelMessagePreview)}</div>
            </div>
            <div class="discord-action-row">
              <button type="button" class="discord-btn discord-btn-primary" disabled>
                🎫 Créer un Ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>

    <!-- Embed du ticket créé -->
    <Card id="tickets-embed" icon={MessageSquare} title="Embed du Ticket Créé" subtitle="Message d'accueil et panneau de contrôle envoyé dans le salon privé du ticket">
      <div class="card-split">
        <div class="inputs-col">
          <div class="form-group">
            <label for="ticket_embed_title">Titre de l'Embed du Ticket</label>
            <input
              id="ticket_embed_title"
              type="text"
              bind:value={config.ticket_embed_title}
              placeholder={defaultEmbedTitle}
            />
            <small class="help-text">Format du titre du ticket (ex: <code>🎫 Ticket - {'{username}'}</code>).</small>
          </div>

          <div class="form-group">
            <label for="ticket_embed_message">Texte de l'Embed du Ticket</label>
            <textarea
              id="ticket_embed_message"
              rows="7"
              bind:value={config.ticket_embed_message}
              placeholder={defaultEmbedMessage}
            ></textarea>

            <div class="variables-section">
              <span class="var-title"><Tag size={12} style="vertical-align: middle; margin-right: 4px;" /> Variables cliquables :</span>
              <div class="var-chips">
                <button type="button" class="var-chip" on:click={() => insertVariable('{user}')}>{'{user}'}</button>
                <button type="button" class="var-chip" on:click={() => insertVariable('{username}')}>{'{username}'}</button>
                <button type="button" class="var-chip" on:click={() => insertVariable('{server}')}>{'{server}'}</button>
                <button type="button" class="var-chip" on:click={() => insertVariable('{subject}')}>{'{subject}'}</button>
                <button type="button" class="var-chip" on:click={() => insertVariable('{authorId}')}>{'{authorId}'}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="preview-col">
          <div class="preview-label">Aperçu en Direct de l'Embed du Ticket</div>
          <div class="discord-msg-preview">
            <div class="discord-bot-header">
              <img src={$dashboardData.bot?.avatarUrl || '/icon.svg'} alt="" class="discord-bot-avatar" />
              <div class="discord-bot-info">
                <span class="discord-bot-name">{$dashboardData.bot?.username || 'Pyro'}</span>
                <span class="discord-bot-badge">BOT</span>
                <span class="discord-bot-time">Aujourd'hui à 12:00</span>
              </div>
            </div>
            <div class="discord-embed" style="border-left-color: {embedColor};">
              <div class="discord-embed-title">{embedTitlePreview}</div>
              <div class="discord-embed-desc">{@html formatDiscordMarkdown(embedMessagePreview)}</div>
              <div class="discord-embed-footer">ID Auteur: 1234567890</div>
            </div>
            <div class="discord-action-row">
              <button type="button" class="discord-btn discord-btn-secondary" disabled>
                🔒 Fermer
              </button>
              <button type="button" class="discord-btn discord-btn-danger" disabled>
                🗑️ Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>

    <div style="margin: 1.5rem 0 2rem 0;">
      <button type="submit" class="btn btn-primary" disabled={savingConfig} style="min-width: 260px;">
        <Save size={16} style="vertical-align: middle; margin-right: 6px;" />
        {savingConfig ? 'Enregistrement...' : 'Sauvegarder les Paramètres'}
      </button>
    </div>
  </form>

  <!-- Déploiement -->
  <Card id="tickets-deploy" icon={Send} title="Déployer le Panneau d'Ouverture" subtitle="Envoyer le message interactif dans le salon Discord de votre choix">
    <form on:submit|preventDefault={handleDeploy}>
      <p style="color:var(--text-muted); font-size:0.85rem; line-height: 1.5; margin-bottom: 1rem;">
        Envoie l'embed public configuré ci-dessus accompagné du bouton interactif <strong>« 🎫 Créer un Ticket »</strong> dans le salon sélectionné.
      </p>

      <div class="form-group" style="max-width: 480px;">
        <label for="deploy_chan">Salon textuel de destination</label>
        <select id="deploy_chan" bind:value={deployChannelId} required>
          <option value="">-- Choisir un salon --</option>
          {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
            <option value={c.id}># {c.name}</option>
          {/each}
        </select>
      </div>

      <button type="submit" class="btn btn-primary" disabled={deploying || !deployChannelId} style="margin-top: 0.5rem; min-width: 220px;">
        <Send size={16} style="vertical-align: middle; margin-right: 6px;" />
        {deploying ? 'Déploiement en cours...' : 'Déployer le panneau'}
      </button>
    </form>
  </Card>
</div>

<style>
  .help-text {
    color: var(--text-muted);
    font-size: 0.78rem;
    margin-top: 0.35rem;
    display: block;
    line-height: 1.4;
  }

  .card-split {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 1.75rem;
    align-items: start;
  }

  @media (max-width: 960px) {
    .card-split {
      grid-template-columns: 1fr;
    }
  }

  .preview-col {
    background: #232428;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
  }

  .preview-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    margin-bottom: 0.85rem;
  }

  .discord-msg-preview {
    background-color: #313338;
    border-radius: 8px;
    padding: 1rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  .discord-bot-header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.75rem;
  }

  .discord-bot-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
  }

  .discord-bot-info {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .discord-bot-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #f2f3f5;
  }

  .discord-bot-badge {
    background-color: #5865f2;
    color: #ffffff;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    text-transform: uppercase;
    line-height: 1.2;
  }

  .discord-bot-time {
    font-size: 0.75rem;
    color: #949ba4;
    margin-left: 0.2rem;
  }

  .discord-embed {
    background-color: #2b2d31;
    border-radius: 4px;
    border-left: 4px solid var(--accent, #ff6b35);
    padding: 0.85rem 1rem;
    margin-bottom: 0.75rem;
  }

  .discord-embed-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: #f2f3f5;
    margin-bottom: 0.45rem;
  }

  .discord-embed-desc {
    font-size: 0.85rem;
    color: #dbdee1;
    line-height: 1.45;
    margin: 0;
    word-break: break-word;
  }

  .discord-embed-desc :global(strong) {
    font-weight: 700;
    color: #ffffff;
  }

  .discord-embed-desc :global(code) {
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.8rem;
    color: #f2f3f5;
  }

  .discord-embed-footer {
    font-size: 0.75rem;
    color: #949ba4;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .discord-action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .discord-btn {
    font-size: 0.82rem;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 3px;
    border: none;
    cursor: default;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: opacity 0.15s ease;
  }

  .discord-btn-primary {
    background-color: #5865f2;
  }

  .discord-btn-secondary {
    background-color: #4e5058;
  }

  .discord-btn-danger {
    background-color: #da373c;
  }

  .variables-section {
    margin-top: 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.65rem 0.85rem;
  }

  .var-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    display: block;
    margin-bottom: 0.45rem;
  }

  .var-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .var-chip {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-family: monospace;
    font-size: 0.76rem;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .var-chip:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--surface-hover);
  }
</style>
