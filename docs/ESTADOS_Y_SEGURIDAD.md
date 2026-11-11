# Estados, modos y acciones de parada

## Modos de la aplicación

| Modo | Qué hace | Qué no hace |
|---|---|---|
| **SIMULACIÓN** (por defecto) | Mueve el modelo 3D, reproduce secuencias y genera gráficas sintéticas rotuladas **SIMULADO** | No transmite nada al hardware. Al cambiar de modo, la pose simulada **no** pasa al robot |
| **ROBOT REAL** | Conecta por COM, identifica el firmware, envía órdenes autorizadas por el perfil | No muestra datos inexistentes: sin sensor, «Sin sensor» |

Al pasar a simulación hay que desarmar primero. El puerto se cierra al cambiar.

## Estados del enlace (barra superior y panel «Conectar»)

`Desconectado → Identificando firmware → Compatible · desarmado ⇄ Armado`, y además
`Firmware desconocido`, `Firmware incompatible`, `Enlace perdido (firmware)`,
`Fallo de comunicación` y `Cargando firmware`.

- **Firmware desconocido o incompatible:** los controles quedan bloqueados y el monitor serie
  sigue disponible. Sirve para los sketches históricos, a 9600 baudios.
- **Reinicio detectado** (`BOOT`, o boot id distinto): se vacían las colas y las consignas y se
  vuelve a desarmado. No se reenvía nada.
- **Enlace perdido:** lo informa el firmware. Para volver a mover hay que **armar de nuevo**.

## Las tres acciones de parada son distintas

| Acción | Dónde | Efecto | Lo que NO garantiza |
|---|---|---|---|
| **DETENER** (Esc) | Botón rojo arriba | Cancela la secuencia, vacía la cola y envía `STOP` con prioridad. La consigna queda congelada. **No cierra el programa** | Que el servo físico ya esté quieto. Los servos **siguen con fuerza** |
| **PWM OFF** | Interruptor «PWM ON / PWM OFF» arriba / «PWM off canal» | `OFF ALL` / `OFF ch`: sin pulso | Que el robot se sostenga: los servos **pueden ceder y el robot puede caer** |
| **Corte de energía** | Mostrado como «sin HW» | No hay hardware controlado por software | — Usa el **interruptor físico** de la batería o el regulador |

### Interruptor PWM de la barra superior

- **PWM ON** (ningún canal con señal): tras una única confirmación, arma el robot si hace falta
  y envía `ENABLE` a **todos** los canales elegibles, cada uno en su pulso de referencia. Si ya
  está armado respeta el modo del firmware; si no, usa EJECUCIÓN cuando hay canales calibrados
  y CALIBRACIÓN cuando sólo hay bandas de exploración (o la sesión de calibración está activa).
  Los canales sin banda o sin canal se omiten y el diálogo dice por qué.
- **PWM OFF** (algún canal con señal; muestra cuántos): `OFF ALL` inmediato, sin diálogo.

### Salir del programa

El botón **Salir** (icono de salida, arriba a la derecha) pide confirmación y entonces detiene
la secuencia, desarma (corta PWM) si el robot estaba armado, libera el puerto COM y apaga el
servicio local; la ventana de `INICIAR_DOGBOT.bat` se cierra sola. Se rechaza mientras haya una
compilación o carga en curso. Para volver a usarlo, ejecuta otra vez `INICIAR_DOGBOT.bat`.

### Caminata de reposo (sólo dibujo)

Mientras **ningún canal tiene PWM** y el operador no ha tomado el control, el modelo 3D camina
en bucle (trote en diagonal) y el escenario avanza bajo él. El visor lo indica con la etiqueta
**REPOSO · caminata de demostración**.

- **Marcha con cinemática inversa**, en ángulos del modelo: no usa µs ni los signos del perfil,
  así que las cuatro patas se mueven igual sea cual sea la calibración guardada. En la fase de
  apoyo cada pie queda a la altura de la pose de referencia y retrocede a velocidad constante.
- **El escenario se desplaza a esa misma velocidad** (≈ 116 mm/s a escala del modelo), de modo
  que el pie apoyado no patina: en Marte avanzan el relieve, la arena y las rocas (el horizonte
  queda fijo); en el Hangar, el suelo, las lámparas y el mobiliario, que se repiten en bucle.
  Los anillos y la regla de calibración quedan anclados al robot.

- **No es la pose del robot ni una consigna**: no escribe en el estado, no aparece en la
  telemetría y no envía nada al firmware. La tarjeta de la articulación y las etiquetas siguen
  mostrando las consignas reales. En ROBOT REAL el robot físico no se mueve aunque el modelo camine.
- **Se detiene** al pulsar PWM ON, en cuanto hay PWM en algún canal, al mover un slider, aplicar
  una pose, reproducir una secuencia, activar la sesión de calibración o recibir una consigna del
  firmware. La marcha y el avance del escenario se detienen juntos, de forma suave (≈0,5 s), y
  después el modelo dibuja sólo las consignas.
- **Se retoma** al desactivar PWM, al pulsar DETENER (Esc) o al cambiar de modo.
- Se puede apagar con la capa **Caminata** del visor. Con «reducir movimiento» activado en el
  sistema operativo no se reproduce.

### Modo claro / oscuro

El botón con el sol / la luna, junto a «Salir», alterna entre ambos temas. La preferencia se
guarda en el navegador.

## Pérdida de enlace (configurable en Perfil → Enlace)

Si el firmware está armado, tiene canales con PWM y no recibe líneas válidas durante el tiempo
configurado (1500 ms por defecto), ocurre lo siguiente:

- **HOLD**: detiene la trayectoria y mantiene la consigna. Los servos siguen haciendo fuerza
  y calor.
- **OFF**: corta PWM y desarma. Si el robot no está sostenido, puede caer.

Ninguna política es segura en todos los ensayos. Pruébalas con el robot sostenido. Mientras
está armado, la PC envía `HB` cada 500 ms. Si se cierra la pestaña, el servicio libera el
puerto a los 4 s y el firmware aplica la política elegida.

## Otras protecciones

- Los límites se aplican **en la interfaz** (sliders y validación) **y en el firmware**
  (rechazo de `RANGE`).
- Slew máximo en el firmware: por defecto 1000 µs/s, ajustable con `SLEW`.
- El modo calibración del firmware solo acepta un canal y pasos de 50 µs como máximo por
  orden.
- Las acciones físicas piden confirmación con lista de comprobación: armar, habilitar canal,
  aplicar pose, ejecutar secuencia y subir firmware. Ningún preset se ejecuta con un clic
  accidental.
- El servicio escucha solo en `127.0.0.1`, comprueba Host y Origin (contra DNS rebinding),
  exige un token por sesión y ejecuta únicamente `arduino-cli` con argumentos estructurados.
  No hay endpoint de shell.
