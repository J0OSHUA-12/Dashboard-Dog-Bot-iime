/*
  DogBotDashboard.ino — Firmware NUEVO para "Dog Bot Control"
  ===========================================================
  Placas: Arduino UNO (ATmega328P) o ESP32 (DevKit / WROOM-32), con un
  PCA9685 en 0x40, PWM 50 Hz. El mismo archivo sirve para las dos: elige la
  placa en el editor del dashboard (o en Arduino IDE) antes de compilar.
  Protocolo: DOGBOT v1 (ver docs/PROTOCOLO.md). 115200 baudios, líneas ASCII
  por el USB de la placa. El protocolo es idéntico en ambas.

  ESTADO: PENDIENTE DE VALIDACIÓN FÍSICA. Probado sólo en software (arnés de
  pruebas en PC, variantes UNO y ESP32). No se ha cargado en el robot. La
  variante ESP32 no se ha compilado todavía con el core real de Espressif.

  ESP32 (ver docs/ESP32.md):
    - I2C en GPIO21 (SDA) y GPIO22 (SCL); se cambian con DOGBOT_SDA/DOGBOT_SCL.
    - El ESP32 trabaja a 3,3 V y sus pines NO toleran 5 V: alimenta el VCC
      (lógica) del PCA9685 desde el pin 3V3 del ESP32, nunca desde 5 V. La
      potencia de los servos (V+) sigue yendo aparte, con GND común.
    - Por ahora el enlace es sólo el USB. WiFi y Bluetooth no se usan.

  NO sustituye ni modifica los sketches históricos:
    - CAMINATA_FLUIDA_PROBADA.ino, CAMINATA_2_0_EXPERIMENTAL.ino,
      CALIBRACION_6_SERVOS.ino (en DOGBOT_CLAUDE_CODE/originales/).

  Comportamiento de seguridad:
    - Al arrancar NO mueve nada: pone los 16 canales del PCA9685 en
      "full OFF" (sin pulso). Los servos quedan sin señal (pueden ceder si
      sostienen peso). No hay marcha ni centrado automático.
    - El sistema arranca DESARMADO. Para mover hace falta: LIMIT (límites
      del canal) -> ARM -> ENABLE canal pulso -> MOVE.
    - ENABLE escribe el pulso inicial de inmediato: sin sensor angular no se
      conoce la postura física real, así que la primera habilitación puede
      producir un salto. Elegir un pulso inicial revisado, con el robot
      sostenido.
    - Límites por canal aplicados AQUÍ (además de en la interfaz). Órdenes
      fuera de rango se RECHAZAN, no se recortan.
    - Movimiento NO bloqueante: el puerto serie se atiende siempre; STOP y
      OFF se procesan en el siguiente ciclo de loop().
    - "cur" es la última consigna PWM escrita, NO una posición medida.
    - Pérdida de enlace (sin líneas válidas durante LINK ms, estando armado
      con canales habilitados): política HOLD (detener trayectoria y mantener
      consigna; los servos siguen haciendo fuerza) u OFF (cortar señal PWM;
      el robot puede caer). Ninguna es segura en todos los ensayos.
    - No se simula ningún sensor. No hay lectura de tensión ni corriente.
    - Sin EEPROM: los límites viven en RAM y la PC los reenvía tras cada
      conexión. Evita escrituras repetidas en EEPROM.

  Nota: el reloj interno del PCA9685 (~25 MHz nominal) varía entre placas;
  los µs escritos son los calculados por la biblioteca, no medidos.
*/

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

#define FW_VERSION "0.2.0"
#define PROTO_VERSION 1

// Placa para la que se compila. Se informa en HELLO (mcu=).
#if defined(ESP32)
#define MCU_NAME "ESP32"
// Pines I2C del ESP32 hacia el PCA9685. Cámbialos aquí si usas otros GPIO.
#ifndef DOGBOT_SDA
#define DOGBOT_SDA 21
#endif
#ifndef DOGBOT_SCL
#define DOGBOT_SCL 22
#endif
#elif defined(ARDUINO_AVR_UNO)
#define MCU_NAME "UNO"
#elif defined(__AVR__)
#define MCU_NAME "AVR"
#else
#define MCU_NAME "OTRA"
#endif

