import { writable } from 'svelte/store';
import { checkAuth } from './auth';
import { loadDashboardData } from './data';

export const preloader = writable({
  loading: true,
});

/**
 * Bootstrap de l'application :
 * - Attente naturelle du chargement des polices via l'API standard document.fonts.ready
 * - Vérification de session et pré-chargement des données Discord
 */
export async function bootstrapApplication() {
  preloader.set({ loading: true });

  try {
    // 1. Polices : attente native de l'API standard du navigateur (sans définir de noms en dur)
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }

    // 2. Données : authentification puis chargement des données Discord
    const isAuth = await checkAuth();
    if (isAuth) {
      await loadDashboardData();
    }
  } catch (error) {
    console.error('[Bootstrap] Erreur lors du chargement initial :', error);
  } finally {
    preloader.set({ loading: false });
  }
}
