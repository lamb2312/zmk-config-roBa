const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { app, BrowserWindow, ipcMain } = require('electron');

// Run with node; the child runs the real Electron renderer in a hidden window.
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
  process.exit(child.status ?? 1);
} else {
  const fs = require('node:fs');
  const os = require('node:os');
  const assert = require('node:assert/strict');
  const base = path.resolve(__dirname, '..');
  const { parseKeymap } = require('../src/keymap-parser');
  const source = fs.readFileSync(path.resolve(base, '../../config/roBa.keymap'), 'utf8');
  ipcMain.handle('settings:load', () => ({}));
  ipcMain.handle('keymap:load', () => ({ content: source, parsed: parseKeymap(source) }));
  ipcMain.handle('app:getInfo', () => ({ version: 'smoke', repoPath: base }));
  app.disableHardwareAcceleration();
  const timeout = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 30000);
  app.whenReady().then(async () => {
    const errors = [];
    const win = new BrowserWindow({ show: false, width: 1280, height: 960,
      webPreferences: { preload: path.join(base, 'preload.js'), contextIsolation: true, nodeIntegration: false,
        offscreen: true, backgroundThrottling: false } });
    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3 && !message.includes('net::')) errors.push(message);
    });
    try {
      await win.loadFile(path.join(base, 'src/renderer/index.html'));
      await win.webContents.executeJavaScript(`switchView('runtime')`);
      const result = await win.webContents.executeJavaScript(`({
        title: document.querySelector('#view-runtime h1').textContent,
        serial: typeof navigator.serial?.requestPort,
        disabled: document.getElementById('rt-controls').disabled,
        layers: document.querySelectorAll('.layer-btn').length,
        overflow: document.documentElement.scrollWidth > innerWidth
      })`);
      assert.equal(result.title, '本体の設定');
      assert.equal(result.serial, 'function');
      assert.equal(result.disabled, true);
      assert.equal(result.layers, 7);
      assert.equal(result.overflow, false);
      // Use the same simulated device as the wire tests to render the connected UI.
      const esbuild = require('esbuild');
      const bundle = esbuild.buildSync({ entryPoints: [path.join(base, 'test/fake-device.js')],
        bundle: true, platform: 'browser', format: 'iife', globalName: 'SmokeDevice', write: false });
      await win.webContents.executeJavaScript(bundle.outputFiles[0].text);
      await win.webContents.executeJavaScript(`
        window.smokePort = new SmokeDevice.FakeDevicePort();
        RobaRuntime.mount(document.getElementById('view-runtime'), { serial: { requestPort: async () => window.smokePort } });
        document.getElementById('rt-connect').click();
      `);
      await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          if (!document.getElementById('rt-controls').disabled) resolve();
          else if (Date.now() - started > 5000) reject(new Error(document.getElementById('rt-status').textContent));
          else setTimeout(poll, 20);
        }; poll();
      })`);
      await win.webContents.executeJavaScript(`switchView('runtime'); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#view-runtime.active') !== null`), true);
      await new Promise(resolve => setTimeout(resolve, 200));
      const output = path.join(os.tmpdir(), 'roba-runtime-integration', 'runtime-screen.png');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, (await win.webContents.capturePage()).toPNG());
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ ...result, screenshot: output, errors }));
      clearTimeout(timeout); app.exit(0);
    } catch (error) {
      console.error(error); clearTimeout(timeout); app.exit(1);
    }
  });
}