const uint8_t MAX_CH = 12;          // 12 servos previstos: canales 0..11
const uint16_t ABS_MIN = 500;       // banda eléctrica de comandos
const uint16_t ABS_MAX = 2500;
// (No llamarla LINE_MAX: en el ESP32 ese nombre ya es una macro de <limits.h>.)
const uint8_t LINE_LEN = 63;        // caracteres por línea (sin '\n')
const uint8_t MAX_TOK = 16;
const uint16_t TICK_MS = 20;        // periodo de actualización de servos
const uint16_t CAL_MAX_STEP = 50;   // µs máximos por orden en modo CAL
const uint16_t MAX_MOVE_MS = 20000;
const uint8_t PCA_ADDR = 0x40;

const uint8_t F_LIM = 1;   // límites configurados
const uint8_t F_EN = 2;    // canal habilitado (PWM activo)
const uint8_t F_MOV = 4;   // trayectoria en curso

const uint8_t LL_HOLD = 0;
const uint8_t LL_OFF = 1;

struct Chan {
  uint16_t minUs, refUs, maxUs;
  uint16_t cur;       // última consigna escrita (µs)
  uint16_t from, to;  // trayectoria lineal
  uint32_t t0;
  uint16_t dur;
  uint16_t moveId;
  uint8_t flags;
};

Adafruit_PWMServoDriver pwm(PCA_ADDR);
Chan ch[MAX_CH];

bool armed = false;
bool calMode = false;
bool linkLost = false;
uint16_t linkTimeoutMs = 1500;
uint8_t linkPolicy = LL_HOLD;
uint32_t lastRx = 0;
uint16_t reportMs = 0;
uint32_t lastReport = 0;
uint32_t lastTick = 0;
uint16_t slewPerTick = 20;          // 20 µs / 20 ms = 1000 µs/s
uint16_t sessionId = 0;
uint16_t bootId = 0;

char line[LINE_LEN + 1];
uint8_t lineLen = 0;
bool lineOverflow = false;
bool lineBadChar = false;

char *tok[MAX_TOK];
uint8_t ntok = 0;

// ---------------------------------------------------------------- utilidades

int freeRam() {
#if defined(__AVR__)
  extern int __heap_start, *__brkval;
  int v;
  return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
#elif defined(ESP32)
  return (int)ESP.getFreeHeap();  // memoria dinámica libre (cientos de kB)
#else
  return -1;  // arnés de pruebas en PC: no aplica
#endif
}

void printHex4(uint16_t v) {
  const char *h = "0123456789ABCDEF";
  for (int8_t s = 12; s >= 0; s -= 4) Serial.write(h[(v >> s) & 0xF]);
}

// Convierte token decimal estricto (1..5 dígitos) a uint16. false si inválido.
bool parseU16(const char *s, uint16_t &out) {
  if (!s || !*s) return false;
  uint32_t v = 0;
  uint8_t n = 0;
  while (*s) {
    if (*s < '0' || *s > '9') return false;
    v = v * 10 + (uint8_t)(*s - '0');
    if (++n > 5 || v > 65535UL) return false;
    s++;
  }
  out = (uint16_t)v;
  return true;
}

bool isCmd(const char *s, const char *pgmName) { return strcmp_P(s, pgmName) == 0; }

void pcaAllOff() {
  // ALL_LED_OFF_H (0xFD) bit 4 = full OFF en los 16 canales.
  Wire.beginTransmission(PCA_ADDR);
  Wire.write((uint8_t)0xFA);
  Wire.write((uint8_t)0x00);
  Wire.write((uint8_t)0x00);
  Wire.write((uint8_t)0x00);
  Wire.write((uint8_t)0x10);
  Wire.endTransmission();
}

void chanOff(uint8_t c) {
  pwm.setPWM(c, 0, 4096);  // full OFF: sin pulso
  ch[c].flags &= ~(F_EN | F_MOV);
}

void allOff() {
  for (uint8_t i = 0; i < 16; i++) pwm.setPWM(i, 0, 4096);
  for (uint8_t i = 0; i < MAX_CH; i++) ch[i].flags &= ~(F_EN | F_MOV);
}

void stopAll() {
  for (uint8_t i = 0; i < MAX_CH; i++) {
    ch[i].flags &= ~F_MOV;
    ch[i].to = ch[i].cur;
  }
}

uint16_t mask(uint8_t f) {
  uint16_t m = 0;
  for (uint8_t i = 0; i < MAX_CH; i++)
    if (ch[i].flags & f) m |= (1u << i);
  return m;
}

// ---------------------------------------------------------------- respuestas

