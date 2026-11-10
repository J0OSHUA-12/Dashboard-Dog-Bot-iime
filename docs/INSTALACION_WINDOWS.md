# Instalación y arranque en Windows

> Estos pasos no se ejecutaron en Windows durante el desarrollo, que se hizo en la nube
> (Linux). Lo que sí se comprobó allí está en [PRUEBAS.md](PRUEBAS.md).

## 1. Requisitos

| Programa | Para qué | Cómo |
|---|---|---|
| **Node.js 22 LTS o 24 LTS** (≥ 22.12) | Ejecutar el servicio local y compilar la interfaz | <https://nodejs.org>, instalador `.msi` |
| **Arduino IDE 2** (o `arduino-cli`) | Compilar y subir sketches | <https://www.arduino.cc/en/software>. El IDE 2 incluye `arduino-cli`, y el servicio lo busca en `%LOCALAPPDATA%\Programs\Arduino IDE\…` |
| Core **Arduino AVR** (`arduino:avr`) | Placa Arduino UNO | Desde el IDE (Gestor de placas) o con el botón *Instalar core* del dashboard |
| Core **ESP32** (`esp32:esp32`), solo si usas un ESP32 | Placa ESP32 | Igual: «esp32 by Espressif Systems» en el IDE, o el botón *Instalar core* con la placa ESP32 elegida. Descarga grande |
| Driver USB **CP210x** o **CH340**, solo si Windows no crea el COM | Adaptador USB del ESP32 o de un clon de UNO | Web del fabricante del chip |
| Biblioteca **Adafruit PWM Servo Driver Library** | PCA9685 | Desde el IDE (Gestor de bibliotecas) o con el botón *Instalar biblioteca* del dashboard |

Si `arduino-cli` está en otra ruta, define la variable `DOGBOT_ARDUINO_CLI` con la ruta
completa del `.exe` antes de iniciar.

## 2. Instalar

1. Descarga el repositorio (rama `ccr-c852bcef-htj9dj`) y descomprímelo, por ejemplo en
   `Documentos\Dog Bot Control`. La ruta puede tener espacios.
2. Doble clic en **`INSTALAR_DOGBOT.bat`**. Instala las dependencias exactas (`npm ci`) y
   compila la interfaz y el servicio (`npm run build`).

## 3. Iniciar

Doble clic en **`INICIAR_DOGBOT.bat`**. Se abre una ventana con el servicio y el navegador
en `http://127.0.0.1:5178`. Esa dirección **solo funciona en esa misma computadora**.

- La app arranca en **SIMULACIÓN**: no se envía nada al hardware.
- Para cerrar, cierra la ventana negra del servicio. Si cierras la pestaña del navegador, el
  servicio libera el puerto COM a los pocos segundos.

## 4. Primera conexión al robot (cuando lo tengas delante)

1. **Cierra el Monitor Serie de Arduino IDE**: solo una aplicación puede usar el COM.
2. **Comprueba qué firmware tiene cargada la placa.** Si es `CAMINATA_FLUIDA_PROBADA`, al
   abrir el puerto la placa se reinicia y **ejecuta su secuencia sola**. Ten el robot
   sostenido en el soporte o la alimentación de los servos desconectada.
3. En el editor (derecha), abre **DogBotDashboard**, elige tu placa (**Arduino UNO** o
   **ESP32 Dev Module**) y el **COM**, y pulsa **Compilar**. Con ESP32, lee antes
   [ESP32.md](ESP32.md): el cableado va a 3,3 V. La salida que aparece en la consola es la real de Arduino CLI.
4. Con el robot sostenido (o los servos sin alimentación), pulsa **Subir**. Solo se sube el
   binario recién compilado. Si editas el código, la compilación queda **obsoleta** y hay
   que compilar de nuevo.
5. Arriba, cambia a **ROBOT REAL**, elige el COM y pulsa **Conectar**. El estado debe pasar a
   **Compatible · desarmado** con «UNO · DOGBOT fw 0.2.0» (o «ESP32 · …»). Si dice
   **Firmware desconocido**, la placa no tiene el firmware nuevo: los controles quedan bloqueados, aunque el monitor serie
   sigue funcionando.
6. Sigue el [procedimiento de calibración](CALIBRACION.md): un canal cada vez, empezando
   por el **canal 1**, con el robot sostenido.

## Problemas frecuentes

| Mensaje | Causa probable | Qué hacer |
|---|---|---|
| «El puerto está ocupado…» | Monitor Serie u otra app usa el COM | Ciérrala y vuelve a conectar |
| «Sin respuesta del bootloader» | Placa/puerto equivocados, cable o driver CH340 | Revisa COM, cable y driver |
| «El ESP32 no entró en modo de carga» | La placa necesita el botón BOOT, o no es un ESP32 | Mantén pulsado **BOOT** al aparecer `Connecting…`; revisa la placa elegida |
| «Falta el core esp32:esp32» | Elegiste ESP32 sin instalar su core | *Diagnóstico Arduino CLI* → *Instalar core esp32:esp32* |
| «Arduino CLI no encontrado» | No hay IDE 2 ni arduino-cli | Instálalo o define `DOGBOT_ARDUINO_CLI` |
| «Falta el core arduino:avr» / «Falta la biblioteca…» | Instalación incompleta | Botones de *Diagnóstico Arduino CLI* en el editor |
| «El puerto 5178 ya está en uso» | Ya hay otra ventana del servicio abierta | Ciérrala, o define `DOGBOT_PORT` |
| Página en blanco con «Interfaz no compilada» | Falta compilar la interfaz | Ejecuta `INSTALAR_DOGBOT.bat` |
