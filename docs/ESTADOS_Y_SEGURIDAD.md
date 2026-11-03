# Estados, modos y acciones de parada

## Modos de la aplicación

| Modo | Qué hace | Qué no hace |
|---|---|---|
| **SIMULACIÓN** (por defecto) | Mueve el modelo 3D, reproduce secuencias y genera gráficas sintéticas rotuladas **SIMULADO** | No transmite nada al hardware. Al cambiar de modo, la pose simulada **no** pasa al robot |
| **ROBOT REAL** | Conecta por COM, identifica el firmware, envía órdenes autorizadas por el perfil | No muestra datos inexistentes: sin sensor, «Sin sensor» |

Al pasar a simulación hay que desarmar primero. El puerto se cierra al cambiar.

## Estados del enlace (barra superior)

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
| **DETENER** (Esc) | Botón rojo arriba | Cancela la secuencia, vacía la cola y envía `STOP` con prioridad. La consigna queda congelada | Que el servo físico ya esté quieto. Los servos **siguen con fuerza** |
| **PWM OFF** | Botón arriba / «PWM off canal» | `OFF ALL` / `OFF ch`: sin pulso | Que el robot se sostenga: los servos **pueden ceder y el robot puede caer** |
| **Corte de energía** | Mostrado como «sin HW» | No hay hardware controlado por software | — Usa el **interruptor físico** de la batería o el regulador |

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
