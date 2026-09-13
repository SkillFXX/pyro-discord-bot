<script>
  import { Shield, KeyRound, ArrowRight } from '@lucide/svelte';
  import { auth, login } from '../stores/auth';
  import { bootstrapApplication } from '../stores/preloader';

  let token = '';
  let errorMsg = '';
  let submitting = false;

  async function handleSubmit() {
    if (!token) return;
    submitting = true;
    errorMsg = '';

    const res = await login(token);
    if (res.success) {
      await bootstrapApplication();
    } else {
      errorMsg = res.error || 'Token invalide. Veuillez réessayer.';
    }
    submitting = false;
  }
</script>

<div class="login-container">
  <div class="login-card">
    <div class="login-brand">
      <img src="/icon.svg" alt="Pyro" class="login-logo" on:error={(e) => (e.currentTarget.style.display = 'none')} />
      <h1>Pyro Bot</h1>
      <p>Panneau d'Administration & Gestion</p>
    </div>

    {#if errorMsg}
      <div class="login-error">
        <span>⚠️ {errorMsg}</span>
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <div class="form-group" style="text-align: left;">
        <label for="login_token">
          <KeyRound size={14} style="vertical-align: middle; margin-right: 4px;" />
          Token du Bot Discord
        </label>
        <input
          id="login_token"
          type="password"
          bind:value={token}
          placeholder="Entrez le jeton secret..."
          required
        />
        <small style="color: var(--text-muted); font-size: 0.78rem; margin-top: 0.35rem; display: block;">
          Pour des raisons de sécurité, l'accès est authentifié par le token Discord configuré dans le fichier d'environnement.
        </small>
      </div>

      <button type="submit" class="btn btn-primary" disabled={submitting || !token} style="width: 100%; margin-top: 1rem; padding: 0.75rem;">
        {#if submitting}
          <span>Vérification...</span>
        {:else}
          <span>Se connecter</span>
          <ArrowRight size={16} style="vertical-align: middle; margin-left: 6px;" />
        {/if}
      </button>
    </form>
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
    padding: 2.5rem;
    width: 100%;
    max-width: 440px;
    text-align: center;
  }

  .login-brand {
    margin-bottom: 2rem;
  }

  .login-logo {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    margin-bottom: 0.8rem;
  }

  .login-brand h1 {
    font-family: var(--font-title);
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }

  .login-brand p {
    font-family: var(--font-body);
    font-weight: 400;
    margin: 0.3rem 0 0 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .login-error {
    background: var(--danger-subtle);
    border: 1px solid var(--danger-border);
    color: var(--danger);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    margin-bottom: 1.25rem;
    text-align: left;
  }
</style>