void okHead(uint16_t id, const __FlashStringHelper *cmd) {
  Serial.print(F("OK "));
  Serial.print(id);
  Serial.print(' ');
  Serial.print(cmd);
}

void err(uint16_t id, const __FlashStringHelper *code, const __FlashStringHelper *detail) {
  Serial.print(F("ER "));
  Serial.print(id);
  Serial.print(' ');
  Serial.print(code);
  if (detail) {
    Serial.print(' ');
    Serial.print(detail);
  }
  Serial.println();
}

void printStatusFields() {
  Serial.print(F(" arm="));
  Serial.print(armed ? 1 : 0);
  Serial.print(F(" mode="));
  Serial.print(calMode ? F("CAL") : F("RUN"));
  Serial.print(F(" lim="));
  printHex4(mask(F_LIM));
  Serial.print(F(" en="));
  printHex4(mask(F_EN));
  Serial.print(F(" mv="));
  printHex4(mask(F_MOV));
  Serial.print(F(" ll="));
  Serial.print(linkLost ? 1 : 0);
  Serial.print(F(" llp="));
  Serial.print(linkPolicy == LL_OFF ? F("OFF") : F("HOLD"));
  Serial.print(F(" llms="));
  Serial.print(linkTimeoutMs);
  Serial.print(F(" slew="));
  Serial.print(slewPerTick);
  Serial.print(F(" rpt="));
  Serial.print(reportMs);
  Serial.print(F(" up="));
  Serial.print(millis());
  Serial.print(F(" fr="));
  Serial.print(freeRam());
}

void printPulses() {
  // PW <millis> c:us ... sólo canales habilitados. "cur" = consigna escrita.
  Serial.print(F("PW "));
  Serial.print(millis());
  for (uint8_t i = 0; i < MAX_CH; i++) {
    if (!(ch[i].flags & F_EN)) continue;
    Serial.print(' ');
    Serial.print(i);
    Serial.print(':');
    Serial.print(ch[i].cur);
  }
  Serial.println();
}

// ---------------------------------------------------------------- comandos

void cmdHello(uint16_t id) {
  if (ntok >= 3) {
    uint16_t s;
    if (!parseU16(tok[2], s)) return err(id, F("ARGS"), F("sesion"));
    sessionId = s;
  }
  okHead(id, F("HELLO"));
  Serial.print(F(" dev=DOGBOT proto="));
  Serial.print(PROTO_VERSION);
  Serial.print(F(" fw=" FW_VERSION " boot="));
  printHex4(bootId);
  Serial.print(F(" ses="));
  Serial.print(sessionId);
  Serial.print(F(" ch="));
  Serial.print(MAX_CH);
  Serial.print(F(" calstep="));
  Serial.print(CAL_MAX_STEP);
  Serial.print(F(" fr="));
  Serial.print(freeRam());
  Serial.print(F(" mcu=" MCU_NAME));
  Serial.println();
}

bool parseChan(uint16_t id, const char *s, uint8_t &c) {
  uint16_t v;
  if (!parseU16(s, v)) {
    err(id, F("ARGS"), F("canal"));
    return false;
  }
  if (v >= MAX_CH) {
    err(id, F("CHANNEL"), F("canal fuera de 0-11"));
    return false;
  }
  c = (uint8_t)v;
  return true;
}

void cmdLimit(uint16_t id) {
  if (ntok != 6) return err(id, F("ARGS"), F("LIMIT ch min ref max"));
  uint8_t c;
  if (!parseChan(id, tok[2], c)) return;
  uint16_t mn, rf, mx;
  if (!parseU16(tok[3], mn) || !parseU16(tok[4], rf) || !parseU16(tok[5], mx)) return err(id, F("ARGS"), F("numeros"));
  if (mn < ABS_MIN || mx > ABS_MAX) return err(id, F("RANGE"), F("fuera de 500-2500"));
  if (!(mn < rf && rf < mx)) return err(id, F("ORDER"), F("min<ref<max"));
  if (ch[c].flags & F_EN) return err(id, F("STATE"), F("desactiva el canal antes"));
  ch[c].minUs = mn;
  ch[c].refUs = rf;
  ch[c].maxUs = mx;
  ch[c].flags |= F_LIM;
  okHead(id, F("LIMIT"));
  Serial.print(F(" ch="));
  Serial.print(c);
  Serial.println();
}

