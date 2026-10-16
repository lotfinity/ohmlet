#include <Arduino.h>
void setup() {
 Serial.begin(115200); analogReadResolution(12);
 analogSetPinAttenuation(34, ADC_11db);
 if (!ledcAttach(2, 1000, 8)) { Serial.println("ERROR ledcAttach"); return; }
 Serial.println("READY adc_pwm");
}
void loop() {
 int raw = analogRead(34); int duty = (raw * 255L) / 4095;
 ledcWrite(2, duty);
 Serial.printf("ADC %lu %d %d\n", millis(), raw, duty);
 delay(100);
}
