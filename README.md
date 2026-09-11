<div align="center">
  <img src="src/web/views/public/logo.png" alt="Pyro Bot Logo" width="100" style="border-radius: 16px;" />
  <h1>Pyro Discord Bot</h1>
  <p><strong>Bot Discord polyvalent tout-en-un avec Dashboard Web & Analytics en temps réel</strong></p>

  <p>
    <a href="https://skillfxx.github.io/pyro-discord-bot/"><img src="https://img.shields.io/badge/Documentation-GitHub%20Pages-FF6B35?style=for-the-badge&logo=github" alt="Documentation" /></a>
    <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js" alt="Node.js" />
    <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord" alt="Discord.js" />
  </p>
</div>

---

## 🌟 Présentation

**Pyro** est un bot Discord complet et moderne développé en **Node.js** et **Discord.js v14**, couplé à une base de données **SQLite** ultra-performante (mode WAL) et un **dashboard web interactif** (Express, HTMX, Chart.js).

👉 **[Accéder au site de présentation complet (GitHub Pages)](https://skillfxx.github.io/pyro-discord-bot/)**

---

## ✨ Fonctionnalités Principales

- 🛡️ **Modération Complète & Sanctions Automatiques** : Avertissements (`/warn`), exclusions temporaires (`/mute`), expulsions (`/kick`), bannissements (`/ban`), escalade automatique configurable (ex: 3 warns = timeout, 5 = ban).
- 🤖 **Automodération Modulaire** : Anti-spam fréquentiel, détection de doublons, blacklist/whitelist de mots, longueurs de messages, filtres Regex, compatible avec les forums.
- 📋 **Système de Logs & Audit Sur-Mesure** : Salon de logs dédié avec sélection granulaire des événements à router via le dashboard :
  - *Logs Pyro Bot* : Démarrage / Boot du bot (latence, stats système), Tickets (création/fermeture/membres), Sanctions & Warns, Vocaux temporaires Join-to-Create, Modération du Staff, XP & Level-up, Infractions Automod.
  - *Logs Serveur Discord (Couverture Intégrale)* : Création/Suppression/Modification de Rôles et Salons, Création & Expiration de Liens d'Invitation, Paramètres du Serveur (nom, icône, bannière, AFK), Arrivées & Départs de membres, Ajout de Bots & Intégrations, Changements de pseudo, Modifications de rôles de membres, Kicks, Bans & Débans, Mutes (Timeouts), Activité vocale, Messages supprimés & édités, Threads & Posts Forum, Émojis & Autocollants, Événements Planifiés, Webhooks.
- ⭐ **Système d'XP & Niveaux** : Gain d'XP paramétrable avec cooldown anti-spam, multiplicateurs par salon (ex: ×2 XP), attribution de rôles de récompenses avec cumul ou remplacement.
- 🎫 **Support & Système de Tickets** : Panneaux interactifs avec boutons Discord (`/ticketsetup`), gestion des salons privés et permissions du rôle Staff (`/ticketmod`).
- 🔊 **Salons Vocaux Temporaires (Join-to-Create)** : Création automatique de salon vocal lors de la connexion au canal créateur et suppression instantanée dès qu'il devient vide.
- 📊 **Dashboard Web & Analytics en Direct** : Suivi des statistiques (messages, temps vocal, heures de pointe, flux de membres), export CSV, et réglage de la configuration à chaud sans redémarrage.
- 🎨 **Personnalisation & Branding Complet** : Onglet dédié dans le Dashboard avec prévisualisation en direct : statut dynamique du bot (Joue à, Regarde, Écoute, Streame, Participe à), présence (En ligne, Inactif, DND), personnalisation intégrale des embeds (texte du footer, icône d'en-tête/pied de page, couleur d'accentuation principale).
- 🔒 **Sécurité Renforcée (Conforme CodeQL)** : Protection anti-CSRF intégrale (`lusca`), limitation de débit anti-bruteforce (`express-rate-limit`), cookies de session durcis et support reverse proxy (`trust proxy`).

---

## 🚀 Démarrage Rapide

### 1. Prérequis
- [Node.js](https://nodejs.org/) v18 ou version ultérieure
- Une application configurée sur le [Discord Developer Portal](https://discord.com/developers/applications) avec les **Privileged Gateway Intents** activés :
  - *Server Members Intent*
  - *Message Content Intent*

### 2. Installation

```bash
# Cloner le dépôt
git clone https://github.com/SkillFXX/pyro-discord-bot.git
cd pyro-discord-bot

# Installer les dépendances
npm install
```

### 3. Configuration (.env)

Copiez le fichier `.env.example` et remplissez vos identifiants :

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=votre_bot_token_ici
CLIENT_ID=votre_bot_client_id_ici
GUILD_ID=votre_serveur_guild_id_ici
PORT=3000
SESSION_SECRET=cle_secrete_aleatoire_pour_le_dashboard
COOKIE_SECURE=false
NODE_ENV=development
```

### 4. Lancement

```bash
# Mode production
npm start

# Mode développement (avec rechargement automatique)
npm run dev
```

Accédez au tableau de bord web sur : `http://localhost:3000` *(connectez-vous avec votre `DISCORD_TOKEN`)*.

---

## 💻 Commandes Principales

| Commande | Description | Permission |
| :--- | :--- | :--- |
| `/niveau` | Affiche votre niveau et progression en XP | Tous |
| `/topniveau` | Classement des membres les plus actifs | Tous |
| `/adminxp` | Gérer manuellement l'XP d'un membre | Admin |
| `/warn` | Avertit un membre avec un motif | Modérateur |
| `/warns` | Liste ou réinitialise les avertissements d'un membre | Modérateur |
| `/mute` | Exclusion temporaire (Timeout) d'un utilisateur | Modérateur |
| `/kick` | Expulse un utilisateur du serveur | Modérateur |
| `/ban` | Bannit un utilisateur du serveur | Modérateur |
| `/sanctions` | Historique complet des sanctions d'un utilisateur | Modérateur |
| `/ticketsetup`| Déploie le panneau interactif pour ouvrir des tickets | Admin |
| `/ticketmod` | Gérer un ticket ouvert (fermer, ajouter un membre) | Staff |
| `/analytics` | Résumé des statistiques du serveur dans Discord | Admin |

---

## ☁️ Hébergement Recommandé : FlowHost

Pour maintenir Pyro en ligne 24h/24 sans interruption avec une faible latence, une haute disponibilité et des performances optimales, nous recommandons **FlowHost** :

👉 **[Héberger simplement sur FlowHost (flowhost.dev)](https://flowhost.dev)**

---

## 📬 Contact & Support

Besoin d'aide, d'une assistance pour configurer Pyro ou d'un développement sur-mesure ?

- ✉️ **Email** : [skillfx.dev@gmail.com](mailto:skillfx.dev@gmail.com)
- 💬 **Discord** : `@flowskill`
- 🌐 **Documentation en ligne** : [https://skillfxx.github.io/pyro-discord-bot/](https://skillfxx.github.io/pyro-discord-bot/)

---

<div align="center">
  <sub>Développé avec ❤️ par <strong>SkillFX</strong>.</sub>
</div>