void cmdEnable(uint16_t id) {
  if (ntok != 4) return err(id, F("ARGS"), F("ENABLE ch us"));
  uint8_t c;
  if (!parseChan(id, tok[2], c)) return;
  uint16_t us;
  if (!parseU16(tok[3], us)) return err(id, F("ARGS"), F("us"));
  if (!armed) return err(id, F("STATE"), F("desarmado"));
  if (linkLost) return err(id, F("STATE"), F("enlace perdido: ARM"));
  if (!(ch[c].flags & F_LIM)) return err(id, F("NOLIMIT"), F("sin limites"));
  if (us < ch[c].minUs || us > ch[c].maxUs) return err(id, F("RANGE"), F("fuera de limites"));
  ch[c].cur = us;
  ch[c].to = us;
  ch[c].from = us;
  ch[c].flags = (ch[c].flags | F_EN) & ~F_MOV;
  pwm.writeMicroseconds(c, us);
  okHead(id, F("ENABLE"));
  Serial.print(F(" ch="));
  Serial.print(c);
  Serial.print(F(" us="));
  Serial.print(us);
  Serial.println();
}

void cmdMove(uint16_t id) {
  // MOVE ms ch us [ch us]...
  if (ntok < 5 || ((ntok - 3) % 2) != 0) return err(id, F("ARGS"), F("MOVE ms ch us .."));
  uint16_t ms;
  if (!parseU16(tok[2], ms) || ms > MAX_MOVE_MS) return err(id, F("ARGS"), F("ms 0-20000"));
  if (!armed) return err(id, F("STATE"), F("desarmado"));
  if (linkLost) return err(id, F("STATE"), F("enlace perdido: ARM"));
  uint8_t pairs = (ntok - 3) / 2;
  if (calMode && pairs != 1) return err(id, F("CALSTEP"), F("CAL: un canal por orden"));
  uint8_t cs[6];
  uint16_t us[6];
  uint16_t seen = 0;
  for (uint8_t p = 0; p < pairs; p++) {
    uint8_t c;
    if (!parseChan(id, tok[3 + p * 2], c)) return;
    uint16_t u;
    if (!parseU16(tok[4 + p * 2], u)) return err(id, F("ARGS"), F("us"));
    if (seen & (1u << c)) return err(id, F("ARGS"), F("canal repetido"));
    seen |= (1u << c);
    if (!(ch[c].flags & F_EN)) return err(id, F("DISABLED"), F("canal no habilitado"));
    if (u < ch[c].minUs || u > ch[c].maxUs) return err(id, F("RANGE"), F("fuera de limites"));
    if (calMode) {
      uint16_t d = (u > ch[c].to) ? (u - ch[c].to) : (ch[c].to - u);
      if (d > CAL_MAX_STEP) return err(id, F("CALSTEP"), F("paso > 50us en CAL"));
    }
    cs[p] = c;
    us[p] = u;
  }
  uint32_t now = millis();
  for (uint8_t p = 0; p < pairs; p++) {
    Chan &k = ch[cs[p]];
    k.from = k.cur;
    k.to = us[p];
    k.t0 = now;
    k.dur = ms;
    k.moveId = id;
    if (k.to != k.cur) k.flags |= F_MOV;
    else k.flags &= ~F_MOV;
  }
  okHead(id, F("MOVE"));
  Serial.print(F(" n="));
  Serial.print(pairs);
  Serial.println();
}

void cmdOff(uint16_t id) {
  if (ntok != 3) return err(id, F("ARGS"), F("OFF ch|ALL"));
  if (isCmd(tok[2], PSTR("ALL"))) {
    allOff();
  } else {
    uint8_t c;
    if (!parseChan(id, tok[2], c)) return;
    chanOff(c);
  }
  okHead(id, F("OFF"));
  Serial.print(F(" en="));
  printHex4(mask(F_EN));
  Serial.println();
}

void cmdMode(uint16_t id) {
  if (ntok != 3) return err(id, F("ARGS"), F("MODE CAL|RUN"));
  if (mask(F_MOV)) return err(id, F("STATE"), F("en movimiento"));
  if (isCmd(tok[2], PSTR("CAL"))) calMode = true;
  else if (isCmd(tok[2], PSTR("RUN"))) calMode = false;
  else return err(id, F("ARGS"), F("CAL|RUN"));
  okHead(id, F("MODE"));
  Serial.print(calMode ? F(" mode=CAL") : F(" mode=RUN"));
  Serial.println();
}

