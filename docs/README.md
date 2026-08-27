# 🎙️ Kids Podcast Studio - Progressive Web App (PWA)

Application web mobile-first 100% autonome (**Client-Side**), permettant de générer et d'écouter des podcasts éducatifs pour enfants directement depuis son smartphone (iPhone / Android) ou son ordinateur, **sans aucun serveur backend**.

---

## 🚀 Fonctionnalités Clés

* **Zéro Serveur / Zéro Cold Start** : Les requêtes vers Gemini (Script + Synthèse Vocale Multi-Speakers) sont effectuées directement par le navigateur.
* **10 Univers Prédéfinis** : *Nature, Animaux, Espace, Histoire, Sciences, Corps Humain, Géographie, Culture, Cuisine, Personnages*.
* **Âge Cible & Durée** : Ajustement de 3 à 12 ans et choix de la durée (3, 5, 7 ou 10 minutes).
* **Moteur Audio Intégré** : Décodage PCM 24kHz en conteneur WAV à la volée.
* **Lecteur Mobile Complet** : Accélération 1.25x/1.5x, saut +/-15s, waveform animée et lecture du dialogue avec mots d'anglais surlignés.
* **Partage & Export Natif** : Bouton de partage direct (`navigator.share`) pour envoyer le fichier dans WhatsApp, iMessage, AirDrop ou l'application *Fichiers*.
* **Persistance Locale & Mode Hors-ligne** : Clé API stockée dans le `localStorage` et épisodes conservés dans `IndexedDB` pour une écoute sans réseau.

---

## 📱 Tester en Local

Pour lancer l'application en local sur votre machine :

```bash
# Avec Python
python -m http.server 8000 --directory pwa

# Ou avec Node.js
npx serve pwa
```

Ouvrez ensuite votre navigateur sur **`http://localhost:8000`** (ou l'adresse IP locale de votre machine depuis votre smartphone connecté sur le même réseau WiFi).

---

## 📲 Installer sur son Smartphone (iOS & Android)

### Sur iPhone (Safari)
1. Ouvrez l'URL de votre PWA dans **Safari**.
2. Appuyez sur l'icône **Partager** (le carré avec la flèche vers le haut en bas de l'écran).
3. Faites défiler et appuyez sur **« Sur l'écran d'accueil »**.
4. L'application apparaît avec son icône dédiée et se lance en plein écran comme une application native.

### Sur Android (Chrome)
1. Ouvrez l'URL de votre PWA dans **Chrome**.
2. Appuyez sur le menu (les 3 points en haut à droite) ou sur la bannière d'installation.
3. Sélectionnez **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**.

---

## 🌐 Déploiement Gratuit (1-Click)

Comme l'application est composée de fichiers statiques (`index.html`, `js/`, `icons/`), vous pouvez l'héberger gratuitement en quelques secondes sur :

### Option 1 : GitHub Pages
1. Poussez le dossier `pwa` sur votre dépôt GitHub.
2. Dans les **Settings** de votre repo > **Pages**, choisissez la branche et sélectionnez le dossier `/pwa` (ou la racine).
3. Votre PWA est disponible en `https://<pseudo>.github.io/<repo>/`.

### Option 2 : Cloudflare Pages / Vercel / Netlify
1. Connectez votre dépôt Git à Cloudflare Pages ou Vercel.
2. Définissez le **Build Output Directory** sur `pwa`.
3. Cliquez sur **Deploy**. Le site est déployé avec SSL et CDN mondial instantanément.

---

## 🔒 Confidentialité & Clé API

* Votre clé API Google AI Studio est enregistrée **uniquement dans le stockage local de votre propre navigateur** (`localStorage`).
* Aucune donnée ni clé API ne transite par un serveur tiers ; tous les appels sont chiffrés directement entre votre appareil et les serveurs de Google Gemini API.
