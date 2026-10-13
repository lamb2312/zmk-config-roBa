'use strict';
const { encode, decode, comboRequestType, comboResponseType } = require('./protocol');
const SUBSYSTEM = 'cormoran__runtime_combo';
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: ${min}〜${max} の整数を指定してください`);
  return value;
}
function validateCombo(combo, { maxCombo, keyCount, layerIds, behaviorIds }) {
  integer(combo.index, 0, maxCombo - 1, 'スロット');
  if (typeof combo.name !== 'string' || combo.name.includes('\0') || new TextEncoder().encode(combo.name).length > 63) throw new Error('コンボ名はUTF-8で63バイト以内にしてください');
  if (!Array.isArray(combo.keyPositions) || combo.keyPositions.length < 2 || combo.keyPositions.length > 16) throw new Error('キーは2〜16個選択してください');
  if (new Set(combo.keyPositions).size !== combo.keyPositions.length) throw new Error('キーの重複があります');
  combo.keyPositions.forEach(p => integer(p, 0, keyCount - 1, 'キー位置'));
  if (!combo.behavior || !behaviorIds.includes(combo.behavior.behaviorId)) throw new Error('本体に組み込まれた動作を選択してください');
  integer(combo.behavior.param1, 0, 0xffffffff, 'パラメーター1');
  integer(combo.behavior.param2, 0, 0xffffffff, 'パラメーター2');
  integer(combo.layerMask, 0, 0xffffffff, 'レイヤー');
  for (let i = 0; i < 32; i++) {
    if ((combo.layerMask >>> i) & 1 && !layerIds.includes(i)) throw new Error(`レイヤー ${i} は本体に存在しません`);
  }
  integer(combo.timeoutMs, 0, 65535, '同時押し判定時間');
  integer(combo.requirePriorIdleMs, 0, 65535, '入力後の待ち時間');
  integer(combo.slowReleaseOverride, 0, 2, 'キーを離す条件');
  if (typeof combo.enabled !== 'boolean') throw new Error('有効状態を指定してください');
}
class RuntimeComboService {
  constructor(connection) { this.connection = connection; this.dirty = false; this.keymapDirty = false; }
  async initialize() {
    const device = await this.connection.call({ core: { getDeviceInfo: true } });
    this.device = device.core?.getDeviceInfo;
    if (!this.device) throw new Error('ZMK Studioの応答ではありません');
    const lock = await this.connection.call({ core: { getLockState: true } });
    if (lock.core?.getLockState !== 1) throw new Error('キーボードのStudioロックを解除してください');
    const subsystems = await this.connection.call({ custom: { listCustomSubsystems: {} } });
    this.subsystem = subsystems.custom?.listCustomSubsystems?.subsystems?.find(s => s.identifier === SUBSYSTEM);
    if (!this.subsystem) throw new Error('Runtime Combo非対応です。READMEの手順で対応ファームウェアを書き込んでください');
    const layouts = await this.connection.call({ keymap: { getPhysicalLayouts: true } });
    const all = layouts.keymap?.getPhysicalLayouts;
    this.layout = all?.layouts?.[all.activeLayoutIndex];
    if (!this.layout?.keys?.length) throw new Error('本体のキー配置を読み込めません');
    const keymap = await this.connection.call({ keymap: { getKeymap: true } });
    this.layers = keymap.keymap?.getKeymap?.layers || [];
    const behaviors = await this.connection.call({ behaviors: { listAllBehaviors: true } });
    this.behaviors = [];
    for (const id of behaviors.behaviors?.listAllBehaviors?.behaviors || []) {
      const detail = await this.connection.call({ behaviors: { getBehaviorDetails: { behaviorId: id } } });
      if (detail.behaviors?.getBehaviorDetails) this.behaviors.push(detail.behaviors.getBehaviorDetails);
    }
    await this.refresh();
    await this.refreshKeymap();
  }
  async refreshKeymap() {
    const response = await this.connection.call({ keymap: { getKeymap: true } });
    if (!response.keymap?.getKeymap?.layers?.length) throw new Error('キーマップを読み込めません');
    this.layers = response.keymap.getKeymap.layers;
    const dirty = await this.connection.call({ keymap: { checkUnsavedChanges: true } });
    if (typeof dirty.keymap?.checkUnsavedChanges !== 'boolean') throw new Error('キーマップの保存状態を確認できません');
    this.keymapDirty = dirty.keymap.checkUnsavedChanges;
  }
  async applyBinding(layerId, keyPosition, binding) {
    const layer = this.layers.find(l => l.id === layerId);
    if (!layer) throw new Error('レイヤーが存在しません');
    integer(keyPosition, 0, Math.min(this.layout.keys.length, layer.bindings.length) - 1, 'キー位置');
    if (!binding || !this.behaviors.some(b => b.id === binding.behaviorId)) throw new Error('本体に組み込まれた動作を選択してください');
    integer(binding.param1, 0, 0xffffffff, 'パラメーター1');
    integer(binding.param2, 0, 0xffffffff, 'パラメーター2');
    this.keymapDirty = true; // A lost acknowledgement may still have changed the device.
    const response = await this.connection.call({ keymap: { setLayerBinding: { layerId, keyPosition, binding } } });
    const code = response.keymap?.setLayerBinding;
    if (code !== 0) throw new Error(({ 1: 'キー位置が無効です', 2: '動作が無効です', 3: '動作の引数が無効です' })[code] || 'キー変更の応答を確認できません');
    await this.refreshKeymap();
  }
  async saveKeymap() {
    const response = await this.connection.call({ keymap: { saveChanges: true } });
    if (response.keymap?.saveChanges?.ok !== true) throw new Error('キーマップを保存できませんでした');
    await this.refreshKeymap();
  }
  async discardKeymap() {
    const response = await this.connection.call({ keymap: { discardChanges: true } });
    if (response.keymap?.discardChanges !== true) throw new Error('キーマップを保存状態に戻せませんでした');
    await this.refreshKeymap();
  }
  async rpc(request, expected) {
    const payload = encode(comboRequestType, request);
    if (payload.length > 96) throw new Error('送信データが対応ファームウェアの上限を超えています');
    const response = await this.connection.call({ custom: { call: { subsystemIndex: this.subsystem.index, payload } } });
    const call = response.custom?.call;
    if (!call || call.subsystemIndex !== this.subsystem.index) throw new Error('コンボの応答が一致しません');
    const result = decode(comboResponseType, call.payload);
    if (result.error) throw new Error(result.error.message || '本体が変更を拒否しました');
    if (!result[expected]) throw new Error('対応しないコンボ通信形式です');
    return result[expected];
  }
  async refresh() {
    this.settings = (await this.rpc({ getGlobalSettings: {} }, 'getGlobalSettings')).settings;
    if (!this.settings || this.settings.maxCombo < 1 || this.settings.maxCombo > 16) throw new Error('このツールは1〜16スロットの対応ファームウェアを対象としています');
    this.combos = (await this.rpc({ listCombos: {} }, 'listCombos')).combos;
    return this.combos;
  }
  async apply(combo) {
    validateCombo(combo, {
      maxCombo: this.settings.maxCombo, keyCount: this.layout.keys.length,
      layerIds: this.layers.map(l => l.id), behaviorIds: this.behaviors.map(b => b.id),
    });
    // Validate BOTH payloads before changing anything on the device.
    const { name, source, ...body } = combo;
    const content = { setCombo: { ...body, persist: false } };
    const naming = { setComboName: { index: combo.index, name, persist: false } };
    for (const request of [content, naming]) if (encode(comboRequestType, request).length > 96) throw new Error('送信データが大きすぎます');
    // Two RPCs are not atomic. Keep dirty even on a partial failure; never retry.
    this.dirty = true;
    await this.rpc(content, 'status');
    await this.rpc(naming, 'status');
    await this.refresh();
  }
  async remove(index) {
    integer(index, 0, this.settings.maxCombo - 1, 'スロット');
    this.dirty = true;
    await this.rpc({ deleteCombo: { index, persist: false } }, 'status');
    await this.refresh();
  }
  async save() {
    await this.rpc({ save: {} }, 'status');
    this.dirty = false;
  }
  async discard() {
    await this.rpc({ discard: {} }, 'status');
    this.dirty = false;
    await this.refresh();
  }
}
module.exports = { RuntimeComboService, validateCombo, integer, SUBSYSTEM };
