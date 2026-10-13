# Pinned protocol definitions

These files are copied without modification from:

- `studio/*.proto`: [cormoran/zmk-studio-messages](https://github.com/cormoran/zmk-studio-messages/tree/89b81d2e587fce807b668dff2a6967a40beef421), commit `89b81d2e587fce807b668dff2a6967a40beef421`, as imported by the pinned firmware.
- `runtime-combo/runtime_combo.proto`: [cormoran/zmk-feature-runtime-combo](https://github.com/cormoran/zmk-feature-runtime-combo/tree/d9490e7b5d41c516221d131241009e81740efcee), commit `d9490e7b5d41c516221d131241009e81740efcee`.

Each directory includes its upstream MIT license. `scripts/build-runtime.js` generates the local protobuf schema and browser bundle. No protocol files are fetched at application startup. Update firmware pins and schemas together, then run the protocol tests.
