'use strict';
const { StudioConnection } = require('./protocol');
const { RuntimeComboService } = require('./service');

function hidKeys() {
  const keys = [];
  const add = (label, code, page = 7) => keys.push({ label, value: (page << 16) | code });
  for (let i = 0; i < 26; i++) add(String.fromCharCode(65 + i), 4 + i);
  '1234567890'.split('').forEach((key, i) => add(key, 30 + i));
  ['Enter', 'Esc', 'Backspace', 'Tab', 'Space', '-', '=', '[', ']', '\\', '#', ';', "'", '`', ',', '.', '/', 'Caps Lock'].forEach((key, i) => add(key, 40 + i));
  for (let i = 1; i <= 12; i++) add(`F${i}`, 57 + i);
  ['Print Screen', 'Scroll Lock', 'Pause', 'Insert', 'Home', 'Page Up', 'Delete', 'End', 'Page Down', '→', '←', '↓', '↑'].forEach((key, i) => add(key, 70 + i));
  ['左Ctrl', '左Shift', '左Alt', '左Win', '右Ctrl', '右Shift', '右Alt', '右Win'].forEach((key, i) => add(key, 224 + i));
  [['音量＋', 0xe9], ['音量−', 0xea], ['ミュート', 0xe2], ['再生・停止', 0xcd], ['次の曲', 0xb5], ['前の曲', 0xb6]].forEach(([key, code]) => add(key, code, 12));
  return keys;
}
const HID_KEYS = hidKeys();
function option(select, value, label) {
  const el = document.createElement('option');
  el.value = String(value); el.textContent = label; select.appendChild(el);
}

