# ALS-001-V1 analog RGB controller

Photo-derived component requested by the owner on 2026-10-15.
Manufacturer and U1 identity are unknown. Reference: owner photographs
20261015_181452, 181448, 181320, 181159, 181211 and earlier 131632/131611/131610.
No third-party CAD or textures are bundled. The procedural mesh is original
code based on those references; dimensions are approximate 34 x 19 mm, derived
from the length ruler and image proportions. The brown substrate, green mask,
barrel jack, U1, three SOT23 devices, D1, 391 resistor and empty U2 footprint
are represented. This is a reconstruction, not an exact manufactured model.

## Terminals

| Pin | Meaning |
| --- | --- |
| VIN / GND | Abstract positive/negative DC jack contacts; use a 12 V bench supply |
| +12V | Strip common positive, internally bridged to VIN |
| G / R / B | Green/red/blue low-side switched outputs |
| VIR | Receiver supply pad, photograph appears labeled +6V; voltage unmeasured |
| GND_IR | Receiver G pad, internally bridged to GND |
| IR | Receiver signal pad |

VIR and IR remain electrically high impedance in this version: no invented
regulator or IR decoder. The receiver G is ground; strip G is green.
Jack contact dimensions and polarity have not been physically measured.
The SOT23 top markings alone do not establish an exact transistor model.

## Behavioral simulation

Externally powered low-side RGB PWM switches (0.1 ohm on, 1 Gohm off).
Control enabled only with positive VIN-GND between 9 and 13 V; this is a
simulation operating window, not a measured absolute rating.
Channel levels, brightness, power and virtual remote presets are runtime controls.
Custom mode uses red/green/blue levels. Other color presets replace those levels.
Jump3, fade3 and flash are illustrative effects with adjustable speed.
Nominal PWM is adjustable 100 Hz (1–1000 Hz); the real frequency is unknown.
No exact remote protocol, IR codes, firmware, DIY memory, actual current limit,
thermal behavior, protection behavior or physical hardware control is emulated.
The pictured 44-key remote is evidence for the product style, not decoded firmware.

## Example and acceptance

The ALS-001 RGB demo uses three separate LED + 1k resistor loads to represent
the three strip channels safely within the simulator. It is not a model of a
whole strip. Wire VIN/GND to the 12 V supply. At full duty an enabled sink
approaches ground and the LED draws roughly 9–10 mA. Disabling power releases
all three outputs; setting supply to zero removes load power. A 25% duty setting
must yield approximately 25% low samples over multiple complete PWM cycles.
Catalog details are shared with MCP and the designer without a second solver.

## Validation on Acer

Typecheck, production build and MCP integration passed. Focused simulation,
netlist, verification, mesh and learning-example regressions passed (102 tests
before the final additional effect test). The final controller suite has 7 tests.
Standalone WebGL render inspected; final mesh: 1,334 triangles, 72 draw calls
including labels. Workbench example menu loading checked in an isolated browser
with RAF disabled for DOM testing; this does not verify ongoing workbench animation.
Live public MCP catalog and isolated worker simulation returned 10.20/9.80/9.00 mA
for red/green/blue 1k LED loads and no issues. Temporary QA workspace deleted.
