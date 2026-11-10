# Calibración paso a paso

Ningún canal tiene todavía calibración definitiva. Los rangos históricos son **referencia, no
autorización**:

- `CAMINATA_FLUIDA_PROBADA`: 1300–1700 µs.
- `CAMINATA_2_0_EXPERIMENTAL`: 1200–1800 µs en el canal 1, sin probar.

## Conceptos del perfil (`perfiles/*.json`, esquema `dogbot-perfil` v1)

| Campo | Significado |
|---|---|
| `canal` | Canal PCA9685, de 0 a 11, o `null`. Los canales 12–15 se rechazan |
| `canalEstado` | `probado` (0–5), `propuesto` (6–11 sin cableado confirmado) o `sin-asignar` |
| `transmisionPermitida` | El operador permite enviar órdenes a ese canal en ROBOT REAL |
| `exploracion` | Banda de trabajo **elegida por el operador** para calibrar |
| `minUs` / `refUs` / `maxUs` | Límites seguros y referencia **medidos en calibración** |
| `calibracion.estado` | `sin-calibrar` → `en-progreso` → `calibrado` (con fecha y origen) |
| `efectoPulsoMas` / `efectoConfirmado` | Qué hace +µs y si se comprobó físicamente |
| `visual` | Signo, µs por grado y offset **solo para el dibujo** (ángulo estimado) |

Validaciones: `mínimo < referencia < máximo`, valores entre 500 y 2500 µs, sin canales
duplicados, sin canales 12–15, y un perfil «calibrado» tiene que tener fecha y canal. Un perfil
inválido no se importa, y el motivo se muestra en un aviso y en Eventos.

## Reglas de autorización

- **Modo calibración** (`MODE CAL`): exige canal asignado, transmisión permitida y una banda
  de exploración o límites calibrados. El firmware acepta **un canal por orden** y **pasos de
  50 µs como máximo**.
- **Ejecución coordinada** (poses y secuencias en ROBOT REAL): exige que **todas** las
  articulaciones implicadas estén calibradas y habilitadas.
- Cargar un perfil, importar poses, conectar o terminar una carga de firmware **nunca**
  ejecuta movimiento.

## Procedimiento sugerido (un canal, luego una pata, luego dos)

1. Robot **sostenido en el soporte**, patas en el aire. Si vas a buscar extremos, desacopla
   el brazo del servo para no forzar topes de las piezas impresas.
2. Botón **Calibración** del riel izquierdo: elige la articulación. Empieza por **D1 · Inferior (canal 1)**;
   el botón «Ir a canal 1» lleva directamente a él.
3. Define una **banda de exploración** conservadora. El botón «Usar 1300–1700 (histórica)» la
   rellena.
4. Activa **Sesión de calibración**, pulsa **Armar (calib.)** y confirma la lista de
   comprobación.
5. Botón Articulaciones → **Habilitar canal…** del canal elegido, con el pulso inicial en la
   referencia. Sin sensor, puede haber un salto.
6. Vuelve a Calibración y avanza con **±1/5/10/25/50 µs**, observando la pata. **Nunca hasta
   topar.** Para salir, usa DETENER (Esc), *PWM off canal* o *Desarmar*.
7. Marca **mínimo**, **referencia** y **máximo** seguros. Anota el efecto de +µs y marca
   «comprobado físicamente» si lo viste.
8. **Marcar calibrado** y luego Perfil → **Exportar JSON**. Guarda el archivo junto al
   registro de ensayo (pestaña Registro de ensayos).
9. Repite con 0 y 2, y después con 3, 4 y 5. En la pata 2 el espejo programado es una
   **hipótesis**: confirma el sentido de cada canal.
10. Solo con los seis canales calibrados se habilita la secuencia «Ensayo suspendido ·
    delanteras» en ROBOT REAL. Arma en modo EJECUCIÓN y empieza con amplitud baja.

## Patas posteriores

Perfil → «Proponer 6–11 para posteriores» asigna canales como **propuesta** con transmisión
desactivada. Antes de activarla, confirma el cableado real y resuelve la alimentación del
segundo regulador: **no unas sus positivos con el delantero**.
