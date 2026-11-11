# Decisiones, estado y próximos pasos

## Decisiones

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Interfaz web local + servicio Node.js** (una sola solución) | React, Three.js y CodeMirror dan 3D y editor de calidad. Node tiene `serialport` con binarios para Windows y lanza `arduino-cli` sin shell. Sin Electron: menos peso y mismo resultado en `127.0.0.1` |
| D2 | La interfaz funciona **sin servicio** (simulación) | Permite explorar el modelo, los controles y el editor sin placa. Compilar y subir se desactivan con explicación |
| D3 | **CodeMirror 6** en lugar de Monaco | Se empaqueta localmente sin workers ni CDN. Resaltado C/C++, números de línea, buscar, deshacer y rehacer por pestaña. Sin autocompletado semántico (no se anuncia) |
| D4 | Protocolo **ASCII por líneas**, 115200 baudios, ids por petición | Cabe en el UNO (sin JSON ni `String`), se puede leer en el monitor serie y está acotado a 63 caracteres |
| D5 | Movimiento **no bloqueante** con trayectorias lineales y *slew* en el firmware | STOP y OFF se atienden en el siguiente ciclo. Corrige la latencia del calibrador histórico |
| D6 | Los límites se aplican también **en el firmware**, que rechaza en vez de recortar | La interfaz no es la única barrera |
| D7 | **Sin EEPROM** en v0.1 | Evita escrituras repetidas. La PC reenvía los límites del perfil en cada sesión |
| D8 | Secuencias físicas transmitidas como **fotogramas cada 100 ms** desde la PC | Si se corta el enlace, la secuencia se detiene sola y luego actúa la política del firmware |
| D9 | Pérdida de enlace **configurable** (HOLD por defecto, sin declararla segura) | Exigencia del dossier: ninguna política es segura en todos los ensayos |
| D10 | Patas nombradas D1/D2/P1/P2, sin izquierda/derecha | No está confirmado en el robot |
| D11 | Modelo 3D **paramétrico** (mm editables) | No hay CAD. Las fotos permiten aproximar la apariencia, no las medidas |
| D12 | Ángulo **estimado** con 2000 µs / 180° y signos del dossier, editable | Sin calibrar no se atribuyen grados físicos |
| D13 | Reconexión con el firmware ya armado → STOP sin cortar PWM | No soltar un robot que podría estar sosteniendo peso, ni reenviar consignas viejas |
| D14 | Vite 7 / Vitest 4 en lugar de las versiones mayores más recientes | Esas versiones fallaban con `npm ci` (bug de árbol de dependencias de npm 10) y `@codemirror/language` 6.13.0 venía sin una dependencia, así que se fijó en 6.12.4 |
| D15 | HUD de cristal cálido sobre un **terreno marciano procedural** (sin texturas ni modelos externos) | El visor ocupa toda la ventana y los paneles flotan encima. El terreno es un escenario visual: la zona bajo el robot es plana y no se simula contacto ni dinámica; los anillos y la regla del suelo sí están a escala (1 u = 100 mm) |
| D16 | **Caminata de reposo** como animación del visor, no como consignas | Da vida al modelo con PWM apagado sin tocar el estado, la telemetría ni el firmware; reutiliza la fórmula del trote ya definida. Va rotulada como demostración y cede el control ante cualquier consigna |
| D17 | Segundo escenario **Hangar** y cristal esmerilado claro en dos niveles | Mismos trazos de calibración a escala en ambos escenarios. Botones y cápsulas dejan pasar más luz; los paneles con texto denso atenúan más el fondo para conservar el contraste |

## Estado actual

- **Hecho (software):** interfaz completa en simulación, servicio local, firmware nuevo
  compilable y probado en arnés, perfiles y calibración, poses, secuencia suspendida,
  telemetría honesta, registros, documentación y 66 pruebas automáticas.
- **No hecho (físico):** todo lo de [PRUEBAS.md § pendientes](PRUEBAS.md#pruebas-físicas-pendientes-no-realizadas).
- **Datos que faltan** (no bloquean el software): límites y sentidos por canal;
  izquierda/derecha de las patas; mapeo posterior; longitudes, masas y CAD; reguladores;
  C-rate y tensión bajo carga; temperaturas; sensores instalados.

## Hacia cuatro patas operativas (Arduino UNO)

1. Calibrar los seis canales delanteros y exportar el perfil `v1` con sus ensayos.
2. Resolver la potencia trasera: caracterizar el segundo regulador y distribuir positivos
   **separados** con GND común. Verificar la continuidad de la barra V+ del PCA9685.
3. Cablear las posteriores. En Perfil, cambiar los canales 6–11 de «propuesto» a «probado»
   solo después de comprobarlos uno por uno, y calibrarlos.
4. Medir las longitudes reales y actualizar el modelo 3D (Perfil → Modelo 3D). Después,
   cinemática con datos reales.
5. Postura de pie **con soporte parcial**, midiendo corriente y tensión. Luego unos pocos
   pasos. Registrar cada avance real sin llamar éxito a una animación.
6. El UNO tiene margen de RAM (≈1,2 kB libres) para 12 canales. Si se añaden sensores, medir
   la RAM de nuevo (`fr=` en `STATUS`).

## Raspberry Pi 4 (futuro)

La separación actual lo facilita: la RPi puede ejecutar el **mismo servicio local**
(`serialport` funciona en Linux ARM) o un planificador de trayectorias que hable **DOGBOT v1**
con el UNO, que seguiría siendo el controlador local de servos con sus límites y su política de
enlace. La interfaz web se serviría en la red local; para eso habría que revisar la seguridad,
porque hoy solo acepta `127.0.0.1`. Esa arquitectura se decidirá más adelante; no es requisito
para esta etapa.
