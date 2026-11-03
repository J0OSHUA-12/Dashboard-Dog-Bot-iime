# PROMPT PARA CLAUDE CODE — DOG BOT CONTROL

Copia el texto desde «Actúa como…» hasta el final en Claude Code. Pon a su disposición `CONTEXTO_DOGBOT_CLAUDE_CODE.md`, los tres sketches y las fotografías, preferiblemente descomprimiendo el ZIP de entrega dentro del proyecto. La imagen del dashboard está incluida en `referencias/01-311117.jpg`; las otras cuatro imágenes muestran el robot. Puedes adjuntarlas también directamente a Claude si facilita su inspección.

---

Actúa como desarrollador de aplicaciones de ingeniería, especialista en visualización 3D y sistemas embebidos. Quiero que **construyas una aplicación local funcional para Windows que permita visualizar, programar y controlar mi robot Dog Bot**. No te quedes en recomendaciones: crea los archivos, implementa, ejecuta las comprobaciones posibles y documenta cómo usarla.

## 1. Primero comprende el proyecto

Lee completo `CONTEXTO_DOGBOT_CLAUDE_CODE.md`, incluidos el dossier histórico y los tres códigos anexos. Inspecciona también los `.ino` de `originales/` y las imágenes que te doy. El contexto contiene tanto hechos comprobados como propuestas; conserva esa diferencia.

Datos esenciales:

- Dog Bot cuadrúpedo: cuatro patas, tres servos por pata, doce articulaciones en el diseño.
- Arduino UNO, PCA9685 a dirección `0x40`, PWM de 50 Hz, servos declarados DC5535 de 35 kg y 180°; variante y fabricante exactos no verificados documentalmente.
- Dos patas delanteras con seis canales 0–5 han funcionado en secuencias coordinadas **suspendidas con un soporte**.
- No está demostrado que el robot se sostenga o camine sin apoyo. No pongas etiquetas como «marcha validada» o «equilibrio estable».
- Pata delantera 1: canal 0 superior, aumentar pulso mueve hacia atrás; canal 1 inferior, aumentar pulso extiende; canal 2 cadera, aumentar pulso abre hacia afuera.
- Pata delantera 2: canales 3/4/5, programados en espejo; falta calibración individual definitiva. No inventes izquierda/derecha física.
- LiPo 3S, 11,1 V nominales, 4000 mAh; regulador delantero aparentemente XL4015 en torno a 7 V. Existe otro regulador para posteriores, pendiente de caracterizar. No unas sus salidas positivas ni presupongas capacidad suficiente.
- Se observó ~0,41 A con seis servos suspendidos y ~7,02 V. Al accionar el canal 1 bajo carga parcial, intentando levantar el robot apoyado en la mesa, la lectura subió a ~1 A o algo más y el voltaje se mantuvo. No son picos verdaderos ni un dimensionamiento de potencia. El instrumento podría haber medido el banco completo aunque solo se moviese un servo.
- Objetivo físico inmediato: ponerse de pie y dar unos pocos pasos con **Arduino**. Raspberry Pi 4 es una mejora posterior; no la requieras para esta versión.

No me vuelvas a preguntar datos que ya están en el dossier. Si faltan dimensiones, sensores o calibración, deja esos campos pendientes y continúa con todo lo que pueda hacerse sin ellos. Las fotografías permiten aproximar la apariencia, no deducir medidas exactas.

## 2. Resultado visual esperado

Quiero una interfaz de ingeniería sofisticada, similar en composición a la captura adjunta: fondo oscuro, escena 3D isométrica dominante, indicadores superiores, paneles laterales y gráficas inferiores. Debe parecer una estación de control de robótica bien terminada y ser cómoda de utilizar.

Usa **rojo y naranja** como colores principales del Dog Bot, sustituyendo el turquesa de la referencia. Fondo `#111217`, paneles `#1B1D24` / `#252832`, rojo `#EF3E36`, naranja `#FF7A1A`, selección `#FFB15C`, texto `#F2F3F5`, secundario `#A8ADB8`. Puedes ajustar estos tonos para contraste y legibilidad sin perder la identidad.

Evita saturar toda la pantalla de neón, tarjetas enormes vacías, animaciones que distraigan, datos ficticios presentados como reales o una página promocional. Necesito una herramienta de trabajo.

Distribución:

