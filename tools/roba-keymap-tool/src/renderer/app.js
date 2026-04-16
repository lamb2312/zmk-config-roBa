// roBa Keymap Tool — メイン SPA ロジック
'use strict';

// ============================================================
// roBa 物理レイアウト (roBa.dtsi から)
// 単位: 100 = 1U (スケール済み座標)
// ============================================================
const ROBA_LAYOUT = [
  // Row 0 (上段)          key_idx, x,    y,   w,   h,  rot
  { idx:  0, x:  0,  y: 37,  w: 100, h: 100, rot: 0 },
  { idx:  1, x:100,  y: 12,  w: 100, h: 100, rot: 0 },
  { idx:  2, x:200,  y:  0,  w: 100, h: 100, rot: 0 },
  { idx:  3, x:300,  y: 12,  w: 100, h: 100, rot: 0 },
  { idx:  4, x:400,  y: 24,  w: 100, h: 100, rot: 0 },
  { idx:  5, x:800,  y: 24,  w: 100, h: 100, rot: 0 },
  { idx:  6, x:900,  y: 12,  w: 100, h: 100, rot: 0 },
  { idx:  7, x:1000, y:  0,  w: 100, h: 100, rot: 0 },
  { idx:  8, x:1100, y: 12,  w: 100, h: 100, rot: 0 },
  { idx:  9, x:1200, y: 37,  w: 100, h: 100, rot: 0 },
  // Row 1 (中段)
  { idx: 10, x:  0,  y:137,  w: 100, h: 100, rot: 0 },
  { idx: 11, x:100,  y:112,  w: 100, h: 100, rot: 0 },
  { idx: 12, x:200,  y:100,  w: 100, h: 100, rot: 0 },
  { idx: 13, x:300,  y:112,  w: 100, h: 100, rot: 0 },
  { idx: 14, x:400,  y:124,  w: 100, h: 100, rot: 0 },
  { idx: 15, x:500,  y:137,  w: 100, h: 100, rot: 0 },
  { idx: 16, x:700,  y:137,  w: 100, h: 100, rot: 0 },
  { idx: 17, x:800,  y:124,  w: 100, h: 100, rot: 0 },
  { idx: 18, x:900,  y:112,  w: 100, h: 100, rot: 0 },
  { idx: 19, x:1000, y:100,  w: 100, h: 100, rot: 0 },
  { idx: 20, x:1100, y:112,  w: 100, h: 100, rot: 0 },
  { idx: 21, x:1200, y:137,  w: 100, h: 100, rot: 0 },
  // Row 2 (下段)
  { idx: 22, x:  0,  y:237,  w: 100, h: 100, rot: 0 },
  { idx: 23, x:100,  y:212,  w: 100, h: 100, rot: 0 },
  { idx: 24, x:200,  y:200,  w: 100, h: 100, rot: 0 },
  { idx: 25, x:300,  y:212,  w: 100, h: 100, rot: 0 },
  { idx: 26, x:400,  y:224,  w: 100, h: 100, rot: 0 },
  { idx: 27, x:500,  y:237,  w: 100, h: 100, rot: 0 },
  { idx: 28, x:700,  y:237,  w: 100, h: 100, rot: 0 },
  { idx: 29, x:800,  y:224,  w: 100, h: 100, rot: 0 },
  { idx: 30, x:900,  y:212,  w: 100, h: 100, rot: 0 },
  { idx: 31, x:1000, y:200,  w: 100, h: 100, rot: 0 },
  { idx: 32, x:1100, y:212,  w: 100, h: 100, rot: 0 },
  { idx: 33, x:1200, y:237,  w: 100, h: 100, rot: 0 },
  // Row 3 (親指段)
  { idx: 34, x:  0,  y:337,  w: 100, h: 100, rot: 0 },
  { idx: 35, x:100,  y:312,  w: 100, h: 100, rot: 0 },
  { idx: 36, x:200,  y:300,  w: 100, h: 100, rot: 0 },
  { idx: 37, x:325,  y:337,  w: 100, h: 100, rot: 0 },
  { idx: 38, x:437,  y:350,  w: 100, h: 100, rot: 10 },
  { idx: 39, x:550,  y:387,  w: 100, h: 100, rot: 20 },
  { idx: 40, x:650,  y:387,  w: 100, h: 100, rot:-20 },
  { idx: 41, x:763,  y:350,  w: 100, h: 100, rot:-10 },
  { idx: 42, x:1200, y:337,  w: 100, h: 100, rot: 0 },
];

const SCALE = 0.55; // 表示スケール

// ============================================================
// アプリ状態
// ============================================================
let state = {
  layers: [],
  currentLayerIdx: 0,
  selectedKeyIdx: null,
  originalBindings: {}, // キー変更追跡用
  uf2Files: null,
  currentTab: 'アルファベット',
  // コンボ関連
  combos: [],
  editingComboIdx: null,  // null = 新規, number = 編集中インデックス
  editingCombo: null,     // draft
  pickerMode: 'layer',    // 'layer' | 'combo'
};

let pickerTarget = null; // 現在選択中のキーインデックス

// ============================================================
// 初期化
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadKeymap();
  setupBuildListeners();
});

// ============================================================
// キーマップ読み込み
// ============================================================
async function loadKeymap() {
  try {
    const { parsed } = await window.roba.loadKeymap();
    state.layers = parsed.layers;
    state.combos = parsed.combos || [];
    buildLayerList();
    renderLayer(0);
  } catch (e) {
    showToast('キーマップの読み込みに失敗しました: ' + e.message, 'error');
  }
}

async function reloadKeymap() {
  await loadKeymap();
  showToast('🔄 再読み込みしました', 'success');
}

async function saveKeymap() {
  try {
    await window.roba.saveKeymap({ layers: state.layers, combos: state.combos });
    showToast('💾 キーマップを保存しました', 'success');
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}

// ============================================================
// レイヤー一覧
// ============================================================
function buildLayerList() {
  const list = document.getElementById('layer-list');
  list.innerHTML = '';
  state.layers.forEach((layer, idx) => {
    const btn = document.createElement('button');
    btn.className = 'layer-btn' + (idx === state.currentLayerIdx ? ' active' : '');
    btn.id = `layer-btn-${idx}`;
    btn.innerHTML = `
      <span>${layer.name}</span>
      <span class="layer-btn-num">${idx}</span>
    `;
    btn.onclick = () => switchLayer(idx);
    list.appendChild(btn);
  });
}

function switchLayer(idx) {
  state.currentLayerIdx = idx;
  document.querySelectorAll('.layer-btn').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
  renderLayer(idx);
}

// ============================================================
// キーボード描画
// ============================================================
function renderLayer(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer) return;

  const canvas = document.getElementById('keyboard-canvas');
  canvas.innerHTML = '';

  // 最大 x+w, y+h を計算してキャンバスサイズを決定
  let maxX = 0, maxY = 0;
  for (const k of ROBA_LAYOUT) {
    maxX = Math.max(maxX, k.x + k.w);
    maxY = Math.max(maxY, k.y + k.h + 40); // 親指段の余裕
  }

  canvas.style.width  = (maxX * SCALE) + 'px';
  canvas.style.height = (maxY * SCALE) + 'px';
  canvas.style.position = 'relative';

  ROBA_LAYOUT.forEach((keyDef, i) => {
    const binding = layer.keys[i] || '&trans';
    const keyEl = createKeyElement(i, keyDef, binding, layerIdx);
    canvas.appendChild(keyEl);
  });
}

