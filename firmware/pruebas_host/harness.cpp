// Arnés para ejecutar DogBotDashboard.ino en una PC (pruebas de software).
//
// Compilar:  g++ -std=c++17 -I firmware/pruebas_host firmware/pruebas_host/harness.cpp -o harness
//   Variante UNO:   añade -DARDUINO_AVR_UNO
//   Variante ESP32: añade -DESP32
// Uso (stdin, una orden por línea):
//   > texto        envía "texto\n" al firmware y ejecuta loop()
//   ~ 41 FF 0A     envía bytes hexadecimales crudos (datos corruptos)
//   t N            avanza N ms (loop() cada 1 ms)
//   p              imprime "PWMSTATE c:valor ..." (off, -, o µs)
// La salida del firmware se imprime tal cual; las líneas del arnés empiezan por '#'.
#include "Arduino.h"
#include "Wire.h"
#include "Adafruit_PWMServoDriver.h"

uint32_t g_millis = 0;
uint32_t g_micros_extra = 0;
MockSerial Serial;
TwoWire Wire;
#if defined(ESP32)
EspClass ESP;
#endif

#include "../DogBotDashboard/DogBotDashboard.ino"

#include <iostream>
#include <sstream>

static void flushOut() {
  if (!Serial.out.empty()) {
    std::string s;
    for (char c : Serial.out)
      if (c != '\r') s.push_back(c);
    std::cout << s;
    Serial.out.clear();
  }
}

static void runLoop(int iterations) {
  for (int i = 0; i < iterations; i++) {
    loop();
    flushOut();
  }
}

int main() {
  g_millis = 100;
  setup();
  flushOut();
  std::cout << "# allOffWrites=" << Wire.allOffWrites << "\n";
  std::cout << "# i2c sda=" << Wire.sda << " scl=" << Wire.scl << "\n";
  std::string cmd;
  while (std::getline(std::cin, cmd)) {
    if (cmd.empty()) continue;
    if (cmd[0] == '>') {
      std::string payload = cmd.size() > 2 ? cmd.substr(2) : "";
      for (char c : payload) Serial.rx.push_back((uint8_t)c);
      Serial.rx.push_back('\n');
      while (!Serial.rx.empty()) runLoop(1);
      runLoop(1);
    } else if (cmd[0] == '~') {
      std::istringstream ss(cmd.substr(1));
      std::string h;
      while (ss >> h) Serial.rx.push_back((uint8_t)std::stoul(h, nullptr, 16));
      while (!Serial.rx.empty()) runLoop(1);
      runLoop(1);
    } else if (cmd[0] == 't') {
      int n = std::stoi(cmd.substr(1));
      for (int i = 0; i < n; i++) {
        g_millis++;
        runLoop(1);
      }
    } else if (cmd[0] == 'p') {
      std::cout << "PWMSTATE";
      for (int i = 0; i < 16; i++) {
        int s = pwm.state[i];
        std::cout << ' ' << i << ':';
        if (s == -1) std::cout << "off";
        else if (s < 0) std::cout << "-";
        else std::cout << s;
      }
      std::cout << "\n";
    }
  }
  flushOut();
  return 0;
}
