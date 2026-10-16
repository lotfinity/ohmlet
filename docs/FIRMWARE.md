# Arduino firmware prototype

The Code panel compiles a single Arduino .ino sketch for the original ESP32 FireBeetle, loads the actual bootloader/partition/app binaries into esp32sim, and runs it with the existing SimEngine in a dedicated browser Worker. This supports exactly one FireBeetle per circuit. Existing manual GPIO simulation remains available.

## Use

Open Code. A demo replaces the circuit (undoable) and loads its compiled sketch; press Run. Button and potentiometer controls are available within the panel. For your own code, add a FireBeetle to the circuit, paste the sketch, then Compile & load sketch. Compiler errors and serial output appear in the panel. Pause preserves machine state; Reset reboots by creating a new emulator from the same images. Manual GPIO mode unloads the firmware.

## Runtime limits

- GPIO/ADC inputs are sampled at 0.5ms boundaries; circuit solver steps are 50µs. Short pulses and sub-millisecond interrupt response can be missed. This is not cycle-accurate electrical co-simulation.
- Firmware PWM up to 1kHz is mapped to the existing circuit model with approximate phase. The emulator's hardware duty/frequency reports are tested; this is not verification of an exact PWM edge train.
- ADC attenuation behavior is nominal, not calibrated against a physical chip.
- Wi-Fi, Bluetooth, USB peripherals and arbitrary external sensor libraries are not integrated. Unsupported firmware may stop with an error.
- Keep board power enabled and its reset control released; use the Code panel Reset. Power-cycling and external reset semantics are not modeled yet.
- The dedicated worker is terminated when firmware is unloaded/reloaded. Browser close ends execution. Structural circuit edits rebuild the circuit state while preserving firmware time; runtime button/pot changes preserve electrical state.
- Scope in firmware mode samples at the UI update cadence, not at the manual-mode 1kHz scope cadence.

## Compiler

server/firmware.ts uses `.firmware-tools/arduino-cli` and `.firmware-tools/arduino.yaml`, override with OHMLET_ARDUINO_CLI / OHMLET_ARDUINO_CONFIG. Install ESP32 core 3.3.10. Compilation requires Linux bubblewrap and prlimit. Each compiler runs without network access, with a read-only toolchain and only its job directory writable, a minimal environment, and memory/CPU limits. Compile jobs use one compiler worker, a five-minute process timeout and an eight-job cache under `.firmware-cache/`; no physical flashing commands exist. No arbitrary shell command or library-install API is exposed. The prototype compiles one sketch against the installed core and standard libraries; multi-file projects/library management are future work. Existing deployment host/origin restrictions remain in effect.

MCP adds firmware_compile, firmware_status, and firmware_browser_load. Load requires a connected workbench browser and one FireBeetle. Use browser_control run/pause/reset afterwards. workspace_read exposes firmware status and recent serial data under browser.state.firmware. Headless simulation_run/verify still use manual catalog GPIO parameters, not compiled firmware.

## Rebuild and tests

See public/firmware/SOURCES.md. Rebuild the WASM asset with scripts/firmware/build-wasm.sh. `npm test -- tests/firmware.test.ts` executes all four actual compiled demo sketches with real circuit inputs/output loads against the exact packaged WASM binary. Also run typecheck, affected FireBeetle/RGB tests, build and mcp:test.

Fast-PWM LED brightness is averaged over each worker frame for display; electrical pin voltages remain instantaneous.
