# Walkthrough: Kids Podcast Generator

L'application est maintenant fonctionnelle et permet de générer des podcasts personnalisés pour enfants.

## Fonctionnalités implémentées

- **Gestion du contexte** : Un champ dédié pour stocker les détails sur l'environnement des enfants (enregistré dans `context.txt`).
- **Génération de script** : Intégration avec Gemini 2.0 Flash pour créer un dialogue entre deux hôtes (Sophie et Marc).
- **Synthèse vocale** : Utilisation de Google Cloud TTS (voix Neural2) pour transformer le script en audio.
- **Interface Streamlit** : Une interface simple et intuitive pour piloter la génération.

## Comment lancer l'application

1. Assurez-vous d'avoir configuré vos identifiants Google Cloud :
   ```bash
   gcloud auth application-default login
   ```
2. Exportez votre clé d'API Gemini :
   ```bash
   export GOOGLE_API_KEY="AIzaSyD897sROFibWoFKh_uvyoLYTyjHHuWG0Yg"
   ```
3. Lancez l'application :
   ```bash
   source venv/bin/activate
   streamlit run app.py
   ```

## Vérification effectuée

- [x] Installation des dépendances.
- [x] Création du module de génération (Gemini + TTS).
- [x] Création de l'interface Streamlit.
- [x] Connexion Frontend/Backend.