void cmdLink(uint16_t id) {
  if (ntok != 4) return err(id, F("ARGS"), F("LINK ms HOLD|OFF"));
  uint16_t ms;
  if (!parseU16(tok[2], ms) || ms < 200 || ms > 10000) return err(id, F("ARGS"), F("ms 200-10000"));
  if (isCmd(tok[3], PSTR("HOLD"))) linkPolicy = LL_HOLD;
  else if (isCmd(tok[3], PSTR("OFF"))) linkPolicy = LL_OFF;
  else return err(id, F("ARGS"), F("HOLD|OFF"));
  linkTimeoutMs = ms;
  okHead(id, F("LINK"));
  Serial.print(F(" llms="));
  Serial.print(linkTimeoutMs);
  Serial.print(linkPolicy == LL_OFF ? F(" llp=OFF") : F(" llp=HOLD"));
  Serial.println();
}

void cmdRate(uint16_t id) {
  uint16_t ms;
  if (ntok != 3 || !parseU16(tok[2], ms) || (ms != 0 && (ms < 100 || ms > 5000))) return err(id, F("ARGS"), F("RATE 0|100-5000"));
  reportMs = ms;
  lastReport = millis();
  okHead(id, F("RATE"));
  Serial.print(F(" rpt="));
  Serial.print(reportMs);
  Serial.println();
}

void cmdSlew(uint16_t id) {
  uint16_t v;
  if (ntok != 3 || !parseU16(tok[2], v) || v < 1 || v > 200) return err(id, F("ARGS"), F("SLEW 1-200"));
  slewPerTick = v;
  okHead(id, F("SLEW"));
  Serial.print(F(" slew="));
  Serial.print(slewPerTick);
  Serial.println();
}

void processLine() {
  // Tokenizar en sitio.
  ntok = 0;
  char *p = line;
  while (*p) {
    while (*p == ' ') *p++ = 0;
    if (!*p) break;
    if (ntok >= MAX_TOK) {
      err(0, F("ARGS"), F("demasiados campos"));
      return;
    }
    tok[ntok++] = p;
    while (*p && *p != ' ') p++;
  }
  if (ntok == 0) return;
  uint16_t id;
  if (!parseU16(tok[0], id) || id == 0) return err(0, F("SYNTAX"), F("id 1-65535"));
  if (ntok < 2) return err(id, F("SYNTAX"), F("falta comando"));
  lastRx = millis();
  const char *c = tok[1];
  if (isCmd(c, PSTR("HB"))) {
    okHead(id, F("HB"));
    Serial.print(F(" up="));
    Serial.print(millis());
    Serial.println();
  } else if (isCmd(c, PSTR("HELLO"))) cmdHello(id);
  else if (isCmd(c, PSTR("STATUS"))) {
    okHead(id, F("STATUS"));
    printStatusFields();
    Serial.println();
  } else if (isCmd(c, PSTR("LIMIT"))) cmdLimit(id);
  else if (isCmd(c, PSTR("ARM"))) {
    armed = true;
    linkLost = false;
    okHead(id, F("ARM"));
    Serial.println();
  } else if (isCmd(c, PSTR("DISARM"))) {
    stopAll();
    allOff();
    armed = false;
    okHead(id, F("DISARM"));
    Serial.println();
  } else if (isCmd(c, PSTR("ENABLE"))) cmdEnable(id);
  else if (isCmd(c, PSTR("MOVE"))) cmdMove(id);
  else if (isCmd(c, PSTR("STOP"))) {
    stopAll();
    okHead(id, F("STOP"));
    Serial.println();
  } else if (isCmd(c, PSTR("OFF"))) cmdOff(id);
  else if (isCmd(c, PSTR("MODE"))) cmdMode(id);
  else if (isCmd(c, PSTR("LINK"))) cmdLink(id);
  else if (isCmd(c, PSTR("RATE"))) cmdRate(id);
  else if (isCmd(c, PSTR("SLEW"))) cmdSlew(id);
  else if (isCmd(c, PSTR("PULSES"))) {
    printPulses();
    okHead(id, F("PULSES"));
    Serial.println();
  }
  else err(id, F("UNKNOWN"), F("comando desconocido"));
}

