const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseKeymap, generateKeymap, generateCombosBlock } = require('../src/keymap-parser');
const source = fs.readFileSync(path.resolve(__dirname, '../../../config/roBa.keymap'), 'utf8');

test('all nine migrated combos retain bindings, positions, and stable slots on save', () => {
  const parsed = parseKeymap(source);
  assert.equal(parsed.combos.length, 9);
  assert.deepEqual(parsed.combos.map(c => c.slot), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(parsed.combos.find(c => c.name === 'mouse3').keyPositions, [18, 19, 20]);
  const generated = generateKeymap(source, parsed);
  assert.match(generated, /cormoran,runtime-combo-defaults/);
  assert.doesNotMatch(generated, /compatible = "zmk,combos"/);
  assert.deepEqual(parseKeymap(generated).combos, parsed.combos);
  assert.deepEqual(parseKeymap(generated).layers, parsed.layers);
  assert.match(generated, /automouse-layer = <4>/);
  assert.match(generated, /encoder_msc_down_up/);
});
test('deleting or reordering combos does not renumber persistent runtime slots', () => {
  const parsed = parseKeymap(source);
  parsed.combos = parsed.combos.slice(1).reverse();
  parsed.combos.push({ name: 'new_combo', binding: '&kp TAB', keyPositions: [1, 2], timeoutMs: 80 });
  const after = parseKeymap(generateKeymap(source, parsed)).combos;
  assert.equal(after.find(c => c.name === 'mouse3').slot, 3);
  assert.equal(after.find(c => c.name === 'new_combo').slot, 0);
});
test('retains default display names and combo timing properties', () => {
  const combo = { name: 'test', displayName: 'test combo', slot: 5, binding: '&kp TAB', keyPositions: [1, 2], timeoutMs: 80, requirePriorIdleMs: 175, slowRelease: true, layers: [1, 2] };
  const parsed = parseKeymap(`/ { ${generateCombosBlock([combo], true)} };`);
  assert.deepEqual(parsed.combos[0], combo);
  assert.throws(() => generateCombosBlock([combo, combo], true), /重複/);
});
test('continues to edit legacy static combo files', () => {
  const legacy = source.replace('runtime_combo_defaults {', 'combos {').replace('cormoran,runtime-combo-defaults', 'zmk,combos');
  const parsed = parseKeymap(legacy);
  parsed.combos[0].binding = '&kp TAB';
  const after = generateKeymap(legacy, parsed);
  assert.match(after, /compatible = "zmk,combos"/);
  assert.equal(parseKeymap(after).combos[0].binding, '&kp TAB');
});
