<script>
  import { dashboardData, saveConfig } from '../stores/data';
  import Card from '../components/Card.svelte';
  import { Palette, Radio, Layout, Save, Eye } from '@lucide/svelte';

  let config = {};
  $: config = { ...$dashboardData.config };

  let saving = false;

  async function handleSave() {
    saving = true;
    await saveConfig('customization', {
      bot_status_type: config.bot_status_type,
      bot_status_state: config.bot_status_state,
      bot_status_text: config.bot_status_text,
      bot_status_url: config.bot_status_url,
      embed_color: config.embed_color,
      embed_footer_text: config.embed_footer_text,
      embed_footer_icon_url: config.embed_footer_icon_url,
    });
    saving = false;
  }

  // Reactive preview calculations
  $: statusDotColor =
    config.bot_status_state === 'idle'
      ? '#f0b232'
      : config.bot_status_state === 'dnd'
        ? '#f23f43'
        : '#23a55a';

  $: statusPrefix =
    config.bot_status_type === 'WATCHING'
      ? 'Regarde'
      : config.bot_status_type === 'LISTENING'
        ? 'Écoute'
        : config.bot_status_type === 'STREAMING'
          ? 'Streame'
          : config.bot_status_type === 'COMPETING'
            ? 'Participe à'
            : 'Joue à';

  $: embedColor = config.embed_color || '#ef490b';
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Palette size={24} class="title-icon" /> Personnalisation & Apparence</h2>
      <p class="section-desc">
        Personnalisez la présence, le statut Discord et l'apparence des messages embeds de votre bot Pyro.
      </p>
    </div>
  </div>

  <div class="tab-layout">
    <div class="left-col">
      <form on:submit|preventDefault={handleSave}>
        <!-- Bot Presence Card -->
        <Card id="custom-presence" title="Présence & Statut du Bot" subtitle="Configurez l'activité et le statut en ligne affichés sur Discord" icon={Radio}>
          <div class="grid-2">
            <div class="form-group">
              <label for="bot_status_type">Type d'Activité</label>
              <select id="bot_status_type" bind:value={config.bot_status_type}>
                <option value="PLAYING">Joue à (Playing)</option>
                <option value="WATCHING">Regarde (Watching)</option>
                <option value="LISTENING">Écoute (Listening)</option>
                <option value="STREAMING">Streame (Streaming)</option>
                <option value="COMPETING">Participe à (Competing)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="bot_status_state">Statut de Connexion</label>
              <select id="bot_status_state" bind:value={config.bot_status_state}>
                <option value="online">🟢 En ligne (Online)</option>
                <option value="idle">🟡 Inactif (Idle)</option>
                <option value="dnd">🔴 Ne pas déranger (DND)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="bot_status_text">Texte du Statut</label>
            <input
              type="text"
              id="bot_status_text"
              bind:value={config.bot_status_text}
              placeholder="Ex: la modération de Pyro"
            />
          </div>

          {#if config.bot_status_type === 'STREAMING'}
            <div class="form-group">
              <label for="bot_status_url">URL Twitch / YouTube (Streaming)</label>
              <input
                type="url"
                id="bot_status_url"
                bind:value={config.bot_status_url}
                placeholder="https://twitch.tv/votre_chaine"
              />
            </div>
          {/if}
        </Card>

        <!-- Embed Branding Card -->
        <Card id="custom-embeds" title="Personnalisation des Embeds" subtitle="Couleur d'accentuation et bas de page de tous les messages embeds" icon={Layout}>
          <div class="grid-2">
            <div class="form-group">
              <label for="embed_color">Couleur Principale</label>
              <div style="display:flex;gap:0.75rem;align-items:center;">
                <input
                  type="color"
                  id="embed_color"
                  bind:value={config.embed_color}
                  style="width:48px;height:38px;padding:2px;cursor:pointer;border-radius:6px;"
                />
                <input type="text" bind:value={config.embed_color} placeholder="#ef490b" style="flex:1;" />
              </div>
            </div>

            <div class="form-group">
              <label for="embed_footer_text">Texte du Bas de Page (Footer)</label>
              <input
                type="text"
                id="embed_footer_text"
                bind:value={config.embed_footer_text}
                placeholder="Ex: Pyro Bot • Modération & Utilitaires"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="embed_footer_icon_url">URL de l'Icône du Footer (Optionnel)</label>
            <input
              type="url"
              id="embed_footer_icon_url"
              bind:value={config.embed_footer_icon_url}
              placeholder="https://i.imgur.com/votre_icone.png"
            />
          </div>
        </Card>

        <button type="submit" class="btn btn-primary" style="width:260px;" disabled={saving}>
          <Save size={16} />
          <span>{saving ? 'Enregistrement...' : 'Sauvegarder l\'Apparence'}</span>
        </button>
      </form>
    </div>

    <!-- Right: Sticky Live Preview Widget -->
    <div class="right-col">
      <div class="preview-sticky">
        <Card title="Aperçu en Direct" subtitle="Rendu instantané des embeds et de la présence" icon={Eye}>
          <!-- Presence Widget -->
          <div class="presence-box">
            <div class="avatar-wrap">
              <img
                src={$dashboardData.bot?.avatarUrl || '/icon.svg'}
                alt={$dashboardData.bot?.username || 'Pyro'}
                class="avatar-img"
                on:error={(e) => (e.target.src = '/icon.svg')}
              />
              <span class="status-dot" style="background-color: {statusDotColor};"></span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.35rem;">
                <strong class="bot-name">{$dashboardData.bot?.username || 'Pyro'}</strong>
                <span class="bot-badge">BOT</span>
              </div>
              <p class="status-text">
                <span>{statusPrefix}</span>
                <strong>{config.bot_status_text || 'la modération de Pyro'}</strong>
              </p>
            </div>
          </div>

          <!-- Embed Card Widget -->
          <div class="embed-preview" style="border-left-color: {embedColor};">
            <div class="embed-header">
              <span>🔔 Notification Exemple</span>
            </div>
            <p class="embed-desc">
              Ceci est une démonstration du rendu visuel de vos messages embeds générés par Pyro Bot.
            </p>
            <div class="embed-footer">
              {#if config.embed_footer_icon_url}
                <img src={config.embed_footer_icon_url} alt="" class="footer-icon" on:error={(e) => e.target.style.display = 'none'} />
              {/if}
              <span class="footer-text">{config.embed_footer_text || 'Pyro Bot • Modération & Utilitaires'}</span>
              <span class="footer-time">• Aujourd'hui à 12:00</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</div>

<style>
  .tab-layout {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 1100px) {
    .tab-layout {
      grid-template-columns: 1fr;
    }
  }

  .preview-sticky {
    position: sticky;
    top: 5.5rem;
  }

  .presence-box {
    background-color: #1e1f22;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 0.85rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    margin-bottom: 1.25rem;
  }

  .avatar-wrap {
    position: relative;
    width: 40px;
    height: 40px;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }

  .status-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #1e1f22;
  }

  .bot-name {
    display: block;
    font-size: 0.92rem;
    color: #f2f3f5;
  }

  .bot-badge {
    background-color: #5865f2;
    color: #ffffff;
    font-size: 0.62rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    line-height: 1.2;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
  }

  .status-text {
    font-size: 0.82rem;
    color: #949ba4;
    margin-top: 0.15rem;
  }

  .embed-preview {
    background-color: #2b2d31;
    border-radius: 4px;
    border-left: 4px solid var(--primary);
    padding: 1rem 1.1rem;
  }

  .embed-header {
    font-weight: 600;
    font-size: 0.92rem;
    color: #f2f3f5;
    margin-bottom: 0.4rem;
  }

  .embed-desc {
    font-size: 0.85rem;
    color: #dbdee1;
    line-height: 1.4;
    margin-bottom: 0.85rem;
  }

  .embed-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.6rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.75rem;
    color: #949ba4;
  }

  .footer-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
  }

  .footer-time {
    opacity: 0.6;
  }
</style>