1. **Arriba:** Dog Bot Control, estado de conexión, selector COM, placa/firmware, modo SIMULACIÓN o ROBOT REAL y parada accesible.
2. **Izquierda:** controles de patas y servos, sliders, entradas numéricas, calibración, poses y secuencias.
3. **Centro:** el modelo 3D de mi robot, grande, interactivo y articulado.
4. **Derecha:** un editor inspirado en Arduino IDE para abrir, pegar, modificar, guardar, compilar y cargar sketches.
5. **Abajo:** información disponible, gráficas, eventos y monitor serie.

Haz los paneles ajustables y plegables. Comprueba el diseño en 1366×768 y 1920×1080; en ventanas estrechas usa pestañas o paneles alternables. El editor y el 3D deben seguir siendo utilizables. Interfaz en español; código y datos con fuente monoespaciada. Los errores necesitan texto/iconos además de rojo.

## 3. Modelo 3D del Dog Bot

Construye un modelo basado en mis fotos: cuerpo alargado naranja, cubierta superior curva opcional, patas rojas segmentadas, soportes verdes, servos negros, pivotes metálicos y tornillos representativos. No uses un perro orgánico ni un cuadrúpedo genérico que no se parezca a mi estructura.

Si hay archivos CAD apropiados, aprovéchalos. Si no, crea una aproximación paramétrica con geometrías editables. Indica «modelo aproximado; dimensiones pendientes». No bloquees la implementación por falta de CAD.

Requisitos:

- Cuatro patas y doce articulaciones visuales, con jerarquía de transformaciones y pivotes correctos según la referencia; evita giros alrededor de centros arbitrarios.
- Control orbital, zoom, restaurar cámara, vistas isométrica/frontal/lateral/superior, rejilla y ejes opcionales.
- Seleccionar una articulación en 3D selecciona el control correspondiente; mover el control la resalta y actualiza la pose.
- Animación fluida y opción de ocultar la tapa para inspección.
- Configuración editable de longitudes, offsets, sentidos y relación pulso/ángulo visual.
- No atribuir grados físicos a una interpolación 500–2500 µs. Mostrar µs y diferenciar «ángulo estimado» de cualquier futura medición.
- Mostrar la pose ordenada o estimada; un ACK de firmware no es feedback angular real.
- Las patas posteriores pueden moverse en simulación, pero no deben transmitir al robot hasta configurar y habilitar sus canales.
- No presentar esta visualización como simulador dinámico validado. Contacto, equilibrio, fricción y torque no se deducen de una animación.

## 4. Controles de servos y calibración

Muestra las cuatro patas; para cada una, tres articulaciones. Incluye slider, valor en µs, pasos finos, última consigna confirmada, límites, estado y selector de canal.

Perfil inicial: canales activos conocidos 0–5; posteriores sin asignación física validada. Permite configurar 6–11 como propuesta futura explícita. No supongas que todos los servos están calibrados. Los canales 12–15 deben quedar fuera del perfil inicial.

Funciones necesarias:

- Selección individual y controles cómodos para el canal 1, sin aumentar su rango automáticamente.
- Habilitar un canal de forma deliberada; abrir el programa no debe mover nada.
- Calibrar mínimo, referencia y máximo, dirección y articulación; guardar/importar/exportar perfiles JSON versionados.
- Validar `mínimo < referencia < máximo`, canales duplicados, rangos ausentes y estado de calibración.
- Aplicar límites en la interfaz **y en firmware**. Los límites históricos provisionales no son límites mecánicos validados.
- Modo de calibración separado de la ejecución coordinada, con pequeños pasos y procedimiento explicado.
- Guardar poses con nombres y reproducir transiciones únicamente cuando el perfil esté validado para el modo físico.
- Secuencias de ensayo suspendido y futura postura/pasos; no activar presets inseguros con un clic accidental ni ejecutar al cargar un perfil.
- Limitar tasa de mensajes, consolidar movimientos de sliders y dar prioridad a detener. No acumular cientos de comandos viejos.

Distingue tres acciones: **detener trayectoria**, **desactivar PWM** y **cortar energía**. No prometas la tercera si no hay hardware para hacerlo. Desactivar PWM puede hacer perder apoyo; detener trayectoria tampoco garantiza que el servo físico ya se haya detenido.

## 5. Editor como Arduino IDE y carga real

Panel derecho con resaltado C/C++, números de línea, buscar, deshacer/rehacer, abrir/guardar `.ino`, pegar código y consola de resultados. Puedes usar Monaco o equivalente apropiado. No anuncies autocompletado semántico o análisis completo de Arduino si no lo implementas.

