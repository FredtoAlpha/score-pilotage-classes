/**
 * ===================================================================
 * GITHUBUPDATER.JS
 * ===================================================================
 *
 * Auto-mise a jour du projet Apps Script depuis GitHub, sans clasp.
 *
 * Principe:
 * - lit le depot GitHub public;
 * - transforme les fichiers .js/.html/appsscript.json au format Apps Script API;
 * - appelle projects.updateContent sur le projet courant;
 * - remplace le contenu complet du projet Apps Script.
 *
 * Pre-requis Google:
 * - activer l'API Apps Script dans les parametres Apps Script;
 * - autoriser les scopes script.projects et script.external_request.
 */

var GITHUB_UPDATER_CONFIG = {
  owner: 'FredtoAlpha',
  repo: 'score-pilotage-classes',
  branch: 'main',
  maxFiles: 160
};

function testerMiseAJourDepuisGitHub() {
  try {
    var summary = github_buildContentFromRepo_({ dryRun: true });
    SpreadsheetApp.getUi().alert(
      'Test GitHub OK',
      'Depot: ' + summary.repo + '\n' +
      'Branche: ' + summary.branch + '\n' +
      'Commit: ' + summary.commitSha + '\n' +
      'Fichiers Apps Script detectes: ' + summary.fileCount + '\n\n' +
      'Aucune ecriture n a ete faite.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return summary;
  } catch (e) {
    SpreadsheetApp.getUi().alert('Test GitHub impossible', e.message || e.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
    throw e;
  }
}

function mettreAJourDepuisGitHub() {
  var ui = SpreadsheetApp.getUi();
  var preview = github_buildContentFromRepo_({ dryRun: true });

  var answer = ui.alert(
    'Mise a jour depuis GitHub',
    'Cette action va remplacer le contenu complet de ce projet Apps Script par le depot GitHub.\n\n' +
    'Depot: ' + preview.repo + '\n' +
    'Branche: ' + preview.branch + '\n' +
    'Commit: ' + preview.commitSha + '\n' +
    'Fichiers Apps Script: ' + preview.fileCount + '\n\n' +
    'Continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) {
    return { success: false, cancelled: true };
  }

  var result = github_applyContentToCurrentScript_(preview);
  ui.alert(
    'Mise a jour terminee',
    'Le projet Apps Script a ete remplace par GitHub.\n\n' +
    'Commit: ' + result.commitSha + '\n' +
    'Fichiers envoyes: ' + result.fileCount + '\n\n' +
    'Recharge maintenant le Google Sheet pour voir le menu actualise.',
    ui.ButtonSet.OK
  );

  return result;
}

function github_buildContentFromRepo_(options) {
  options = options || {};

  var cfg = GITHUB_UPDATER_CONFIG;
  var repoLabel = cfg.owner + '/' + cfg.repo;
  var headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'score-pilotage-classes-apps-script-updater'
  };

  var commitUrl = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/commits/' + encodeURIComponent(cfg.branch);
  var commit = github_fetchJson_(commitUrl, headers);
  var commitSha = commit && commit.sha ? commit.sha : cfg.branch;

  var treeUrl = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/git/trees/' + encodeURIComponent(commitSha) + '?recursive=1';
  var tree = github_fetchJson_(treeUrl, headers);
  var entries = (tree.tree || []).filter(function(entry) {
    return entry.type === 'blob' && github_shouldDeployPath_(entry.path);
  });

  if (entries.length === 0) {
    throw new Error('Aucun fichier Apps Script deployable trouve dans GitHub.');
  }

  if (entries.length > cfg.maxFiles) {
    throw new Error('Trop de fichiers a deployer (' + entries.length + '). Limite configuree: ' + cfg.maxFiles);
  }

  var requests = entries.map(function(entry) {
    return {
      url: github_rawUrl_(cfg.owner, cfg.repo, commitSha, entry.path),
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'score-pilotage-classes-apps-script-updater'
      }
    };
  });

  var responses = UrlFetchApp.fetchAll(requests);
  var files = [];

  responses.forEach(function(response, index) {
    var code = response.getResponseCode();
    var path = entries[index].path;
    if (code < 200 || code >= 300) {
      throw new Error('Lecture GitHub impossible pour ' + path + ' (HTTP ' + code + ')');
    }
    files.push(github_toAppsScriptFile_(path, response.getContentText()));
  });

  var hasManifest = files.some(function(file) {
    return file.name === 'appsscript' && file.type === 'JSON';
  });

  if (!hasManifest) {
    throw new Error('appsscript.json est obligatoire dans le depot GitHub.');
  }

  return {
    success: true,
    dryRun: options.dryRun === true,
    repo: repoLabel,
    branch: cfg.branch,
    commitSha: commitSha,
    fileCount: files.length,
    files: files,
    paths: entries.map(function(entry) { return entry.path; })
  };
}

function github_applyContentToCurrentScript_(content) {
  var scriptId = ScriptApp.getScriptId();
  var url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/content';
  var response = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify({ files: content.files }),
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    }
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Echec Apps Script API updateContent (HTTP ' + code + '): ' + body);
  }

  return {
    success: true,
    scriptId: scriptId,
    commitSha: content.commitSha,
    fileCount: content.fileCount,
    responseCode: code
  };
}

function github_shouldDeployPath_(path) {
  if (!path) return false;
  if (path.indexOf('.github/') === 0) return false;
  if (path.indexOf('node_modules/') === 0) return false;
  if (path.indexOf('VERSION_CODEX_OPTIMISEE/') === 0) return false;
  if (path.indexOf('_github_check_score_pilotage_classes/') === 0) return false;
  if (/\.md$/i.test(path)) return false;
  if (/^package(-lock)?\.json$/i.test(path)) return false;
  if (/^\.clasp/i.test(path)) return false;
  if (/^\.gitignore$/i.test(path)) return false;

  return path === 'appsscript.json' || /\.js$/i.test(path) || /\.html$/i.test(path);
}

function github_toAppsScriptFile_(path, source) {
  if (path === 'appsscript.json') {
    return {
      name: 'appsscript',
      type: 'JSON',
      source: source
    };
  }

  if (/\.html$/i.test(path)) {
    return {
      name: path.replace(/\.html$/i, ''),
      type: 'HTML',
      source: source
    };
  }

  if (/\.js$/i.test(path)) {
    return {
      name: path.replace(/\.js$/i, ''),
      type: 'SERVER_JS',
      source: source
    };
  }

  throw new Error('Type de fichier non supporte: ' + path);
}

function github_rawUrl_(owner, repo, ref, path) {
  var encodedPath = path.split('/').map(function(part) {
    return encodeURIComponent(part);
  }).join('/');

  return 'https://raw.githubusercontent.com/' +
    encodeURIComponent(owner) + '/' +
    encodeURIComponent(repo) + '/' +
    encodeURIComponent(ref) + '/' +
    encodedPath;
}

function github_fetchJson_(url, headers) {
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: headers || {}
  });

  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('GitHub API HTTP ' + code + ': ' + text);
  }

  return JSON.parse(text);
}
