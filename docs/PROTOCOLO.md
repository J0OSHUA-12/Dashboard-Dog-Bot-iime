# Protocolo serie DOGBOT v1

Entre la PC (servicio local + interfaz) y `firmware/DogBotDashboard/DogBotDashboard.ino`.
El protocolo es **el mismo en Arduino UNO y en ESP32**; las diferencias de cada placa están en
[ESP32.md](ESP32.md).

- **Enlace:** USB/COM, **115200 baudios**, 8N1. Líneas ASCII imprimibles terminadas en `\n`
  (se ignora `\r`).
- **Petición (PC → firmware):** `<id> <COMANDO> [args…]`. El `id` va de 1 a 65535 y
  relaciona la petición con su respuesta. Máximo **63 caracteres** por línea.
- **Respuestas (firmware → PC):**
  - `OK <id> <COMANDO> [clave=valor…]`: orden aceptada.
  - `ER <id> <CÓDIGO> [detalle]`: orden rechazada. El id es 0 si la línea no se pudo
    interpretar.
- **Mensajes espontáneos:**
  - `BOOT DOGBOT proto=1 fw=0.2.0 boot=XXXX`: se emite al arrancar. `boot` es un id aleatorio
    por arranque. Un ESP32 escribe antes unas líneas de su cargador de arranque, que se
    ignoran.
  - `EV DONE id=<id>`: todas las articulaciones del `MOVE <id>` llegaron a su consigna. No se
    emite si otra orden reemplazó a ese `MOVE`.
  - `EV LINKLOST llp=HOLD|OFF`: el firmware detectó pérdida de enlace.
  - `PW <millis> <canal>:<µs> …`: **consigna PWM escrita**, solo de los canales habilitados.
    **No es una posición medida.**

## Comandos

| Comando | Argumentos | Efecto | Requisitos |
|---|---|---|---|
| `HELLO` | `[sesión]` | Identificación: `dev proto fw boot ses ch calstep fr mcu` | — |
| `STATUS` | — | `arm mode lim en mv ll llp llms slew rpt up fr` (máscaras hex por canal) | — |
| `LIMIT` | `ch min ref max` | Límites del canal (µs). Exige `500 ≤ min < ref < max ≤ 2500` | Canal deshabilitado |
| `ARM` | — | Permite habilitar canales. Borra el estado de enlace perdido. **No mueve nada** | — |
| `DISARM` | — | Detiene trayectorias, **corta PWM en todos** y desarma | — |
| `ENABLE` | `ch us` | Activa PWM del canal **escribiendo `us` de inmediato** (puede dar un salto) | Armado, con límites, `us` dentro de ellos |
| `MOVE` | `ms ch us [ch us]…` (≤ 6 pares) | Trayectoria lineal no bloqueante de `ms` milisegundos, limitada por `SLEW` | Armado, canales habilitados, dentro de límites; modo CAL: 1 canal y paso ≤ 50 µs |
| `STOP` | — | **Detener trayectoria**: congela la consigna en la última escrita. PWM sigue activo | — |
| `OFF` | `ch` \| `ALL` | **Desactivar PWM** (full OFF) del canal o de todos | — |
| `MODE` | `CAL` \| `RUN` | Modo calibración o ejecución | Sin movimientos en curso |
| `LINK` | `ms HOLD\|OFF` | Tiempo sin datos (200–10000 ms) y política de pérdida de enlace | — |
| `HB` | — | Heartbeat. Responde `up=` | — |
| `RATE` | `0 \| 100–5000` | Periodo de reportes `PW` (0 = apagado) | — |
| `SLEW` | `1–200` | Velocidad máxima en µs por ciclo de 20 ms (por defecto 20 = 1000 µs/s) | — |
| `PULSES` | — | Envía una línea `PW` y `OK` | — |

Códigos de error: `SYNTAX`, `UNKNOWN`, `ARGS`, `CHANNEL` (fuera de 0–11), `NOLIMIT`, `RANGE`,
`ORDER`, `STATE`, `DISABLED`, `CALSTEP`, `OVERFLOW`. **Las órdenes fuera de rango se
rechazan, no se recortan.** Un `MOVE` con un solo par inválido no se aplica en absoluto.

