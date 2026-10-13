const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { FakeDevicePort } = require('./fake-device');
const { mount } = require('../src/runtime/ui');

async function waitFor(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('UI did not settle');
}
test('USB combo screen supports connect, edit, apply, save and disconnect', async t => {
  const dom = new JSDOM('<section id="screen"></section>');
  global.document = dom.window.document;
  global.window = dom.window;
  const port = new FakeDevicePort();
  const controller = mount(document.getElementById('screen'), { serial: { requestPort: async () => port } });
  t.after(async () => { await controller.disconnect(); dom.window.close(); delete global.document; delete global.window; });
  const get = id => document.getElementById(`rt-${id}`);
  assert.equal(get('controls').disabled, true);
  get('connect').click();
  await waitFor(() => !get('controls').disabled);
  assert.equal(get('slot').options.length, 16);
  assert.equal(document.querySelectorAll('#rt-keys .runtime-key').length, 43);
  assert.equal(get('name').value, 'esc');
  const km = id => document.getElementById(`km-${id}`);
  assert.equal(km('controls').hidden, false);
  assert.equal(km('layer').options.length, 3);
  km('layer').value = '2'; km('layer').dispatchEvent(new dom.window.Event('change'));
  km('keys').children[5].click();
  km('param1').value = String(0x70005); km('param1').dispatchEvent(new dom.window.Event('change'));
  km('apply').click(); await waitFor(() => !km('controls').disabled);
  assert.equal(port.layers[2].bindings[5].param1, 0x70005);
  assert.equal(port.layers[0].bindings[5].param1, 0x70004);
  assert.equal(port.savedLayers[2].bindings[5].param1, 0x70004);
  km('save').click(); await waitFor(() => !km('controls').disabled);
  assert.equal(port.savedLayers[2].bindings[5].param1, 0x70005);
  km('param1').value = String(0x70006); km('param1').dispatchEvent(new dom.window.Event('change'));
  km('apply').click(); await waitFor(() => !km('controls').disabled);
  km('discard').click(); await waitFor(() => !km('controls').disabled);
  assert.equal(port.layers[2].bindings[5].param1, 0x70005);
  get('combo-tab').click();
  assert.equal(km('controls').hidden, true);
  assert.equal(get('controls').hidden, false);
  get('name').value = '日本語'; get('timeout').value = '125';
  get('apply').click(); await waitFor(() => !get('controls').disabled);
  assert.equal(port.combos[0].name, '日本語');
  assert.equal(port.combos[0].timeoutMs, 125);
  assert.equal(port.saved[0].name, 'esc');
  get('save').click(); await waitFor(() => !get('controls').disabled);
  assert.equal(port.saved[0].name, '日本語');
  get('delete').click(); await waitFor(() => !get('controls').disabled);
  assert.equal(port.combos[0].enabled, false);
  get('discard').click(); await waitFor(() => !get('controls').disabled);
  assert.equal(port.combos[0].enabled, true);
  get('disconnect').click(); await waitFor(() => !get('connect').disabled);
  assert.equal(get('controls').disabled, true);
});
