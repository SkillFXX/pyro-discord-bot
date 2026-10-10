<script>
  import { onMount } from 'svelte';
  import { dashboardData, saveConfig, testLavalinkNode, fetchMusicStatus } from '../stores/data';
  import { showToast } from '../stores/toast';
  import Card from '../components/Card.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { 
    Music, 
    Volume2, 
    Server, 
    Shield, 
    Radio, 
    CheckCircle2, 
    AlertCircle, 
    RefreshCw, 
    Save, 
    Sliders, 
    Info, 
    Plus, 
    X,
    ExternalLink
  } from '@lucide/svelte';

  let config = {};
  $: config = { ...$dashboardData.config };

  $: channels = $dashboardData.channels || { voice: [] };
  $: roles = $dashboardData.roles || [];
  $: musicStatus = $dashboardData.musicStatus;

  let musicEnabled = false;
  let lavalinkHost = 'localhost';
  let lavalinkPort = 2333;
  let lavalinkPass = 'youshallnotpass';
  let lavalinkSecure = false;
  let defaultVolume = 80;
  let searchProvider = 'ytsearch';
  let music247 = false;

  let allowedRoles = [];
  let allowedChannels = [];

  let selectedRoleToAdd = '';
  let selectedChannelToAdd = '';

  let saving = false;
  let testing = false;
  let testResult = null;

  // Initialize local states from config
  $: if (config) {
    musicEnabled = config.music_enabled === true || config.music_enabled === 'true';
    lavalinkHost = config.music_lavalink_host || 'localhost';
    lavalinkPort = parseInt(config.music_lavalink_port || 2333, 10);
    lavalinkPass = config.music_lavalink_pass || 'youshallnotpass';
    lavalinkSecure = config.music_lavalink_secure === true || config.music_lavalink_secure === 'true';
    defaultVolume = parseInt(config.music_default_volume || 80, 10);
    searchProvider = config.music_search_provider || 'ytsearch';
    music247 = config.music_247 === true || config.music_247 === 'true';

    try {
      const parsedRoles = config.music_allowed_roles;
      allowedRoles = Array.isArray(parsedRoles) 
        ? parsedRoles 
        : (typeof parsedRoles === 'string' ? JSON.parse(parsedRoles || '[]') : []);
    } catch(e) {
      allowedRoles = [];
    }

    try {
      const parsedChannels = config.music_allowed_channels;
      allowedChannels = Array.isArray(parsedChannels)
        ? parsedChannels
        : (typeof parsedChannels === 'string' ? JSON.parse(parsedChannels || '[]') : []);
    } catch(e) {
      allowedChannels = [];
    }
  }

  onMount(async () => {
    await fetchMusicStatus();
  });

  function addRole() {
    if (!selectedRoleToAdd) return;
    if (!allowedRoles.includes(selectedRoleToAdd)) {
      allowedRoles = [...allowedRoles, selectedRoleToAdd];
    }
    selectedRoleToAdd = '';
  }

  function removeRole(roleId) {
    allowedRoles = allowedRoles.filter(r => r !== roleId);
  }

  function addChannel() {
    if (!selectedChannelToAdd) return;
    if (!allowedChannels.includes(selectedChannelToAdd)) {
      allowedChannels = [...allowedChannels, selectedChannelToAdd];
    }
    selectedChannelToAdd = '';
  }

  function removeChannel(channelId) {
    allowedChannels = allowedChannels.filter(c => c !== channelId);
  }

  function getRoleName(id) {
    const r = roles.find(role => role.id === id);
    return r ? `@${r.name}` : `ID: ${id}`;
  }

  function getChannelName(id) {
    const c = (channels.voice || []).find(chan => chan.id === id);
    return c ? `🔊 ${c.name}` : `ID: ${id}`;
  }

  async function handleTestNode() {
    testing = true;
    testResult = null;
    try {
      testResult = await testLavalinkNode({
        host: lavalinkHost,
        port: lavalinkPort,
        pass: lavalinkPass,
        secure: lavalinkSecure
      });
      if (testResult.success) {
        showToast(`Lavalink connecté (${testResult.version}, ping: ${testResult.ping}ms) !`, 'success');
      } else {
        showToast(testResult.error || 'Échec de connexion au nœud Lavalink', 'error');
      }
    } catch(e) {
      testResult = { success: false, error: e.message };
      showToast('Erreur lors du test de connexion', 'error');
    }
    testing = false;
  }

  async function handleSave() {
    saving = true;
    const payload = {
      music_enabled: musicEnabled,
      music_lavalink_host: lavalinkHost.trim(),
      music_lavalink_port: lavalinkPort,
      music_lavalink_pass: lavalinkPass,
      music_lavalink_secure: lavalinkSecure,
      music_default_volume: defaultVolume,
      music_search_provider: searchProvider,
      music_247: music247,
      music_allowed_roles: allowedRoles,
      music_allowed_channels: allowedChannels,
    };

    const success = await saveConfig('music', payload);
    if (success) {
      // Re-fetch music status after brief delay to allow Lavalink node connection
      setTimeout(async () => {
        await fetchMusicStatus();
      }, 1500);
    }
    saving = false;
  }