## Secuencia típica

```text
(abrir COM: el UNO se reinicia; un ESP32 puede no hacerlo, y entonces no hay BOOT)
BOOT DOGBOT proto=1 fw=0.2.0 boot=93AF
1 HELLO 4711                         -> OK 1 HELLO dev=DOGBOT proto=1 fw=0.2.0 boot=93AF ses=4711 ch=12 calstep=50 fr=… mcu=UNO
2 STATUS                             -> OK 2 STATUS arm=0 … en=0000 …
3 LINK 1500 HOLD / 4 RATE 250 / 5 SLEW 20 / 6 MODE CAL
7 LIMIT 1 1300 1500 1700             -> OK 7 LIMIT ch=1
8 ARM                                -> OK 8 ARM
9 ENABLE 1 1500                      -> OK 9 ENABLE ch=1 us=1500
10 MOVE 80 1 1525                    -> OK 10 MOVE n=1 … EV DONE id=10
11 HB (cada 500 ms mientras está armado)
12 STOP  /  13 OFF ALL  /  14 DISARM
```

`mcu=` es la placa para la que se compiló el firmware: `UNO`, `ESP32`, `AVR` (otra placa AVR)
u `OTRA`. Existe desde el firmware 0.2.0; con el 0.1.0, que no lo envía, la interfaz muestra
«Placa» y todo lo demás funciona igual. `fr=` es la RAM libre: alrededor de 1,2 kB en el UNO y
cientos de kB (heap) en el ESP32.

## Reglas de la PC

- Al conectar solo envía `HELLO` y `STATUS`. **Nunca** envía centro, pose ni consignas
  anteriores.
- Si el firmware sigue armado porque la placa no se reinició, la PC envía `STOP` (sin cortar
  PWM), lee `PULSES` y muestra el estado real.
- Un `BOOT` inesperado o un `boot` distinto se tratan como reinicio: se vacían colas y
  consignas y el robot queda desarmado.
- Sliders: se guarda la última consigna por canal y se envía consolidada cada 60 ms como
  máximo, con hasta 2 `MOVE` en vuelo. Las demás se descartan, no se acumulan.
- `STOP`, `OFF` y `DISARM` van con prioridad: el servicio descarta lo pendiente y los escribe
  primero.
- Si tres peticiones seguidas no reciben respuesta en 1,2 s, el estado pasa a **Fallo de
  comunicación**.
- Las líneas corruptas o con baudios distintos se marcan como inválidas y no se interpretan.

## Presupuesto de transmisión y memoria (UNO)

- 115200 baudios ≈ 11,5 kB/s. En una secuencia física, la PC envía un `MOVE` de 6 canales
  (~50 bytes) cada 100 ms (~0,5 kB/s), más `HB` cada 500 ms y `PW` cada 250 ms (~60 bytes):
  menos del 10 % del enlace.
- RAM estática del firmware: **838 B de 2048**, y 13 950 B de flash (avr-gcc 7.3, core
  AVR, Adafruit PWM 3.0.3). En el ESP32 la memoria no es una restricción práctica. La biblioteca reserva además un objeto pequeño en el heap. `HELLO` y `STATUS`
  informan la RAM libre real (`fr=`).
- Sin `String` ni JSON. Parser incremental con búfer de 64 bytes y como máximo 64 bytes
  atendidos por ciclo.

## Comportamiento al arrancar y límites conocidos

- Antes de `pwm.begin()` se escribe `ALL_LED_OFF`. Así se evita que salidas previas del
  PCA9685 (que conserva sus registros si sigue alimentado) se emitan a 1 kHz. Después, los 16
  canales quedan en **full OFF**: los servos no reciben pulso y **pueden ceder** si sostienen
  peso.
- Sin sensor angular, la postura física al arrancar es desconocida: `ENABLE` puede producir un
  salto. Elige un pulso inicial revisado y prueba con el robot sostenido.
- El oscilador del PCA9685 (25 MHz nominal) varía entre placas, así que los µs escritos son
  los que calcula la biblioteca, no los medidos.
- No hay EEPROM: los límites viven en RAM y la PC los reenvía en cada sesión. Así se evitan
  escrituras repetidas.
