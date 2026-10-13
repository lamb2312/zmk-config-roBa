'use strict';
const protobuf = require('protobufjs/light');
const root = protobuf.Root.fromJSON(require('./schema.json'));
const requestType = root.lookupType('zmk.studio.Request');
const responseType = root.lookupType('zmk.studio.Response');
const comboRequestType = root.lookupType('cormoran.runtime_combo.Request');
const comboResponseType = root.lookupType('cormoran.runtime_combo.Response');

function encode(type, value) {
  const error = type.verify(value);
  if (error) throw new Error(error);
  return type.encode(type.create(value)).finish();
}
function decode(type, bytes) {
  // Do not populate absent oneof fields: enum value 0 is a valid response.
  return type.toObject(type.decode(bytes), { arrays: true, defaults: true });
}
function frame(bytes) {
  const out = [0xab];
  for (const byte of bytes) {
    if (byte >= 0xab && byte <= 0xad) out.push(0xac);
    out.push(byte);
  }
  out.push(0xad);
  return Uint8Array.from(out);
}
class FrameDecoder {
  constructor(onFrame) { this.onFrame = onFrame; this.reset(); }
  reset() { this.active = false; this.escaped = false; this.bytes = []; }
  push(chunk) {
    for (const b of chunk) {
      if (this.escaped) { this.bytes.push(b); this.escaped = false; }
      else if (b === 0xab) { this.bytes = []; this.active = true; }
      else if (!this.active) continue;
      else if (b === 0xac) this.escaped = true;
      else if (b === 0xad) {
        const bytes = Uint8Array.from(this.bytes);
        this.reset();
        this.onFrame(bytes);
      } else this.bytes.push(b);
      if (this.bytes.length > 262144) throw new Error('受信データが大きすぎます');
    }
  }
}

// One outstanding request, correlated by ID; no automatic retry of writes.
class StudioConnection {
  constructor(port, { timeoutMs = 5000, onDisconnect = () => {} } = {}) {
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.onDisconnect = onDisconnect;
    this.nextId = 1;
    this.pending = null;
    this.queue = Promise.resolve();
    this.closed = false;
  }
  async open() {
    await this.port.open({ baudRate: 12500 });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.readTask = this.readLoop();
  }
  async readLoop() {
    const decoder = new FrameDecoder(bytes => {
      const message = decode(responseType, bytes);
      const reply = message.requestResponse;
      if (!reply || reply.requestId !== this.pending?.id) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      if (reply.meta) {
        const messages = ['通信エラー', 'キーボードのロックを解除してください', '対応する機能がありません', '要求の形式が一致しません', '応答の生成に失敗しました'];
        pending.reject(new Error(messages[reply.meta.simpleError] || '応答がありません'));
      } else pending.resolve(reply);
    });
    try {
      while (!this.closed) {
        const { done, value } = await this.reader.read();
        if (done) break;
        decoder.push(value);
      }
    } catch (error) {
      this.readError = error;
    } finally {
      this.reader.releaseLock();
      this.reader = null;
      if (!this.closed) void this.close(this.readError || new Error('USB接続が切断されました'));
    }
  }
  call(body) {
    const run = () => {
      if (this.closed) throw new Error('キーボードに接続していません');
      const id = this.nextId++;
      const bytes = frame(encode(requestType, { ...body, requestId: id }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          // Completion is unknown after a timeout. Close rather than replaying writes.
          void this.close(new Error('応答がタイムアウトしました。再接続して本体の状態を確認してください'));
        }, this.timeoutMs);
        this.pending = { id, resolve, reject, timer };
        this.writer.write(bytes).catch(error => { void this.close(error); });
      });
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
  async close(error) {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error || new Error('接続を終了しました'));
      this.pending = null;
    }
    this.onDisconnect(error);
    try { await this.reader?.cancel(); } catch {}
    try { await this.readTask; } catch {}
    try { await this.writer?.abort(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null;
    try { await this.port.close(); } catch {}
  }
}
module.exports = { root, encode, decode, frame, FrameDecoder, StudioConnection,
  requestType, responseType, comboRequestType, comboResponseType };
