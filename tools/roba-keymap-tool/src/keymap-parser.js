// キーマップパーサー / ジェネレーター
// roBa.keymap の ZMK DSL を JSON <-> .keymap に変換する

/**
 * ZMK .keymap ファイルをパースして JSON に変換
 * @param {string} content - .keymap ファイルの文字列
 * @returns {object} JSON 形式のキーマップデータ
 */
function parseKeymap(content) {
  const result = {
    behaviors: {},
    combos: [],
    macros: {},
    layers: [],
    sensorBindings: {},
  };

  // Windows CRLF を LF に正規化
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // combos { ... }; ブロックを抽出してパース
  const combosIdx = normalized.indexOf('combos {');
  if (combosIdx !== -1) {
    const combosBlock = extractBlock(normalized, combosIdx + 'combos'.length);
    if (combosBlock) {
      result.combos = parseCombos(combosBlock);
    }
  }

  // keymap { ... }; ブロックをブレースカウントで正確に抽出
  const keymapStart = normalized.indexOf('keymap {');
  if (keymapStart === -1) return result;

  const keymapBlock = extractBlock(normalized, keymapStart + 'keymap'.length);
  if (!keymapBlock) return result;

  // keymapブロック内からレイヤー名でブロックを列挙
  // パターン: 識別子 { ... };
  const layerNameRegex = /^[ \t]*([\w]+)[ \t]*\{/gm;
  let nameMatch;
  const layerEntries = [];

  while ((nameMatch = layerNameRegex.exec(keymapBlock)) !== null) {
    const layerName = nameMatch[1];
    if (layerName === 'keymap' || layerName === 'compatible') continue;
    const blockStart = nameMatch.index + nameMatch[0].indexOf('{');
    const blockContent = extractBlock(keymapBlock, blockStart);
    if (blockContent) {
      layerEntries.push({ name: layerName, content: blockContent });
    }
  }

  for (const entry of layerEntries) {
    // bindings を抽出 (< ... > の中身)
    const bindingsMatch = entry.content.match(/bindings\s*=\s*<([\s\S]*?)>;/);
    if (!bindingsMatch) continue;

    const keys = parseBindings(bindingsMatch[1]);

    // sensor-bindings を抽出
    const sensorMatch = entry.content.match(/sensor-bindings\s*=\s*<([^>]*)>/);
    const sensorBinding = sensorMatch ? sensorMatch[1].trim() : null;

    result.layers.push({
      name: entry.name,
      keys,
      sensorBinding,
    });
  }

  return result;
}

/**
 * combos ブロック内容からコンボ配列をパース
 * @param {string} block - combos { ... } の内部テキスト
 * @returns {Array}
 */
function parseCombos(block) {
  const combos = [];
  const comboNameRegex = /^\s*([\w]+)\s*\{/gm;
  let match;
  while ((match = comboNameRegex.exec(block)) !== null) {
    const name = match[1];
    if (name === 'compatible') continue;
    const blockStart = match.index + match[0].indexOf('{');
    const blockContent = extractBlock(block, blockStart);
    if (!blockContent) continue;

    const bindingsMatch = blockContent.match(/bindings\s*=\s*<([^>]*)>/);
    const positionsMatch = blockContent.match(/key-positions\s*=\s*<([^>]*)>/);
    if (!bindingsMatch || !positionsMatch) continue;

    const binding = bindingsMatch[1].trim();
    const keyPositions = positionsMatch[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));

    const timeoutMatch = blockContent.match(/timeout-ms\s*=\s*<(\d+)>/);
    const layersMatch  = blockContent.match(/layers\s*=\s*<([^>]*)>/);

    combos.push({
      name,
      binding,
      keyPositions,
      timeoutMs: timeoutMatch ? parseInt(timeoutMatch[1]) : null,
      layers:    layersMatch  ? layersMatch[1].trim().split(/\s+/).map(Number) : null,
    });
  }
  return combos;
}

/**
 * コンボ配列から combos { ... }; ブロック文字列を生成
 * @param {Array} combos
 * @returns {string}
 */
function generateCombosBlock(combos) {
  let block = 'combos {\n        compatible = "zmk,combos";\n';
  for (const combo of combos) {
    block += `\n        ${combo.name} {\n`;
    block += `            bindings = <${combo.binding}>;\n`;
    block += `            key-positions = <${combo.keyPositions.join(' ')}>;\n`;
    if (combo.timeoutMs != null) {
      block += `            timeout-ms = <${combo.timeoutMs}>;\n`;
    }
    if (combo.layers && combo.layers.length > 0) {
      block += `            layers = <${combo.layers.join(' ')}>;\n`;
    }
    block += `        };\n`;
  }
  block += '    };';
  return block;
}

/**
 * content 中の sectionName { ... }; ブロックを newContent に置換
 * @param {string} content
 * @param {string} sectionName
 * @param {string} newContent
 * @returns {string}
 */
function replaceSectionBlock(content, sectionName, newContent) {
  const searchStr = sectionName + ' {';
  const idx = content.indexOf(searchStr);
  if (idx === -1) return content;

  const braceStart = content.indexOf('{', idx);
  if (braceStart === -1) return content;

  let depth = 0;
  let braceEnd = braceStart;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { braceEnd = i; break; }
    }
  }

  // 閉じ '}' の後のセミコロンを含める
  let semiEnd = braceEnd + 1;
  while (semiEnd < content.length && content[semiEnd] !== ';' && content[semiEnd] !== '\n') semiEnd++;
  if (semiEnd < content.length && content[semiEnd] === ';') semiEnd++;

  return content.slice(0, idx) + newContent + content.slice(semiEnd);
}