Incluye selección de placa y COM, **Compilar** y **Subir** con progreso y logs reales. Conserva archivos originales y crea nuevos archivos para las adaptaciones. Si abro dos documentos, no pierdas cambios al cambiar de pestaña.

Integra Arduino CLI mediante un componente local. Detecta instalación, core de Arduino UNO y biblioteca Adafruit PWM Servo Driver, e informa qué falta. No simules compilación ni carga con un temporizador. `upload` no compila por sí mismo: compila el código actual, comprueba éxito y sube únicamente ese binario.

Liga cada compilación con una instantánea del código, placa y configuración. Si edito después, marca la compilación como obsoleta; nunca subas un binario viejo tras un error. Respeta carpetas de sketch con nombre válido y usa rutas seguras en Windows, incluidas rutas con espacios.

El servicio debe controlar la propiedad del COM, liberar antes de cargar y reconectar después cuando corresponda. Si Arduino IDE/Monitor Serie lo ocupa, mostrar un diagnóstico útil. Tras una carga, comprueba el protocolo del nuevo firmware: cargar cualquier sketch no implica que los sliders sigan siendo compatibles.

No cargues ni ejecutes código automáticamente por el solo hecho de leer este prompt, iniciar la app o conectar una placa. Implementa las acciones para que el operador las invoque. El sketch histórico fluido puede moverse por su propio `setup()` al reiniciar: adviértelo en su ficha y no lo uses como firmware inicial del dashboard.

## 6. Arquitectura local y modos

Elige una arquitectura coherente para Windows después de inspeccionar el proyecto. Preferencia de partida: frontend React/TypeScript con Three.js, editor integrado y un servicio local Node.js o Python para COM y Arduino CLI. También acepto una app de escritorio si resuelve mejor la integración. Explica la decisión brevemente y desarrolla una sola solución.

Una página HTML aislada no debe prometer ejecutar herramientas de escritorio si no tiene el puente necesario. Incluye instalación, arranque sencillo y dependencias fijadas; no dependas de servicios de pago, nube ni Raspberry Pi para operar localmente. Tras instalar dependencias, los recursos de interfaz deben poder cargarse localmente.

Separa renderizado, estado del robot, perfiles, protocolo, transporte, compilación y telemetría. El servicio solo debe aceptar acceso local autorizado; no exponer un endpoint de shell arbitrario. Ejecuta herramientas con argumentos estructurados y rutas validadas.

Dos modos claramente separados:

- **SIMULACIÓN:** funciona sin robot, permite explorar el modelo, controles y gráficas sintéticas rotuladas. No manda comandos a hardware.
- **ROBOT REAL:** requiere conexión, identificación del firmware y perfil de canales. Datos inexistentes se muestran como no disponibles.

No transfieras automáticamente al robot la pose que quedó en simulación cuando cambio de modo. No reenvíes movimientos antiguos al reconectar. Detecta reinicios de firmware, limpia colas y vuelve a un estado desarmado.

## 7. Firmware nuevo para el dashboard

Crea un sketch nuevo compatible con Arduino UNO y PCA9685, sin sobrescribir los tres de referencia. Debe ser compilable y estar documentado como nuevo y pendiente de validación física hasta que se pruebe.

Los sketches históricos tienen diferencias que debes respetar:

- `CAMINATA_FLUIDA_PROBADA.ino`: secuencia automática en `setup()`, sin parser interactivo; probado reportado solo suspendido.
- `CAMINATA_2_0_EXPERIMENTAL.ino`: no validado; `x` congela consignas, `+/-` pueden provocar postura si está detenido; arranca al 70 % pero permite 30–100 %.
- `CALIBRACION_6_SERVOS.ino`: `x/X` desactivan señal; guarda límites en RAM pero no los aplica a movimientos; sus desplazamientos bloquean lectura serial y pueden retrasar la parada.

Diseña un protocolo versionado y acotado: identificación/capacidades, canal, pulso, habilitación, parada, estado, secuencias, errores y heartbeat. Usa IDs de solicitud/sesión para relacionar confirmaciones. No llames posición medida a la última consigna PWM.

Firmware con parser incremental, buffers limitados, movimiento no bloqueante, comprobación de canal/rango/estado, límites por articulación y tratamiento explícito de pérdidas de comunicación. Verifica memoria disponible y presupuesto de transmisión; no diseñes una telemetría imposible para el UNO.

