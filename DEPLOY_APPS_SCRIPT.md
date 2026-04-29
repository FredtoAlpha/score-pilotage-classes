# Deploiement Google Apps Script avec clasp

Ce depot peut pousser automatiquement le code vers un projet Google Apps Script avec `clasp`.

## Point de prudence

`clasp push --force` remplace le contenu complet du projet Apps Script cible. Utiliser d'abord un Google Sheet de test duplique, pas le fichier de production.

## Configuration locale rapide

1. Activer l'API Apps Script : https://script.google.com/home/usersettings
2. Installer clasp :

```powershell
npm install -g @google/clasp
```

3. Se connecter :

```powershell
clasp login
```

4. Creer le fichier local `.clasp.json` a la racine du depot :

```json
{
  "scriptId": "TON_SCRIPT_ID",
  "rootDir": "."
}
```

5. Pousser vers le projet Apps Script de test :

```powershell
clasp push --force
```

6. Recharger le Google Sheet, puis tester le menu :

```text
PILOTAGE CLASSE > Assistant Import Pronote
```

## Pont GitHub Actions vers Apps Script

Le workflow `.github/workflows/deploy-apps-script.yml` pousse automatiquement vers Apps Script quand `main` change, a condition de configurer les secrets GitHub.

Dans GitHub :

```text
Settings > Secrets and variables > Actions > New repository secret
```

Creer ces deux secrets :

- `APPS_SCRIPT_ID` : l'identifiant du projet Apps Script cible.
- `CLASPRC_JSON` : le contenu complet du fichier `.clasprc.json` cree par `clasp login`.

Emplacement habituel du fichier `.clasprc.json` sous Windows :

```text
C:\Users\TON_UTILISATEUR\.clasprc.json
```

Apres ajout des secrets, le workflow peut etre lance manuellement depuis l'onglet Actions, ou automatiquement lors d'un push sur `main`.