/**
 * 文字列の pos 位置にある '{' から対応する '}' までのブロック内容を返す
 * @param {string} text
 * @param {number} pos - '{' のインデックス
 * @returns {string|null}
 */
function extractBlock(text, pos) {
  // pos から '{' を探す
  let start = text.indexOf('{', pos);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start + 1, i);
      }
    }
  }
  return null;
}

/**
 * bindings 文字列をキーバインディングの配列に変換
 * @param {string} bindingsStr
 * @returns {string[]}
 */
function parseBindings(bindingsStr) {
  const keys = [];
  // &xxx YYY ZZZ 形式にマッチ
  // 複数引数のバインディングにも対応: &mt LEFT_SHIFT A, &lt 1 SPACE 等
  const tokenRegex = /&[\w_]+(?:\s+[\w_\(\)\-]+)*/g;
  let match;
  while ((match = tokenRegex.exec(bindingsStr)) !== null) {
    keys.push(match[0].trim());
  }
  return keys;
}

/**
 * JSON キーマップデータを .keymap ファイル形式に変換
 * @param {string} originalContent - 元の .keymap ファイル内容
 * @param {object} keymapData - 編集後の JSON データ
 * @returns {string} 新しい .keymap ファイル内容
 */
function generateKeymap(originalContent, keymapData) {
  let result = originalContent;

  // 1. コンボブロックを差し替え
  if (keymapData.combos !== undefined) {
    const newCombosBlock = generateCombosBlock(keymapData.combos);
    result = replaceSectionBlock(result, 'combos', newCombosBlock);
  }

  // 2. 各レイヤーの bindings ブロックを差し替え
  for (const layer of keymapData.layers) {
    const layerName = layer.name;
    const newBindings = formatBindings(layer.keys, layerName);

    // bindings = < ... >; を置換
    const bindingsRegex = new RegExp(
      `(${escapeRegex(layerName)}\\s*\\{[\\s\\S]*?bindings\\s*=\\s*<)[\\s\\S]*?(>;)`,
      'g'
    );
    result = result.replace(bindingsRegex, `$1\n${newBindings}\n            $2`);
  }

  return result;
}

/**
 * キーバインディング配列を整形された文字列に変換
 * @param {string[]} keys
 * @param {string} layerName
 * @returns {string}
 */