function createKeyElement(keyIdx, keyDef, binding, layerIdx) {
  const el = document.createElement('div');
  el.className = 'key' + (binding === '&trans' ? ' trans' : '');
  el.id = `key-${layerIdx}-${keyIdx}`;

  const x = keyDef.x * SCALE;
  const y = keyDef.y * SCALE;
  const w = (keyDef.w - 4) * SCALE;
  const h = (keyDef.h - 4) * SCALE;

  el.style.left    = x + 'px';
  el.style.top     = y + 'px';
  el.style.width   = w + 'px';
  el.style.height  = h + 'px';

  if (keyDef.rot !== 0) {
    const rx = keyDef.x + keyDef.w / 2;
    const ry = keyDef.y + keyDef.h / 2;
    el.style.transformOrigin = `${(rx - keyDef.x) * SCALE}px ${(ry - keyDef.y) * SCALE}px`;
    el.style.transform = `rotate(${keyDef.rot}deg)`;
  }

  el.innerHTML = formatKeyLabel(binding);
  el.title = binding;

  el.addEventListener('click', () => openKeyPicker(keyIdx, binding));
  el.addEventListener('mouseenter', () => {
    document.getElementById('key-info-pos').textContent = `Key ${keyIdx}`;
    document.getElementById('key-info-binding').textContent = binding;
  });

  return el;
}

function formatKeyLabel(binding) {
  binding = binding.trim();

  if (binding === '&trans') return '<span class="key-label-main">▽</span>';
  if (binding === '&none')  return '<span class="key-label-main">✕</span>';

  // &mt MOD KEY
  const mtMatch = binding.match(/^&mt\s+(\S+)\s+(.+)$/);
  if (mtMatch) {
    return `<span class="key-label-top">${simplifyMod(mtMatch[1])}</span>` +
           `<span class="key-label-main">${simplifyKey(mtMatch[2])}</span>`;
  }

  // &lt LAYER KEY
  const ltMatch = binding.match(/^&(?:lt|lt_to_layer_0)\s+(\d+)\s+(.+)$/);
  if (ltMatch) {
    return `<span class="key-label-top">L${ltMatch[1]}</span>` +
           `<span class="key-label-main">${simplifyKey(ltMatch[2])}</span>`;
  }

  // &mo LAYER
  const moMatch = binding.match(/^&mo\s+(\d+)$/);
  if (moMatch) {
    return `<span class="key-label-main">MO</span>` +
           `<span class="key-label-mod">${moMatch[1]}</span>`;
  }

  // &to LAYER
  const toMatch = binding.match(/^&to\s+(\d+)$/);
  if (toMatch) {
    return `<span class="key-label-main">TO</span>` +
           `<span class="key-label-mod">${toMatch[1]}</span>`;
  }

  // &kp KEY
  const kpMatch = binding.match(/^&kp\s+(.+)$/);
  if (kpMatch) {
    return `<span class="key-label-main">${simplifyKey(kpMatch[1])}</span>`;
  }

  // &mkp
  const mkpMatch = binding.match(/^&mkp\s+(.+)$/);
  if (mkpMatch) {
    return `<span class="key-label-main">${mkpMatch[1]}</span>`;
  }

  // &bt
  const btMatch = binding.match(/^&bt\s+BT_SEL\s+(\d+)$/);
  if (btMatch) {
    return `<span class="key-label-top">BT</span><span class="key-label-main">${btMatch[1]}</span>`;
  }

  if (binding === '&bootloader') return '<span class="key-label-main" style="font-size:9px">BOOT</span>';

  return `<span class="key-label-main" style="font-size:9px">${binding.substring(0,10)}</span>`;
}

function simplifyKey(key) {
  const map = {
    'UP_ARROW': '↑', 'DOWN_ARROW': '↓', 'LEFT_ARROW': '←', 'RIGHT_ARROW': '→',
    'SPACE': 'SPC', 'ENTER': '↵', 'BACKSPACE': 'BS', 'DELETE': 'Del',
    'ESCAPE': 'Esc', 'TAB': 'Tab', 'LEFT_WIN': 'Win',
    'LEFT_SHIFT': 'Shift', 'LEFT_CONTROL': 'Ctrl', 'LEFT_ALT': 'Alt',
    'EXCLAMATION': '!', 'AT_SIGN': '@', 'HASH': '#', 'DOLLAR': '$',
    'PERCENT': '%', 'CARET': '^', 'AMPERSAND': '&', 'ASTERISK': '*',
    'LEFT_PARENTHESIS': '(', 'RIGHT_PARENTHESIS': ')',
    'LEFT_BRACKET': '[', 'RIGHT_BRACKET': ']',
    'MINUS': '-', 'EQUAL': '=', 'PLUS': '+', 'UNDERSCORE': '_',
    'SLASH': '/', 'BACKSLASH': '\\', 'PIPE': '|', 'TILDE': '~',
    'GRAVE': '`', 'SEMICOLON': ';', 'COLON': ':', 'APOSTROPHE': "'",
    'DOUBLE_QUOTES': '"', 'COMMA': ',', 'PERIOD': '.', 'QUESTION': '?',
    'LESS_THAN': '<', 'GREATER_THAN': '>',
  };
  // LS(LG(S)) などの修飾付き
  if (key.includes('(')) return key.substring(0, 7);
  return map[key] || key.replace('KP_', '').replace('NUMBER_', '').replace('N', '');
}

function simplifyMod(mod) {
  const map = {
    'LEFT_SHIFT': 'SFT', 'LEFT_CONTROL': 'CTL', 'LEFT_ALT': 'ALT', 'LEFT_WIN': 'WIN',
    'RIGHT_SHIFT': 'RSFT', 'RIGHT_CONTROL': 'RCTL',
  };
  return map[mod] || mod.substring(0, 4);
}

