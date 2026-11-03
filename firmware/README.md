# Firmware

## `DogBotDashboard/DogBotDashboard.ino` (NUEVO)

Firmware para Dog Bot Control: protocolo DOGBOT v1, 115200 baudios. Ver
[docs/PROTOCOLO.md](../docs/PROTOCOLO.md).

- **Estado:** compila para Arduino UNO (avr-gcc: 13 920 B de flash y 838 B de RAM estática)
  y se probó **solo en software** con el arnés `pruebas_host/`. **Pendiente de validación
  física.**
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

```bash
g++ -std=c++17 -I firmware/pruebas_host firmware/pruebas_host/harness.cpp -o harness
printf '> 1 HELLO\n> 2 LIMIT 1 1300 1500 1700\n> 3 ARM\n> 4 ENABLE 1 1500\np\n' | ./harness
```
