# Your default breadboard
The user photo shows a 400-point board: 30 numbered rows, a–j terminal letters, a centre channel, and 25 holes on each of four power rails. Each a–e group and f–j group at one number is a separate connected strip. Rails are modelled continuous; if a real rail is split, bridge it explicitly after checking continuity.

New and cleared browser boards, new MCP workspaces, and AI generation default to one half (400-point) board. Every bundled lesson and firmware circuit declares board: half. Old untagged documents retain their legacy 63-column interpretation so existing wiring is not clipped.

Counter: reset button relocated to f1; display still counts/reset correctly. Firmware ADC/PWM: output resistor/LED moved to rows 14,18,22. Four-digit date: packed onto TWO 30-row boards with locally numbered rows, independent rails and explicit red/black inter-board power jumpers. The menu warns before loading. New month-display lesson shows 06 on ONE board. No components or electrical functions were discarded from the full date lesson.

The renderer prints every number 1–30 for this board. App references use letter then number (a12); power-rail indices remain zero-based for compatibility (top+0 is the first hole). The More panel explains the mapping. Supplies, ESP32 boards and controller modules remain off-board, as they would on the real bench.