// ============================================================
// Behavior 定義
// ============================================================
const BEHAVIORS = [
  {
    id: 'kp',   name: '&kp',   desc: 'キープレス / 修飾キー組み合わせ',
    params: ['mods', 'key'],
    build: (p) => {
      if (!p.key) return null;
      let result = p.key;
      const mods = p.mods || [];
      // 右から左へネスト: [LS, LG] + S → LS(LG(S))
      for (let i = mods.length - 1; i >= 0; i--) {
        result = `${mods[i]}(${result})`;
      }
      return `&kp ${result}`;
    },
  },
  {
    id: 'mt',   name: '&mt',   desc: 'Hold=修飾 / Tap=キー',
    params: ['mod', 'key'],
    build: (p) => (p.mod && p.key) ? `&mt ${p.mod} ${p.key}` : null,
  },
  {
    id: 'lt',   name: '&lt',   desc: 'Hold=レイヤー / Tap=キー',
    params: ['layer', 'key'],
    build: (p) => (p.layer != null && p.key) ? `&lt ${p.layer} ${p.key}` : null,
  },
  {
    id: 'mo',   name: '&mo',   desc: 'Hold でレイヤー有効',
    params: ['layer'],
    build: (p) => (p.layer != null) ? `&mo ${p.layer}` : null,
  },
  {
    id: 'to',   name: '&to',   desc: 'レイヤーに切替',
    params: ['layer'],
    build: (p) => (p.layer != null) ? `&to ${p.layer}` : null,
  },
  {
    id: 'tog',  name: '&tog',  desc: 'レイヤーをトグル',
    params: ['layer'],
    build: (p) => (p.layer != null) ? `&tog ${p.layer}` : null,
  },
  {
    id: 'mkp',  name: '&mkp',  desc: 'マウスボタン',
    params: ['button'],
    build: (p) => p.button ? `&mkp ${p.button}` : null,
  },
  {
    id: 'bt',   name: '&bt',   desc: 'Bluetooth 操作',
    params: ['btcmd'],
    build: (p) => p.btcmd ? `&bt ${p.btcmd}` : null,
  },
  {
    id: 'msc',  name: '&msc',  desc: 'マウススクロール',
    params: ['scroll'],
    build: (p) => p.scroll ? `&msc ${p.scroll}` : null,
  },
  {
    id: 'trans', name: '&trans', desc: '透過 (下レイヤーを使用)',
    params: [],
    build: () => '&trans',
  },
  {
    id: 'none',  name: '&none', desc: '無効キー',
    params: [],
    build: () => '&none',
  },
  {
    id: 'bootloader', name: '&bootloader', desc: 'ブートローダー起動',
    params: [],
    build: () => '&bootloader',
  },
];

// ZMK モディファイア関数
const ZMK_MODS = [
  { label: 'Shift(L)', value: 'LS' },
  { label: 'Ctrl(L)',  value: 'LC' },
  { label: 'Alt(L)',   value: 'LA' },
  { label: 'Win(L)',   value: 'LG' },
  { label: 'Shift(R)', value: 'RS' },
  { label: 'Ctrl(R)',  value: 'RC' },
  { label: 'Alt(R)',   value: 'RA' },
  { label: 'Win(R)',   value: 'RG' },
];

// 修飾キー一覧
const MOD_KEYS = [
  { label: 'Shift (L)', value: 'LEFT_SHIFT' },
  { label: 'Ctrl (L)',  value: 'LEFT_CONTROL' },
  { label: 'Alt (L)',   value: 'LEFT_ALT' },
  { label: 'Win (L)',   value: 'LEFT_WIN' },
  { label: 'Shift (R)', value: 'RIGHT_SHIFT' },
  { label: 'Ctrl (R)',  value: 'RIGHT_CONTROL' },
  { label: 'Alt (R)',   value: 'RIGHT_ALT' },
];

// マウスボタン一覧
const MOUSE_BTNS = ['MB1', 'MB2', 'MB3', 'MB4', 'MB5'];

// Bluetooth コマンド一覧
const BT_CMDS = [
  { label: 'BT 0', value: 'BT_SEL 0' }, { label: 'BT 1', value: 'BT_SEL 1' },
  { label: 'BT 2', value: 'BT_SEL 2' }, { label: 'BT 3', value: 'BT_SEL 3' },
  { label: 'BT 4', value: 'BT_SEL 4' }, { label: 'CLR', value: 'BT_CLR' },
  { label: 'CLR ALL', value: 'BT_CLR_ALL' },
];

// スクロール方向
const SCROLL_DIRS = [
  { label: '↓ SCRL_DOWN', value: 'SCRL_DOWN' },
  { label: '↑ SCRL_UP',   value: 'SCRL_UP' },
  { label: '→ SCRL_RIGHT', value: 'SCRL_RIGHT' },
  { label: '← SCRL_LEFT', value: 'SCRL_LEFT' },
];

// キーカテゴリ
const KEY_CATEGORIES_RENDERER = {
  'アルファベット': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(k => ({ label: k, value: k })),
  '数字': Array.from({length: 10}, (_, i) => ({ label: String(i), value: `N${i}` })),
  'ファンクション': Array.from({length: 12}, (_, i) => ({ label: `F${i+1}`, value: `F${i+1}` })),
  '修飾キー': [
    { label: 'Shift', value: 'LEFT_SHIFT' },
    { label: 'Ctrl',  value: 'LEFT_CONTROL' },
    { label: 'Alt',   value: 'LEFT_ALT' },
    { label: 'Win',   value: 'LEFT_WIN' },
    { label: 'RShift', value: 'RIGHT_SHIFT' },
    { label: 'RCtrl',  value: 'RIGHT_CONTROL' },
    { label: 'RAlt',   value: 'RIGHT_ALT' },
    { label: 'RWin',   value: 'RIGHT_WIN' },
  ],
  'ナビゲーション': [
    { label: '↑', value: 'UP_ARROW' }, { label: '↓', value: 'DOWN_ARROW' },
    { label: '←', value: 'LEFT_ARROW' }, { label: '→', value: 'RIGHT_ARROW' },
    { label: 'Home', value: 'HOME' }, { label: 'End', value: 'END' },
    { label: 'PgUp', value: 'PAGE_UP' }, { label: 'PgDn', value: 'PAGE_DOWN' },
    { label: 'Del', value: 'DELETE' }, { label: 'BS', value: 'BACKSPACE' },
    { label: 'Tab', value: 'TAB' }, { label: 'Esc', value: 'ESCAPE' },
    { label: '↵', value: 'ENTER' }, { label: 'Space', value: 'SPACE' },
    { label: 'PrtSc', value: 'PRINTSCREEN' }, { label: 'Ins', value: 'INSERT' },
  ],
  '記号': [
    { label: '-', value: 'MINUS' }, { label: '=', value: 'EQUAL' },
    { label: '[', value: 'LEFT_BRACKET' }, { label: ']', value: 'RIGHT_BRACKET' },
    { label: '\\', value: 'BACKSLASH' }, { label: ';', value: 'SEMICOLON' },
    { label: "'", value: 'APOSTROPHE' }, { label: '`', value: 'GRAVE' },
    { label: ',', value: 'COMMA' }, { label: '.', value: 'PERIOD' },
    { label: '/', value: 'SLASH' }, { label: '!', value: 'EXCLAMATION' },
    { label: '@', value: 'AT_SIGN' }, { label: '#', value: 'HASH' },
    { label: '$', value: 'DOLLAR' }, { label: '%', value: 'PERCENT' },
    { label: '^', value: 'CARET' }, { label: '&', value: 'AMPERSAND' },
    { label: '*', value: 'ASTERISK' }, { label: '(', value: 'LEFT_PARENTHESIS' },
    { label: ')', value: 'RIGHT_PARENTHESIS' }, { label: '+', value: 'PLUS' },
    { label: '|', value: 'PIPE' }, { label: '~', value: 'TILDE' },
    { label: '?', value: 'QUESTION' }, { label: ':', value: 'COLON' },
    { label: '"', value: 'DOUBLE_QUOTES' }, { label: '<', value: 'LESS_THAN' },
    { label: '>', value: 'GREATER_THAN' }, { label: '_', value: 'UNDERSCORE' },
  ],
  'メディア': [
    { label: '音量+', value: 'C_VOLUME_UP' }, { label: '音量-', value: 'C_VOLUME_DOWN' },
    { label: 'ミュート', value: 'C_MUTE' }, { label: '再生/停止', value: 'C_PLAY_PAUSE' },
    { label: '次の曲', value: 'C_NEXT' }, { label: '前の曲', value: 'C_PREVIOUS' },
  ],
};

