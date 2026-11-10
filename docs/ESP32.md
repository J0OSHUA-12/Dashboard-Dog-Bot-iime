# Dog Bot con ESP32

Desde la versión 0.2.0 del firmware, el dashboard controla el Dog Bot con un **Arduino UNO** o
con un **ESP32** (placas DevKit con módulo WROOM-32). Es el **mismo firmware**
(`firmware/DogBotDashboard/DogBotDashboard.ino`) y el **mismo protocolo** DOGBOT v1: los
controles, la calibración, las poses, las secuencias y las paradas funcionan igual. Lo que
cambia es la placa que eliges al compilar y cómo se cablea.

> **Estado: pendiente de validación física y de compilación real.** La variante ESP32 se
> probó solo en software: el firmware real se ejecutó en la PC compilado como lo vería el
> ESP32 (`-DESP32`) y la app completa se manejó desde el navegador contra ese firmware por un
> puerto serie virtual. **No se compiló con el core real de Espressif** (el entorno de
> desarrollo no pudo descargarlo) ni se cargó en una placa. A cambio, las funciones del core
> que usa el firmware se contrastaron con el código fuente de `arduino-esp32`, y todos sus
> nombres se cruzaron con las macros de las cabeceras reales del ESP32; esa revisión encontró
> y corrigió un error que habría impedido compilar (ver [PRUEBAS.md](PRUEBAS.md), fila 14b).
> La primera compilación real será en tu computadora: si falla, copia el error de la consola.

## Qué cambia respecto al UNO

| | Arduino UNO | ESP32 (DevKit, WROOM-32) |
|---|---|---|
| Placa en el editor | Arduino UNO | **ESP32 Dev Module (DevKit, WROOM-32)** |
| Core de Arduino | `arduino:avr` | `esp32:esp32` (descarga grande) |
| Lógica | 5 V | **3,3 V — los pines no toleran 5 V** |
| I²C hacia el PCA9685 | A4 (SDA), A5 (SCL) | **GPIO21 (SDA), GPIO22 (SCL)** |
| Enlace con el dashboard | USB, 115200 baudios | USB, 115200 baudios |
| Al abrir el puerto | Se reinicia siempre | Puede reiniciarse o no |
| Carga del firmware | Automática | Automática; a veces hay que mantener **BOOT** |
| Memoria libre que informa (`fr=`) | ≈ 1,2 kB | cientos de kB |
| Se identifica como (`mcu=`) | `UNO` | `ESP32` |

## Cableado

```text
ESP32 3V3    ──► PCA9685 VCC   (lógica; NO usar 5 V / VIN aquí)
ESP32 GND    ──► PCA9685 GND   ──► masa común con los reguladores de los servos
ESP32 GPIO21 ──► PCA9685 SDA
ESP32 GPIO22 ──► PCA9685 SCL
Regulador(es) de servos ──► V+ de los servos, como hasta ahora (nunca desde el ESP32)
```

- **VCC del PCA9685 a 3V3, no a 5 V.** Las resistencias de *pull-up* de SDA y SCL de la placa
  PCA9685 van a su VCC. Si VCC está a 5 V, esas líneas suben a 5 V y pueden dañar el ESP32.
- **El ESP32 no alimenta los servos.** V+ sigue viniendo de los reguladores, con GND común.
  Vale todo lo que dice [PLAN_FASE1.md](PLAN_FASE1.md) sobre separar los bancos de potencia.
- Con VCC a 3,3 V, la señal PWM que sale del PCA9685 hacia los servos también es de 3,3 V. Los
  servos de hobby suelen aceptarla, pero **está sin comprobar con los servos del Dog Bot**:
  es una de las primeras pruebas físicas (un solo canal, robot sostenido).
- Para usar otros pines I²C, cambia `DOGBOT_SDA` y `DOGBOT_SCL` al principio del firmware.

## Preparar la computadora

1. **Driver del adaptador USB.** Las placas ESP32 llevan un chip CP210x (Silicon Labs) o CH340.
   Si Windows no crea un puerto COM al conectarla, instala el driver del chip que traiga tu
   placa. El selector de puertos muestra una pista (`COM5 · CP210x`), que es orientativa.
2. **Core del ESP32.** En el editor elige la placa **ESP32 Dev Module**, abre *Diagnóstico
   Arduino CLI* y pulsa **Instalar core esp32:esp32**. Son cientos de MB: puede tardar bastante.
   También sirve instalar «esp32 by Espressif Systems» desde el Gestor de placas de Arduino IDE.
3. La biblioteca **Adafruit PWM Servo Driver Library** es la misma que para el UNO.

## Compilar y subir

