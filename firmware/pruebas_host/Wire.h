// I2C simulado para el arnés de pruebas en PC.
#pragma once
#include "Arduino.h"
#include <vector>

class TwoWire {
 public:
  std::vector<uint8_t> last;
  int allOffWrites = 0;
  void begin() {}
  void beginTransmission(uint8_t) { last.clear(); }
  size_t write(uint8_t b) { last.push_back(b); return 1; }
  uint8_t endTransmission() {
    if (last.size() == 5 && last[0] == 0xFA && last[4] == 0x10) allOffWrites++;
    return 0;
  }
};
extern TwoWire Wire;
