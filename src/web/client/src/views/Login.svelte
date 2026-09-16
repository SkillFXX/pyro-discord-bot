<script>
  import { onMount } from 'svelte';
  import { auth } from '../stores/auth';
  import { ShieldAlert, AlertCircle } from '@lucide/svelte';

  let errorMsg = '';

  const ERROR_MESSAGES = {
    insufficient_permissions: 'Accès refusé : vous devez posséder la permission Administrateur ou Voir les logs du serveur (View Audit Log) sur Discord.',
    not_in_guild: "Accès refusé : votre compte Discord n'est pas membre du serveur associé à ce bot.",
    access_denied: "Connexion annulée : vous avez refusé l'autorisation sur Discord.",
    oauth_not_configured: "Configuration incomplète : DISCORD_CLIENT_SECRET ou DISCORD_REDIRECT_URI n'est pas configuré dans le fichier .env.",
    invalid_state: "Session expirée ou requête invalide. Veuillez réessayer de vous connecter.",
    token_exchange_failed: "Impossible de valider le jeton auprès de Discord. Veuillez réessayer.",
    user_fetch_failed: "Échec de récupération de votre profil utilisateur Discord.",
    guild_not_found: "Le serveur Discord configuré pour le bot est introuvable ou inaccessible.",
    internal_error: "Une erreur interne s'est produite lors de la connexion."
  };

  onMount(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err && ERROR_MESSAGES[err]) {
        errorMsg = ERROR_MESSAGES[err];
      } else if (err) {
        errorMsg = 'Une erreur est survenue lors de la tentative de connexion.';
      }
    }
  });
</script>

<div class="login-container">
  <div class="login-card">
    <div class="login-brand">
      <img src="/icon.svg" alt="Pyro" class="login-logo" on:error={(e) => (e.currentTarget.style.display = 'none')} />
      <h1>Pyro Bot</h1>
    </div>

    {#if errorMsg}
      <div class="login-error">
        <ShieldAlert size={18} class="error-icon" />
        <span>{errorMsg}</span>
      </div>
    {/if}

    <div class="login-actions">
      {#if $auth.discordConfigured}
        <a href="/api/auth/discord" class="btn-discord">
          <svg class="discord-icon" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          <span>Se connecter avec Discord</span>
        </a>
      {:else}
        <div class="config-warning">
          <AlertCircle size={20} class="warning-icon" />
          <div class="warning-text">
            <strong>OAuth2 non configuré</strong>
            <p>Pour vous connecter, renseignez <code>DISCORD_CLIENT_SECRET</code> et <code>DISCORD_REDIRECT_URI</code> dans le fichier <code>.env</code>.</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: var(--bg-base);
  }

  .login-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 2.75rem 2.25rem;
    width: 100%;
    max-width: 440px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .login-brand {
    margin-bottom: 2rem;
  }

  .login-logo {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  .login-brand h1 {
    font-family: var(--font-title);
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }

  .login-error {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: var(--danger-subtle);
    border: 1px solid var(--danger-border);
    color: var(--danger);
    padding: 0.85rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    line-height: 1.45;
    margin-bottom: 1.5rem;
    text-align: left;
  }

  :global(.error-icon) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .login-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .btn-discord {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background-color: #5865F2;
    color: #ffffff;
    font-family: var(--font-body);
    font-size: 0.95rem;
    font-weight: 600;
    padding: 0.85rem 1.25rem;
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: background-color 0.15s ease;
    cursor: pointer;
  }

  .btn-discord:hover {
    background-color: #4752c4;
    color: #ffffff;
  }

  .discord-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .config-warning {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.25);
    color: #f59e0b;
    padding: 1rem;
    border-radius: var(--radius-sm);
    text-align: left;
    font-size: 0.85rem;
  }

  :global(.warning-icon) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .warning-text strong {
    display: block;
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
  }

  .warning-text p {
    margin: 0;
    color: var(--text-secondary);
  }

  .warning-text code {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    background: var(--surface-2);
    padding: 0.15rem 0.35rem;
    border-radius: var(--radius-xs);
  }
</style>
