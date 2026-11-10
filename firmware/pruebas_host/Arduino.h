// Simulación MÍNIMA del entorno Arduino para ejecutar el firmware en una PC.
// Sólo para pruebas de software del parser/estados. No representa el
// hardware real: tiempos, I2C y servos están simulados.
#pragma once
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <string>
#include <deque>

typedef uint8_t byte;
typedef bool boolean;

class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper *>(s))
#define PSTR(s) (s)
inline int strcmp_P(const char *a, const char *b) { return std::strcmp(a, b); }

#define A0 14
extern uint32_t g_millis;
extern uint32_t g_micros_extra;
inline uint32_t millis() { return g_millis; }
inline uint32_t micros() { return g_millis * 1000u + g_micros_extra; }
inline int analogRead(uint8_t pin) { return (pin * 37 + 11) & 1023; }
inline void delay(uint32_t ms) { g_millis += ms; }

#if defined(ESP32)
// Variante ESP32 del arnés (g++ -DESP32): sólo lo que el firmware usa del
// core de Espressif. Valores fijos; no simula el chip.

// La biblioteca C del ESP32 (newlib, <sys/syslimits.h>) define estas macros
// para cualquier sketch; la del AVR no. Se reproducen aquí para que un nombre
// del firmware que choque con ellas falle al compilar el arnés y no en la
// placa. Ya pasó: el firmware 0.1.0 llamaba LINE_MAX a una constante.
#undef ARG_MAX
#undef CHILD_MAX
#undef LINK_MAX
#undef MAX_CANON
#undef MAX_INPUT
#undef NAME_MAX
#undef NGROUPS_MAX
#undef OPEN_MAX
#undef PATH_MAX
#undef PIPE_BUF
#undef IOV_MAX
#undef LINE_MAX
#undef RE_DUP_MAX
#define ARG_MAX 65536
#define CHILD_MAX 40
#define LINK_MAX 32767
#define MAX_CANON 255
#define MAX_INPUT 255
#define NAME_MAX 255
#define NGROUPS_MAX 16
#define OPEN_MAX 64
#define PATH_MAX 1024
#define PIPE_BUF 512
#define IOV_MAX 1024
#define LINE_MAX 2048
#define RE_DUP_MAX 255
class EspClass {
 public:
  uint32_t getFreeHeap() { return 287654; }
};
extern EspClass ESP;
inline long random(long lo, long hi) { return lo + (long)((g_millis * 7919u + 0x5A17u) % (uint32_t)(hi - lo)); }
#endif

class MockSerial {
 public:
  std::deque<uint8_t> rx;
  std::string out;
  void begin(unsigned long) {}
  int available() { return (int)rx.size(); }
  int read() {
    if (rx.empty()) return -1;
    int c = rx.front();
    rx.pop_front();
    return c;
  }
  size_t write(char c) { out.push_back(c); return 1; }
  size_t write(uint8_t c) { out.push_back((char)c); return 1; }
  void print(const char *s) { out += s; }
  void print(const __FlashStringHelper *s) { out += reinterpret_cast<const char *>(s); }
  void print(char c) { out.push_back(c); }
  void print(int v) { out += std::to_string(v); }
  void print(unsigned int v) { out += std::to_string(v); }
  void print(long v) { out += std::to_string(v); }
  void print(unsigned long v) { out += std::to_string(v); }
  void print(uint16_t v) { out += std::to_string(v); }
  void print(uint8_t v) { out += std::to_string((unsigned)v); }
  void println() { out += "\r\n"; }
  template <typename T>
  void println(T v) { print(v); println(); }
};
extern MockSerial Serial;
