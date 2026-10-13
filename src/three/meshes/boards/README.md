# FireBeetle 2 ESP32-E — Phase 1

Implemented as catalog type `firebeetle_esp32e` (DFR0654-F). Choose it in the
component drawer or load **More → Examples → FireBeetle ESP32 LED blink**.
Run the simulation and select the board to change USB power, reset, the user
button, and individual GPIO modes. Each output has independent HIGH, LOW,
high-impedance input, and PWM settings. Frequency and duty are live controls.
GPIO34/35/36/39 are input-only. The inspector shows pin voltages, digital
input state, and idealized 12-bit ADC readings on ADC-capable header pins.

## Pin interface
Header order follows the manufacturer's USB-at-top pinout:
https://wiki.dfrobot.com/dfr0654-f/

Left: RST, 3V3, NC, GND, EN, 18, 23, 19, 22, 21, 2, 13, 14, 0, 26, 25, TX1, RX3.
Right: VCC, 3V3, GND, SCL22, SDA21, 15, 35, 34, 39, 36, 12, 4, 16, 17.
Use `ESP1:GPIO2`, `ESP1:GND`, etc. Duplicate header contacts have suffix
`_2` and are electrically joined. RST and EN share the enable net.
NC has no electrical function. GPIO27/D4 is the onboard user button and
is exposed in telemetry, not as an invented external header contact.
GPIO5/WS2812, GDI, and wireless protocols are not implemented.

## Models
The procedural PCB is 25.4 × 60 mm at 2.54 mm per scene unit.
Header contacts use a single shared geometry mapping for scene picking,
wire routing, collision validation and placement. The board sits beside
the breadboard and can be dragged; layout positions and parameters survive
JSON export/import and undo/redo. Cosmetic component placement is approximate,
not a manufacturer CAD reproduction.

USB power is an idealized source (3.3V rail, approximately 4.7V VCC). GPIO
drivers have 40-ohm output impedance; inputs release their drive. PWM uses
simulation time, not wall time, and is limited to 1kHz for the existing
50µs solver timestep. Reset releases GPIOs while the power rails remain on.
ADC is an ideal 0–3.3V conversion, not the real ESP32 attenuation/calibration
curve. External VCC/battery powering, charging, input protection and MCU
power consumption are not modeled. This is an educational GPIO model.

## Phase 2 seam
The catalog pin identifiers and simulation nets are stable. A future firmware
adapter can replace GPIO drive selection and read the same resolved pin nets.
No Xtensa CPU, Arduino firmware execution, I²C/SPI/UART, Wi-Fi or Bluetooth
emulation is included in Phase 1.
