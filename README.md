<div align="center">
  <img src="docs/assets/logo.svg" alt="Pyro Bot Logo" width="60" />
  <h1>Pyro Discord Bot</h1>
  <p><strong>Bot Discord polyvalent tout-en-un avec Dashboard Web moderne en Svelte 5 & Analytics</strong></p>

  <p>
    <a href="https://skillfxx.github.io/pyro-discord-bot/"><img src="https://img.shields.io/badge/Documentation-GitHub%20Pages-EF490B?style=for-the-badge&logo=github" alt="Documentation" /></a>
    <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js" alt="Node.js" />
    <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord" alt="Discord.js" />
    <img src="https://img.shields.io/badge/Dashboard-Svelte%205-FF3E00?style=for-the-badge&logo=svelte" alt="Svelte 5" />
    <img src="https://img.shields.io/badge/Database-SQLite%20WAL-003B57?style=for-the-badge&logo=sqlite" alt="SQLite" />
  </p>
</div>

---

## 🌟 Présentation

**Pyro** est un bot Discord complet et moderne développé en **Node.js** et **Discord.js v14**, associé à une base de données **SQLite** ultra-rapide (mode WAL) et à un **tableau de bord web réactif** conçu en **Svelte 5** et **Vite**.

Il centralise tous les besoins d'un serveur communautaire ou professionnel : modération assistée, automodération, système de niveaux (XP), gestion de tickets par boutons, salons vocaux temporaires automatiques et logs d'audit exhaustifs.

👉 **[Consulter la documentation officielle en ligne](https://skillfxx.github.io/pyro-discord-bot/)**

---

## ✨ Fonctionnalités Principales

- 🛡️ **Modération & Sanctions Automatiques** : Avertissements (`/warn`), mutes temporaires (`/mute`), expulsions (`/kick`), bannissements (`/ban`) et escalade automatique configurable (ex: 3 warns = timeout, 5 = ban).
- 🤖 **Automodération Intelligente** : Détection anti-spam fréquentiel, doublons, blacklist/whitelist de mots et motifs Regex en temps réel sur les salons textuels et forums.
- 📋 **Logs & Audit Granulaire** : Routeur de logs permettant d'activer/désactiver sélectivement le traçage des événements Discord (rôles, salons, invitations, départs/arrivées, vocaux, messages édités/supprimés) et des actions du bot (tickets, sanctions, vocaux, boot).
- ⭐ **Système d'XP & Niveaux** : Gain d'XP paramétrable avec cooldown anti-spam, multiplicateurs par salon (ex: ×2 XP) et attribution de rôles récompenses (cumul ou remplacement).
- 🎫 **Support & Système de Tickets** : Salons de support privés créés via boutons interactifs avec gestion et modération pour l'équipe staff (`/ticketmod`).
- 🔊 **Vocaux Temporaires (Join-to-Create)** : Création automatique d'un salon vocal privé à la connexion et suppression instantanée dès qu'il est libéré.
- 🎨 **Dashboard Svelte & Personnalisation** : Interface web réactive en Svelte 5 (analytics Chart.js, prévisualisation en direct du statut du bot et branding des embeds Discord, persistance des sessions en SQLite).
- 🔒 **Sécurité Renforcée (Conforme CodeQL)** : Protection anti-CSRF (`lusca`), rate-limiting anti-bruteforce (`express-rate-limit`), sessions SQLite durcies et compatibilité reverse proxy (`trust proxy`).

---

## 🚀 Guide de Démarrage

### 1. Prérequis
- [Node.js](https://nodejs.org/) v20 ou version ultérieure (Recommandé : LTS v20 / v22)
- Une application sur le [Discord Developer Portal](https://discord.com/developers/applications) avec les **Privileged Gateway Intents** activés :
  - *Server Members Intent*
  - *Message Content Intent*

### 2. Installation & Compilation

```bash
# 1. Cloner le dépôt
git clone https://github.com/SkillFXX/pyro-discord-bot.git
cd pyro-discord-bot

# 2. Installer les dépendances
npm install

# 3. Compiler l'interface web (Svelte 5 / Vite)
npm run build
```

### 3. Configuration (.env)

Copiez le fichier d'exemple et renseignez vos informations :

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=votre_token_bot_discord
CLIENT_ID=votre_client_id_application
GUILD_ID=votre_id_serveur_discord
PORT=3000
SESSION_SECRET=cle_secrete_aleatoire_dashboard
COOKIE_SECURE=false
NODE_ENV=production
```

> [!NOTE]
> Sur un hébergement **Pelican / Pterodactyl**, la variable `SERVER_PORT` est automatiquement détectée et utilisée si `PORT` n'est pas spécifié.

### 4. Lancement

```bash
# Lancement standard (Production)
npm start

# Mode développement avec rechargement à chaud
npm run dev
```

Accédez au tableau de bord web sur : `http://localhost:3000` *(connectez-vous avec votre `DISCORD_TOKEN`)*.

---

## 💻 Commandes Slash Principales

| Commande | Catégorie | Description | Permission |
| :--- | :--- | :--- | :--- |
| `/niveau` | XP | Affiche votre niveau et progression en XP | Tous |
| `/topniveau` | XP | Classement des membres les plus actifs | Tous |
| `/adminxp` | XP | Gérer manuellement l'XP d'un membre | Administrateur |
| `/warn` | Modération | Avertit un utilisateur avec un motif | Modérateur |
| `/warns` | Modération | Historique des avertissements d'un membre | Modérateur |
| `/mute` | Modération | Exclusion temporaire (Timeout) personnalisée | Modérateur |
| `/kick` | Modération | Expulse un utilisateur du serveur | Modérateur |
| `/ban` | Modération | Bannit un utilisateur du serveur | Modérateur |
| `/sanctions` | Modération | Historique complet des sanctions d'un membre | Modérateur |
| `/ticketmod` | Support | Gérer les tickets (ajouter/retirer un membre ou ouvrir un ticket) | Rôle Staff |

---

## ☁️ Hébergement Recommandé : FlowHost

Pour maintenir votre bot Pyro en ligne 24h/24 sans interruption avec une excellente connectivité et des performances constantes, nous recommandons les offres cloud de **FlowHost** :

👉 **[Découvrir FlowHost (flowhost.dev)](https://flowhost.dev)**

---

## 📬 Contact & Support

Pour toute question, assistance ou demande de développement sur-mesure :

- ✉️ **Email** : [skillfx.dev@gmail.com](mailto:skillfx.dev@gmail.com)
- 💬 **Discord** : `@flowskill`
- 🌐 **Site & Documentation** : [https://skillfxx.github.io/pyro-discord-bot/](https://skillfxx.github.io/pyro-discord-bot/)

---

<div align="center">
  <sub>Développé avec passion par <strong>SkillFX</strong>.</sub>
</div>