1. En el editor abre **DogBotDashboard**, elige **ESP32 Dev Module** y el puerto COM.
2. **Compilar.** La primera vez compila todo el core y tarda varios minutos. Las siguientes
   son rápidas. Cambiar de placa deja la compilación anterior **obsoleta**.
3. Con el robot sostenido o los servos sin alimentación, **Subir**. Si la consola se queda en
   `Connecting......`, mantén pulsado el botón **BOOT** de la placa hasta que empiece a
   escribir. Algunas placas lo necesitan siempre.
4. Cambia a **ROBOT REAL**, conecta, y el estado debe pasar a **Compatible · desarmado** con
   «ESP32 · DOGBOT fw 0.2.0» en la barra superior.

Un binario compilado para una placa **no se puede subir eligiendo otra**: el servicio lo
rechaza. Si la placa conectada ya se identificó (por ejemplo como `ESP32`) y vas a subir un
binario para otra familia, el diálogo de carga lo avisa y pide confirmarlo.

## Diferencias de comportamiento que conviene conocer

- **Reinicio al conectar.** El UNO se reinicia siempre al abrir el puerto, así que arranca
  desarmado. El ESP32 puede **no** reiniciarse: si quedó armado de una sesión anterior, el
  dashboard lo detecta, envía `STOP` (sin cortar PWM, para no soltar un robot que sostiene
  peso) y muestra el estado real. Revisa y desarma si corresponde.
- **Texto de arranque.** Al reiniciarse, el ESP32 escribe unas líneas propias (`ets …`,
  `rst:0x1 …`) antes de `BOOT DOGBOT …`. Se ven en el monitor serie y se ignoran.
- **Botón EN/RST.** Reinicia el ESP32 como cualquier reinicio: el firmware arranca con los
  16 canales sin pulso y desarmado, y los servos **pueden ceder**.
- **Pérdida de enlace.** Igual que en el UNO: si el USB se corta estando armado, el firmware
  aplica la política configurada (HOLD u OFF).

## Problemas conocidos en Windows (adaptador CH9102/CH343)

- **«waiting for download» al conectar.** Si la pestaña Serie muestra `boot:0x3 (DOWNLOAD_BOOT…)`, la placa
  arrancó en modo de carga y no ejecuta el firmware. El servicio deja DTR y RTS inactivos al abrir el puerto
  para evitarlo; si aun así ocurre, pulsa EN.
- **Respuestas que llegan tarde o solo al enviar otra orden.** Con `serialport` y este adaptador en Windows,
  la lectura se queda retenida hasta que se escribe otra cosa en el puerto (el Monitor Serie de Arduino IDE
  no tiene el problema). Como solución provisional el servicio envía una línea vacía cada 40 ms cuando no hay
  nada que escribir, a 115200 baudios y solo en Windows; el firmware la ignora. Se desactiva con la variable
  de entorno `DOGBOT_SERIAL_KICK=0`. **Sin validar en hardware.**

## Hacia la app en el celular (futuro, no implementado)

El motivo para pasar al ESP32 es que tiene WiFi y Bluetooth. **Hoy no se usan**: el enlace
sigue siendo el cable USB hasta la computadora. El camino previsto, para más adelante:

1. Mantener DOGBOT v1 tal cual. Es texto por líneas, así que puede viajar por otro transporte
   sin cambiar los comandos ni los límites que aplica el firmware.
2. Añadir en el firmware un segundo transporte (Bluetooth LE o WiFi con WebSocket) junto al
   USB, con la misma política de pérdida de enlace y heartbeat.
3. Hacer la app móvil sobre el mismo cliente de protocolo (`shared/protocolClient.ts`), que no
   depende del transporte.

Antes de eso hay que decidir la seguridad (emparejamiento, quién puede armar el robot) y
validar físicamente lo básico con cable.

## Pruebas físicas pendientes con ESP32

Además de las de [PRUEBAS.md](PRUEBAS.md), en este orden y con el robot sostenido:

1. Compilar `DogBotDashboard` para ESP32 con Arduino CLI real y anotar el tamaño.
2. Subir a la placa (anotar si hizo falta el botón BOOT).
3. Conectar: comprobar «ESP32 · DOGBOT fw 0.2.0», y si la placa se reinicia o no al abrir el
   puerto.
4. Con el PCA9685 a 3V3: confirmar que ningún servo se mueve al arrancar ni al conectar.
5. Un solo canal: comprobar que el servo responde bien a la señal de 3,3 V en todo su rango.
6. Pulsar EN/RST con el puerto abierto: el firmware debe volver a arrancar y emitir `BOOT`.
7. Pérdida de enlace: desconectar el USB con un canal habilitado.
