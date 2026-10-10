#!/bin/bash
# ==============================================================================
#                      PYRO DISCORD BOT - STARTUP SCRIPT
# ==============================================================================

# Se placer dans le répertoire du bot (/home/container sur Pterodactyl)
cd "/home/container" 2>/dev/null || cd "$(dirname "$0")"

echo "================================================="
echo "          PYRO DISCORD BOT - STARTUP             "
echo "================================================="
echo "Node.js version  : $(node -v 2>/dev/null || echo 'Non installé')"
echo "NPM version      : $(npm -v 2>/dev/null || echo 'Non installé')"
echo "Dossier de base  : $(pwd)"
echo "Date de démarrage: $(date)"
echo "================================================="

# Synchronisation du port Pterodactyl (SERVER_PORT -> PORT)
if [ -n "$SERVER_PORT" ] && [ -z "$PORT" ]; then
    export PORT="$SERVER_PORT"
fi

# Configuration de la sécurité Git pour éviter les erreurs d'ownership dans Docker
git config --global --add safe.directory /home/container 2>/dev/null || true
git config --global --add safe.directory "$(pwd)" 2>/dev/null || true

# Mise à jour automatique Git (si AUTO_UPDATE=1 ou AUTO_UPDATE=true)
if [ "${AUTO_UPDATE}" = "1" ] || [ "${AUTO_UPDATE}" = "true" ]; then
    if [ -d .git ]; then
        echo "[Pyro Update] Vérification des mises à jour Git..."
        TARGET_BRANCH="${BRANCH:-main}"
        git fetch origin "${TARGET_BRANCH}" 2>/dev/null || true
        
        LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "local")
        REMOTE_COMMIT=$(git rev-parse "origin/${TARGET_BRANCH}" 2>/dev/null || echo "remote")

        if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ] && [ "$REMOTE_COMMIT" != "remote" ]; then
            echo "[Pyro Update] Nouvelle version détectée ($LOCAL_COMMIT -> $REMOTE_COMMIT) !"
            echo "[Pyro Update] Application de la mise à jour..."
            git reset --hard "origin/${TARGET_BRANCH}"
            
            echo "[Pyro Update] Installation des nouvelles dépendances..."
            npm install --no-audit --no-fund
            
            echo "[Pyro Update] Recompilation du Dashboard Web..."
            npm run build
            echo "[Pyro Update] Mise à jour terminée avec succès !"
        else
            echo "[Pyro Update] Le bot est déjà à jour (commit: ${LOCAL_COMMIT:0:7})."
        fi
    else
        echo "[Pyro Update] Aucun dépôt .git détecté, mise à jour ignorée."
    fi
fi

# Vérification des modules Node.js
if [ ! -d "node_modules" ] || [ ! -f "node_modules/discord.js/package.json" ]; then
    echo "[Pyro] Dépendances manquantes. Exécution de npm install..."
    npm install --no-audit --no-fund
fi

# Vérification de la compilation du Dashboard Web
if [ ! -d "src/web/dist" ] || [ ! -f "src/web/dist/index.html" ]; then
    echo "[Pyro] Dashboard Web non compilé. Exécution de npm run build..."
    npm run build
fi

# Génération / Synchronisation du fichier .env si absent
if [ ! -f .env ]; then
    echo "[Pyro] Fichier .env absent, initialisation automatique..."
    cat << ENVEOF > .env
DISCORD_TOKEN=${DISCORD_TOKEN}
CLIENT_ID=${CLIENT_ID}
GUILD_ID=${GUILD_ID}
DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}
DISCORD_REDIRECT_URI=${DISCORD_REDIRECT_URI}
PORT=${PORT:-${SERVER_PORT:-3000}}
SESSION_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)
COOKIE_SECURE=${COOKIE_SECURE:-0}
NODE_ENV=production
ENVEOF
fi

echo "================================================="
echo "[Pyro] Lancement du bot Pyro..."
echo "================================================="

# Remplacement du processus shell par Node.js pour transmettre proprement les signaux Pterodactyl (SIGINT / SIGTERM)
exec node src/index.js

