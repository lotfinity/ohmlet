---
name: add-electrify-component
description: Add or repair an Electrify/Ohmlet component through source-code access, including mcp-acer terminal commands. Use for missing catalog parts, custom boards, electrical models, pin mappings, realistic 3D assets, example circuits, and component integration tests.
---

# Add an Electrify component

## Establish the checkout and scope

1. Verify the remote host with `hostname`, then enter the intended checkout.
   On Acer, use `/home/lofa/Projects/ohmlet`. Do not confuse a relay device's
   filesystem with Acer's filesystem.
2. Read applicable `AGENTS.md` files and inspect `git status --short`,
   `git branch --show-current`, and `package.json`. Preserve unrelated edits.
   Use an already-authorized alternate connection if mcp-acer is unavailable;
   do not treat an unavailable connector as proof that Acer is offline.
3. Read this workflow before changing components. Resolve exact part/revision
   from the request or manufacturer evidence; ask only when ambiguity materially
   affects implementation.
4. Distinguish source development from circuit editing. Electrify MCP can use
   catalog parts; adding a new type requires catalog, simulation, and rendering
   source changes. Never assume a component-registration tool exists: inspect
   live tools before using it.
5. Separate visual representation, electrical simulation, and firmware/hardware
   execution. Do not claim firmware, Wi-Fi, Bluetooth, or physical flashing
   support merely because a board has a realistic mesh.

## Write the component specification first

Record the specification in the change's documentation or PR description:

- Exact manufacturer, model, revision/SKU, source URLs, asset licenses, and dates
  where relevant. Prefer manufacturer datasheets, pinouts, dimensions, and CAD.
- Catalog type ID, category, placement kind, ordered logical pins, aliases,
  permanently connected pins, supply/ground, input-only pins, and voltage limits.
- Parameters with units, defaults, ranges, discrete options, and runtime behavior.
- Body dimensions, origin, rotation, pin pitch, socket/contact height, and bounds.
- Supported electrical behavior, explicit approximations, and observable tests.
- Minimal example circuits and expected measured outcomes.

Verify contradictions against primary sources. Do not infer a pinout from a
generic ESP32 diagram or from the visual ordering of labels alone.

## Inspect the shared integration points

Read only the relevant implementations; use the nearest working component as
a reference rather than copying every FireBeetle-specific assumption.

| Concern | Existing source |
| --- | --- |
| Catalog, pins, parameters, model identifiers | `src/model/catalog.ts` |
| Layout and telemetry contracts | `src/model/types.ts` |
| FireBeetle pin aliases and physical coordinates | `src/model/firebeetle.ts` |
| Pin expansion, hole/terminal references, off-board placement | `src/model/breadboard.ts` |
| Occupancy, bounds, parameter and placement validation | `src/model/validate.ts` |
| Body occlusion | `src/model/occlusion.ts` |
| Source stamping, supply detection and runtime stepping | `src/sim/engine.ts` |
| Internal bridges, terminal connectivity and ground selection | `src/sim/netlist.ts` |
| Analog devices and behavioral chip registration | `src/sim/devices.ts`, `src/sim/chips/all.ts` |
| Mesh construction, dispatch and disposal | `src/three/component-meshes.ts` |
| Existing board asset loading and fallback | `src/three/meshes/boards/firebeetle.ts`, `src/three/meshes/gltf-overrides.ts` |
| Scene updates and interaction | `src/three/scene.ts`, `src/three/scene-api.ts` |
| Store, runtime parameters and UI actions | `src/state/store.ts`, `src/ui/sheets/PropertiesSheet.tsx` |
| AI designer context and verification | `src/llm/prompt.ts`, `src/llm/schema.ts`, `src/llm/verify.ts` |
| Learning examples and menu integration | `examples/`, `src/ui/sheets/MoreSheet.tsx` |
| MCP handlers and deployment notes | `server/index.ts`, `docs/MCP.md` |

Trace the actual imports and dispatch sites before editing. Do not invent file
names, function signatures, telemetry fields, or parameter keys.

## Implement and prove electrical behavior

1. Add the catalog entry and the appropriate shared electrical model. Register
   behavioral chips through the existing mechanism when applicable.
2. Preserve ordered pin semantics: catalog order determines lead-hole order and
   package pin numbering. Represent duplicate electrical contacts with the
   existing internal-bridge mechanism.
3. For a new powered board or instrument, inspect both source detection in the
   engine and ground selection in the netlist. A mesh and catalog entry alone
   do not make a board supply current or establish the right reference.
4. Reuse `validateLayout`, `buildNetlist`, `SimEngine`, and `verifyCircuit`.
   Keep browser and MCP electrical behavior consistent; do not introduce an
   independent solver just for MCP.