Arranque sin marcha automática ni centrado general; primera habilitación explícita. Sin sensor angular no puedes conocer la postura física inicial ni garantizar que activar en 1500 µs sea suave. Documenta ese límite.

Define la política de pérdida de enlace según el tipo de ensayo: soltar todos los servos puede causar caída; sostener una consigna puede mantener esfuerzo. No declares una política universalmente segura. Permite probar el comportamiento con el robot sostenido.

No simules sensores en el firmware real. Si añades persistencia en EEPROM, usa guardado explícito con versión/integridad y evita escribir en cada cambio de slider.

## 8. Telemetría y panel inferior

Quiero voltajes, corrientes y datos útiles **cuando realmente puedan medirse**. Actualmente no están confirmados sensores integrados que los entreguen al Arduino.

Muestra inicialmente:

- Estado de conexión y firmware, consigna por canal, secuencia, eventos, errores y tiempos disponibles.
- Tarjetas preparadas para tensión de batería, tensión de banco, corriente total, corriente por servo y temperaturas, con «Sin sensor» donde corresponda.
- Historial manual separado de las mediciones antiguas del dossier, con sus condiciones: suspendido o bajo carga parcial.
- Gráficas reales únicamente con datos recibidos; huecos o estado desactualizado al perder comunicación.
- En simulación, datos sintéticos con rótulo persistente **SIMULADO** y sin mezclarlos con registros reales.

No dividas la corriente total entre doce para presentar corrientes individuales. No inventes ángulos medidos, porcentaje de batería, temperatura, centro de gravedad, equilibrio ni estado de contacto. Cada señal debe indicar unidad, fuente, timestamp y validez; usa ausencia de dato, no cero.

Incluye exportación CSV de sesiones, monitor serie y registro de ensayos con notas de apoyo/carga, sketch, perfil, alimentación y resultado. Si propones sensores, hazlo como trabajo futuro separado; verifica rango y montaje antes de ofrecer cableado concreto.

## 9. Verificación y entrega

Comprueba al menos:

1. La app inicia en Windows siguiendo las instrucciones y se puede explorar sin placa en modo simulación. Si no estás en Windows, no afirmes haberlo ejecutado allí; deja claramente esa comprobación pendiente y valida lo que permita tu entorno.
2. Los doce controles visuales mueven la articulación correcta del modelo y muestran sus unidades/origen.
3. Perfil desconocido o canal sin calibrar no habilita movimiento coordinado físico.
4. Importar un perfil inválido, canales duplicados, datos serie corruptos o comandos fuera de rango produce rechazo claro.
5. Selección, calibración y perfiles se guardan y recuperan sin perder información.
6. Compilación muestra el resultado real; error impide subir; editar invalida el binario anterior.
7. Reconexión, cambio de modo y carga de firmware no reproducen consignas antiguas.
8. La parada cancela la trayectoria y la cola según el protocolo; el firmware no queda bloqueado en desplazamientos largos.
9. Sin sensores no aparecen mediciones inventadas; pérdida de datos se marca como tal.
10. Diseño revisado visualmente a 1366×768 y 1920×1080, sin paneles que tapen controles o logs.

Usa pruebas de software significativas para límites, protocolo, estados, compilación y fallos de comunicación. Usa un transporte simulado para lo que no puedas probar físicamente, etiquetándolo. No afirmes que el Dog Bot caminó porque pasen las pruebas de software.

Entrega:

- Código completo del dashboard y servicio, sin botones decorativos que aparenten funcionar.
- Firmware nuevo del dashboard, preservando los tres sketches históricos.
- Modelo 3D editable y perfiles iniciales con campos desconocidos explícitos.
- Instrucciones simples de instalación/arranque en Windows y dependencias exactas utilizadas.
- Documentación de protocolo, calibración, estados, telemetría y proceso de carga.
- Capturas del resultado, resumen de comprobaciones hechas y lista de pruebas físicas pendientes.
- Un registro de decisiones y estado para continuar después hacia cuatro patas operativas y Raspberry Pi 4.

Trabaja por fases, pero continúa hasta tener una primera versión completa utilizable en simulación y preparada para integración real. No pares a pedir decisiones estéticas o técnicas rutinarias. Pregunta solo cuando un dato físico faltante impida una acción concreta y continúa con el resto del software mientras tanto.

**Prioridad:** parecido visual con mi referencia, modelo reconocible de mi Dog Bot, controles cómodos, editor con compilación/carga reales y absoluta claridad entre simulación, órdenes enviadas, mediciones reales y avances físicos comprobados.
