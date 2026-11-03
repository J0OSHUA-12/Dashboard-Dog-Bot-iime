// PCA9685 simulado para el arnés de pruebas en PC: registra la última
// salida ordenada por canal ("off" o µs). No modela servos ni carga.
#pragma once
#include "Arduino.h"

class Adafruit_PWMServoDriver {
 public:
  int state[16];       // -1 = full OFF, >0 = µs
  int writes[16];
  float freq = 0;
  explicit Adafruit_PWMServoDriver(uint8_t) {
    for (int i = 0; i < 16; i++) { state[i] = -2; writes[i] = 0; }  // -2 = desconocido (antes de setup)
  }
  bool begin(uint8_t = 0) { freq = 1000; return true; }
  void setPWMFreq(float f) { freq = f; }
  uint8_t setPWM(uint8_t n, uint16_t on, uint16_t off) {
    if (n < 16) { state[n] = (off == 4096 && on == 0) ? -1 : -3; writes[n]++; }
    return 0;
  }
  void writeMicroseconds(uint8_t n, uint16_t us) {
    if (n < 16) { state[n] = us; writes[n]++; }
  }
};
