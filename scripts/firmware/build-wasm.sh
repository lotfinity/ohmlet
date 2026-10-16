#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
git clone https://github.com/mikroverk/esp32sim.git "$BUILD/esp32sim"
cd "$BUILD/esp32sim"
git checkout 4e49dac2f3d1baee8128e7525443d4d871462973
git apply "$ROOT/scripts/firmware/esp32sim-bridge.patch"
tools/wasm-build.sh
cp web/wasm/esp32sim.wasm "$ROOT/public/firmware/esp32sim.wasm"
tools/fetch-rom-elfs.sh "$BUILD/roms"
cp "$BUILD/roms/esp32_rev300_rom.elf" "$ROOT/public/firmware/"
