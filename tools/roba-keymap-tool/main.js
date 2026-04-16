// Electron メインプロセス
const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GitHubService = require('./src/github-service');
const FlashService = require('./src/flash-service');
const GitService = require('./src/git-service');
const { parseKeymap, generateKeymap } = require('./src/keymap-parser');

let REPO_ROOT;
const checkDirs = [];

if (process.env.PORTABLE_EXECUTABLE_DIR) {
  checkDirs.push(
    process.env.PORTABLE_EXECUTABLE_DIR,
    path.resolve(process.env.PORTABLE_EXECUTABLE_DIR, '../..'),
    path.resolve(process.env.PORTABLE_EXECUTABLE_DIR, '../../..')
  );
} else if (app.isPackaged) {
  const exePath = path.dirname(app.getPath('exe'));
  checkDirs.push(
    exePath,
    path.resolve(exePath, '../..'),
    path.resolve(exePath, '../../..')
  );
} else {
  checkDirs.push(path.resolve(__dirname, '../..'));
}

REPO_ROOT = checkDirs.find(dir => fs.existsSync(path.join(dir, 'config', 'roBa.keymap'))) || checkDirs[checkDirs.length - 1];

const KEYMAP_PATH = path.join(REPO_ROOT, 'config', 'roBa.keymap');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DOWNLOAD_DIR = path.join(app.getPath('temp'), 'roba-keymap-tool');

let mainWindow;
let flashService = new FlashService();
let githubService = null;
let gitService = new GitService(REPO_ROOT);

// --- 設定の読み書き ---
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    githubToken: '',
    owner: '',
    repo: '',
    ref: 'main',
  };
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

// --- ウィンドウ作成 ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f0f1a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f0f1a',
      symbolColor: '#a0a0c0',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile('src/renderer/index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ========== IPC ハンドラー ==========

// --- キーマップ読み込み ---
ipcMain.handle('keymap:load', async () => {
  const content = fs.readFileSync(KEYMAP_PATH, 'utf8');
  const parsed = parseKeymap(content);
  return { content, parsed };
});

// --- キーマップ保存 ---
ipcMain.handle('keymap:save', async (event, keymapData) => {
  const originalContent = fs.readFileSync(KEYMAP_PATH, 'utf8');
  const newContent = generateKeymap(originalContent, keymapData);
  fs.writeFileSync(KEYMAP_PATH, newContent, 'utf8');
  return { success: true };
});

// --- 設定読み込み ---
ipcMain.handle('settings:load', async () => {
  const settings = loadSettings();
  // リモート情報を自動取得
  const remoteInfo = gitService.getRemoteInfo();
  if (remoteInfo && !settings.owner) {
    settings.owner = remoteInfo.owner;
    settings.repo = remoteInfo.repo;
  }
  return settings;
});

// --- 設定保存 ---
ipcMain.handle('settings:save', async (event, settings) => {
  saveSettings(settings);
  // サービスを再初期化
  githubService = new GitHubService(settings.githubToken, settings.owner, settings.repo);
  return { success: true };
});

// --- PAT 検証 ---
ipcMain.handle('settings:validateToken', async (event, { token, owner, repo }) => {
  const svc = new GitHubService(token, owner, repo);
  return await svc.validateToken();
});

// -----------------------------------------------
// ビルド & フラッシュ ワークフロー
// -----------------------------------------------

ipcMain.handle('build:start', async (event, { commitMessage }) => {
  const settings = loadSettings();
  if (!settings.githubToken) {
    return { success: false, error: 'GitHub Token が設定されていません' };
  }

  githubService = new GitHubService(settings.githubToken, settings.owner, settings.repo);

  const send = (type, data) => {
    mainWindow?.webContents.send('build:progress', { type, ...data });
  };

  try {
    // 1. git commit & push
    send('git', { message: 'キーマップを GitHub にプッシュ中...' });
    const gitResult = await gitService.commitAndPush(commitMessage || 'キーマップを更新');

    if (!gitResult.changed) {
      send('git', { message: '変更がありません' });
    } else {
      send('git', { message: `プッシュ完了 (${gitResult.branch})` });
    }

    // 2. GitHub Actions トリガー
    send('trigger', { message: 'GitHub Actions ビルドをトリガー中...' });
    const triggerTime = await githubService.triggerBuild(settings.ref || 'main');

    // 3. ランID取得
    send('trigger', { message: 'ビルドジョブを確認中...' });
    const runId = await githubService.getLatestRunId(triggerTime);
    send('trigger', { message: `ビルド開始 (Run #${runId})` });

    // 4. ビルド完了待機
    const conclusion = await githubService.waitForBuild(runId, ({ status, durationSec }) => {
      send('building', { message: `ビルド中... ${durationSec}秒経過`, status, durationSec });
    });

    if (conclusion !== 'success') {
      throw new Error(`ビルド失敗: ${conclusion}`);
    }

    send('building', { message: 'ビルド成功 ✓' });

    // 5. アーティファクトダウンロード
    send('download', { message: 'UF2 ファイルをダウンロード中...' });
    const artifacts = await githubService.listArtifacts(runId);

    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    let allUf2Files = [];

    for (const artifact of artifacts) {
      if (artifact.name.includes('settings_reset')) continue;
      send('download', { message: `${artifact.name} をダウンロード中...` });
      const { uf2Files } = await githubService.downloadArtifact(artifact.id, path.join(DOWNLOAD_DIR, artifact.name));
      allUf2Files.push(...uf2Files);
    }

    if (allUf2Files.length === 0) {
      throw new Error('UF2 ファイルが見つかりませんでした');
    }

    send('download', { message: `${allUf2Files.length} 個の UF2 ファイルを取得` });

    // 6. フラッシュフェーズへ
    send('flash_ready', {
      message: 'フラッシュ準備完了',
      uf2Files: allUf2Files,
    });

    return { success: true, uf2Files: allUf2Files };

  } catch (e) {
    send('error', { message: `エラー: ${e.message}` });
    return { success: false, error: e.message };
  }
});

// --- フラッシュ実行 ---
ipcMain.handle('flash:start', async (event, { uf2Files }) => {
  const send = (data) => {
    mainWindow?.webContents.send('flash:progress', data);
  };

  try {
    await flashService.flashBothSides(uf2Files, (status) => {
      send(status);
    });

    // 完了通知
    if (Notification.isSupported()) {
      new Notification({
        title: 'roBa キーマップ更新完了',
        body: '左右両方のフラッシュが完了しました！',
      }).show();
    }

    send({ phase: 'all_done', message: '🎉 全フラッシュ完了！' });
    return { success: true };

  } catch (e) {
    send({ phase: 'error', message: e.message });
    return { success: false, error: e.message };
  }
});

// --- Windowsエクスプローラーで開く ---
ipcMain.handle('shell:openPath', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// --- アプリ情報 ---
ipcMain.handle('app:getInfo', async () => {
  return {
    version: app.getVersion(),
    repoPath: REPO_ROOT,
    keymapPath: KEYMAP_PATH,
  };
});
