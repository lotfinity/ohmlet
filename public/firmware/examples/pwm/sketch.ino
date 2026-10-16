#include <Arduino.h>
void setup() {
 Serial.begin(115200);
 if (!ledcAttach(2, 1000, 8)) { Serial.println("ERROR ledcAttach"); return; }
 ledcWrite(2, 128); Serial.println("READY pwm duty=128 frequency=1000 resolution=8");
}
void loop() { delay(100); }
