<script>
  import { onMount, tick } from 'svelte';
  import { 
    Image as ImageIcon, 
    Sparkles, 
    Save, 
    Send, 
    Download, 
    RotateCcw, 
    Plus, 
    Trash2, 
    User, 
    Type, 
    Palette, 
    Eye, 
    ChevronDown,
    ChevronUp,
    Info
  } from '@lucide/svelte';
  import Toggle from './Toggle.svelte';
  import Modal from './Modal.svelte';
  import { dashboardData, fetchCardConfig, saveCardConfig, testSendCard } from '../stores/data';
  import { showToast } from '../stores/toast';

  // Props
  export let type = 'welcome'; // 'welcome' | 'leave' | 'levelup'
  export let title = 'Carte Graphique Personnalisée';
  export let subtitle = 'Générez et envoyez une image personnalisée sur Discord';

  let isSaving = false;
  let isTesting = false;
  let showTestModal = false;
  let selectedTestChannelId = '';
  let isExpanded = false;
  let activeTab = 'presets'; // 'presets' | 'background' | 'avatar' | 'texts'

  // Local card configuration state
  let config = null;
  let canvasElement;
  let selectedTextIndex = 0;

  // Mock Context for Preview
  let mockContext = {
    username: 'Alexandre',
    userMention: '@Alexandre',
    userTag: 'alexandre_dev',
    serverName: 'Pyro Community',
    memberCount: 142,
    level: 12,
    oldLevel: 11,
    xp: 4850,
    inviter: 'CaptainPyro',
    inviterUsername: 'CaptainPyro',
    invitesCount: 6,
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
  };

  // Cached avatar image object for client canvas
  let cachedAvatarImg = null;
  let cachedBgImg = null;

  // Available Presets
  const presets = [
    {
      name: 'Pyro Glow (Orange)',
      border: '#ef490b',
      gradient: ['#0d0c1d', '#1f1538', '#110c22'],
      textColor: '#ef490b'
    },
    {
      name: 'Cyberpunk Néon',
      border: '#00f0ff',
      gradient: ['#090919', '#151336', '#09081a'],
      textColor: '#00f0ff'
    },
    {
      name: 'Gold Champion',
      border: '#f1c40f',
      gradient: ['#171407', '#2e250b', '#130f04'],
      textColor: '#f1c40f'
    },
    {
      name: 'Cosmic Blue',
      border: '#3b82f6',
      gradient: ['#080f24', '#0f1d47', '#080d1e'],
      textColor: '#60a5fa'
    },
    {
      name: 'Émeraude Sombre',
      border: '#10b981',
      gradient: ['#061712', '#0d2e24', '#061410'],
      textColor: '#34d399'
    }
  ];

  // Font options
  const fontFamilies = [
    { label: 'Figtree (Discord)', value: 'Figtree' },
    { label: 'Syne (Moderne & Titres)', value: 'Syne' },
    { label: 'Arial', value: 'Arial' },
    { label: 'Impact', value: 'Impact' },
    { label: 'Trebuchet MS', value: 'Trebuchet MS' },
    { label: 'Sans-Serif', value: 'sans-serif' }
  ];

  // Available dynamic variables per card type
  $: availableVariables = type === 'levelup' 
    ? [
        { tag: '{username}', desc: 'Pseudo' },
        { tag: '{user}', desc: 'Mention' },
        { tag: '{level}', desc: 'Niveau atteint' },
        { tag: '{oldLevel}', desc: 'Ancien niveau' },
        { tag: '{xp}', desc: 'XP totale' },
        { tag: '{server}', desc: 'Serveur' },
        { tag: '{memberCount}', desc: 'Compteur membres' }
      ]
    : [
        { tag: '{username}', desc: 'Pseudo' },
        { tag: '{user}', desc: 'Mention' },
        { tag: '{server}', desc: 'Serveur' },
        { tag: '{memberCount}', desc: 'Compteur membres' },
        { tag: '{inviter}', desc: "Nom inviteur" },
        { tag: '{invites}', desc: "Nb invitations" }
      ];

  $: textChannels = ($dashboardData.channels && $dashboardData.channels.text) ? $dashboardData.channels.text.filter(c => !c.forum) : [];
  $: if ($dashboardData.serverName) {
    mockContext.serverName = $dashboardData.serverName;
  }

  onMount(async () => {
    preloadAvatar();
    await loadConfig();
  });

  function preloadAvatar() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedAvatarImg = img;
      renderClientCanvas();
    };
    img.src = mockContext.avatarUrl;
  }

  async function loadConfig() {
    if ($dashboardData.cards && $dashboardData.cards[type]) {
      config = JSON.parse(JSON.stringify($dashboardData.cards[type]));
    } else {
      config = await fetchCardConfig(type);
    }

    if (config && config.enabled) {
      isExpanded = true;
    }

    selectedTextIndex = 0;
    await tick();
    loadBgImage();
    renderClientCanvas();
  }

  function loadBgImage() {
    if (config?.background?.type === 'image' && config.background.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cachedBgImg = img;
        renderClientCanvas();
      };
      img.onerror = () => {
        cachedBgImg = null;
        renderClientCanvas();
      };
      img.src = config.background.imageUrl;
    } else {
      cachedBgImg = null;
    }
  }

  function formatVar(str) {
    if (!str) return '';
    return str
      .replace(/{user}/g, mockContext.userMention)
      .replace(/{username}/g, mockContext.username)
      .replace(/{tag}/g, mockContext.userTag)
      .replace(/{server}/g, mockContext.serverName)
      .replace(/{memberCount}/g, mockContext.memberCount.toString())
      .replace(/{level}/g, mockContext.level.toString())
      .replace(/{oldLevel}/g, mockContext.oldLevel.toString())
      .replace(/{xp}/g, mockContext.xp.toLocaleString('fr-FR'))
      .replace(/{inviter}/g, mockContext.inviter)
      .replace(/{inviterUsername}/g, mockContext.inviterUsername)
      .replace(/{inviterTag}/g, mockContext.inviter)
      .replace(/{invites}/g, mockContext.invitesCount.toString())
      .replace(/{inviteCount}/g, mockContext.invitesCount.toString());
  }

  function getGradientCoords(angleDeg, width, height) {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const length = Math.abs(width * Math.cos(angleRad)) + Math.abs(height * Math.sin(angleRad));
    const halfLen = length / 2;

    const x0 = cx - Math.cos(angleRad) * halfLen;
    const y0 = cy - Math.sin(angleRad) * halfLen;
    const x1 = cx + Math.cos(angleRad) * halfLen;
    const y1 = cy + Math.sin(angleRad) * halfLen;

    return { x0, y0, x1, y1 };
  }

  function renderClientCanvas() {
    if (!canvasElement || !config) return;
    const ctx = canvasElement.getContext('2d');
    const width = config.width || 900;
    const height = config.height || 400;
    const borderRadius = config.borderRadius ?? 24;

    canvasElement.width = width;
    canvasElement.height = height;

    ctx.clearRect(0, 0, width, height);

    // 1. Clip Rounded Corners
    ctx.save();
    ctx.beginPath();
    if (borderRadius > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(0, 0, width, height, borderRadius);
    } else {
      ctx.rect(0, 0, width, height);
    }
    ctx.clip();

    // 2. Background
    const bg = config.background || {};
    if (bg.type === 'color') {
      ctx.fillStyle = bg.color || '#14161b';
      ctx.fillRect(0, 0, width, height);
    } else if (bg.type === 'image' && cachedBgImg) {
      const imgRatio = cachedBgImg.width / cachedBgImg.height;
      const canvasRatio = width / height;
      let renderWidth = width;
      let renderHeight = height;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasRatio > imgRatio) {
        renderHeight = width / imgRatio;
        offsetY = (height - renderHeight) / 2;
      } else {
        renderWidth = height * imgRatio;
        offsetX = (width - renderWidth) / 2;
      }

      ctx.drawImage(cachedBgImg, offsetX, offsetY, renderWidth, renderHeight);

      const overlayOpacity = parseFloat(bg.overlayOpacity ?? 0.45);
      if (overlayOpacity > 0) {
        ctx.fillStyle = bg.overlayColor || '#000000';
        ctx.globalAlpha = overlayOpacity;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1.0;
      }
    } else {
      const gradConfig = bg.gradient || {};
      const angle = parseInt(gradConfig.angle ?? 135, 10);
      const { x0, y0, x1, y1 } = getGradientCoords(angle, width, height);
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      const colors = (gradConfig.colors && gradConfig.colors.length > 0) 
        ? gradConfig.colors 
        : ['#0d0c1d', '#1f1538', '#110c22'];

      colors.forEach((col, idx) => {
        gradient.addColorStop(idx / (colors.length - 1 || 1), col);
      });

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // 3. Avatar
    const av = config.avatar || {};
    if (av.enabled !== false && cachedAvatarImg) {
      const avX = av.x ?? 450;
      const avY = av.y ?? 135;
      const avSize = av.size ?? 130;
      const avRadius = avSize / 2;
      const shape = av.shape || 'circle';

      ctx.save();

      if (av.glow && av.glowColor) {
        ctx.shadowColor = av.glowColor;
        ctx.shadowBlur = av.glowBlur ?? 16;
      }

      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(avX, avY, avRadius, 0, Math.PI * 2, true);
      } else if (shape === 'rounded') {
        const rad = av.borderRadius ?? 24;
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(avX - avRadius, avY - avRadius, avSize, avSize, rad);
        } else {
          ctx.rect(avX - avRadius, avY - avRadius, avSize, avSize);
        }
      } else {
        ctx.rect(avX - avRadius, avY - avRadius, avSize, avSize);
      }
      ctx.closePath();

      if (av.borderWidth > 0 && av.borderColor) {
        ctx.strokeStyle = av.borderColor;
        ctx.lineWidth = av.borderWidth;
        ctx.stroke();
      }

      ctx.clip();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.drawImage(cachedAvatarImg, avX - avRadius, avY - avRadius, avSize, avSize);
      ctx.restore();
    }

    // 4. Text Layers
    const texts = config.texts || [];
    texts.forEach((layer) => {
      const formatted = formatVar(layer.text);
      if (!formatted) return;

      ctx.save();
      const weight = layer.fontWeight || 'bold';
      const size = layer.fontSize || 32;
      const family = layer.fontFamily || 'Figtree';
      ctx.font = `${weight} ${size}px "${family}", sans-serif`;
      ctx.textAlign = layer.align || 'center';
      ctx.textBaseline = 'middle';

      if (layer.shadow !== false) {
        ctx.shadowColor = layer.shadowColor || 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = layer.shadowBlur ?? 8;
        ctx.shadowOffsetX = layer.shadowOffsetX ?? 0;
        ctx.shadowOffsetY = layer.shadowOffsetY ?? 2;
      }

      ctx.fillStyle = layer.color || '#ffffff';
      ctx.fillText(formatted, layer.x ?? 450, layer.y ?? 250);
      ctx.restore();
    });

    // 5. Border
    const border = config.border || {};
    if (border.enabled !== false && border.width > 0) {
      ctx.save();
      if (border.glow && border.glowColor) {
        ctx.shadowColor = border.glowColor;
        ctx.shadowBlur = border.glowBlur ?? 14;
      }
      ctx.beginPath();
      const halfBorder = border.width / 2;
      if (borderRadius > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(halfBorder, halfBorder, width - border.width, height - border.width, Math.max(0, borderRadius - halfBorder));
      } else {
        ctx.rect(halfBorder, halfBorder, width - border.width, height - border.width);
      }
      ctx.strokeStyle = border.color || '#ef490b';
      ctx.lineWidth = border.width;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function enableAndCreateCard() {
    if (!config) {
      config = {
        enabled: true,
        sendMode: 'embed',
        width: 900,
        height: 400,
        borderRadius: 24,
        background: {
          type: 'gradient',
          gradient: {
            type: 'linear',
            angle: 135,
            colors: ['#0d0c1d', '#1f1538', '#110c22']
          },
          imageUrl: '',
          overlayOpacity: 0.45
        },
        border: {
          enabled: true,
          color: '#ef490b',
          width: 2,
          glow: true,
          glowColor: 'rgba(239, 73, 11, 0.35)',
          glowBlur: 14
        },
        avatar: {
          enabled: true,
          x: 450,
          y: 135,
          size: 130,
          shape: 'circle',
          borderWidth: 4,
          borderColor: '#ef490b',
          glow: true,
          glowColor: 'rgba(239, 73, 11, 0.45)',
          glowBlur: 16
        },
        texts: type === 'levelup' ? [
          { text: 'NOUVEAU NIVEAU !', fontSize: 22, fontWeight: '800', fontFamily: 'Syne', color: '#ef490b', x: 450, y: 220, align: 'center', shadow: true },
          { text: '{username}', fontSize: 36, fontWeight: 'bold', fontFamily: 'Figtree', color: '#ffffff', x: 450, y: 260, align: 'center', shadow: true },
          { text: 'A atteint le Niveau {level} • {xp} XP', fontSize: 18, fontWeight: '600', fontFamily: 'Figtree', color: '#cbd5e1', x: 450, y: 305, align: 'center', shadow: true }
        ] : type === 'leave' ? [
          { text: 'AU REVOIR', fontSize: 24, fontWeight: '800', fontFamily: 'Syne', color: '#ef4444', x: 450, y: 225, align: 'center', shadow: true },
          { text: '{username}', fontSize: 36, fontWeight: 'bold', fontFamily: 'Figtree', color: '#ffffff', x: 450, y: 270, align: 'center', shadow: true },
          { text: 'Nous ne sommes plus que {memberCount} membres', fontSize: 18, fontWeight: '500', fontFamily: 'Figtree', color: '#94a3b8', x: 450, y: 315, align: 'center', shadow: true }
        ] : [
          { text: 'BIENVENUE SUR LE SERVEUR', fontSize: 20, fontWeight: '800', fontFamily: 'Syne', color: '#ef490b', x: 450, y: 225, align: 'center', shadow: true },
          { text: '{username}', fontSize: 38, fontWeight: 'bold', fontFamily: 'Figtree', color: '#ffffff', x: 450, y: 270, align: 'center', shadow: true },
          { text: 'Tu es le {memberCount}e membre !', fontSize: 18, fontWeight: '500', fontFamily: 'Figtree', color: '#cbd5e1', x: 450, y: 315, align: 'center', shadow: true }
        ]
      };
    } else {
      config.enabled = true;
    }
    isExpanded = true;
    tick().then(() => {
      renderClientCanvas();
    });
  }

  function applyPreset(p) {
    if (!config) return;
    config.background.type = 'gradient';
    config.background.gradient.colors = [...p.gradient];
    config.border.color = p.border;
    config.border.glowColor = p.border + '66';
    if (config.avatar) {
      config.avatar.borderColor = p.border;
      config.avatar.glowColor = p.border + '77';
    }
    if (config.texts && config.texts[0]) {
      config.texts[0].color = p.textColor;
    }
    config = { ...config };
    renderClientCanvas();
    showToast(`Modèle "${p.name}" appliqué`, 'info');
  }

  function addTextLayer() {
    if (!config.texts) config.texts = [];
    const newIdx = config.texts.length + 1;
    config.texts.push({
      text: `Texte #${newIdx}`,
      fontSize: 22,
      fontWeight: 'bold',
      fontFamily: 'Figtree',
      color: '#ffffff',
      x: 450,
      y: 350,
      align: 'center',
      shadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.75)',
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 2
    });
    selectedTextIndex = config.texts.length - 1;
    config = { ...config };
    renderClientCanvas();
  }

  function removeTextLayer(idx) {
    if (!config.texts || config.texts.length <= 1) {
      showToast('Il faut conserver au moins 1 calque de texte', 'warning');
      return;
    }
    config.texts.splice(idx, 1);
    selectedTextIndex = Math.max(0, selectedTextIndex - 1);
    config = { ...config };
    renderClientCanvas();
  }

  function insertVariable(tag) {
    if (!config?.texts || !config.texts[selectedTextIndex]) return;
    config.texts[selectedTextIndex].text = (config.texts[selectedTextIndex].text || '') + ' ' + tag;
    config = { ...config };
    renderClientCanvas();
  }

  function resetToDefault() {
    if (confirm('Réinitialiser cette carte aux réglages graphiques d\'origine ?')) {
      config = null;
      enableAndCreateCard();
      showToast('Paramètres réinitialisés avec succès', 'info');
    }
  }

  function downloadCanvas() {
    if (!canvasElement) return;
    const link = document.createElement('a');
    link.download = `pyro-${type}-card.png`;
    link.href = canvasElement.toDataURL('image/png');
    link.click();
    showToast('Image téléchargée au format PNG', 'success');
  }

  function openTestModal() {
    if (textChannels.length > 0) {
      selectedTestChannelId = textChannels[0].id;
    }
    showTestModal = true;
  }

  async function handleSendTest() {
    if (!selectedTestChannelId) {
      showToast('Veuillez sélectionner un salon Discord', 'error');
      return;
    }

    isTesting = true;
    try {
      const success = await testSendCard(type, selectedTestChannelId, config, mockContext);
      if (success) {
        showToast('Carte de test envoyée avec succès sur Discord !', 'success');
        showTestModal = false;
      } else {
        showToast("Erreur lors de l'envoi sur Discord", 'error');
      }
    } catch (err) {
      showToast(err.message || 'Erreur inattendue', 'error');
    } finally {
      isTesting = false;
    }
  }

  async function handleSave() {
    isSaving = true;
    try {
      const ok = await saveCardConfig(type, config);
      if (ok) {
        showToast(`Carte "${title}" sauvegardée avec succès !`, 'success');
      } else {
        showToast('Erreur lors de la sauvegarde de la carte', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Erreur inattendue', 'error');
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="card-editor-wrapper">
  {#if !config || !config.enabled}
    <!-- Clean Single Callout (No Nested Boxes) -->
    <div class="flat-callout-hero">
      <div class="hero-left">
        <div class="hero-icon">
          <ImageIcon size={22} />
        </div>
        <div>
          <span class="hero-title">{title}</span>
          <p class="hero-sub">{subtitle}</p>
        </div>
      </div>

      <button type="button" class="btn btn-primary btn-sm" on:click={enableAndCreateCard}>
        <Plus size={15} /> Créer & Personnaliser la carte
      </button>
    </div>
  {:else}
    <!-- Clean Top Bar -->
    <div class="studio-topbar">
      <div class="topbar-left">
        <div class="badge-active">Active</div>
        <Toggle 
          id={`card_enabled_${type}`} 
          label="Activer l'envoi sur Discord" 
          bind:checked={config.enabled}
        />
      </div>

      <div class="topbar-actions">
        <button 
          type="button" 
          class="btn btn-secondary btn-sm" 
          on:click={() => (isExpanded = !isExpanded)}
        >
          {#if isExpanded}
            <ChevronUp size={14} /> Masquer l'Éditeur
          {:else}
            <ChevronDown size={14} /> Modifier la Carte
          {/if}
        </button>

        <button type="button" class="btn btn-secondary btn-sm" on:click={downloadCanvas} title="Télécharger le PNG">
          <Download size={14} /> PNG
        </button>

        <button type="button" class="btn btn-secondary btn-sm" on:click={openTestModal} title="Tester sur Discord">
          <Send size={14} /> Tester
        </button>

        <button type="button" class="btn btn-primary btn-sm" on:click={handleSave} disabled={isSaving}>
          <Save size={14} /> {isSaving ? 'Enregistrement...' : 'Sauvegarder'}
        </button>
      </div>
    </div>

    {#if isExpanded}
      <!-- Side-by-Side Studio Layout (Sticky Canvas Left, Flat Tabs Right) -->
      <div class="studio-split-layout">
        
        <!-- LEFT COLUMN: Sticky Canvas & Live Preview + Send Mode -->
        <div class="studio-left-column">
          <div class="sticky-preview-box">
            <div class="preview-badge-row">
              <span class="preview-tag">
                <Eye size={13} /> Prévisualisation en direct
              </span>
              <button type="button" class="btn-reset" on:click={resetToDefault} title="Réinitialiser les couleurs et textes">
                <RotateCcw size={12} /> Réinitialiser
              </button>
            </div>

            <!-- Canvas Viewport -->
            <div class="canvas-box">
              <canvas bind:this={canvasElement}></canvas>
            </div>

            <!-- Delivery Mode Selector with Clear Explanation -->
            <div class="delivery-options-box">
              <label for={`send_mode_${type}`} class="delivery-label">
                Format de diffusion Discord :
              </label>

              <select id={`send_mode_${type}`} bind:value={config.sendMode} class="delivery-select">
                <option value="embed">🖼️ Intégrée dans l'Embed (Recommandé)</option>
                <option value="standalone">📎 Fichier Image Direct (Texte + Image)</option>
              </select>

              <div class="delivery-hint">
                <Info size={14} class="hint-icon" />
                {#if config.sendMode === 'standalone'}
                  <span>
                    Le message ci-dessus est envoyé comme <strong>texte Discord</strong> et la carte en <strong>pièce jointe</strong>. Le membre <code>{'{user}'}</code> est notifié directement dans le texte.
                  </span>
                {:else}
                  <span>
                    Le message ci-dessus constitue la <strong>description de l'Embed</strong> et la carte s'affiche en <strong>bannière centrale</strong>. Le bot mentionne le membre pour garantir la notification.
                  </span>
                {/if}
              </div>
            </div>

            <!-- Quick Action Buttons under Preview -->
            <div class="preview-action-row">
              <button type="button" class="btn btn-primary" on:click={handleSave} disabled={isSaving} style="flex:1;">
                <Save size={15} /> {isSaving ? 'Enregistrement...' : 'Sauvegarder la Carte'}
              </button>
              <button type="button" class="btn btn-secondary" on:click={openTestModal} title="Envoyer sur un salon Discord">
                <Send size={15} /> Tester
              </button>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Flat Tabbed Controls (No Nested Boxes) -->
        <div class="studio-right-column">
          <!-- Navigation Tabs -->
          <div class="flat-tab-nav">
            <button 
              type="button" 
              class="flat-nav-btn {activeTab === 'presets' ? 'active' : ''}" 
              on:click={() => (activeTab = 'presets')}
            >
              <Sparkles size={14} /> Modèles
            </button>
            <button 
              type="button" 
              class="flat-nav-btn {activeTab === 'background' ? 'active' : ''}" 
              on:click={() => (activeTab = 'background')}
            >
              <Palette size={14} /> Fond & Bordure
            </button>
            <button 
              type="button" 
              class="flat-nav-btn {activeTab === 'avatar' ? 'active' : ''}" 
              on:click={() => (activeTab = 'avatar')}
            >
              <User size={14} /> Avatar
            </button>
            <button 
              type="button" 
              class="flat-nav-btn {activeTab === 'texts' ? 'active' : ''}" 
              on:click={() => (activeTab = 'texts')}
            >
              <Type size={14} /> Textes & Variables
            </button>
          </div>

          <!-- TAB 1: PRESETS -->
          {#if activeTab === 'presets'}
            <div class="tab-pane">
              <p class="tab-intro">Appliquez un thème graphique complet en un seul clic :</p>
              <div class="preset-grid">
                {#each presets as p}
                  <button 
                    type="button" 
                    class="preset-card" 
                    on:click={() => applyPreset(p)}
                    style="border-color: {p.border};"
                  >
                    <div class="preset-stripe" style="background: linear-gradient(135deg, {p.gradient.join(', ')});"></div>
                    <span class="preset-title">{p.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- TAB 2: BACKGROUND & BORDER -->
          {#if activeTab === 'background'}
            <div class="tab-pane">
              <div class="form-group">
                <label for={`bg_type_${type}`}>Type d'arrière-plan</label>
                <select id={`bg_type_${type}`} bind:value={config.background.type} on:change={renderClientCanvas}>
                  <option value="gradient">🎨 Dégradé Linéaire</option>
                  <option value="color">🟦 Couleur Unie</option>
                  <option value="image">🖼️ Image Personnalisée (URL)</option>
                </select>
              </div>

              {#if config.background.type === 'gradient'}
                <div class="grid-2">
                  <div class="form-group">
                    <label for={`grad_angle_${type}`}>Angle ({config.background.gradient.angle || 135}°)</label>
                    <input 
                      type="range" 
                      id={`grad_angle_${type}`} 
                      min="0" 
                      max="360" 
                      step="5" 
                      bind:value={config.background.gradient.angle} 
                      on:input={renderClientCanvas}
                    />
                  </div>

                  <div class="form-group">
                    <label>Couleurs du dégradé</label>
                    <div style="display:flex; gap: 0.5rem; align-items:center;">
                      {#each (config.background.gradient.colors || []) as col, i}
                        <input 
                          type="color" 
                          class="color-picker-square"
                          bind:value={config.background.gradient.colors[i]} 
                          on:input={renderClientCanvas}
                          title={`Couleur #${i+1}`}
                        />
                      {/each}
                    </div>
                  </div>
                </div>
              {:else if config.background.type === 'color'}
                <div class="form-group">
                  <label for={`bg_color_${type}`}>Couleur de Fond</label>
                  <div style="display:flex; gap: 0.5rem; align-items:center;">
                    <input 
                      type="color" 
                      id={`bg_color_${type}`} 
                      class="color-picker-square"
                      bind:value={config.background.color} 
                      on:input={renderClientCanvas}
                    />
                    <input 
                      type="text" 
                      bind:value={config.background.color} 
                      on:input={renderClientCanvas}
                      style="max-width: 140px;"
                    />
                  </div>
                </div>
              {:else if config.background.type === 'image'}
                <div class="form-group">
                  <label for={`bg_image_url_${type}`}>URL de l'image (PNG, JPG, WebP)</label>
                  <input 
                    type="url" 
                    id={`bg_image_url_${type}`} 
                    bind:value={config.background.imageUrl} 
                    on:input={loadBgImage}
                    placeholder="https://..."
                  />
                </div>

                <div class="form-group">
                  <label for={`overlay_opacity_${type}`}>Assombrissement ({Math.round((config.background.overlayOpacity ?? 0.45) * 100)}%)</label>
                  <input 
                    type="range" 
                    id={`overlay_opacity_${type}`} 
                    min="0" 
                    max="0.95" 
                    step="0.05" 
                    bind:value={config.background.overlayOpacity} 
                    on:input={renderClientCanvas}
                  />
                </div>
              {/if}

              <!-- Divider -->
              <div class="section-divider"></div>

              <!-- Border & Radius -->
              <div class="grid-2">
                <div class="form-group">
                  <label for={`card_radius_${type}`}>Rayon des Coins ({config.borderRadius ?? 24}px)</label>
                  <input 
                    type="range" 
                    id={`card_radius_${type}`} 
                    min="0" 
                    max="40" 
                    step="2" 
                    bind:value={config.borderRadius} 
                    on:input={renderClientCanvas}
                  />
                </div>

                <div class="form-group">
                  <label for={`card_border_width_${type}`}>Épaisseur Bordure ({config.border.width ?? 2}px)</label>
                  <input 
                    type="range" 
                    id={`card_border_width_${type}`} 
                    min="0" 
                    max="8" 
                    step="1" 
                    bind:value={config.border.width} 
                    on:input={renderClientCanvas}
                  />
                </div>
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label for={`card_border_col_${type}`}>Couleur Bordure</label>
                  <div style="display:flex; gap: 0.5rem; align-items:center;">
                    <input 
                      type="color" 
                      id={`card_border_col_${type}`} 
                      class="color-picker-square"
                      bind:value={config.border.color} 
                      on:input={renderClientCanvas}
                    />
                    <input 
                      type="text" 
                      bind:value={config.border.color} 
                      on:input={renderClientCanvas}
                      style="max-width: 120px;"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label for={`card_border_glow_${type}`}>Lueur Néon</label>
                  <Toggle 
                    id={`card_border_glow_${type}`} 
                    label="Activer l'aura lumineuse" 
                    bind:checked={config.border.glow}
                    on:change={renderClientCanvas}
                  />
                </div>
              </div>
            </div>
          {/if}

          <!-- TAB 3: AVATAR -->
          {#if activeTab === 'avatar'}
            <div class="tab-pane">
              <Toggle 
                id={`avatar_enabled_${type}`} 
                label="Afficher la photo de profil du membre" 
                bind:checked={config.avatar.enabled}
                on:change={renderClientCanvas}
              />

              {#if config.avatar.enabled}
                <div class="section-divider"></div>

                <div class="grid-2">
                  <div class="form-group">
                    <label for={`av_shape_${type}`}>Forme de l'Avatar</label>
                    <select id={`av_shape_${type}`} bind:value={config.avatar.shape} on:change={renderClientCanvas}>
                      <option value="circle">⚪ Cercle</option>
                      <option value="rounded">🔲 Rectangle Arrondi</option>
                      <option value="square">⬛ Carré</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label for={`av_size_${type}`}>Diamètre / Taille ({config.avatar.size || 130}px)</label>
                    <input 
                      type="range" 
                      id={`av_size_${type}`} 
                      min="70" 
                      max="200" 
                      step="5" 
                      bind:value={config.avatar.size} 
                      on:input={renderClientCanvas}
                    />
                  </div>
                </div>

                <div class="grid-2">
                  <div class="form-group">
                    <label for={`av_x_${type}`}>Position Horizontale X ({config.avatar.x || 450}px)</label>
                    <input 
                      type="range" 
                      id={`av_x_${type}`} 
                      min="100" 
                      max="800" 
                      step="5" 
                      bind:value={config.avatar.x} 
                      on:input={renderClientCanvas}
                    />
                    <div style="display:flex; gap:4px; margin-top:4px;">
                      <button type="button" class="btn-micro" on:click={() => { config.avatar.x = 200; renderClientCanvas(); }}>Gauche</button>
                      <button type="button" class="btn-micro" on:click={() => { config.avatar.x = 450; renderClientCanvas(); }}>Centre</button>
                      <button type="button" class="btn-micro" on:click={() => { config.avatar.x = 700; renderClientCanvas(); }}>Droite</button>
                    </div>
                  </div>

                  <div class="form-group">
                    <label for={`av_y_${type}`}>Position Verticale Y ({config.avatar.y || 135}px)</label>
                    <input 
                      type="range" 
                      id={`av_y_${type}`} 
                      min="70" 
                      max="330" 
                      step="5" 
                      bind:value={config.avatar.y} 
                      on:input={renderClientCanvas}
                    />
                  </div>
                </div>

                <div class="grid-2">
                  <div class="form-group">
                    <label for={`av_bcolor_${type}`}>Bordure de l'Avatar</label>
                    <div style="display:flex; gap: 0.5rem; align-items:center;">
                      <input 
                        type="color" 
                        id={`av_bcolor_${type}`} 
                        class="color-picker-square"
                        bind:value={config.avatar.borderColor} 
                        on:input={renderClientCanvas}
                      />
                      <input 
                        type="text" 
                        bind:value={config.avatar.borderColor} 
                        on:input={renderClientCanvas}
                        style="max-width: 120px;"
                      />
                    </div>
                  </div>

                  <div class="form-group">
                    <label for={`av_glow_${type}`}>Halo / Lueur</label>
                    <Toggle 
                      id={`av_glow_${type}`} 
                      label="Halo lumineux néon" 
                      bind:checked={config.avatar.glow}
                      on:change={renderClientCanvas}
                    />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- TAB 4: TEXTS & VARIABLES -->
          {#if activeTab === 'texts'}
            <div class="tab-pane">
              <!-- Horizontal Layer Pills -->
              <div class="layers-header-row">
                <div class="layers-pills">
                  {#each (config.texts || []) as t, idx}
                    <button 
                      type="button" 
                      class="layer-chip {selectedTextIndex === idx ? 'active' : ''}" 
                      on:click={() => (selectedTextIndex = idx)}
                    >
                      {t.text ? t.text.substring(0, 14) + (t.text.length > 14 ? '…' : '') : `Texte #${idx + 1}`}
                    </button>
                  {/each}
                </div>

                <button type="button" class="btn btn-secondary btn-sm" on:click={addTextLayer}>
                  <Plus size={14} /> Ajouter un Texte
                </button>
              </div>

              <!-- Selected Layer Controls -->
              {#if config.texts && config.texts[selectedTextIndex]}
                {@const cur = config.texts[selectedTextIndex]}
                <div class="layer-editor-area">
                  <div class="layer-title-row">
                    <span class="layer-active-badge">CALQUE #{selectedTextIndex + 1}</span>
                    {#if config.texts.length > 1}
                      <button 
                        type="button" 
                        class="btn-text-danger" 
                        on:click={() => removeTextLayer(selectedTextIndex)}
                        title="Supprimer ce calque"
                      >
                        <Trash2 size={13} /> Supprimer le calque
                      </button>
                    {/if}
                  </div>

                  <!-- Text Input -->
                  <div class="form-group">
                    <label for={`text_content_${type}`}>Texte affiché</label>
                    <input 
                      type="text" 
                      id={`text_content_${type}`} 
                      bind:value={cur.text} 
                      on:input={renderClientCanvas}
                      placeholder={"Ex: BIENVENUE {user}"}
                    />
                  </div>

                  <!-- Variable Chips -->
                  <div class="var-chips-wrap">
                    <span class="var-title">Variables disponibles (cliquez pour insérer) :</span>
                    <div class="var-chips-list">
                      {#each availableVariables as v}
                        <button 
                          type="button" 
                          class="var-chip-btn" 
                          on:click={() => insertVariable(v.tag)}
                          title={v.desc}
                        >
                          {v.tag}
                        </button>
                      {/each}
                    </div>
                  </div>

                  <!-- Typography Settings -->
                  <div class="grid-2">
                    <div class="form-group">
                      <label for={`t_font_${type}`}>Police</label>
                      <select id={`t_font_${type}`} bind:value={cur.fontFamily} on:change={renderClientCanvas}>
                        {#each fontFamilies as f}
                          <option value={f.value}>{f.label}</option>
                        {/each}
                      </select>
                    </div>

                    <div class="form-group">
                      <label for={`t_size_${type}`}>Taille ({cur.fontSize || 24}px)</label>
                      <input 
                        type="range" 
                        id={`t_size_${type}`} 
                        min="12" 
                        max="72" 
                        step="1" 
                        bind:value={cur.fontSize} 
                        on:input={renderClientCanvas}
                      />
                    </div>
                  </div>

                  <div class="grid-2">
                    <div class="form-group">
                      <label for={`t_color_${type}`}>Couleur du Texte</label>
                      <div style="display:flex; gap: 0.5rem; align-items:center;">
                        <input 
                          type="color" 
                          id={`t_color_${type}`} 
                          class="color-picker-square"
                          bind:value={cur.color} 
                          on:input={renderClientCanvas}
                        />
                        <input 
                          type="text" 
                          bind:value={cur.color} 
                          on:input={renderClientCanvas}
                          style="max-width: 120px;"
                        />
                      </div>
                    </div>

                    <div class="form-group">
                      <label for={`t_y_${type}`}>Position Verticale Y ({cur.y || 250}px)</label>
                      <input 
                        type="range" 
                        id={`t_y_${type}`} 
                        min="30" 
                        max="390" 
                        step="5" 
                        bind:value={cur.y} 
                        on:input={renderClientCanvas}
                      />
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Test Send Modal -->
<Modal bind:open={showTestModal} title="Tester l'envoi de la carte sur Discord">
  <div style="padding: 0.5rem 0;">
    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
      Sélectionnez le salon textuel dans lequel envoyer un rendu réel de la carte.
    </p>

    <div class="form-group">
      <label for={`test_channel_${type}`}>Salon textuel de test</label>
      <select id={`test_channel_${type}`} bind:value={selectedTestChannelId}>
        {#each textChannels as ch}
          <option value={ch.id}># {ch.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (showTestModal = false)}>
      Annuler
    </button>
    <button type="button" class="btn btn-primary" on:click={handleSendTest} disabled={isTesting || !selectedTestChannelId}>
      <Send size={15} />
      <span>{isTesting ? 'Envoi en cours...' : 'Envoyer la carte de test'}</span>
    </button>
  </svelte:fragment>
</Modal>

<style>
  .card-editor-wrapper {
    margin-top: 1rem;
    width: 100%;
  }

  /* 1. Flat Callout Hero (When Inactive) */
  .flat-callout-hero {
    background: rgba(239, 73, 11, 0.05);
    border: 1px dashed rgba(239, 73, 11, 0.3);
    border-radius: var(--radius-md);
    padding: 1rem 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    transition: all 0.2s ease;
  }

  .flat-callout-hero:hover {
    border-color: var(--primary);
    background: rgba(239, 73, 11, 0.08);
  }

  .hero-left {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .hero-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(239, 73, 11, 0.15);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hero-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #ffffff;
    display: block;
  }

  .hero-sub {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0.15rem 0 0 0;
  }

  /* 2. Top Bar (When Active) */
  .studio-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: 0.85rem;
    flex-wrap: wrap;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .badge-active {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.35);
    color: #10b981;
    text-transform: uppercase;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  /* 3. Side-by-Side Studio Layout */
  .studio-split-layout {
    display: grid;
    grid-template-columns: minmax(340px, 1fr) minmax(320px, 1fr);
    gap: 1.25rem;
    align-items: start;
    margin-top: 0.75rem;
  }

  @media (max-width: 1024px) {
    .studio-split-layout {
      grid-template-columns: 1fr;
    }
  }

  /* Left Column: Sticky Preview */
  .studio-left-column {
    display: flex;
    flex-direction: column;
  }

  .sticky-preview-box {
    position: sticky;
    top: 85px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preview-badge-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.78rem;
  }

  .preview-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--primary);
    font-weight: 700;
  }

  .btn-reset {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-reset:hover {
    color: var(--text-primary);
  }

  .canvas-box {
    width: 100%;
    background: #090a0f;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .canvas-box canvas {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 900 / 400;
  }

  .delivery-options-box {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.75rem 0.85rem;
  }

  .delivery-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.35rem;
    display: block;
  }

  .delivery-select {
    width: 100%;
    padding: 0.4rem 0.65rem;
    font-size: 0.82rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
  }

  .delivery-hint {
    margin-top: 0.5rem;
    font-size: 0.76rem;
    color: var(--text-secondary);
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    line-height: 1.35;
  }

  :global(.hint-icon) {
    color: var(--primary);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .preview-action-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  /* Right Column: Flat Tab Controls */
  .studio-right-column {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1rem;
  }

  .flat-tab-nav {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .flat-nav-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.35rem 0.65rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
  }

  .flat-nav-btn:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
  }

  .flat-nav-btn.active {
    background: var(--primary-subtle);
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 700;
  }

  .tab-pane {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tab-intro {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0 0 0.5rem 0;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.5rem;
  }

  .preset-card {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.45rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .preset-card:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.05);
  }

  .preset-stripe {
    height: 12px;
    border-radius: 3px;
    margin-bottom: 4px;
  }

  .preset-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-primary);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section-divider {
    height: 1px;
    background: var(--border);
    margin: 0.5rem 0;
  }

  .color-picker-square {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
  }

  .btn-micro {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 3px;
    cursor: pointer;
  }

  .btn-micro:hover {
    color: var(--text-primary);
    border-color: var(--text-muted);
  }

  .layers-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .layers-pills {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .layer-chip {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    padding: 0.25rem 0.55rem;
    border-radius: var(--radius-full);
    font-size: 0.74rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .layer-chip.active {
    background: var(--primary-subtle);
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 700;
  }

  .layer-editor-area {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding-top: 0.5rem;
  }

  .layer-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .layer-active-badge {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: 0.5px;
  }

  .btn-text-danger {
    background: transparent;
    border: none;
    color: #ef4444;
    font-size: 0.74rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .btn-text-danger:hover {
    color: #f87171;
  }

  .var-chips-wrap {
    margin: 0.2rem 0;
  }

  .var-title {
    font-size: 0.72rem;
    color: var(--text-muted);
    display: block;
    margin-bottom: 3px;
  }

  .var-chips-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .var-chip-btn {
    background: rgba(239, 73, 11, 0.1);
    border: 1px solid rgba(239, 73, 11, 0.3);
    color: #ff7f4d;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: monospace;
    cursor: pointer;
    transition: all 0.15s;
  }

  .var-chip-btn:hover {
    background: var(--primary);
    color: #ffffff;
  }
</style>