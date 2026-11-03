# Telemetría y registros

Cada dato muestra **unidad, fuente, marca de tiempo y validez**. La ausencia de dato se
muestra como «Sin sensor», «No disponible» o «Sin datos», **nunca como cero**.

| Señal | Disponible hoy | Fuente | Presentación |
|---|---|---|---|
| Consigna por canal (µs) | Sí | Firmware (`PW`, consigna escrita) / simulación | Gráfica. Al perder comunicación aparecen huecos y una marca discontinua de «desactualizado» |
| Última consigna confirmada | Sí | `OK` del firmware | Por articulación, con antigüedad |
| Ángulo físico | **No** | Servos de 3 hilos sin feedback | «Sin sensor». El dibujo usa un **ángulo estimado** |
| Tensión de batería / banco | **No** | — | «Sin sensor». Las lecturas manuales históricas van aparte |
| Corriente total / por servo | **No** | — | «Sin sensor». **Nunca** se divide la total entre servos |
| Temperaturas | **No** | — | «Sin sensor» |
| IMU / contacto / equilibrio | **No** | — | «No disponible» |
| RTT del enlace | Sí (armado) | Medido por la PC con `HB` | Gráfica en ROBOT REAL |
| RAM libre del firmware | Sí | `HELLO` / `STATUS` | Barra superior |

En **SIMULACIÓN** aparecen gráficas de tensión y corriente **sintéticas**, con el rótulo
SIMULADO siempre visible. Viven en un espacio de datos separado y nunca se mezclan con datos
reales.

## Registros

- **Eventos**: todo lo relevante con nivel (icono y texto «ERROR:» además del color), modo y
  origen.
- **Monitor serie**: TX y RX con hora. El envío manual queda bloqueado mientras el robot está
  armado. La velocidad se elige ahí: 115200 para el firmware nuevo, 9600 para los sketches
  históricos.
- **Registro de ensayos**: montaje (suspendido, carga parcial, libre), carga, alimentación,
  sketch, perfil, medición visible, instrumento, resultado y notas. Se exporta a CSV. Un
  ensayo simulado lleva la etiqueta SIM y no cuenta como avance físico.
- **Mediciones**: tus lecturas manuales, separadas del **histórico del dossier**. El histórico
  conserva sus condiciones: 0,41 A y 7,02 V con 6 servos suspendidos; ≥ 1 A accionando el
  canal 1 bajo carga parcial, probablemente midiendo el banco completo.
- **Sesión CSV** (botón en el panel inferior): eventos y series con
  `timestamp, modo, tipo, canal_o_señal, valor, fuente, validez, detalle`.

## Sensores futuros (trabajo aparte, no implementado)

Antes de proponer cableado concreto hay que medir la tensión y los picos reales, y elegir el
rango, el shunt, la disipación y el punto de medida. Un sensor de banco (por ejemplo, de
corriente y tensión en V+) **no** mide corrientes por servo. El firmware no contiene código que
finja leer sensores inexistentes.
