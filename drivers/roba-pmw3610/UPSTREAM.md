# roBa PMW3610 compatibility copy

Source: https://github.com/kumamuk-git/zmk-pmw3610-driver/tree/5e04553ab803d24405bd45621a41310ea3050e59

The C sources, headers, Kconfig and devicetree binding retain their upstream copyright and SPDX notices. This copy preserves roBa's existing CPI, scroll/snipe layers, automouse, and ball-action behavior while moving to Zephyr 4.1.

Local changes:

- Rename the devicetree compatible from `pixart,pmw3610` to `roba,pmw3610`, and the C `DT_DRV_COMPAT` accordingly. Zephyr 4.1 ships another `pixart,pmw3610` binding; loading both is an error.
- Load the driver through the config repository's `zephyr/module.yml` instead of a second west module.
- Pass `locking = false` to the updated ZMK layer activate/deactivate API, preserving momentary automouse behavior.

Do not re-add the unmodified upstream driver to `west.yml`, as that reintroduces the duplicate binding.