// ============================================================
// ピッカー状態
// ============================================================
let picker = {
  target: null,          // キーインデックス
  behaviorId: 'kp',      // 選択中 Behavior
  params: {},            // 現在のパラメーター値
  keySelectFor: null,    // 'key' または 'mod' など（キーグリッドで選ぶもの）
  currentKeyTab: 'アルファベット',
};

// ============================================================
// キー選択モーダル — 開く / 閉じる
// ============================================================
function openKeyPicker(keyIdx, currentBinding) {
  picker.target = keyIdx;
  picker.params = {};
  picker.keySelectFor = null;

  // 現在の binding を解析して初期 Behavior を設定
  initPickerFromBinding(currentBinding);

  document.getElementById('modal-pos').textContent = `Key ${keyIdx}`;
  document.getElementById('key-picker-overlay').classList.remove('hidden');

  buildBehaviorList();
  renderPickerForBehavior();
  updatePickerPreview();
}

function closeKeyPicker(event) {
  if (!event || event.target === document.getElementById('key-picker-overlay')) {
    document.getElementById('key-picker-overlay').classList.add('hidden');
    picker.target = null;
  }
}

// kp の binding から mods と key を解析
function parseKpBinding(str) {
  const mods = [];
  let current = str.trim();
  const modRegex = /^(LS|LC|LA|LG|RS|RC|RA|RG)\((.+)\)$/;
  while (true) {
    const m = current.match(modRegex);
    if (m) { mods.push(m[1]); current = m[2]; }
    else break;
  }
  return { mods, key: current };
}

// 既存 binding からピッカーの初期状態を復元
function initPickerFromBinding(binding) {
  binding = (binding || '').trim();

  const mtMatch = binding.match(/^&mt\s+(\S+)\s+(.+)$/);
  if (mtMatch) { picker.behaviorId = 'mt'; picker.params = { mod: mtMatch[1], key: mtMatch[2] }; return; }

  const ltMatch = binding.match(/^&(?:lt|lt_to_layer_0)\s+(\d+)\s+(.+)$/);
  if (ltMatch) { picker.behaviorId = 'lt'; picker.params = { layer: ltMatch[1], key: ltMatch[2] }; return; }

  const moMatch = binding.match(/^&mo\s+(\d+)$/);
  if (moMatch) { picker.behaviorId = 'mo'; picker.params = { layer: moMatch[1] }; return; }

  const toMatch = binding.match(/^&to\s+(\d+)$/);
  if (toMatch) { picker.behaviorId = 'to'; picker.params = { layer: toMatch[1] }; return; }

  const togMatch = binding.match(/^&tog\s+(\d+)$/);
  if (togMatch) { picker.behaviorId = 'tog'; picker.params = { layer: togMatch[1] }; return; }

  const kpMatch = binding.match(/^&kp\s+(.+)$/);
  if (kpMatch) {
    picker.behaviorId = 'kp';
    const { mods, key } = parseKpBinding(kpMatch[1]);
    picker.params = { mods, key };
    return;
  }

  const mkpMatch = binding.match(/^&mkp\s+(.+)$/);
  if (mkpMatch) { picker.behaviorId = 'mkp'; picker.params = { button: mkpMatch[1] }; return; }

  const btMatch = binding.match(/^&bt\s+(.+)$/);
  if (btMatch) { picker.behaviorId = 'bt'; picker.params = { btcmd: btMatch[1] }; return; }

  const mscMatch = binding.match(/^&msc\s+(.+)$/);
  if (mscMatch) { picker.behaviorId = 'msc'; picker.params = { scroll: mscMatch[1] }; return; }

  if (binding === '&trans')      { picker.behaviorId = 'trans'; return; }
  if (binding === '&none')       { picker.behaviorId = 'none'; return; }
  if (binding === '&bootloader') { picker.behaviorId = 'bootloader'; return; }

  picker.behaviorId = 'kp';
}

