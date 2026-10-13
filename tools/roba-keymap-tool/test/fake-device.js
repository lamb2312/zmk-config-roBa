const { FrameDecoder, frame, encode, decode, requestType, responseType,
  comboRequestType, comboResponseType } = require('../src/runtime/protocol');

class FakeDevicePort {
  constructor() {
    this.requests = [];
    this.layers = [0, 1, 2].map(id => ({ id, name: `Layer ${id}`, bindings: Array.from({ length: 43 }, () => ({ behaviorId: 7, param1: 0x70004, param2: 0 })) }));
    this.savedLayers = structuredClone(this.layers);
    this.defaultCombo = { index: 0, name: 'esc', keyPositions: [0, 1],
      behavior: { behaviorId: 7, param1: 0x70029, param2: 0 }, layerMask: 0,
      enabled: true, timeoutMs: 50, requirePriorIdleMs: 0, slowReleaseOverride: 0, source: 1 };
    this.combos = [structuredClone(this.defaultCombo)];
    this.saved = structuredClone(this.combos);
  }
  async open() {
    this.readable = new ReadableStream({ start: controller => { this.controller = controller; } });
    const decoder = new FrameDecoder(bytes => this.receive(decode(requestType, bytes)));
    this.writable = new WritableStream({ write: bytes => decoder.push(bytes) });
  }
  async close() { this.wasClosed = true; }
  emit(reply) {
    const bytes = frame(encode(responseType, reply));
    for (let i = 0; i < bytes.length; i += 3) this.controller.enqueue(bytes.slice(i, i + 3));
  }
  receive(req) {
    this.requests.push(req);
    if (this.drop) return;
    let reply;
    if (req.core?.getDeviceInfo) reply = { core: { getDeviceInfo: { name: 'roBa test', serialNumber: Uint8Array.of(0xab, 0xac, 0xad) } } };
    else if (req.core?.getLockState) reply = { core: { getLockState: this.locked ? 0 : 1 } };
    else if (req.custom?.listCustomSubsystems) reply = { custom: { listCustomSubsystems: { subsystems: this.unsupported ? [] : [{ index: 4, identifier: 'cormoran__runtime_combo', uiUrl: [] }] } } };
    else if (req.keymap?.getPhysicalLayouts) reply = { keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: 'roBa', keys: Array.from({ length: 43 }, (_, i) => ({ x: i % 10 * 100, y: Math.floor(i / 10) * 100, width: 100, height: 100, r: 0, rx: 0, ry: 0 })) }] } } };
    else if (req.keymap?.getKeymap) reply = { keymap: { getKeymap: { layers: this.layers } } };
    else if (req.keymap?.checkUnsavedChanges) reply = { keymap: { checkUnsavedChanges: JSON.stringify(this.layers) !== JSON.stringify(this.savedLayers) } };
    else if (req.keymap?.setLayerBinding) {
      const value = req.keymap.setLayerBinding;
      const code = this.bindingError || 0;
      if (!code) this.layers.find(l => l.id === value.layerId).bindings[value.keyPosition] = structuredClone(value.binding);
      reply = { keymap: { setLayerBinding: code } };
    } else if (req.keymap?.saveChanges) {
      if (!this.saveError) this.savedLayers = structuredClone(this.layers);
      reply = { keymap: { saveChanges: this.saveError ? { err: 1 } : { ok: true } } };
    } else if (req.keymap?.discardChanges) {
      this.layers = structuredClone(this.savedLayers);
      reply = { keymap: { discardChanges: true } };
    }
    else if (req.behaviors?.listAllBehaviors) reply = { behaviors: { listAllBehaviors: { behaviors: [7] } } };
    else if (req.behaviors?.getBehaviorDetails) reply = { behaviors: { getBehaviorDetails: { id: 7, displayName: 'Key Press', metadata: [{ param1: [{ name: 'Key', hidUsage: { keyboardMax: 255, consumerMax: 1023 } }], param2: [] }] } } };
    else if (req.custom?.call) reply = this.custom(req.custom.call);
    else reply = { meta: { simpleError: 2 } };
    // An unrelated notification must not steal the outstanding response.
    this.emit({ notification: { core: { lockStateChanged: 1 } } });
    this.emit({ requestResponse: { requestId: req.requestId, ...reply } });
  }
  custom(call) {
    const req = decode(comboRequestType, call.payload);
    let result = { status: { affectedCount: 1, message: 'ok' } };
    if (req.getGlobalSettings) result = { getGlobalSettings: { settings: { timeoutMs: 50, slowRelease: false, maxCombo: 16, requirePriorIdleMs: 0 } } };
    else if (req.listCombos) result = { listCombos: { combos: this.combos } };
    else if (req.setCombo) {
      const value = req.setCombo;
      this.combos = this.combos.filter(c => c.index !== value.index);
      this.combos.push({ ...value, name: '', source: 3 });
    } else if (req.setComboName) {
      if (this.failName) result = { error: { message: 'Name write failed' } };
      else this.combos.find(c => c.index === req.setComboName.index).name = req.setComboName.name;
    } else if (req.deleteCombo) {
      this.combos.find(c => c.index === req.deleteCombo.index).enabled = false;
    } else if (req.save) this.saved = structuredClone(this.combos);
    else if (req.discard) this.combos = structuredClone(this.saved);
    return { custom: { call: { subsystemIndex: call.subsystemIndex, payload: encode(comboResponseType, result) } } };
  }
}
module.exports = { FakeDevicePort };
