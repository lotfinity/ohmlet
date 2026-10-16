#include <Arduino.h>
void setup() { Serial.begin(115200); pinMode(2, OUTPUT); Serial.println("READY blink"); }
void loop() {
 digitalWrite(2, HIGH); Serial.printf("EDGE %lu 1\n", millis()); delay(500);
 digitalWrite(2, LOW); Serial.printf("EDGE %lu 0\n", millis()); delay(500);
}