5. Add focused tests for actual behavior: supply on/off, loaded output, input
   sensing, runtime parameter changes, aliases/bridges, relevant invalid
   configurations, and representative dynamic behavior. Measure voltages,
   currents, frequency or duty cycle as appropriate; assert useful tolerances.
6. Use a minimal valid layout to prove behavior before building elaborate art.

Use `tests/firebeetle.test.ts`, `tests/instruments.test.ts`,
`tests/netlist.test.ts`, `tests/validate.test.ts`, and `tests/verify.test.ts`
as references. Choose only tests relevant to the change.

## Integrate the visual and physical model

1. Prefer licensed manufacturer CAD plus real reference photographs when
   realism matters. Use an inexpensive procedural fallback while assets load.
   Record source attribution alongside assets in `public/models/`; consult
   `public/models/firebeetle-esp32e.SOURCES.md` as an existing example.
2. Simplify excessive CAD detail and compress/resize textures appropriately for
   Acer's 4 GB RAM and mobile clients. Report asset bytes, triangles and draw
   calls. The existing FireBeetle asset is a reference, not a mandatory budget.
3. Align scale, axes, origin and rotation with the project's coordinates.
   Consult existing coordinate helpers: a breadboard pitch represents 2.54 mm;
   do not scatter unverified millimeter-to-scene conversions through files.
4. Share pin/socket coordinates with wire endpoints and routing obstacles.
   Verify contact height as well as X/Z positions. For the FireBeetle, sockets
   sit well above the PCB; placing wire ends at PCB height produced bad joins.
5. Keep renderer bounds, off-board spacing, body occlusion, routing clearance,
   hit targets, selection, and placement validation consistent.
6. Cache reusable model-loading promises and shared GPU assets. Clone instances
   without disposing shared geometry/textures when one instance is removed.
   Guard late asynchronous loads after component disposal.
7. Verify telemetry-driven visuals: LEDs, displays, controls or indicators must
   follow measured state instead of a decorative animation.

Use `tests/firebeetle-asset.test.ts` and `tests/meshes.test.ts` for existing
asset/disposal expectations. Inspect a rendered instance and its wire joins.

## Add examples and AI support

- Add small, validated circuits demonstrating the new part. Include readable
  instructions, correct power/ground and protection parts, and measurable
  expected behavior. Register examples in the existing menu.
- Update catalog documentation and designer instructions. Search for obsolete
  exclusions and assumptions, not just the new part's name. FireBeetle work
  uncovered prompts claiming there was no microcontroller and that every
  circuit needed a separate power supply.
- Keep exact catalog pins and parameter names discoverable through MCP.
  Inspect catalog lookup, layout schemas, output schemas, and any static
  type lists; extend them when necessary.
- Preserve on-demand catalog retrieval. Do not inject all assets, source files,
  or a second full catalog into every AI request.
- Verify live MCP discovery and a small circuit using the actual updated server.
  Use an isolated workspace; avoid overwriting the user's active browser board.

## Validate efficiently and deploy the built result

Run from the checkout, adapting the focused tests to the component:

```sh
npm run typecheck
npm test -- tests/firebeetle.test.ts tests/firebeetle-asset.test.ts
npm run build
# Run when MCP handlers, schemas or server integration changed:
npm run mcp:test
```

- Read current scripts first. The build currently produces both Vite assets and
  MCP bundles; restarting an old server bundle does not deploy source changes.
- Verify meaningful behavior, not tests that merely mirror constants. Recheck
  existing affected components after changing shared simulation or geometry.
- Record baseline failures separately from regressions. Historical wire-router
  timing thresholds failed on Acer; re-establish the current baseline instead
  of automatically dismissing a new failure as historical.
- In browser tests, wait for app readiness before timing the operation under
  test. Acer loading and software rendering can exceed short cold-start limits.
  Use one browser at a time and always close it on failure.
- If a test deliberately disables requestAnimationFrame, use timer polling
  (`polling: 100`) instead of RAF-based waits. Do not use that setup to claim
  rendering or animation was verified.
- Inspect the actual app store or persisted app state. A bare dynamic import
  of a Vite store module can create a second store when the mounted app uses
  a timestamped module URL; do not mistake that store for the live workbench.
- Test placement, wires, controls, run/pause/reset, visual response, removal
  and reloading as relevant. Treat headless deterministic simulations and the
  browser's ongoing simulation as distinct runs.

When deployment is authorized, restart only the required Acer user services:
`ohmlet.service` for Vite and `ohmlet-mcp.service` for the MCP backend.
Verify service state, the app, MCP initialization, catalog discovery and an
appropriate measurement after restart. Preserve current tunnel and authentication
settings; component additions do not authorize unrelated access-policy changes.

Stage only intended files, inspect the diff, commit and push the task branch
within the authorized workflow. Report implemented behavior, asset provenance,
checks and measured results, remaining approximations, and the commit. Do not
claim unsupported firmware or physical-device behavior.
