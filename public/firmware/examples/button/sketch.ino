#include <Arduino.h>
void setup() { Serial.begin(115200); pinMode(2, OUTPUT); pinMode(13, INPUT_PULLUP); Serial.println("READY button"); }
void loop() {
 bool pressed = digitalRead(13) == LOW;
 digitalWrite(2, pressed);
 static int last = -1;
 if (last != int(pressed)) { Serial.printf("BUTTON %lu %d\n", millis(), pressed); last = pressed; }
 delay(10);
}
