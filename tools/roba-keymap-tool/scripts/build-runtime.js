const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');
const esbuild = require('esbuild');
const base = path.resolve(__dirname, '..');
const root = new protobuf.Root();
root.loadSync([
  path.join(base, 'vendor/studio/studio.proto'),
  path.join(base, 'vendor/runtime-combo/runtime_combo.proto'),
]);
root.resolveAll();
fs.mkdirSync(path.join(base, 'src/runtime'), { recursive: true });
fs.writeFileSync(path.join(base, 'src/runtime/schema.json'), JSON.stringify(root.toJSON()));
esbuild.buildSync({
  entryPoints: [path.join(base, 'src/runtime/ui.js')],
  outfile: path.join(base, 'src/renderer/runtime.bundle.js'),
  bundle: true, platform: 'browser', target: 'chrome132',
  format: 'iife', globalName: 'RobaRuntime', legalComments: 'eof',
});