function formatBindings(keys, layerName) {
  // roBa のレイアウト: 各行のキー数
  // 行0: 10キー (左5 + 右5)
  // 行1: 12キー (左5+1 + 右5+1)
  // 行2: 12キー (左5+1 + 右5+1)
  // 行3: 9キー (左3+1+1+1 + 右1+1 + 右1)
  const rowLayout = [10, 12, 12, 9];
  const lines = [];
  let idx = 0;

  for (const count of rowLayout) {
    const rowKeys = keys.slice(idx, idx + count);
    lines.push('            ' + rowKeys.join('  '));
    idx += count;
  }

  return lines.join('\n');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ZMK キーコードのカテゴリ定義（GUI 用）
 */
const KEY_CATEGORIES = {
  'アルファベット': [
    'A','B','C','D','E','F','G','H','I','J','K','L','M',
    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'
  ].map(k => ({ label: k, binding: `&kp ${k}` })),

  '数字': [
    'N0','N1','N2','N3','N4','N5','N6','N7','N8','N9'
  ].map((k, i) => ({ label: String(i), binding: `&kp ${k}` })),

  'ファンクション': [
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'
  ].map(k => ({ label: k, binding: `&kp ${k}` })),

  '修飾キー': [
    { label: 'Shift', binding: '&kp LEFT_SHIFT' },
    { label: 'Ctrl', binding: '&kp LEFT_CONTROL' },
    { label: 'Alt', binding: '&kp LEFT_ALT' },
    { label: 'Win', binding: '&kp LEFT_WIN' },
    { label: 'RShift', binding: '&kp RIGHT_SHIFT' },
    { label: 'RCtrl', binding: '&kp RIGHT_CONTROL' },
    { label: 'RAlt', binding: '&kp RIGHT_ALT' },
  ],

  'ナビゲーション': [
    { label: '↑', binding: '&kp UP_ARROW' },
    { label: '↓', binding: '&kp DOWN_ARROW' },
    { label: '←', binding: '&kp LEFT_ARROW' },
    { label: '→', binding: '&kp RIGHT_ARROW' },
    { label: 'Home', binding: '&kp HOME' },
    { label: 'End', binding: '&kp END' },
    { label: 'PgUp', binding: '&kp PAGE_UP' },
    { label: 'PgDn', binding: '&kp PAGE_DOWN' },
    { label: 'Del', binding: '&kp DELETE' },
    { label: 'BS', binding: '&kp BACKSPACE' },
    { label: 'Tab', binding: '&kp TAB' },
    { label: 'Esc', binding: '&kp ESCAPE' },
    { label: 'Enter', binding: '&kp ENTER' },
    { label: 'Space', binding: '&kp SPACE' },
  ],

  '記号': [
    { label: '-', binding: '&kp MINUS' },
    { label: '=', binding: '&kp EQUAL' },
    { label: '[', binding: '&kp LEFT_BRACKET' },
    { label: ']', binding: '&kp RIGHT_BRACKET' },
    { label: '\\', binding: '&kp BACKSLASH' },
    { label: ';', binding: '&kp SEMICOLON' },
    { label: "'", binding: '&kp APOSTROPHE' },
    { label: '`', binding: '&kp GRAVE' },
    { label: ',', binding: '&kp COMMA' },
    { label: '.', binding: '&kp PERIOD' },
    { label: '/', binding: '&kp SLASH' },
    { label: '!', binding: '&kp EXCLAMATION' },
    { label: '@', binding: '&kp AT_SIGN' },
    { label: '#', binding: '&kp HASH' },
    { label: '$', binding: '&kp DOLLAR' },
    { label: '%', binding: '&kp PERCENT' },
    { label: '^', binding: '&kp CARET' },
    { label: '&', binding: '&kp AMPERSAND' },
    { label: '*', binding: '&kp ASTERISK' },
    { label: '(', binding: '&kp LEFT_PARENTHESIS' },
    { label: ')', binding: '&kp RIGHT_PARENTHESIS' },
    { label: '+', binding: '&kp PLUS' },
    { label: '|', binding: '&kp PIPE' },
    { label: '~', binding: '&kp TILDE' },
    { label: '?', binding: '&kp QUESTION' },
    { label: ':', binding: '&kp COLON' },
    { label: '"', binding: '&kp DOUBLE_QUOTES' },
    { label: '<', binding: '&kp LESS_THAN' },
    { label: '>', binding: '&kp GREATER_THAN' },
    { label: '_', binding: '&kp UNDERSCORE' },
  ],

  'メディア': [
    { label: '音量+', binding: '&kp C_VOLUME_UP' },
    { label: '音量-', binding: '&kp C_VOLUME_DOWN' },
    { label: 'ミュート', binding: '&kp C_MUTE' },
    { label: '再生/停止', binding: '&kp C_PLAY_PAUSE' },
    { label: '次の曲', binding: '&kp C_NEXT' },
    { label: '前の曲', binding: '&kp C_PREVIOUS' },
  ],

  'マウス': [
    { label: 'MB1', binding: '&mkp MB1' },
    { label: 'MB2', binding: '&mkp MB2' },
    { label: 'MB3', binding: '&mkp MB3' },
    { label: 'MB4', binding: '&mkp MB4' },
    { label: 'MB5', binding: '&mkp MB5' },
  ],

  'Bluetooth': [
    { label: 'BT 0', binding: '&bt BT_SEL 0' },
    { label: 'BT 1', binding: '&bt BT_SEL 1' },
    { label: 'BT 2', binding: '&bt BT_SEL 2' },
    { label: 'BT 3', binding: '&bt BT_SEL 3' },
    { label: 'BT 4', binding: '&bt BT_SEL 4' },
    { label: 'BT CLR', binding: '&bt BT_CLR' },
    { label: 'BT CLR ALL', binding: '&bt BT_CLR_ALL' },
  ],

  'レイヤー': [], // 動的に生成
  '特殊': [
    { label: 'Trans', binding: '&trans' },
    { label: 'NONE', binding: '&none' },
    { label: 'BootLoader', binding: '&bootloader' },
  ],
};

/**
 * バインディング文字列の表示ラベルを返す
 * @param {string} binding
 * @returns {string}
 */
function getKeyLabel(binding) {
  if (!binding) return '?';
  binding = binding.trim();

  if (binding === '&trans') return '▽';
  if (binding === '&none') return '✕';
  if (binding === '&bootloader') return 'BOOT';

  // &kp KEY
  const kpMatch = binding.match(/^&kp\s+(.+)$/);
  if (kpMatch) {
    const key = kpMatch[1];
    // 全カテゴリから検索
    for (const cat of Object.values(KEY_CATEGORIES)) {
      const found = cat.find(k => k.binding === binding);
      if (found) return found.label;
    }
    return key.replace('_ARROW', '').replace('LEFT_', 'L').replace('RIGHT_', 'R');
  }

  // &mt MOD KEY
  const mtMatch = binding.match(/^&mt\s+(\S+)\s+(.+)$/);
  if (mtMatch) return `MT\n${getKeyLabel('&kp ' + mtMatch[2])}`;

  // &lt LAYER KEY
  const ltMatch = binding.match(/^&lt(?:_to_layer_0)?\s+(\d+)\s+(.+)$/);
  if (ltMatch) return `L${ltMatch[1]}\n${getKeyLabel('&kp ' + ltMatch[2])}`;

  // &mo LAYER
  const moMatch = binding.match(/^&mo\s+(\d+)$/);
  if (moMatch) return `MO\n${moMatch[1]}`;

  // &to LAYER
  const toMatch = binding.match(/^&to\s+(\d+)$/);
  if (toMatch) return `TO\n${toMatch[1]}`;

  // &mkp BUTTon
  const mkpMatch = binding.match(/^&mkp\s+(.+)$/);
  if (mkpMatch) return mkpMatch[1];

  // &bt CMD
  const btMatch = binding.match(/^&bt\s+(.+)$/);
  if (btMatch) return btMatch[1].replace('BT_', '').replace('SEL ', 'BT');

  // &kp LS(LG(S)) のような修飾付き
  const lsMatch = binding.match(/^&kp\s+(.+)$/);
  if (lsMatch) {
    return lsMatch[1].substring(0, 6);
  }

  return binding.replace('&', '').substring(0, 8);
}

module.exports = { parseKeymap, generateKeymap, parseCombos, generateCombosBlock, getKeyLabel, KEY_CATEGORIES };
