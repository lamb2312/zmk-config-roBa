const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StudioConnection, FrameDecoder, frame, encode, requestType } = require('../src/runtime/protocol');
const { RuntimeComboService, validateCombo } = require('../src/runtime/service');
const { FakeDevicePort } = require('./fake-device');

test('custom subsystem request uses the pinned ZMK wire tags', () => {
  assert.deepEqual([...encode(requestType, { requestId: 1, custom: { listCustomSubsystems: {} } })], [8, 1, 162, 6, 2, 10, 0]);
});
test('framing preserves all bytes, split escapes, and resynchronizes after noise', () => {
  const data = Uint8Array.from({ length: 256 }, (_, i) => i);
  const replies = [];
  const decoder = new FrameDecoder(bytes => replies.push(bytes));
  decoder.push(Uint8Array.of(0, 1, 2));
  for (const b of frame(data)) decoder.push(Uint8Array.of(b));
  assert.deepEqual(replies, [data]);
});
test('device discovery, combo edits, persistence, deletion and discard over framed USB', async t => {
  const port = new FakeDevicePort();
  const conn = new StudioConnection(port); await conn.open();
  t.after(() => conn.close());
  const service = new RuntimeComboService(conn); await service.initialize();
  assert.equal(service.subsystem.index, 4);
  assert.equal(service.layers[0].id, 0);
  assert.equal(service.combos[0].index, 0);
  assert.equal(service.combos[0].layerMask, 0);
  const combo = { ...service.combos[0], name: '日本語コンボ', keyPositions: [8, 9, 10], layerMask: 4 };
  await service.apply(combo);
  assert.equal(service.combos[0].name, '日本語コンボ');
  assert.equal(service.dirty, true);
  assert.equal(port.saved[0].name, 'esc');
  await service.save();
  assert.equal(port.saved[0].name, '日本語コンボ');
  assert.equal(service.dirty, false);
  await service.remove(0); assert.equal(service.combos[0].enabled, false);
  await service.discard(); assert.equal(service.combos[0].enabled, true);
});
test('invalid combo is rejected before any USB write; partial failure remains dirty', async t => {
  const port = new FakeDevicePort(); const conn = new StudioConnection(port); await conn.open();
  t.after(() => conn.close());
  const service = new RuntimeComboService(conn); await service.initialize();
  const count = port.requests.length;
  await assert.rejects(service.apply({ ...service.combos[0], keyPositions: [43, 44] }), /キー位置/);
  assert.equal(port.requests.length, count);
  port.failName = true;
  await assert.rejects(service.apply({ ...service.combos[0], timeoutMs: 100 }), /Name write failed/);
  assert.equal(service.dirty, true);
  assert.equal(port.saved[0].timeoutMs, 50);
  assert.equal(port.combos[0].timeoutMs, 100);
});
test('validates UTF-8 names, duplicate positions, layers and numeric limits', () => {
  const combo = new FakeDevicePort().defaultCombo;
  const limits = { maxCombo: 16, keyCount: 43, layerIds: [0, 1, 2], behaviorIds: [7] };
  validateCombo(combo, limits);
  for (const change of [{ name: 'あ'.repeat(22) }, { keyPositions: [0, 0] }, { index: 16 },
    { layerMask: 8 }, { timeoutMs: NaN }, { requirePriorIdleMs: -1 }, { slowReleaseOverride: 3 }]) {
    assert.throws(() => validateCombo({ ...combo, ...change }, limits));
  }
});
test('locked and unsupported firmware cannot be edited', async () => {
  for (const flag of ['locked', 'unsupported']) {
    const port = new FakeDevicePort(); port[flag] = true;
    const conn = new StudioConnection(port); await conn.open();
    try { await assert.rejects(new RuntimeComboService(conn).initialize(), /ロック|非対応/); }
    finally { await conn.close(); }
  }
});
test('timeout disconnects, rejects queued work and never retries a request', async () => {
  const port = new FakeDevicePort(); port.drop = true;
  const conn = new StudioConnection(port, { timeoutMs: 20 }); await conn.open();
  const results = await Promise.allSettled([conn.call({ core: { getDeviceInfo: true } }), conn.call({ core: { getLockState: true } })]);
  assert.deepEqual(results.map(r => r.status), ['rejected', 'rejected']);
  assert.match(results[0].reason.message, /タイムアウト/);
  assert.equal(port.requests.length, 1);
  assert.equal(conn.closed, true);
});
test('USB removal rejects pending work promptly', async () => {
  const port = new FakeDevicePort(); port.drop = true;
  const conn = new StudioConnection(port); await conn.open();
  const pending = conn.call({ core: { getDeviceInfo: true } });
  await new Promise(resolve => setImmediate(resolve));
  port.controller.close();
  await assert.rejects(pending, /切断/);
  assert.equal(conn.closed, true);
});
test('keymap uses stable layer IDs and saves independently of combos; rejects invalid edits', async t => {
  const port = new FakeDevicePort();
  port.layers[1].id = 5; port.savedLayers = structuredClone(port.layers);
  const conn = new StudioConnection(port); await conn.open(); t.after(() => conn.close());
  const service = new RuntimeComboService(conn); await service.initialize();
  const binding = { behaviorId: 7, param1: 0x70005, param2: 0 };
  const before = port.requests.length;
  for (const args of [[1, 0, binding], [5, 43, binding], [5, 0, { ...binding, param1: -1 }], [5, 0, { ...binding, behaviorId: 999 }]]) await assert.rejects(service.applyBinding(...args));
  assert.equal(port.requests.length, before);
  await service.apply({ ...service.combos[0], name: 'unsaved combo' });
  await service.applyBinding(5, 42, binding);
  assert.equal(service.keymapDirty, true);
  assert.deepEqual(port.layers[1].bindings[42], binding);
  assert.equal(port.layers[0].bindings[42].param1, 0x70004);
  await service.saveKeymap();
  assert.equal(service.keymapDirty, false);
  assert.equal(service.dirty, true);
  assert.equal(port.saved[0].name, 'esc');
  port.bindingError = 3;
  await assert.rejects(service.applyBinding(5, 42, { ...binding, param1: 0x70006 }), /引数/);
  assert.deepEqual(service.layers[1].bindings[42], binding);
  port.bindingError = 0;
  await service.applyBinding(5, 42, { ...binding, param1: 0x70006 });
  port.saveError = true;
  await assert.rejects(service.saveKeymap(), /保存できません/);
  assert.equal(service.keymapDirty, true);
  await service.discardKeymap();
  assert.deepEqual(service.layers[1].bindings[42], binding);
  assert.equal(port.combos[0].name, 'unsaved combo');
});
