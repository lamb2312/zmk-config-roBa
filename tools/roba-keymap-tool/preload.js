// Preload スクリプト
// IPC ブリッジ: Renderer から Main の機能を安全に呼び出す

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roba', {
  // --- キーマップ ---
  loadKeymap: () => ipcRenderer.invoke('keymap:load'),
  saveKeymap: (keymapData) => ipcRenderer.invoke('keymap:save', keymapData),

  // --- 設定 ---
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  validateToken: (token, owner, repo) => ipcRenderer.invoke('settings:validateToken', { token, owner, repo }),

  // --- ビルド ---
  startBuild: (commitMessage) => ipcRenderer.invoke('build:start', { commitMessage }),
  onBuildProgress: (callback) => {
    ipcRenderer.on('build:progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('build:progress');
  },

  // --- フラッシュ ---
  startFlash: (uf2Files) => ipcRenderer.invoke('flash:start', { uf2Files }),
  onFlashProgress: (callback) => {
    ipcRenderer.on('flash:progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('flash:progress');
  },

  // --- ユーティリティ ---
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
});