// ============================================================
// Behavior リスト (左カラム)
// ============================================================
function buildBehaviorList() {
  const list = document.getElementById('behavior-list');
  list.innerHTML = '';

  for (const beh of BEHAVIORS) {
    const chip = document.createElement('div');
    chip.className = 'behavior-chip' + (beh.id === picker.behaviorId ? ' active' : '');
    chip.innerHTML = `
      <span class="behavior-chip-name">${beh.name}</span>
      <span class="behavior-chip-desc">${beh.desc}</span>
    `;
    chip.onclick = () => {
      picker.behaviorId = beh.id;
      picker.params = {};
      picker.keySelectFor = null;
      document.querySelectorAll('.behavior-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderPickerForBehavior();
      updatePickerPreview();
    };
    list.appendChild(chip);
  }
}

// ============================================================
// 右カラム: パラメーターパネル + キーグリッド
// ============================================================
function renderPickerForBehavior() {
  const params = document.getElementById('picker-params');
  const keyArea = document.getElementById('picker-key-area');
  params.innerHTML = '';
  keyArea.classList.add('hidden');

  const beh = BEHAVIORS.find(b => b.id === picker.behaviorId);
  if (!beh) return;

  // パラメーターが不要な Behavior (trans, none, bootloader)
  if (beh.params.length === 0) {
    params.innerHTML = `
      <div class="picker-empty">
        <div class="picker-empty-icon">${beh.id === 'trans' ? '▽' : beh.id === 'none' ? '✕' : '⚡'}</div>
        <div>${beh.desc}</div>
        <div style="font-size:11px;color:var(--text-muted)">パラメーターなし — 適用ボタンを押してください</div>
      </div>`;
    return;
  }

  // レイヤー選択
  if (beh.params.includes('layer')) {
    params.appendChild(buildLayerParam());
  }

  // モディファイア選択 (&kp の mods)
  if (beh.params.includes('mods')) {
    params.appendChild(buildModsToggle());
  }

  // 修飾キー選択 (&mt)
  if (beh.params.includes('mod')) {
    params.appendChild(buildModParam());
  }

  // マウスボタン選択 (&mkp)
  if (beh.params.includes('button')) {
    params.appendChild(buildChipParam('button', 'ボタン', MOUSE_BTNS.map(b => ({ label: b, value: b }))));
  }

  // Bluetooth コマンド
  if (beh.params.includes('btcmd')) {
    params.appendChild(buildChipParam('btcmd', 'コマンド', BT_CMDS));
  }

  // スクロール方向
  if (beh.params.includes('scroll')) {
    params.appendChild(buildChipParam('scroll', '方向', SCROLL_DIRS));
  }

  // キー選択 (&kp / &mt / &lt)
  if (beh.params.includes('key')) {
    const mods = picker.params.mods || [];
    const keyChipLabel = picker.params.key
      ? (mods.length > 0 ? mods.join('+') + ' + ' + picker.params.key : picker.params.key)
      : '選択してください →';
    const keyBtn = document.createElement('div');
    keyBtn.className = 'param-row';
    keyBtn.innerHTML = `
      <span class="param-label">キー</span>
      <span class="param-chips" id="key-select-chips">
        <span class="param-chip${picker.params.key ? ' key-selected' : ''}" id="key-selected-chip"
          onclick="openKeyGrid('key')">
          ${keyChipLabel}
        </span>
      </span>`;
    params.appendChild(keyBtn);
    keyArea.classList.remove('hidden');
    buildKeyGrid('key');
  }
}

// レイヤー選択パラメーター
function buildLayerParam() {
  const row = document.createElement('div');
  row.className = 'param-row';
  const chips = state.layers.map((l, i) =>
    `<span class="param-chip${picker.params.layer == i ? ' active' : ''}"
       onclick="setParam('layer', ${i})"
     >${i}: ${l.name}</span>`
  ).join('');
  row.innerHTML = `<span class="param-label">レイヤー</span><span class="param-chips">${chips}</span>`;
  return row;
}

// 修飾キーパラメーター
function buildModParam() {
  const row = document.createElement('div');
  row.className = 'param-row';
  const chips = MOD_KEYS.map(m =>
    `<span class="param-chip${picker.params.mod === m.value ? ' active' : ''}"
       onclick="setParam('mod', '${m.value}')"
     >${m.label}</span>`
  ).join('');
  row.innerHTML = `<span class="param-label">修飾キー</span><span class="param-chips">${chips}</span>`;
  return row;
}

// モディファイア複数選択トグル (&kp 用)
function buildModsToggle() {
  const row = document.createElement('div');
  row.className = 'param-row';
  const currentMods = picker.params.mods || [];
  const chips = ZMK_MODS.map(m =>
    `<span class="param-chip${currentMods.includes(m.value) ? ' active' : ''}"
       onclick="toggleMod('${m.value}')"
     >${m.label}</span>`
  ).join('');
  row.innerHTML = `<span class="param-label">修飾 (複数可)</span><span class="param-chips">${chips}</span>`;
  return row;
}

// モディファイアをトグル
function toggleMod(modValue) {
  const mods = picker.params.mods ? [...picker.params.mods] : [];
  const idx = mods.indexOf(modValue);
  if (idx >= 0) mods.splice(idx, 1);
  else mods.push(modValue);
  picker.params.mods = mods;
  renderPickerForBehavior();
  updatePickerPreview();
}

// 汎用チップパラメーター
function buildChipParam(paramName, label, options) {
  const row = document.createElement('div');
  row.className = 'param-row';
  const chips = options.map(o =>
    `<span class="param-chip${picker.params[paramName] === o.value ? ' active' : ''}"
       onclick="setParam('${paramName}', '${o.value}')"
     >${o.label}</span>`
  ).join('');
  row.innerHTML = `<span class="param-label">${label}</span><span class="param-chips">${chips}</span>`;
  return row;
}

// パラメーター値をセット & プレビュー更新
function setParam(name, value) {
  picker.params[name] = String(value);
  // 再描画
  renderPickerForBehavior();
  updatePickerPreview();
}

// ============================================================
// キーグリッド
// ============================================================
function openKeyGrid(forParam) {
  picker.keySelectFor = forParam;
  buildKeyGrid(forParam);
}

function buildKeyGrid(forParam) {
  picker.keySelectFor = forParam;
  const keyArea = document.getElementById('picker-key-area');
  keyArea.classList.remove('hidden');

  // タブ
  const tabContainer = document.getElementById('picker-key-tabs');
  tabContainer.innerHTML = '';
  const cats = Object.keys(KEY_CATEGORIES_RENDERER);
  for (const cat of cats) {
    const btn = document.createElement('button');
    btn.className = 'modal-tab' + (cat === picker.currentKeyTab ? ' active' : '');
    btn.textContent = cat;
    btn.onclick = () => {
      picker.currentKeyTab = cat;
      document.querySelectorAll('#picker-key-tabs .modal-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildKeyGridContent();
    };
    tabContainer.appendChild(btn);
  }
  buildKeyGridContent();
}

function buildKeyGridContent() {
  const grid = document.getElementById('picker-key-grid');
  grid.innerHTML = '';
  const keys = KEY_CATEGORIES_RENDERER[picker.currentKeyTab] || [];
  for (const k of keys) {
    const el = document.createElement('div');
    const isSelected = picker.params[picker.keySelectFor] === k.value;
    el.className = 'key-option' + (isSelected ? ' key-selected' : '');
    el.textContent = k.label;
    el.title = k.value;
    el.onclick = () => {
      picker.params[picker.keySelectFor] = k.value;
      // 選択チップを更新
      document.querySelectorAll('#picker-key-grid .key-option').forEach(e => e.classList.remove('key-selected', 'active'));
      el.classList.add('key-selected');
      // key-selected-chip を更新
      const chip = document.getElementById('key-selected-chip');
      if (chip) { chip.textContent = k.value; chip.classList.add('key-selected'); }
      updatePickerPreview();
    };
    grid.appendChild(el);
  }
}

// ============================================================
// プレビュー & 適用
// ============================================================
function updatePickerPreview() {
  const beh = BEHAVIORS.find(b => b.id === picker.behaviorId);
  const binding = beh ? beh.build(picker.params) : null;
  const preview = document.getElementById('modal-preview-binding');
  const applyBtn = document.getElementById('modal-apply-btn');

  if (binding) {
    preview.textContent = binding;
    applyBtn.disabled = false;
    applyBtn.style.opacity = '1';
  } else {
    preview.textContent = '— 未完成 —';
    applyBtn.disabled = true;
    applyBtn.style.opacity = '0.4';
  }

  // カスタム入力と同期
  document.getElementById('modal-custom-input').value = binding || '';
}

function applyPickerBinding() {
  const beh = BEHAVIORS.find(b => b.id === picker.behaviorId);

  // カスタム入力が優先されている場合はそちらを使う
  const customVal = document.getElementById('modal-custom-input').value.trim();
  const binding = customVal || (beh ? beh.build(picker.params) : null);
  if (!binding) return;

  if (state.pickerMode === 'combo') {
    // コンボモード: editingCombo のバインディングを更新
    if (state.editingCombo) {
      state.editingCombo.binding = binding;
      updateComboBindingPreview();
    }
    state.pickerMode = 'layer'; // モードをリセット
    document.getElementById('key-picker-overlay').classList.add('hidden');
    picker.target = null;
  } else {
    // 通常モード: レイヤーキーを更新
    if (picker.target === null) return;
    applyBinding(binding);
    closeKeyPicker();
  }
}

// カスタム入力が変わったとき
function onCustomInputChange(val) {
  const preview = document.getElementById('modal-preview-binding');
  preview.textContent = val || '—';
  const applyBtn = document.getElementById('modal-apply-btn');
  applyBtn.disabled = !val.trim();
  applyBtn.style.opacity = val.trim() ? '1' : '0.4';

  // カスタム入力が変更されたら Behavior 解析して同期
  if (val.trim()) {
    initPickerFromBinding(val.trim());
    buildBehaviorList();
    renderPickerForBehavior();
    // プレビューは手入力値を優先
    preview.textContent = val.trim();
    document.getElementById('modal-custom-input').value = val.trim();
  }
}

// ============================================================
// キーに binding を適用してキャンバスを更新
// ============================================================
function applyBinding(binding) {
  if (picker.target === null) return;

  const layer = state.layers[state.currentLayerIdx];
  if (!layer) return;

  layer.keys[picker.target] = binding;

  // DOM 更新
  const keyEl = document.getElementById(`key-${state.currentLayerIdx}-${picker.target}`);
  if (keyEl) {
    keyEl.innerHTML = formatKeyLabel(binding);
    keyEl.title = binding;
    keyEl.classList.remove('trans');
    keyEl.classList.add('modified');
    if (binding === '&trans') keyEl.classList.add('trans');
  }
  document.getElementById('key-info-binding').textContent = binding;
}




// ============================================================
// ビュー切替
// ============================================================
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  document.getElementById(`nav-${viewName}`)?.classList.add('active');

  const layerPanel = document.getElementById('layer-panel');
  layerPanel.style.display = viewName === 'editor' ? '' : 'none';

  // コンボビューに切り替えられたときはリストを描画
  if (viewName === 'combos') {
    renderComboList();
  }
}

// ============================================================
// ビルド & フラッシュ
// ============================================================
function setupBuildListeners() {
  window.roba.onBuildProgress((data) => {
    handleBuildProgress(data);
  });

  window.roba.onFlashProgress((data) => {
    handleFlashProgress(data);
  });
}

async function startBuildFlow() {
  // まず保存
  await saveKeymap();

  // ビュー切替
  switchView('build');

  // ステップリセット
  resetSteps();
  clearLog();

  addLog('🚀 ビルド & フラッシュを開始します...', 'info');

  const result = await window.roba.startBuild('キーマップを更新');
  if (!result.success) {
    addLog('❌ ' + result.error, 'error');
  }
}

function handleBuildProgress(data) {
  const { type, message, status, durationSec } = data;

  addLog(message);

  switch (type) {
    case 'git':
      setStepActive('step-git');
      document.getElementById('step-git-desc').textContent = message;
      break;

    case 'trigger':
      setStepDone('step-git');
      setStepActive('step-build');
      document.getElementById('step-build-desc').textContent = message;
      break;

    case 'building':
      setStepActive('step-build');
      document.getElementById('step-build-desc').textContent = message;
      break;

    case 'download':
      setStepDone('step-build');
      setStepActive('step-download');
      document.getElementById('step-download-desc').textContent = message;
      break;

    case 'flash_ready':
      setStepDone('step-download');
      state.uf2Files = data.uf2Files;
      addLog('✅ UF2 準備完了 — フラッシュを開始します', 'success');
      // 自動でフラッシュ開始
      window.roba.startFlash(data.uf2Files);
      break;

    case 'error':
      addLog('❌ ' + message, 'error');
      setStepError(getCurrentActiveStep());
      break;
  }
}

function handleFlashProgress(data) {
  const { phase, side, message } = data;

  setStepActive('step-flash');
  document.getElementById('step-flash-desc').textContent = message;
  addLog(message, phase === 'done' ? 'success' : 'info');

  if (phase === 'waiting') {
    document.getElementById('flash-waiting-text').textContent =
      `【${side}】${message}`;
    document.getElementById('flash-waiting').classList.remove('hidden');
  } else if (phase === 'flashing') {
    document.getElementById('flash-waiting-text').textContent =
      `【${side}】フラッシュ中... しばらくお待ちください`;
  } else if (phase === 'all_done') {
    document.getElementById('flash-waiting').classList.add('hidden');
    setStepDone('step-flash');
    document.getElementById('flash-done').classList.remove('hidden');
    addLog('🎉 全フラッシュ完了！', 'success');
  }
}

// ステップ管理
function resetSteps() {
  ['step-git', 'step-build', 'step-download', 'step-flash'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'step';
    document.getElementById(id + '-status').textContent = '';
  });
  document.getElementById('flash-waiting').classList.add('hidden');
  document.getElementById('flash-done').classList.add('hidden');
}

