# Compilación y carga de firmware

## Flujo

1. **Compilar.** El servicio guarda una **instantánea** del código en
   `.dogbot/builds/<id>/sketch/<Nombre>/<Nombre>.ino`, con carpeta y nombre válidos, y
   calcula `sha256(nombre + placa + contenido)`. Después ejecuta:
   `arduino-cli compile --fqbn arduino:avr:uno --build-path … --output-dir … <carpeta>`.
   La consola muestra la salida **real** y el tamaño de flash y RAM.
2. **Editar después de compilar** deja la compilación **obsoleta** (insignia amarilla) y
   desactiva «Subir».
3. **Subir.** Solo es posible si la compilación fue correcta, el hash coincide con el
   documento actual, la placa es la misma y el `.hex` existe. El servicio libera el COM y
   ejecuta: `arduino-cli upload -p COMx --fqbn … --input-dir <salida> <carpeta>`.
   `--input-dir` sube **ese** binario y no recompila. Al terminar reabre el puerto si estaba
   abierto.
4. **Después de cargar**, la interfaz vuelve a identificar el protocolo. Que la carga funcione
   no implica que los sliders sean compatibles: con otro sketch, el estado queda en «Firmware
   desconocido».

Hay una sola operación a la vez (compilar, subir o instalar). Los errores típicos llevan
diagnóstico: puerto ocupado por el Monitor Serie, bootloader sin respuesta o puerto
inexistente.

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
- el core `arduino:avr`;
- la biblioteca `Adafruit PWM Servo Driver Library`.

Desde ahí se puede actualizar el índice e instalar lo que falte. Estas acciones solo se
ejecutan si el operador pulsa los botones.

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
automáticas, y el firmware se compiló aparte con avr-gcc y las fuentes del core AVR. **La
compilación y la carga con Arduino CLI real quedan pendientes en Windows.**