void readSerial() {
  // Parser incremental: nunca espera a que llegue la línea completa.
  uint8_t budget = 64;  // limita el trabajo por iteración
  while (Serial.available() && budget--) {
    int r = Serial.read();
    if (r < 0) break;
    char c = (char)r;
    if (c == '\r') continue;
    if (c == '\n') {
      if (lineOverflow) err(0, F("OVERFLOW"), F("linea > 63"));
      else if (lineBadChar) err(0, F("SYNTAX"), F("caracter invalido"));
      else {
        line[lineLen] = 0;
        processLine();
      }
      lineLen = 0;
      lineOverflow = false;
      lineBadChar = false;
      continue;
    }
    if (c < 32 || c > 126) {
      lineBadChar = true;
      continue;
    }
    if (lineLen < LINE_LEN) line[lineLen++] = c;
    else lineOverflow = true;
  }
}

void updateMotion(uint32_t now) {
  for (uint8_t i = 0; i < MAX_CH; i++) {
    Chan &k = ch[i];
    if (!(k.flags & F_MOV) || !(k.flags & F_EN)) continue;
    uint32_t el = now - k.t0;
    int32_t desired;
    if (k.dur == 0 || el >= k.dur) desired = k.to;
    else desired = (int32_t)k.from + ((int32_t)k.to - (int32_t)k.from) * (int32_t)el / (int32_t)k.dur;
    int32_t step = desired - (int32_t)k.cur;
    if (step > (int32_t)slewPerTick) step = slewPerTick;
    if (step < -(int32_t)slewPerTick) step = -(int32_t)slewPerTick;
    if (step != 0) {
      k.cur = (uint16_t)((int32_t)k.cur + step);
      pwm.writeMicroseconds(i, k.cur);
    }
    if (k.cur == k.to) {
      k.flags &= ~F_MOV;
      bool pending = false;
      for (uint8_t j = 0; j < MAX_CH; j++)
        if ((ch[j].flags & F_MOV) && ch[j].moveId == k.moveId) pending = true;
      if (!pending) {
        Serial.print(F("EV DONE id="));
        Serial.println(k.moveId);
      }
    }
  }
}

void checkLink(uint32_t now) {
  if (!armed || linkLost || mask(F_EN) == 0) return;
  if (now - lastRx <= linkTimeoutMs) return;
  linkLost = true;
  stopAll();
  if (linkPolicy == LL_OFF) {
    allOff();
    armed = false;
  }
  Serial.print(F("EV LINKLOST llp="));
  Serial.println(linkPolicy == LL_OFF ? F("OFF") : F("HOLD"));
}

void setup() {
  Serial.begin(115200);
#if defined(ESP32)
  Wire.begin(DOGBOT_SDA, DOGBOT_SCL);
#else
  Wire.begin();
#endif
  pcaAllOff();  // antes de begin(): evita salidas previas a 1 kHz
  pwm.begin();
  pwm.setPWMFreq(50);
  for (uint8_t i = 0; i < 16; i++) pwm.setPWM(i, 0, 4096);
  for (uint8_t i = 0; i < MAX_CH; i++) {
    ch[i].minUs = ch[i].refUs = ch[i].maxUs = 0;
    ch[i].cur = ch[i].from = ch[i].to = 0;
    ch[i].flags = 0;
    ch[i].moveId = 0;
  }
#if defined(ESP32)
  // Sin randomSeed(), random() usa el generador por hardware del ESP32.
  bootId = (uint16_t)random(1, 65536);
#else
  uint16_t seed = (uint16_t)micros();
  for (uint8_t a = 0; a < 4; a++) seed = (seed << 3) ^ (seed >> 5) ^ (uint16_t)analogRead(A0 + a);
  bootId = seed ? seed : 1;
#endif
  lastRx = millis();
  lastTick = millis();
#if defined(ESP32)
  // El cargador de arranque del ESP32 escribe su propio texto por este mismo
  // puerto: BOOT empieza siempre en una línea nueva.
  Serial.println();
#endif
  Serial.print(F("BOOT DOGBOT proto="));
  Serial.print(PROTO_VERSION);
  Serial.print(F(" fw=" FW_VERSION " boot="));
  printHex4(bootId);
  Serial.println();
}

void loop() {
  readSerial();
  uint32_t now = millis();
  if (now - lastTick >= TICK_MS) {
    lastTick = now;
    updateMotion(now);
    checkLink(now);
  }
  if (reportMs && (now - lastReport >= reportMs)) {
    lastReport = now;
    if (mask(F_EN)) printPulses();
  }
}