function setStepActive(id) {
  document.getElementById(id).className = 'step active';
  document.getElementById(id + '-status').textContent = '⏳';
}

function setStepDone(id) {
  document.getElementById(id).className = 'step done';
  document.getElementById(id + '-status').textContent = '✅';
}

function setStepError(id) {
  if (!id) return;
  document.getElementById(id).className = 'step error';
  document.getElementById(id + '-status').textContent = '❌';
}

function getCurrentActiveStep() {
  const steps = ['step-git', 'step-build', 'step-download', 'step-flash'];
  for (const id of steps) {
    if (document.getElementById(id).classList.contains('active')) return id;
  }
  return null;
}

// ログ管理
function addLog(message, level = 'info') {
  const log = document.getElementById('build-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  document.getElementById('build-log').innerHTML = '';
}

// ============================================================
// 設定
// ============================================================
async function loadSettings() {
  const settings = await window.roba.loadSettings();

  document.getElementById('input-token').value = settings.githubToken || '';
  document.getElementById('input-owner').value = settings.owner || '';
  document.getElementById('input-repo').value   = settings.repo || '';
  document.getElementById('input-ref').value    = settings.ref || 'main';

  updateRepoInfo(settings);
}

async function saveSettings() {
  const settings = {
    githubToken: document.getElementById('input-token').value,
    owner: document.getElementById('input-owner').value,
    repo: document.getElementById('input-repo').value,
    ref: document.getElementById('input-ref').value || 'main',
  };
  await window.roba.saveSettings(settings);
  updateRepoInfo(settings);
  showToast('✅ 設定を保存しました', 'success');
}

async function validateToken() {
  const token = document.getElementById('input-token').value;
  const owner = document.getElementById('input-owner').value;
  const repo  = document.getElementById('input-repo').value;

  const btn = document.getElementById('btn-validate');
  btn.textContent = '検証中...';
  btn.disabled = true;

  const status = document.getElementById('token-status');
  const result = await window.roba.validateToken(token, owner, repo);

  btn.textContent = '🔍 トークン検証';
  btn.disabled = false;

  if (result.valid) {
    status.className = 'token-status valid';
    status.textContent = `✅ 有効 (@${result.login})`;
  } else {
    status.className = 'token-status invalid';
    status.textContent = `❌ 無効: ${result.error}`;
  }
}

function updateRepoInfo(settings) {
  const box = document.getElementById('repo-info');
  if (settings.owner && settings.repo) {
    box.innerHTML = `
      リポジトリ: <b>${settings.owner}/${settings.repo}</b><br>
      ブランチ: <b>${settings.ref || 'main'}</b><br>
      GitHub Actions: <a href="https://github.com/${settings.owner}/${settings.repo}/actions" style="color:#a89cf8" onclick="return false">actions ページ</a>
    `;
  } else {
    box.textContent = '設定を入力してください';
  }
}

function toggleTokenVisibility() {
  const input = document.getElementById('input-token');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function openTokenGuide() {
  // Electron では shell.openExternal を使うが、ここでは情報表示
  showToast('GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)', 'info');
}

// ============================================================
// トースト通知
// ============================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// ============================================================
// ユーティリティ
// ============================================================
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// コンボ管理
// ============================================================

// コンボリストを描画
function renderComboList() {
  const list = document.getElementById('combo-list');
  list.innerHTML = '';

  if (state.combos.length === 0) {
    list.innerHTML = `
      <div class="combo-empty">
        <div class="combo-empty-icon">⚡</div>
        <div class="combo-empty-text">コンボがまだ登録されていません</div>
        <button class="btn btn-primary" onclick="addCombo()">＋ コンボの追加</button>
      </div>`;
    return;
  }

  state.combos.forEach((combo, idx) => {
    const card = document.createElement('div');
    card.className = 'combo-card';
    card.onclick = () => openComboEditor(idx);

    // ミニキーボード
    const miniKb = buildMiniKeyboard(combo.keyPositions);

    const metaParts = [`キー: ${combo.keyPositions.join(', ')}`];
    if (combo.timeoutMs != null) metaParts.push(`timeout: ${combo.timeoutMs}ms`);
    if (combo.layers && combo.layers.length > 0) metaParts.push(`レイヤー: ${combo.layers.join(',')}`);

    card.innerHTML = `
      <div class="combo-mini-kb" id="mini-kb-${idx}"></div>
      <div class="combo-card-info">
        <div class="combo-card-name">${escapeHtml(combo.name)}</div>
        <div class="combo-card-binding">${escapeHtml(combo.binding)}</div>
        <div class="combo-card-meta">${metaParts.join(' · ')}</div>
      </div>
      <span style="color:var(--text-muted);font-size:18px">›</span>
    `;
    list.appendChild(card);

    // ミニキーボードを挿入
    card.querySelector(`#mini-kb-${idx}`).appendChild(miniKb);
  });
}

// ミニキーボード (64×200 px) を生成
const MINI_SCALE = 0.145;
function buildMiniKeyboard(selectedPositions) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.width = '200px';
  wrap.style.height = '60px';

  let maxX = 0, maxY = 0;
  for (const k of ROBA_LAYOUT) {
    maxX = Math.max(maxX, (k.x + k.w) * MINI_SCALE);
    maxY = Math.max(maxY, (k.y + k.h) * MINI_SCALE);
  }

  const scaleX = 200 / maxX;
  const scaleY = 60 / maxY;
  const sc = Math.min(scaleX, scaleY) * 0.92;

  for (const k of ROBA_LAYOUT) {
    const el = document.createElement('div');
    el.className = 'combo-mini-kb-key' + (selectedPositions.includes(k.idx) ? ' selected' : '');
    el.style.left   = (k.x * MINI_SCALE * sc) + 'px';
    el.style.top    = (k.y * MINI_SCALE * sc) + 'px';
    el.style.width  = ((k.w - 2) * MINI_SCALE * sc) + 'px';
    el.style.height = ((k.h - 2) * MINI_SCALE * sc) + 'px';
    if (k.rot !== 0) {
      el.style.transformOrigin = `${(k.w / 2) * MINI_SCALE * sc}px ${(k.h / 2) * MINI_SCALE * sc}px`;
      el.style.transform = `rotate(${k.rot}deg)`;
    }
    wrap.appendChild(el);
  }
  return wrap;
}

// コンボ追加 (新規)
function addCombo() {
  state.editingComboIdx = null;
  state.editingCombo = {
    name: '',
    binding: '',
    keyPositions: [],
    timeoutMs: null,
    layers: null,
  };
  openComboEditorModal();
}

// コンボ編集 (既存)
function openComboEditor(idx) {
  state.editingComboIdx = idx;
  const orig = state.combos[idx];
  state.editingCombo = {
    name: orig.name,
    binding: orig.binding,
    keyPositions: [...orig.keyPositions],
    timeoutMs: orig.timeoutMs,
    layers: orig.layers ? [...orig.layers] : null,
  };
  openComboEditorModal();
}

function openComboEditorModal() {
  const combo = state.editingCombo;
  const isNew = state.editingComboIdx === null;

  document.getElementById('combo-modal-title').textContent = isNew ? 'コンボを追加' : 'コンボを編集';
  document.getElementById('combo-name-input').value    = combo.name;
  document.getElementById('combo-timeout-input').value = combo.timeoutMs != null ? combo.timeoutMs : '';
  document.getElementById('combo-delete-btn').style.display = isNew ? 'none' : '';

  updateComboBindingPreview();
  buildComboLayerChips();
  updateComboPositionsDisplay();
  buildComboKeySelector();

  document.getElementById('combo-editor-overlay').classList.remove('hidden');
}

function closeComboEditor(event) {
  if (!event || event.target === document.getElementById('combo-editor-overlay')) {
    document.getElementById('combo-editor-overlay').classList.add('hidden');
    state.editingCombo = null;
    state.editingComboIdx = null;
  }
}

// コンボのバインディングプレビューを更新
function updateComboBindingPreview() {
  const preview = document.getElementById('combo-binding-preview');
  if (preview) {
    preview.textContent = state.editingCombo?.binding || '未設定';
  }
}

// レイヤーチップを構築
function buildComboLayerChips() {
  const container = document.getElementById('combo-layers-chips');
  if (!container) return;
  container.innerHTML = '';
  const selectedLayers = state.editingCombo?.layers || [];
  state.layers.forEach((layer, i) => {
    const chip = document.createElement('span');
    chip.className = 'param-chip' + (selectedLayers.includes(i) ? ' active' : '');
    chip.textContent = `${i}: ${layer.name}`;
    chip.onclick = () => toggleComboLayer(i, chip);
    container.appendChild(chip);
  });
}

function toggleComboLayer(layerIdx, chip) {
  if (!state.editingCombo) return;
  let layers = state.editingCombo.layers ? [...state.editingCombo.layers] : [];
  const pos = layers.indexOf(layerIdx);
  if (pos >= 0) { layers.splice(pos, 1); chip.classList.remove('active'); }
  else          { layers.push(layerIdx); chip.classList.add('active'); }
  state.editingCombo.layers = layers.length > 0 ? layers : null;
}

// キーポジション表示を更新
function updateComboPositionsDisplay() {
  const positions = state.editingCombo?.keyPositions || [];
  const badge = document.getElementById('combo-positions-count');
  const listEl = document.getElementById('combo-positions-list');
  if (badge) badge.textContent = `${positions.length}個`;
  if (!listEl) return;
  listEl.innerHTML = '';
  if (positions.length === 0) {
    listEl.textContent = 'キーを右側のキーボードから選択してください';
    listEl.style.color = 'var(--text-muted)';
    return;
  }
  listEl.style.color = '';
  positions.forEach(pos => {
    const tag = document.createElement('span');
    tag.className = 'combo-pos-tag';
    tag.innerHTML = `${pos} <span class="combo-pos-tag-remove" onclick="removeComboPosition(${pos})">✕</span>`;
    listEl.appendChild(tag);
  });
}

function removeComboPosition(pos) {
  if (!state.editingCombo) return;
  state.editingCombo.keyPositions = state.editingCombo.keyPositions.filter(p => p !== pos);
  updateComboPositionsDisplay();
  // キーセレクターの表示も同期
  const keyEl = document.getElementById(`csk-${pos}`);
  if (keyEl) keyEl.classList.remove('selected');
}

function clearComboPositions() {
  if (!state.editingCombo) return;
  state.editingCombo.keyPositions = [];
  updateComboPositionsDisplay();
  document.querySelectorAll('.combo-sel-key.selected').forEach(el => el.classList.remove('selected'));
}

// コンボ用キーセレクターを描画 (ROBAレイアウト表示)
const COMBO_SEL_SCALE = 0.52;
function buildComboKeySelector() {
  const container = document.getElementById('combo-key-selector');
  if (!container) return;
  container.innerHTML = '';

  let maxX = 0, maxY = 0;
  for (const k of ROBA_LAYOUT) {
    maxX = Math.max(maxX, k.x + k.w);
    maxY = Math.max(maxY, k.y + k.h + 30);
  }
  container.style.width  = (maxX * COMBO_SEL_SCALE) + 'px';
  container.style.height = (maxY * COMBO_SEL_SCALE) + 'px';

  const positions = state.editingCombo?.keyPositions || [];

  ROBA_LAYOUT.forEach(k => {
    const el = document.createElement('div');
    el.className = 'combo-sel-key' + (positions.includes(k.idx) ? ' selected' : '');
    el.id = `csk-${k.idx}`;

    const x = k.x * COMBO_SEL_SCALE;
    const y = k.y * COMBO_SEL_SCALE;
    const w = (k.w - 3) * COMBO_SEL_SCALE;
    const h = (k.h - 3) * COMBO_SEL_SCALE;

    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';

    if (k.rot !== 0) {
      el.style.transformOrigin = `${(k.w / 2) * COMBO_SEL_SCALE}px ${(k.h / 2) * COMBO_SEL_SCALE}px`;
      el.style.transform = `rotate(${k.rot}deg)`;
    }

    // バインディングラベルを現在レイヤーから取得
    const currentLayer = state.layers[state.currentLayerIdx];
    const binding = currentLayer?.keys[k.idx] || '';
    const label = formatKeyLabel(binding);

    el.innerHTML = `<span class="key-idx">${k.idx}</span><span style="font-size:8px">${label.replace(/<[^>]+>/g, '')}</span>`;
    el.title = `Key ${k.idx}` + (binding ? ` (${binding})` : '');

    el.addEventListener('click', () => toggleComboKeyPosition(k.idx, el));
    container.appendChild(el);
  });
}

function toggleComboKeyPosition(keyIdx, el) {
  if (!state.editingCombo) return;
  const positions = state.editingCombo.keyPositions;
  const pos = positions.indexOf(keyIdx);
  if (pos >= 0) {
    positions.splice(pos, 1);
    el.classList.remove('selected');
  } else {
    positions.push(keyIdx);
    positions.sort((a, b) => a - b);
    el.classList.add('selected');
  }
  updateComboPositionsDisplay();
}

// コンボ用バインディングピッカーを開く (既存の key-picker を再利用)
function openComboBindingPicker() {
  state.pickerMode = 'combo';
  const binding = state.editingCombo?.binding || '';
  picker.target = -1; // dummy (combo mode)
  picker.params = {};
  picker.keySelectFor = null;
  initPickerFromBinding(binding);

  document.getElementById('modal-pos').textContent = 'コンボのバインディング';
  document.getElementById('key-picker-overlay').classList.remove('hidden');
  buildBehaviorList();
  renderPickerForBehavior();
  updatePickerPreview();
}

// コンボを保存
function saveComboEdit() {
  if (!state.editingCombo) return;

  const nameInput = document.getElementById('combo-name-input').value.trim();
  if (!nameInput || !/^[\w]+$/.test(nameInput)) {
    showToast('コンボ名は英数字・アンダースコアのみで入力してください', 'error');
    return;
  }
  if (!state.editingCombo.binding) {
    showToast('バインディングを設定してください', 'error');
    return;
  }
  if (state.editingCombo.keyPositions.length < 2) {
    showToast('キーポジションは2個以上選択してください', 'error');
    return;
  }

  // 同名チェック
  const dupIdx = state.combos.findIndex((c, i) => c.name === nameInput && i !== state.editingComboIdx);
  if (dupIdx >= 0) {
    showToast(`同じ名前「${nameInput}」のコンボがすでに存在します`, 'error');
    return;
  }

  const timeoutVal = document.getElementById('combo-timeout-input').value;
  const timeoutMs  = timeoutVal ? parseInt(timeoutVal) : null;

  const saved = {
    name:         nameInput,
    binding:      state.editingCombo.binding,
    keyPositions: [...state.editingCombo.keyPositions],
    timeoutMs,
    layers: state.editingCombo.layers && state.editingCombo.layers.length > 0
      ? [...state.editingCombo.layers] : null,
  };

  if (state.editingComboIdx === null) {
    state.combos.push(saved);
  } else {
    state.combos[state.editingComboIdx] = saved;
  }

  closeComboEditor();
  renderComboList();
  showToast('✅ コンボを保存しました（💾 保存でファイルに書き込み）', 'success');
}

// コンボを削除
function deleteComboEditing() {
  if (state.editingComboIdx === null) return;
  const name = state.combos[state.editingComboIdx]?.name || '';
  state.combos.splice(state.editingComboIdx, 1);
  closeComboEditor();
  renderComboList();
  showToast(`🗑 「${name}」を削除しました`, 'success');
}
