# Firmware

## `DogBotDashboard/DogBotDashboard.ino` (NUEVO)

Firmware para Dog Bot Control: protocolo DOGBOT v1, 115200 baudios. Ver
[docs/PROTOCOLO.md](../docs/PROTOCOLO.md).

- **Placas:** el mismo archivo sirve para **Arduino UNO** y para **ESP32** (DevKit,
  WROOM-32). Las diferencias están en bloques `#if defined(ESP32)`: pines I²C (GPIO21/22),
  memoria libre e id de arranque. El protocolo es idéntico; `HELLO` informa la placa en
  `mcu=`. Ver [docs/ESP32.md](../docs/ESP32.md).
- **Estado:** la versión 0.2.0 compila para Arduino UNO (avr-gcc 7.3: 13 950 B de flash y
  838 B de RAM estática) y se probó **solo en software** con el arnés `pruebas_host/`, en
  sus dos variantes. La variante ESP32 **no se ha compilado con el core real de Espressif**.
  **Pendiente de validación física.**
- Arranca **sin mover nada**: los 16 canales quedan en full OFF y el firmware desarmado.
- Requiere `Wire` y **Adafruit PWM Servo Driver Library** (que a su vez instala Adafruit
  BusIO).
- No sustituye a los sketches históricos de `DOGBOT_CLAUDE_CODE/originales/`, que no se
  modificaron.

## `pruebas_host/`

Entorno Arduino **simulado** para compilar y ejecutar el firmware en una PC con g++. Lo usa
`tests/firmware.host.test.ts`; si no hay g++, la prueba se omite, como pasa en Windows sin
compilador. Sirve para probar el parser, los estados, los límites, la parada y la pérdida de
enlace. **No** representa el comportamiento eléctrico ni mecánico.

Las pruebas compilan el firmware dos veces: con `-DARDUINO_AVR_UNO` y con `-DESP32`, que
activa las ramas del ESP32 sobre unas pocas funciones simuladas de su core y define las
mismas macros de `<limits.h>` que la biblioteca C del ESP32 (`LINE_MAX`, `PATH_MAX`…), para
que un nombre del firmware que choque con ellas falle aquí. Eso comprueba la lógica de esas
ramas, **no** que el código compile con el core real.

```bash
g++ -std=c++17 -DESP32 -I firmware/pruebas_host firmware/pruebas_host/harness.cpp -o harness
printf '> 1 HELLO\n> 2 LIMIT 1 1300 1500 1700\n> 3 ARM\n> 4 ENABLE 1 1500\np\n' | ./harness
```