</script>

<div class="tab-content-wrapper">
  <!-- Page Title -->
  <div class="page-title-row">
    <div>
      <h2><Music size={24} class="title-icon" /> Lecteur de Musique</h2>
      <p class="section-desc">
        Configurez votre serveur audio Lavalink, les réglages de lecture et les salons vocaux autorisés.
      </p>
    </div>
  </div>

  <form on:submit|preventDefault={handleSave}>
    <!-- 1. General & Playback Settings -->
    <Card id="music-settings" title="Paramètres Généraux de Lecture" subtitle="Activez la musique et ajustez les réglages par défaut" icon={Sliders}>
      <div style="margin-bottom: 1.25rem;">
        <Toggle 
          id="music_enabled"
          label="Activer le système de musique"
          description="Permet aux membres d'utiliser les commandes /music et connecte le bot à votre nœud Lavalink."
          bind:checked={musicEnabled}
        />
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="music_search_provider">Moteur de recherche par défaut</label>
          <select id="music_search_provider" bind:value={searchProvider} disabled={!musicEnabled}>
            <option value="scsearch">SoundCloud (Recommandé - Sans blocage IP)</option>
            <option value="ytsearch">YouTube (Standard - Peut être bloqué)</option>
            <option value="ytmsearch">YouTube Music</option>
            <option value="spsearch">Spotify</option>
          </select>
          <small style="color:var(--text-muted); font-size:0.75rem;">Utilisé lorsque l'utilisateur tape un mot clé sans coller de lien direct. SoundCloud est recommandé pour éviter les blocages YouTube.</small>
        </div>

        <div class="form-group">
          <label for="music_default_volume">Volume initial par défaut ({defaultVolume}%)</label>
          <div style="display:flex; align-items:center; gap: 1rem;">
            <input 
              id="music_default_volume" 
              type="range" 
              min="10" 
              max="100" 
              step="5" 
              bind:value={defaultVolume} 
              disabled={!musicEnabled}
              style="flex: 1;"
            />
            <span class="num-shape" style="min-width: 48px; text-align: center;">{defaultVolume}%</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 0.5rem;">
        <Toggle 
          id="music_247"
          label="Mode 24/7 (Rester dans le salon vocal)"
          description="Si désactivé, le bot quitte automatiquement le salon vocal 30 secondes après la fin de la file d'attente."
          bind:checked={music247}
          disabled={!musicEnabled}
        />
      </div>
    </Card>

    <!-- 2. Lavalink Server Connection Card -->
    <Card id="music-lavalink" title="Serveur Audio Lavalink" subtitle="Coordonnées de connexion vers votre nœud Lavalink v4" icon={Server}>
      <div slot="actions" style="display:flex; align-items:center; gap: 0.5rem;">
        <button 
          type="button" 
          class="btn btn-secondary btn-sm" 
          on:click={fetchMusicStatus} 
          title="Actualiser l'état du serveur Lavalink"
        >
          <RefreshCw size={13} />
        </button>

        {#if !musicEnabled}
          <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0.65rem;">
            Désactivé
          </span>
        {:else if musicStatus?.nodeStatus === 'connected'}
          <span class="badge badge-success" style="font-size: 0.78rem; padding: 0.35rem 0.65rem; display:inline-flex; align-items:center; gap: 6px;">
            <span class="status-dot-pulse"></span>
            Connecté {musicStatus.playersCount > 0 ? `(${musicStatus.playersCount} salon${musicStatus.playersCount > 1 ? 's' : ''})` : ''}
          </span>
        {:else if musicStatus?.nodeStatus === 'connecting'}
          <span class="badge badge-warning" style="font-size: 0.78rem; padding: 0.35rem 0.65rem; display:inline-flex; align-items:center; gap: 6px;">
            <span class="status-dot-warning"></span>
            Connexion en cours...
          </span>
        {:else if musicStatus?.nodeStatus === 'error'}
          <span class="badge badge-danger" style="font-size: 0.78rem; padding: 0.35rem 0.65rem; display:inline-flex; align-items:center; gap: 6px;" title={musicStatus.lastError || ''}>
            <span class="status-dot-danger"></span>
            Erreur du nœud
          </span>
        {:else}
          <span class="badge badge-danger" style="font-size: 0.78rem; padding: 0.35rem 0.65rem; display:inline-flex; align-items:center; gap: 6px;">
            <span class="status-dot-danger"></span>
            Déconnecté
          </span>
        {/if}
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="music_lavalink_host">Hôte (Host / IP / Domaine)</label>
          <input 
            id="music_lavalink_host" 
            type="text" 
            bind:value={lavalinkHost} 
            placeholder="Ex: localhost ou 127.0.0.1 ou lavalink.monserveur.com" 
          />
        </div>

        <div class="form-group">
          <label for="music_lavalink_port">Port</label>
          <input 
            id="music_lavalink_port" 
            type="number" 
            bind:value={lavalinkPort} 
            placeholder="2333" 
            min="1" 
            max="65535" 
          />
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="music_lavalink_pass">Mot de passe (Authorization Password)</label>
          <input 
            id="music_lavalink_pass" 
            type="password" 
            bind:value={lavalinkPass} 
            placeholder="youshallnotpass" 
          />
        </div>

        <div class="form-group" style="display:flex; flex-direction:column; justify-content:center;">
          <Toggle 
            id="music_lavalink_secure"
            label="Connexion sécurisée SSL (WSS / HTTPS)"
            description="Activez si votre serveur Lavalink est configuré avec un certificat SSL (port 443 / domaine sécurisé)."
            bind:checked={lavalinkSecure}
          />
        </div>
      </div>

      <!-- Test Connection Button & Result -->
      <div style="display:flex; align-items:center; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap;">
        <button 
          type="button" 
          class="btn btn-secondary" 
          on:click={handleTestNode} 
          disabled={testing || !lavalinkHost}
        >
          {#if testing}
            <RefreshCw size={14} class="spin" /> Test en cours...
          {:else}
            <Radio size={14} /> Tester la connexion au serveur
          {/if}
        </button>

        {#if testResult}
          {#if testResult.success}
            <span style="color: var(--success, #2ecc71); font-size: 0.85rem; display:inline-flex; align-items:center; gap: 4px;">
              <CheckCircle2 size={16} /> 
              Connexion réussie ! Version Lavalink : <strong>{testResult.version}</strong> (Latence : {testResult.ping}ms)
            </span>
          {:else}
            <span style="color: var(--danger, #ef4444); font-size: 0.85rem; display:inline-flex; align-items:center; gap: 4px;">
              <AlertCircle size={16} /> 
              Échec : {testResult.error}
            </span>
          {/if}
        {/if}
      </div>

      <!-- Informational note -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-top: 1.25rem; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">
        <div style="display:flex; align-items:center; gap: 6px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
          <Info size={16} style="color: var(--primary);" /> Qu'est-ce que Lavalink ?
        </div>
        Lavalink est un serveur autonome Java optimisé dédié à l'extraction et au streaming audio en temps réel pour Discord. Il prend en charge YouTube, SoundCloud, Spotify, Apple Music et les flux Web radio sans consommer les ressources du bot Pyro. 
      </div>

      <!-- YouTube Blocking Advice -->
      <div style="background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.28); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-top: 0.75rem; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">
        <div style="display:flex; align-items:center; gap: 6px; font-weight: 600; color: #ffaa00; margin-bottom: 4px;">
          <AlertCircle size={16} /> Blocage YouTube sur les serveurs d'hébergement
        </div>
        YouTube bloque fréquemment les serveurs hébergés en datacenter (erreur <code>AllClientsFailedException: This video requires login</code>). Si vous rencontrez ce problème avec des liens YouTube sur un nœud public gratuit, passez le moteur par défaut sur <strong>SoundCloud</strong> ci-dessus ou écoutez de la musique via SoundCloud / Spotify.
      </div>
    </Card>

    <!-- 3. Permissions & Restrictions Card -->
    <Card id="music-permissions" title="Permissions, Rôles DJ & Salons Autorisés" subtitle="Contrôlez qui peut manipuler la musique et où" icon={Shield}>
      <div class="grid-2">
        <!-- DJ Roles Selection -->
        <div>
          <label style="display:block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem;">
            Rôles avec Contrôle DJ (Skip, Stop, Pause, Volume...)
          </label>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.5rem;">
            Si aucun rôle n'est spécifié, tous les membres présents dans le salon vocal peuvent contrôler la musique.
          </p>

          <div style="display:flex; gap: 0.5rem; margin-bottom: 0.75rem;">
            <select bind:value={selectedRoleToAdd} style="flex:1;">
              <option value="">-- Choisir un rôle à autoriser --</option>
              {#each roles as r}
                {#if !allowedRoles.includes(r.id)}
                  <option value={r.id}>@{r.name}</option>
                {/if}
              {/each}
            </select>
            <button type="button" class="btn btn-secondary" on:click={addRole} disabled={!selectedRoleToAdd}>
              <Plus size={14} /> Ajouter
            </button>
          </div>

          <!-- Badges des rôles autorisés -->
          <div style="display:flex; flex-wrap:wrap; gap: 6px; min-height: 38px; padding: 0.4rem; background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: var(--radius-sm); align-items:center;">
            {#if allowedRoles.length === 0}
              <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 2px 6px;">
                Tous les membres peuvent contrôler la musique
              </span>
            {:else}
              {#each allowedRoles as roleId}
                <span class="badge badge-info" style="display:inline-flex; align-items:center; gap: 5px; padding: 0.3rem 0.55rem;">
                  <span>{getRoleName(roleId)}</span>
                  <button type="button" class="tag-remove-btn" on:click={() => removeRole(roleId)} title="Retirer">
                    <X size={12} />
                  </button>
                </span>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Allowed Voice Channels Selection -->
        <div>
          <label style="display:block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem;">
            Salons Vocaux Autorisés pour la Musique
          </label>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.5rem;">
            Si aucun salon n'est sélectionné, la musique peut être lancée dans tous les salons vocaux du serveur.
          </p>

          <div style="display:flex; gap: 0.5rem; margin-bottom: 0.75rem;">
            <select bind:value={selectedChannelToAdd} style="flex:1;">
              <option value="">-- Choisir un salon vocal --</option>
              {#each (channels.voice || []) as v}
                {#if !allowedChannels.includes(v.id)}
                  <option value={v.id}>{v.name}</option>
                {/if}
              {/each}
            </select>
            <button type="button" class="btn btn-secondary" on:click={addChannel} disabled={!selectedChannelToAdd}>
              <Plus size={14} /> Ajouter
            </button>
          </div>

          <!-- Badges des salons autorisés -->
          <div style="display:flex; flex-wrap:wrap; gap: 6px; min-height: 38px; padding: 0.4rem; background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: var(--radius-sm); align-items:center;">
            {#if allowedChannels.length === 0}
              <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 2px 6px;">
                Tous les salons vocaux sont autorisés
              </span>
            {:else}
              {#each allowedChannels as chanId}
                <span class="badge badge-warning" style="display:inline-flex; align-items:center; gap: 5px; padding: 0.3rem 0.55rem;">
                  <span>{getChannelName(chanId)}</span>
                  <button type="button" class="tag-remove-btn" on:click={() => removeChannel(chanId)} title="Retirer">
                    <X size={12} />
                  </button>
                </span>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </Card>

    <!-- Save Button Bar -->
    <div style="display:flex; justify-content:flex-end; margin-top: 1.5rem; margin-bottom: 2rem;">
      <button type="submit" class="btn btn-primary" disabled={saving}>
        {#if saving}
          <RefreshCw size={16} class="spin" /> Enregistrement...
        {:else}
          <Save size={16} /> Enregistrer la Configuration Musique
        {/if}
      </button>
    </div>
  </form>
</div>

<style>
  .tag-remove-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .tag-remove-btn:hover {
    opacity: 1;
  }

  .status-dot-pulse {
    width: 7px;
    height: 7px;
    background: #2ecc71;
    border-radius: 50%;
    display: inline-block;
    box-shadow: 0 0 6px rgba(46, 204, 113, 0.6);
  }

  .status-dot-warning {
    width: 7px;
    height: 7px;
    background: #f1c40f;
    border-radius: 50%;
    display: inline-block;
  }

  .status-dot-danger {
    width: 7px;
    height: 7px;
    background: #e74c3c;
    border-radius: 50%;
    display: inline-block;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }
</style>