function mount(container, { serial = navigator.serial, Connection = StudioConnection, Service = RuntimeComboService } = {}) {
  container.innerHTML = `
    <div class="view-header"><h1 class="view-title">本体の設定</h1>
      <div class="view-actions"><button id="rt-dya" class="btn btn-ghost">DYA Studioを開く</button>
      <button id="rt-connect" class="btn btn-primary">USBで接続</button>
      <button id="rt-disconnect" class="btn btn-ghost" disabled>切断</button></div></div>
    <p class="runtime-help">右側をUSBで接続してください。ここでの変更は本体に反映され、ローカルの .keymap ファイルには書き込まれません。</p>
    <p id="rt-status" class="runtime-status" role="status" aria-live="polite">対応ファームウェアの書き込み後に接続できます。</p>
    <div class="runtime-toolbar"><button id="rt-map-tab" class="btn btn-primary">キーマップ</button><button id="rt-combo-tab" class="btn btn-ghost">コンボ</button></div>
    <fieldset id="km-controls" class="runtime-controls" disabled>
      <div class="runtime-toolbar"><button id="km-reload" class="btn btn-ghost">本体から再読み込み</button><button id="km-save" class="btn btn-primary">キーマップを保存</button><button id="km-discard" class="btn btn-ghost">最後の保存状態へ戻す</button></div>
      <p class="runtime-help">レイヤーとキーを選び、動作を編集して「反映して試す」を押してください。保存すると電源を切っても残ります。コンボの保存とは独立しています。</p>
      <p id="km-state" class="runtime-help"></p>
      <div class="runtime-grid"><div>
        <label class="form-label" for="km-layer">レイヤー</label><select id="km-layer" class="form-input"></select>
        <p id="km-position" class="runtime-help"></p>
        <label class="form-label" for="km-behavior">動作</label><select id="km-behavior" class="form-input"></select><div id="km-parameters"></div>
        <button id="km-apply" class="btn btn-primary">反映して試す</button>
      </div><div><div class="runtime-keyboard-scroll"><div id="km-keys" class="runtime-keyboard"></div></div><p class="runtime-help">キーをすべて離してから反映してください。動作やマクロ自体の追加・定義変更はファームウェアのビルドが必要です。</p></div></div>
    </fieldset>
    <fieldset hidden id="rt-controls" class="runtime-controls" disabled>
      <div class="runtime-toolbar">
        <button id="rt-reload" class="btn btn-ghost">本体から再読み込み</button>
        <button id="rt-save" class="btn btn-primary">本体へ保存</button>
        <button id="rt-discard" class="btn btn-ghost">最後の保存状態へ戻す</button>
      </div>
      <p class="runtime-help">「反映」で動作を試せます。「本体へ保存」でコンボ全体を保存すると、電源を切っても残ります。</p>
      <div class="runtime-grid">
        <div><label class="form-label" for="rt-slot">コンボ</label><select id="rt-slot" class="form-input"></select>
          <p id="rt-source" class="runtime-help"></p>
          <label class="form-label" for="rt-name">名前</label><input id="rt-name" class="form-input" maxlength="63">
          <label class="runtime-check"><input id="rt-enabled" type="checkbox" checked> 有効</label>
          <label class="form-label" for="rt-behavior">動作</label><select id="rt-behavior" class="form-input"></select>
          <div id="rt-parameters"></div>
          <label class="form-label" for="rt-timeout">同時押し判定時間（ms）</label>
          <input id="rt-timeout" class="form-input" type="number" min="0" max="65535" value="0">
          <label class="form-label" for="rt-idle">直前の入力からの待ち時間（ms）</label>
          <input id="rt-idle" class="form-input" type="number" min="0" max="65535" value="0">
          <p id="rt-global" class="runtime-help"></p>
          <label class="form-label" for="rt-release">コンボのキーを離す条件</label>
          <select id="rt-release" class="form-input"><option value="0">共通設定に従う</option><option value="1">すべてのキーを離したとき</option><option value="2">どれかのキーを離したとき</option></select>
        </div>
        <div><div class="form-label">組み合わせるキー（2〜16個）</div>
          <div class="runtime-keyboard-scroll"><div id="rt-keys" class="runtime-keyboard"></div></div>
          <p id="rt-positions" class="runtime-help"></p>
          <div class="form-label">対象レイヤー（未選択で全レイヤー）</div><div id="rt-layers" class="runtime-layers"></div>
          <div class="runtime-toolbar"><button id="rt-apply" class="btn btn-primary">反映して試す</button>
            <button id="rt-delete" class="btn btn-ghost">このコンボを削除</button></div>
          <p class="runtime-help">削除も「本体へ保存」するまで一時的な変更です。キーをすべて離してから反映してください。</p>
        </div>
      </div>
    </fieldset>`;
  const el = id => container.querySelector(`#rt-${id}`);
  const km = id => container.querySelector(`#km-${id}`);
  let mapDraft = null, keyPosition = 0;
  let connection = null, service = null, busy = false, draft = null;
  const status = (message, error = false) => {
    el('status').textContent = message;
    el('status').classList.toggle('runtime-error', error);
  };
  const controls = () => {
    el('controls').disabled = busy || !service;
    km('controls').disabled = busy || !service;
    el('connect').disabled = busy || !!connection;
    el('disconnect').disabled = busy || !connection;
    el('dya').disabled = busy || !!connection;
  };
  async function action(work, success) {
    if (busy) return;
    busy = true; controls();
    try {
      await work();
      if (success) status(success);
    } catch (error) {
      status(`${error.message}${(service?.dirty || service?.keymapDirty) ? ' 一部の変更が反映されている可能性があります。本体から再読み込みして確認するか、最後の保存状態へ戻してください。' : ''}`, true);
    } finally { busy = false; controls(); }
  }
  function selectedCombo(index) {
    return service.combos.find(c => c.index === index) || {
      index, name: '', enabled: true, keyPositions: [], layerMask: 0,
      behavior: { behaviorId: service.behaviors[0]?.id || 0, param1: 0, param2: 0 },
      timeoutMs: 0, requirePriorIdleMs: 0, slowReleaseOverride: 0, source: 0,
    };
  }
  function refreshSlots(index = 0) {
    el('slot').replaceChildren();
    for (let i = 0; i < service.settings.maxCombo; i++) {
      const combo = service.combos.find(c => c.index === i);
      option(el('slot'), i, `${i + 1}: ${combo?.name || '未設定'}${combo && !combo.enabled ? '（無効）' : ''}`);
    }
    el('slot').value = String(index);
    showDraft(index);
  }
  function showDraft(index) {
    draft = structuredClone(selectedCombo(index));
    draft.behavior ||= { behaviorId: service.behaviors[0]?.id || 0, param1: 0, param2: 0 };
    el('name').value = draft.name;
    el('enabled').checked = draft.enabled;
    el('timeout').value = draft.timeoutMs;
    el('idle').value = draft.requirePriorIdleMs;
    el('release').value = String(draft.slowReleaseOverride);
    el('source').textContent = ['未設定', 'ファームウェアの初期設定', '変更済みの初期設定', '本体で作成'][draft.source] || '';
    el('global').textContent = `0 は共通設定を使用：同時押し ${service.settings.timeoutMs} ms、待ち時間 ${service.settings.requirePriorIdleMs} ms`;
    el('behavior').replaceChildren();
    for (const b of service.behaviors) option(el('behavior'), b.id, b.displayName || `動作 ${b.id}`);
    if (!service.behaviors.some(b => b.id === draft.behavior.behaviorId)) option(el('behavior'), draft.behavior.behaviorId, `未対応の動作 ${draft.behavior.behaviorId}`);
    el('behavior').value = String(draft.behavior.behaviorId);
    renderParameters(); renderKeyboard(); renderLayers();
  }
  function renderParameters(get = el, binding = draft.behavior, prefix = 'rt') {
    const target = get('parameters'); target.replaceChildren();
    const behavior = service.behaviors.find(b => b.id === Number(get('behavior').value));
    for (const key of ['param1', 'param2']) {
      const descriptions = (behavior?.metadata || []).flatMap(m => m[key] || []);
      const label = document.createElement('label'); label.className = 'form-label'; label.htmlFor = `${prefix}-${key}`;
      label.textContent = descriptions.find(d => d.name)?.name || (key === 'param1' ? '引数1' : '引数2');
      const select = document.createElement('select'); select.className = 'form-input'; select.id = `${prefix}-${key}`;
      const values = new Map();
      if (descriptions.some(d => d.hidUsage)) HID_KEYS.forEach(k => values.set(k.value, k.label));
      for (const d of descriptions) {
        if (Object.hasOwn(d, 'constant')) values.set(d.constant, d.name || String(d.constant));
        if (d.nil) values.set(0, 'なし');
        if (d.layerId) service.layers.forEach(l => values.set(l.id, `${l.id}: ${l.name || 'レイヤー'}`));
        if (d.range && d.range.max - d.range.min <= 100) {
          for (let n = Math.max(0, d.range.min); n <= d.range.max; n++) values.set(n, `${d.name || ''} ${n}`);
        }
      }
      if (!descriptions.length) values.set(0, 'なし');
      const current = binding[key];
      if (!values.has(current)) values.set(current, `現在の値: ${current}`);
      for (const [value, name] of values) option(select, value, name);
      option(select, 'custom', '数値で指定…'); select.value = String(current);
      const input = document.createElement('input'); input.className = 'form-input'; input.type = 'number';
      input.min = '0'; input.max = '4294967295'; input.value = String(current); input.hidden = true;
      input.setAttribute('aria-label', `${label.textContent}の数値`);
      select.onchange = () => {
        input.hidden = select.value !== 'custom';
        if (input.hidden) { input.value = select.value; binding[key] = Number(select.value); }
        else binding[key] = Number(input.value);
      };
      input.oninput = () => { binding[key] = input.value.trim() ? Number(input.value) : NaN; };
      target.append(label, select, input);
    }
  }
  function renderKeyboard(get = el, isMap = false) {
    const target = get('keys'); target.replaceChildren();
    const keys = service.layout.keys;
    const minX = Math.min(...keys.map(k => k.x)), minY = Math.min(...keys.map(k => k.y));
    const scale = 0.42;
    target.style.width = `${(Math.max(...keys.map(k => k.x + k.width)) - minX + 40) * scale}px`;
    target.style.height = `${(Math.max(...keys.map(k => k.y + k.height)) - minY + 80) * scale}px`;
    keys.forEach((k, i) => {
      const key = document.createElement('button'); key.type = 'button';
      key.className = 'runtime-key';
      const binding = isMap ? service.layers.find(l => l.id === Number(km('layer').value))?.bindings[i] : null;
      key.textContent = isMap ? bindingLabel(binding) : String(i); key.title = `キー位置 ${i}: ${key.textContent}`;
      key.disabled = isMap && !binding;
      key.setAttribute('aria-label', `キー位置 ${i}`);
      key.setAttribute('aria-pressed', String(isMap ? keyPosition === i : draft.keyPositions.includes(i)));
      Object.assign(key.style, { left: `${(k.x - minX) * scale}px`, top: `${(k.y - minY) * scale}px`,
        width: `${(k.width - 5) * scale}px`, height: `${(k.height - 5) * scale}px`,
        transform: `rotate(${k.r / 100}deg)`,
        transformOrigin: `${(k.rx - k.x) * scale}px ${(k.ry - k.y) * scale}px` });
      key.onclick = () => {
        if (isMap) { keyPosition = i; showKey(); return; }
        if (draft.keyPositions.includes(i)) draft.keyPositions = draft.keyPositions.filter(p => p !== i);
        else draft.keyPositions.push(i);
        draft.keyPositions.sort((a, b) => a - b); renderKeyboard();
      };
      target.appendChild(key);
    });
    if (!isMap) el('positions').textContent = `選択中: ${draft.keyPositions.join(', ') || 'なし'}`;
  }
  function renderLayers() {
    el('layers').replaceChildren();
    for (const layer of service.layers) {
      const label = document.createElement('label'); label.className = 'runtime-check';
      const input = document.createElement('input'); input.type = 'checkbox';
      input.checked = !!((draft.layerMask >>> layer.id) & 1);
      input.onchange = () => {
        draft.layerMask = (input.checked ? draft.layerMask | (1 << layer.id) : draft.layerMask & ~(1 << layer.id)) >>> 0;
      };
      label.append(input, document.createTextNode(`${layer.id}: ${layer.name || 'レイヤー'}`));
      el('layers').appendChild(label);
    }
  }
  function bindingLabel(binding) {
    if (!binding) return '—';
    const behavior = service.behaviors.find(b => b.id === binding.behaviorId);
    const hid = behavior?.metadata?.some(m => m.param1?.some(d => d.hidUsage));
    if (hid) return HID_KEYS.find(k => k.value === binding.param1)?.label || `0x${binding.param1.toString(16)}`;
    return `${behavior?.displayName || binding.behaviorId}${binding.param1 || binding.param2 ? ` ${binding.param1}${binding.param2 ? ',' + binding.param2 : ''}` : ''}`;
  }
  function refreshMap() {
    const id = Number(km('layer').value);
    km('layer').replaceChildren();
    service.layers.forEach(l => option(km('layer'), l.id, `${l.id}: ${l.name || 'レイヤー'}`));
    if (service.layers.some(l => l.id === id)) km('layer').value = String(id);
    showKey();
  }
  function showKey() {
    const layer = service.layers.find(l => l.id === Number(km('layer').value));
    if (keyPosition >= layer.bindings.length) keyPosition = 0;
    mapDraft = structuredClone(layer.bindings[keyPosition] || { behaviorId: 0, param1: 0, param2: 0 });
    km('position').textContent = `キー位置 ${keyPosition}：${bindingLabel(layer.bindings[keyPosition])}`;
    km('state').textContent = service.keymapDirty ? '本体に未保存のキーマップ変更があります。' : '本体のキーマップは保存済みです。';
    km('behavior').replaceChildren();
    service.behaviors.forEach(b => option(km('behavior'), b.id, b.displayName || `動作 ${b.id}`));
    if (!service.behaviors.some(b => b.id === mapDraft.behaviorId)) option(km('behavior'), mapDraft.behaviorId, `未対応の動作 ${mapDraft.behaviorId}`);
    km('behavior').value = String(mapDraft.behaviorId);
    km('apply').disabled = !layer.bindings[keyPosition];
    renderParameters(km, mapDraft, 'km'); renderKeyboard(km, true);
  }
  function switchMode(map) {
    km('controls').hidden = !map; el('controls').hidden = map;
    el('map-tab').className = `btn ${map ? 'btn-primary' : 'btn-ghost'}`;
    el('combo-tab').className = `btn ${map ? 'btn-ghost' : 'btn-primary'}`;
  }
  el('map-tab').onclick = () => switchMode(true);
  el('combo-tab').onclick = () => switchMode(false);
  km('layer').onchange = showKey;
  km('behavior').onchange = () => {
    mapDraft = { behaviorId: Number(km('behavior').value), param1: 0, param2: 0 };
    renderParameters(km, mapDraft, 'km');
  };
  km('apply').onclick = () => action(async () => {
    await service.applyBinding(Number(km('layer').value), keyPosition, mapDraft); refreshMap();
  }, 'キーを本体へ反映しました。「キーマップを保存」で電源を切っても残ります。');
  km('reload').onclick = () => action(async () => { await service.refreshKeymap(); refreshMap(); }, '本体のキーマップを読み込みました。');
  km('save').onclick = () => action(async () => { await service.saveKeymap(); refreshMap(); }, 'キーマップを本体へ保存しました。');
  km('discard').onclick = () => action(async () => { await service.discardKeymap(); refreshMap(); }, 'キーマップを最後の保存状態へ戻しました。');
  el('connect').onclick = () => action(async () => {
    if (!serial) throw new Error('この環境ではUSBシリアル通信を利用できません');
    const port = await serial.requestPort({});
    status('本体の設定を読み込んでいます…');
    connection = new Connection(port, { onDisconnect(error) {
      const unsaved = service?.dirty || service?.keymapDirty;
      service = null; connection = null;
      status(error?.message || `切断しました。${unsaved ? '未保存の変更があります。電源を切ると失われます。' : ''}`, !!error);
      controls();
    } });
    try {
      await connection.open();
      const candidate = new Service(connection); await candidate.initialize();
      service = candidate; refreshSlots(); refreshMap();
      status(`${service.device.name} に接続しました。${service.settings.maxCombo} 個までコンボを設定できます。`);
    } catch (error) {
      await connection?.close(); connection = null; service = null; throw error;
    }
  });
  el('disconnect').onclick = () => action(async () => { await connection?.close(); });
  el('dya').onclick = () => window.roba.openDyaStudio();
  el('slot').onchange = () => showDraft(Number(el('slot').value));
  el('behavior').onchange = () => {
    draft.behavior = { behaviorId: Number(el('behavior').value), param1: 0, param2: 0 }; renderParameters();
  };
  el('reload').onclick = () => action(async () => { await service.refresh(); refreshSlots(Number(el('slot').value)); }, '本体の現在の設定を読み込みました。');
  el('apply').onclick = () => action(async () => {
    draft.name = el('name').value; draft.enabled = el('enabled').checked;
    draft.timeoutMs = el('timeout').value === '' ? 0 : Number(el('timeout').value);
    draft.requirePriorIdleMs = el('idle').value === '' ? 0 : Number(el('idle').value);
    draft.slowReleaseOverride = Number(el('release').value);
    const index = draft.index; await service.apply(draft); refreshSlots(index);
  }, '本体へ反映しました。電源を切った後も使うには「本体へ保存」を押してください。');
  el('delete').onclick = () => action(async () => { const index = draft.index; await service.remove(index); refreshSlots(index); }, 'コンボを削除しました。削除を残すには「本体へ保存」を押してください。');
  el('save').onclick = () => action(() => service.save(), '本体へ保存しました。電源を切ってもコンボ設定が残ります。');
  el('discard').onclick = () => action(async () => { await service.discard(); refreshSlots(Number(el('slot').value)); }, '最後の保存状態へ戻しました。');
  controls();
  return { disconnect: () => connection?.close() };
}
module.exports = { mount, HID_KEYS };
