# FireBeetle 2 ESP32-E — Phase 1

The initial procedural model is in `firebeetle.ts`. It is deliberately not
registered in the component catalog yet: the current off-board instrument
placement has a fixed two-terminal footprint and would make a 30+ pin board
incorrectly wireable and cause invalid overlap/routing.

Next implementation steps:
1. Verify the exact DFR0654-F manufacturer pinout and header positions.
2. Add a board-sized placement kind or generalized multi-pin offboard footprint.
3. Bind each verified electrical pin to an individually selectable connector.
4. Add safe 3.3V GPIO and power-domain simulation with runtime controls.
5. Add a demo with LED and series resistor; validate telemetry and UI.
6. Later, implement a firmware execution adapter behind the same pin interface.

The model dimensions are physical approximations; cosmetic header positions,
USB-C, and shield placement must be checked against manufacturer CAD before
calling this a faithful reproduction. No ESP32 firmware execution exists yet.
