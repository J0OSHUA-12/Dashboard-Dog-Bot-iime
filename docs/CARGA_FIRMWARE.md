# Compilación y carga de firmware

## Flujo

1. **Compilar.** El servicio guarda una **instantánea** del código en
   `.dogbot/builds/<id>/sketch/<Nombre>/<Nombre>.ino`, con carpeta y nombre válidos, y
   calcula `sha256(nombre + placa + contenido)`. Después ejecuta:
   `arduino-cli compile --fqbn <placa> --build-path … --output-dir … <carpeta>`, donde
   `<placa>` es `arduino:avr:uno` o `esp32:esp32:esp32` según el selector del editor.
   La consola muestra la salida **real** y el tamaño de flash y RAM.
2. **Editar después de compilar** deja la compilación **obsoleta** (insignia amarilla) y
   desactiva «Subir».
3. **Subir.** Solo es posible si la compilación fue correcta, el hash coincide con el
   documento actual, la placa es la misma y el binario existe (`.hex` para el UNO, `.bin`
   para el ESP32). El servicio libera el COM y
   ejecuta: `arduino-cli upload -p COMx --fqbn … --input-dir <salida> <carpeta>`.
   `--input-dir` sube **ese** binario y no recompila. Al terminar reabre el puerto si estaba
   abierto.
4. **Después de cargar**, la interfaz vuelve a identificar el protocolo. Que la carga funcione
   no implica que los sliders sean compatibles: con otro sketch, el estado queda en «Firmware
   desconocido».

Hay una sola operación a la vez (compilar, subir o instalar). Los errores típicos llevan
diagnóstico: puerto ocupado por el Monitor Serie, bootloader sin respuesta, puerto
inexistente, core sin instalar o un ESP32 que no entra en modo de carga (botón **BOOT**).

## Placas

| Placa en el selector | FQBN | Core | Binario |
|---|---|---|---|
| Arduino UNO | `arduino:avr:uno` | `arduino:avr` | `.hex` |
| ESP32 Dev Module (DevKit, WROOM-32) | `esp32:esp32:esp32` | `esp32:esp32` | `.bin` |

- La placa elegida se recuerda entre sesiones. Como forma parte del hash, **cambiar de placa
  deja obsoleta la compilación** y hay que compilar de nuevo.
- Un binario de una placa no se sube eligiendo otra. Si la placa conectada ya se identificó
  y es de otra familia, el diálogo de carga lo avisa y exige confirmarlo.
- El servicio solo acepta las placas de `shared/boards.ts`. Para añadir otra (por ejemplo un
  ESP32-S3) hay que agregarla ahí.
- Detalles del ESP32 (cableado a 3,3 V, core, botón BOOT): [ESP32.md](ESP32.md).

## Archivos

- **Originales** (`DOGBOT_CLAUDE_CODE/originales/`): solo lectura. Cada uno muestra su ficha
  de advertencias. Para modificarlos, «Guardar» crea una copia en `sketches/`, con el nombre
  `<Nombre>_ADAPTADO` como sugerencia.
- **Firmware del dashboard** (`firmware/DogBotDashboard/`): solo lectura desde la interfaz. Se
  compila directamente desde su instantánea.
- **Mis sketches** (`sketches/<Nombre>/<Nombre>.ino`): lectura y escritura.
- Cada pestaña del editor conserva su propio historial de deshacer. Los borradores se guardan
  en el navegador para no perder cambios.

## Detección de herramientas

«Diagnóstico Arduino CLI» comprueba:

- el ejecutable (`DOGBOT_ARDUINO_CLI`, el `arduino-cli` incluido en Arduino IDE 2, o el
  `PATH`) y su versión;
- cada core por separado: `arduino:avr` (UNO) y `esp32:esp32` (ESP32). Solo hace falta el
  de la placa elegida; el otro se muestra sin alarma;
- la biblioteca `Adafruit PWM Servo Driver Library`.

Desde ahí se puede actualizar el índice e instalar lo que falte. Estas acciones solo se
ejecutan si el operador pulsa los botones. El core del ESP32 se instala con
`arduino-cli core install esp32:esp32 --additional-urls <índice de Espressif>` y es una
descarga de cientos de MB.

## Advertencias

- **`CAMINATA_FLUIDA_PROBADA.ino` se mueve sola en `setup()`** al arrancar o reiniciarse, y
  abrir el puerto reinicia el UNO. No es firmware del dashboard. Si lo cargas, hazlo con el
  robot sostenido.
- `CAMINATA_2_0_EXPERIMENTAL.ino` centra al arrancar y no está probado.
- La aplicación no carga ni ejecuta nada automáticamente: ni al iniciar, ni al conectar una
  placa, ni al abrir un archivo.

## Estado

Durante el desarrollo, Arduino CLI **no estaba disponible** en la nube porque el sitio de
descargas estaba bloqueado. El flujo se probó con un **Arduino CLI simulado** en las pruebas
automáticas, y el firmware se compiló aparte con avr-gcc y las fuentes del core AVR. Para el
ESP32 no se pudo obtener su compilador: no hay compilación real de esa variante. **La
compilación y la carga con Arduino CLI real quedan pendientes en Windows, para las dos
placas.**
