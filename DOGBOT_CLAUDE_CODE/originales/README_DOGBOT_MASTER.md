# DOG BOT — DOSSIER MAESTRO DEL PROYECTO

**Fecha del estado consolidado:** 3 de noviembre de 2026  
**Propósito:** transferir el contexto técnico e histórico a otro chat, Claude Code u otro asistente, sin tener que explicar desde cero lo que se hizo.  
**Estado general:** robot cuadrúpedo en construcción; **dos patas delanteras completas montadas con 3 servomotores cada una** (seis servos conectados a los canales 0–5 del PCA9685), probadas individualmente y con secuencias alternadas de movimiento. **No ha demostrado caminar sobre el suelo ni sostenerse solo sin apoyo.** Sigue en fase de calibración y de comprobación de alimentación bajo carga.

> **Regla de lectura:** se separan HECHOS CONFIRMADOS por pruebas del usuario, DATOS REFERENCIALES (no necesariamente de su pieza concreta), HIPÓTESIS y PENDIENTES. Una versión de código entregada no significa que el usuario la haya probado.

---

## 1. Objetivo del Dog Bot

Construir un robot con forma de perro y cuatro patas articuladas, con tres servomotores por pata (**12 servos previstos en total**), capaz de realizar saludos, levantar patas, ponerse de pie y finalmente caminar de forma coordinada y natural. Se trabaja con estructura física roja de piezas plásticas impresas en 3D, tornillos y articulaciones; servos grandes negros DC5535; Arduino UNO; PCA9685; batería LiPo y reguladores reductores.

Objetivos escalonados:

1. Validar alimentación, conexiones y respuesta de los servos.
2. Hacer saludar una pata (inicialmente con dos servos).
3. Activar sus tres articulaciones.
4. Identificar canales y direcciones de giro.
5. Realizar marcha de prueba de una pata suspendida.
6. Repetir en la pata delantera vecina.
7. Coordinar los seis servos de ambas patas delanteras en movimientos alternados y fluidos.
8. Calibrar límites reales y posición erguida, especialmente canal 1.
9. Incorporar pata trasera izquierda/derecha, diseñar la potencia para 12 servos.
10. Lograr apoyo estable y luego locomoción real; en el futuro podría tener interfaz de PC y sensores de equilibrio.

Hubo un contexto de **feria vocacional**: se preparó un guion divulgativo simple sobre qué hace el robot, Arduino, servos y qué se había conseguido; el usuario prefería una presentación comprensible para escolares y público general, no excesivamente técnica.

---

## 2. Hardware conocido

| Elemento | Datos conocidos | Estado/confianza |
|---|---|---|
| Microcontrolador | **Arduino UNO**, conectado por USB a computadora Windows | Confirmado por usuario y capturas |
| Controlador de servos | **PCA9685**, placa azul de 16 canales PWM/I²C, dirección usada `0x40` | Confirmado por fotos/códigos |
| Servos | **DC5535**, de alto torque, descritos como «35 kg»; el usuario indica que son de **180°** | Modelo declarado; subvariante y límites eléctricos/mecánicos exactos sin verificación documental concluyente |
| Servos instalados | **6**, tres por cada una de las dos patas delanteras | Confirmado |
| Servos finales proyectados | **12**, tres por cada una de cuatro patas | Objetivo de diseño |
| Batería | **LiPo 3S, 11,1 V nominales, 4000 mAh (4,0 Ah)**; en etiqueta puede leerse «4.0» y «4000 mA» | Declarado por usuario; C-rate y tensión real en carga todavía no medidos/documentados |
| Regulador delantero | Convertidor DC-DC reductor de placa azul, **aparentemente familia XL4015**, ajustado alrededor de 7 V | Identificación visual probable, no confirmada por código exacto del chip |
| Regulador trasero | **El usuario ya dispone de un segundo regulador** para las dos patas de atrás | Confirmado que lo tiene, **modelo/capacidad/salida y montaje todavía desconocidos** |
| Mecánica | Estructura roja impresa en 3D, dos patas delanteras completas, articulaciones con tornillos | Visible en fotografías |
| Soporte de ensayo | Robot apoyado sobre un objeto que mantiene las patas en el aire, evitando arrastrarlas/chocar con mesa | Confirmado por usuario e imágenes |
| Medición | Multímetro en serie, pinza amperimétrica, lecturas de corriente y tensión reportadas | Confirmado; ancho de banda y precisión para picos no verificados |

**Importante:** la capacidad de 4000 mAh es energía/almacenamiento, **NO** una corriente máxima de 4 A. La descarga admisible de la LiPo depende de su clasificación C y conexiones.

**DC5535:** en una respuesta anterior se citaron referencias de corriente de ~2,8 A por servo a 7,4 V según condiciones de fabricante/vendedor. Es una **referencia de especificación**, no el consumo constante medido ni un máximo de atasco verificado para las unidades exactas. No se deben calcular requisitos de potencia de todos los servos multiplicando las lecturas sin carga de 0,41 A.

---

## 3. Distribución eléctrica / conexiones efectivas

### 3.1 Señal y lógica

Esquema usado con Arduino UNO y PCA9685:

```text
ARDUINO UNO                    PCA9685
-----------------------------------------
5V de Arduino  --------------> VCC  (lógica; no 7 V)
GND de Arduino --------------> GND  (masa común)
A4 (SDA)       --------------> SDA
A5 (SCL)       --------------> SCL

PCA9685: dirección I²C habitual utilizada: 0x40
Frecuencia PWM de servos utilizada: 50 Hz
```

El USB alimenta/comunica la parte Arduino como se hizo en pruebas. Los DC5535 toman potencia de la batería a través del regulador, NO del pin de 5 V del Arduino. Debe existir referencia GND común.

### 3.2 Potencia (primera etapa)

```text
Batería LiPo 3S 11,1 V nominal
         │
         ├── (+) -> IN+ regulador reductor
         └── (-) -> IN- regulador reductor
                       │
     regulador OUT+ ~7,0 V -> V+ de alimentación servos PCA9685
     regulador OUT-        -> GND de alimentación PCA9685
                       │
                 6 servos DC5535:
                 canales PCA 0,1,2,3,4,5
```

**Distinción crítica:** `VCC` de PCA9685 (lógica ~5 V en el montaje) **no es** `V+` (alimentación de servos ~7 V). Nunca introducir 7 V al pin VCC del Arduino/PCA ni conectar la LiPo 3S directamente a los servos. La LiPo 3S puede tener **12,6 V** recién cargada (11,1 V es nominal).

En las primeras pruebas de octubre, se ajustó inicialmente un convertidor a unos **6,04 V** y después se elevó hacia **7,0 V**; las pruebas recientes se realizaron alrededor de 7 V.

### 3.3 Segundo regulador: una advertencia para las patas traseras

El usuario tiene un **segundo regulador**. **No conectar sus salidas positivas en paralelo con la del regulador delantero ni a la misma bornera V+ del PCA9685 sin diseño específico.** En las placas PCA9685 comunes, los positivos de alimentación de todos los conectores de servo suelen estar unidos a una misma barra V+. En consecuencia, conectar 7 V de un convertidor a V+ y otra salida de otro convertidor a otros encabezados no crea automáticamente dos bancos de potencia aislados: puede unir ambas salidas y dañarlas.

Opciones de arquitectura a estudiar cuando se instalen las patas traseras:

- Mantener el PCA9685 solo como generador de señal: distribuir potencia por separado fuera de los encabezados de 3 pines, alimentando cada grupo de servos desde su propio regulador **con positivos separados y GND común**, y llevar a cada servo la señal del PCA y GND. Verificar continuidad real de la placa antes de hacerlo.
- Utilizar placas separadas o una distribución/bancada de servo diseñada con separación real de alimentaciones (con direcciones I²C distintas si dos PCA9685 comparten bus).

Dimensionar cada regulador para corriente **continua, picos y disipación térmica**, con fusible/conexión y calibres acordes. No asumir que un supuesto XL4015 de «5 A» mantendrá 5 A continuamente sin refrigeración ni que una lectura instantánea de 0,41 A valida seis servos bajo carga.

---

## 4. Identificación física DEFINITIVA de canales (con fotografía anotada por el usuario)

Las dos patas activas son las **dos delanteras, colocadas una junto a la otra**, no una delantera y una trasera.

### Pata delantera 1

| Canal PCA | Articulación física | Resultado al incrementar pulso (`+`) |
|---|---|---|
| **0** | **Servo superior**, montado verticalmente en el tramo superior de la pata | **Mueve la pata hacia atrás** |
| **1** | **Servo inferior**, articulación de la parte inferior/larga de la pata | **EXTIENDE la pata** |
| **2** | **Servo de cadera**, unión al cuerpo/chasis | **Mueve la pata hacia afuera del cuerpo** |

**El canal 1 es prioritario**: el usuario insistió repetidamente en que su extensión desde el centro se veía demasiado pequeña, y quería poder extender la pata casi recta para evaluar postura. Al subir su pulso, **canal 1 extiende** (dirección comprobada por el usuario).

### Pata delantera 2

| Canal PCA | Rol esperado | Dirección |
|---|---|---|
| **3** | Superior | Se programó inicialmente en espejo del 0 |
| **4** | Inferior | Se programó inicialmente en espejo del 1 |
| **5** | Cadera | Se programó inicialmente en espejo del 2 |

El usuario confirmó **que la segunda pata funciona**. Sin embargo, no se registró una tabla individual explícita de «al aumentar pulso» para canales 3, 4 y 5; los signos en espejo del software son una **hipótesis de montaje que funcionó como prueba general**, no una calibración mecánica definitiva de cada canal.

**Signos utilizados en los códigos:**

```cpp
const int dirAvance[2]  = {-1, +1};
const int dirFlexion[2] = {-1, +1};
const int dirCadera[2]  = {+1, -1};
```

Interpretación importante: `dirFlexion = -1` en la primera pata significa que un valor matemático *positivo de flexión* **reduce el pulso** del canal 1 (la flexiona); un valor negativo de flexión **aumenta el pulso** (la extiende). Esto coincide con la observación física del usuario.

### Historia de numeración anterior

En las pruebas iniciales de **saludo** con solo dos motores se alternaron conexiones/constantes con canales **1 y 2** y después **0 y 1**. En una versión el principal levantaba la pata y el otro saludaba; la lógica estaba escrita para esa distribución temporal. **La asignación física vigente y confiable para los seis servos es la tabla 0,1,2 / 3,4,5 anterior**, no la vieja del saludo.

---

## 5. Historial y cronología de lo realizado

### 26 de octubre de 2026 — arranque/control del saludo

- Se configuró Arduino UNO + PCA9685 + LiPo 3S + convertidor DC-DC + DC5535.
- Se verificó cableado I²C del UNO al PCA9685 y potencia independiente para servos.
- Al principio hubo un momento en el que el montaje **no se movía**, y se revisaron tensión, alimentación del bloque V+, masa común y programa.
- Funcionaron **dos servos en una misma pata**: uno para levantarla y otro para simular un saludo.
- Código histórico de saludo incluía `Adafruit_PWMServoDriver pwm(0x40)`, `pwm.setPWMFreq(50)`, comandos de pulso en microsegundos, movimientos progresivos con pasos de unos 10 µs y pausas.
- Un ajuste histórico aumentó elevación con `PATA_ARRIBA = 1100` desde una referencia previa cerca de 1300, con `PATA_ABAJO = 1700` y rapidez de saludo alrededor de `velocidad = 8` en aquel sketch. **Esos valores corresponden al montaje histórico**; no aplicarlos sin revisar a la asignación actual.
- El usuario quería que el saludo fuera más visible y preparó una explicación sencilla para feria vocacional.

### 3 de noviembre de 2026 — tres servos en la primera pata

- Se confirmó que **cada pata tiene 3 servos**.
- Primera pata pasó a usar canales **0, 1 y 2**.
- Se escribió un sketch con una fase de movimiento **servo por servo** y otra con los **3 simultáneos**.
- Se incrementó amplitud desde movimientos de ±75 µs a ±250 µs y luego a ±350 µs; hubo pruebas con `1500 -> 1850` y `1500 -> 1150` (no tomar eso como límite real).
- Se probaron secuencias coordinadas tipo `recoger -> avanzar -> bajar -> empujar -> regresar` con la primera pata en el aire.
- El usuario consideró varios recorridos demasiado pequeños y pidió repetidamente más amplitud.
- Se aclaró que 1500 µs es un centro de señal de referencia, **no necesariamente la posición recta de la estructura**.
- Se creó programa de calibración por Monitor Serie con `0/1/2`, `+`, `-`, `c` para identificar sentidos. El usuario respondió:
  - Canal 0 con `+`: hacia atrás.
  - Canal 1 con `+`: extiende.
  - Canal 2 con `+`: hacia afuera.
- Envió imagen enumerando físicamente las tres articulaciones.

### 3 de noviembre de 2026 — segunda pata delantera

- El usuario instaló/probó la pata vecina con servos en **canales 3,4,5**. Confirmó que ambas están «arriba», es decir, **dos delanteras**.
- Los **seis servos quedaron conectados simultáneamente al PCA9685**, con un solo regulador delantero.
- Se hizo sketch que primero movía una pata y luego la otra.
- Se amplió el recorrido con `AVANCE=200`, `FLEXION=200`, pasos ~350–450 ms y tres ciclos.
- Una vez pareció fallar tras «pata 1, pata 2 y un poco de pata 1», pero el usuario luego **identificó la causa: al moverse una pierna se había desconectado la batería**. Al restablecerla, dijo que **todo funciona bien**. No atribuir ese incidente a fallo del código ni afirmar sobrecarga por ese síntoma.
- Se desarrolló una versión **simultánea** donde las dos patas se mueven a la vez, **desfasadas medio ciclo** (`fase2 = fase + 0.5`), de modo que una levanta/adelanta mientras la otra simula apoyo/retroceso. Una pasada de este programa fue confirmada funcionando.

### 3 de noviembre de 2026 — postura e intento de preparación para ponerse de pie

- El usuario pidió mejorar caminata y **quitar el apoyo para sostenerse solamente sobre las dos patas delanteras**.
- Se explicó que esto NO es simplemente más amplitud: el centro de gravedad de un cuadrúpedo con solo apoyos delanteros probablemente quedará detrás del apoyo; sin otras patas/sujeción/control de equilibrio el robot puede caer.
- Se creó un sketch con comandos por Serial:
  - `p` postura extendida;
  - `w` caminar;
  - `c` centro;
  - `x` detener trayectoria (no corta potencia).
- El usuario observó **canal 1 demasiado cerca del centro**; en código anterior `EXTENSION = 35`, que efectivamente daba un desplazamiento de solo 35 µs desde 1500 y era insuficiente para ver la pierna recta.
- Hubo propuesta de extensión a `EXTENSION_PARADO = 150`, ajustable con `+` y `-` de 25 µs hasta 200 µs. No hay una confirmación de posición recta mecánica o de robot de pie sin soporte.
- El usuario pidió rango de calibración más libre, porque el código mostró «180°» cuando el servo aún tenía recorrido. Se aclaró que el ángulo mostrado era **un cálculo estimado a partir del PWM**, no lectura del encoder/posición física. Las subvariantes DC5535 comercializadas pueden diferir, así que no asumir 180° exactos de articulación.
- Se entregó calibrador de seis servos con registro de mínimo, postura/neutro y máximo, sin moverlos al inicio. **No hay una tabla de seis resultados reales guardada todavía**.
- Última petición fue aumentar mucho la amplitud, especialmente canal 1. Se entregó **CAMINATA 2.0**, con intensidad escalable 70–100 %, mayor flexión/extensión y límites provisionales. **No consta en la conversación que se haya probado esa última versión**.

---

## 6. Mediciones reales: resultados, contexto y matices

### 6.1 Regulador / voltaje

- Se ajustó aproximadamente a 7 V de salida para los DC5535.
- Con **2 servos saludando**: reposo ~**7,06 V**; en movimiento **7,02–7,06 V**.
- Con **3 servos**, el usuario primero creyó leer máximo 7,7 V, luego **corrigió**: rango observado de **7,1 V (mínimo mientras se movían 3) a 7,5 V (máximo)**. La cifra 7,7 V fue **corregida y debe descartarse**.
- Con **6 servos en el movimiento simultáneo fluido**: salida observada **7,02 V** durante la prueba, sin informe de grandes caídas.
- Interpretación: tensiones observadas aceptables en esas pruebas suspendidas; NO validan capacidad de pico, seguridad térmica, estabilidad bajo peso ni regulación perfecta.

### 6.2 Corriente — primera pata

El usuario puso **multímetro en serie en el positivo entre OUT+ del regulador y V+ del PCA9685**, dejando el negativo del regulador directo a GND del módulo. Correcta topología para medir la **corriente total de los servos** de ese banco, no solo la electrónica del chip PWM, siempre que no existan rutas alternativas de potencia V+.

| Prueba con pata suspendida | Corriente observada |
|---|---:|
| Mueve canal 0 | **0,15 A** |
| Mueve canal 1 | **0,08 A** (NO 0,80; el usuario lo corrigió explícitamente) |
| Mueve canal 2 | **0,13 A** |
| Mueve canales 0,1,2 juntos | **0,23 A** |

Antes, con pinza amperimétrica, había visto ~0,30 A en un momento. Una respuesta anterior sugirió que había dos conductores bajo la pinza, pero el usuario aclaró que **solo abrazaba uno**; no perpetuar esa hipótesis como hecho. También debe confirmarse que la pinza es realmente compatible con corriente DC, si se reutiliza.

### 6.3 Corriente — dos patas delanteras simultáneas

Con seis servos conectados, dos patas moviéndose simultáneamente, robot suspendido:

- **Reposo observado:** ~**0,20 A**.
- **Máximo observado en pantalla durante la caminata:** ~**0,41 A**.
- **Voltaje de salida en esa misma prueba:** **7,02 V**.

**Esto es una lectura visible, NO máximo instantáneo verdadero.** El medidor puede promediar o no capturar picos de arranque, carga brusca o atasco. La pata estaba libre del suelo, no cargaba todo el cuerpo.

### 6.4 Dato CRÍTICO de carga anterior

En otra prueba explicada por el propio usuario, al **quitar el apoyo de la estructura y probar que la pata intentase sostener/levantar parte del peso del robot**, **un solo servo (canal 1 según esa descripción) llegó a consumir alrededor de 1 A o algo más**. El usuario precisó que lo que subía era la **corriente, no el voltaje**. El voltaje se mantenía.

Esa prueba demuestra por qué no se debe extrapolar `0,41 A / 6` a un robot caminando. En carga real un solo servo ya alcanzó corriente de orden 1 A; todavía faltan picos y casos de parada/bloqueo. **No existen mediciones completas confiables de la corriente total de los seis servos soportando el cuerpo.**

### 6.5 Medición correcta y seguridad

- **Voltaje:** multímetro en paralelo con OUT+ y OUT− del regulador, selector V DC.
- **Corriente:** medidor DC en serie con el único positivo que alimenta los servos; revisar entrada 10/20 A, fusible y límite de tiempo del instrumento; evitar medición si posibles picos exceden rango. Nunca poner amperímetro en paralelo entre + y − (cortocircuito).
- Una **pinza DC** adecuada o medidor DC en línea con registro de picos es preferible para estimar consumo dinámico.
- **Voltaje LiPo bajo carga:** medir entrada IN+/IN− del regulador mientras funciona; 11,1 V es nominal, cargada puede ser 12,6 V. No se informó aún una medida verificable de tensión de batería bajo carga.
- **Temperatura:** termómetro infrarrojo o sonda apropiada; no se registró ninguna temperatura cuantitativa del regulador.
- El soporte mantiene las patas libres; sus bajas corrientes no son representativas de un robot de pie.

---

## 7. Software, librerías, protocolo y problemas conocidos

- **Arduino IDE** en Windows.
- Placa elegida: **Arduino Uno**, puerto COM de la computadora (COM exacto no fijado permanentemente).
- Bibliotecas Arduino: `<Wire.h>` y `<Adafruit_PWMServoDriver.h>`; algunos sketches usan `<math.h>`.
- Inicialización típica:

```cpp
Adafruit_PWMServoDriver pwm(0x40);
pwm.begin();
pwm.setPWMFreq(50);
pwm.writeMicroseconds(canal, pulso);
```

- **Monitor Serie: 9600 baudios** para los programas interactivos.
- Hubo un error de Arduino IDE con Monitor Serie: mensaje «Not connected. Select a board and a port to connect automatically». Aunque el sketch subía al UNO, el monitor no tenía conexión activa. Se solucionó seleccionando placa y **puerto COM**, reabriendo Monitor Serie y verificando baudrate.
- El usuario se cansó de introducir `+` Enter continuamente; solicitó **una interfaz de escritorio Windows** con sliders/botones y selección COM para calibración. Se inició una solicitud en un flujo de trabajo separado, pero **no está confirmado aquí que esa aplicación esté instalada o terminada**. Si se realiza, cerrar Monitor Serie antes de abrir la conexión serial desde la app (un solo proceso puede usar el puerto COM).
- Arduino UNO por USB controla/comunica; los motores de alto consumo usan su alimentación externa por LiPo/reductor.

### 7.1 El PCA9685 no devuelve ángulos físicos

El DC5535 descrito usa **3 cables** (potencia, GND, señal PWM), y no se identificó una conexión dedicada de retroalimentación angular. **El PCA9685 solo emite órdenes PWM; no sabe la posición real**. Por eso:

- `1500 µs` es una orden de referencia, **NO prueba de que la pata esté recta**.
- Mostrar `180°` en Serial por interpolación entre `500` y `2500` **NO prueba ángulo físico real de 180°**.
- Si el usuario mueve las patas manualmente con todo desconectado, el Arduino **no puede leer las seis posiciones físicas** al encenderse.
- Para conservar un montaje en postura deseada se deben identificar valores mediante calibración gradual o añadir sensores externos de ángulo/servos de feedback; los registros PWM por sí solos no miden la posición física.

---

## 8. Códigos y evolución de parámetros

### 8.1 Saludo con dos servos — HISTÓRICO

- Al comienzo dos servos por la primera pata, uno elevaba y el otro realizaba saludo.
- En uno de los programas originales: dos canales definidos en 1 y 2; posiciones generales de elevación `PATA_ABAJO=1700`, `PATA_ARRIBA=1300` y después se ajustó elevación más marcada, incluyendo valor cercano a **1100 µs** en un sketch posterior; movimiento de saludo alrededor de 1350/1500/1650 µs y aceleración por pasos de pulso.
- **No reutilizar sin actualizar asignaciones actuales 0/1/2 y comprobar direcciones**.

### 8.2 Prueba de tres servos, primera pata

Fase A: mover individualmente uno por uno. Fase B: mover los tres simultáneos.

- Inicialmente `1500 µs` y amplitud ±75.
- Aumentó a ±250 (`1750`, `1250`, `1750`), después ±350 (`1850`, `1150`, `1850`) para hacer el movimiento visible.
- Son consignas históricas de prueba suspendida, **no límites verificados**.

### 8.3 Paso coordinado de una pata

Secuencia construida: recoger/flexionar -> adelantar con superior -> extender/bajar -> empujar atrás -> recoger -> centrar. Las magnitudes empezaron ~90–100 µs y después se ampliaron a `AVANCE=250`, `FLEXION=250`, `EXTENSION=100`, `APERTURA=100`, con límites provisionales `1250–1750` y varios movimientos de 700–1100 ms. El usuario confirmó funcionamiento, pero insistió que amplitud seguía siendo pequeña.

### 8.4 Dos patas alternadas una después de otra

Primero se probó pata 1 canales 0–2 y, al terminar, pata 2 canales 3–5. Variantes `AVANCE=120` y `FLEXION=100` (más suave) y otra de `AVANCE=200`, `FLEXION=200`, `EXTENSION=60`, `APERTURA=65`, tiempos 350–450 ms. El incidente de detención se debió a cable de batería desconectado y quedó resuelto.

### 8.5 Dos patas simultáneas: versión FLUIDA PROBADA

Archivo adjunto en este paquete: `CAMINATA_FLUIDA_PROBADA.ino`. Es la versión que mejor representa una prueba ya reportada funcionando con seis servos suspendidos.

Conceptos:

- Pata 1 evalúa fase en `[0,1)`.
- Pata 2 evalúa `fase + 0.5` (desfase de 180°).
- Tramo de vuelo **43 %**: eleva/retrae la articulación inferior con `sin(πt)^2` y avanza.
- Tramo de supuesto apoyo **57 %**: retrocede.
- Usa smoothstep `t*t*(3-2*t)`.
- `AVANCE=190`, `FLEXION=175`, `EXTENSION=25`, `APERTURA=45`, `DURACION_CICLO=2400 ms`, `INTERVALO=20 ms`, `CICLOS=3`, límites `1300–1700 µs`.
- Inicia con transición suave, ejecuta ciclos y vuelve al centro.
- El usuario confirmó las dos patas moviéndose simultáneamente, con consumo observado **0,41 A** y **7,02 V** suspendidas.
- **Esto NO equivale a cinemática inversa calibrada ni demuestra locomoción real.**

### 8.6 Postura delantera y calibración canal 1

Se buscó extender canal 1 para que la pata quedara visualmente más recta. Una variante usó `EXTENSION = 35` (demasiado poco). Luego `EXTENSION_PARADO=150` ajustable desde Serial y hasta 200 µs. **La posición exacta de «pata recta» no fue aún informada/calibrada.**

### 8.7 Calibrador individual avanzado de 6 servos

Archivo adjunto `CALIBRACION_6_SERVOS.ino`:

- Seleccionar canal `0`, `1`, `2`, `3`, `4`, `5`.
- `c`: activar o centrar en 1500 µs (puede dar salto porque posición física inicial es desconocida).
- `+` / `-`: sumar/restar 10 µs.
- `>` / `<`: sumar/restar 50 µs.
- `m1700`: ordenar 1700 µs (desplazamiento suave desde la **última orden conocida**, no lectura real).
- `l`: guardar mínimo mecánico seguro anotado por el usuario.
- `n`: guardar referencia/neutro mecánico elegido.
- `u`: guardar máximo mecánico seguro.
- `r`: mostrar registros de 6 servos.
- `x`: dejar de enviar PWM al canal activo; `X`: todos. **No garantizan apagado eléctrico / paro físico**, puede perder fuerza.
- Rango programado 500–2500 µs tomado como banda de comandos exploratoria; **NO asegura que el servo concreto ni la pata armada tengan ese recorrido libre**, ni implica 0–180° exactos.
- Los resultados están solo en **RAM** y se pierden al cortar energía. No están guardados automáticamente en EEPROM/archivo.
- Usuario todavía no ha aportado tabla concreta de mínimo, neutro, máximo de los seis canales.

### 8.8 CAMINATA 2.0 — ULTIMO CÓDIGO ENTREGADO, AÚN NO PROBADO

Archivo adjunto `CAMINATA_2_0_EXPERIMENTAL.ino`.

Es la versión producida tras la última petición de «mover mucho más, sobre todo canal 1», con:

```cpp
const int CENTRO = 1500;
const int MINIMO[6] = {1250, 1200, 1400, 1250, 1200, 1400};
const int MAXIMO[6] = {1750, 1800, 1600, 1750, 1800, 1600};
const int AVANCE = 240;
const int FLEXION = 280;   // mayor flexion de articulaciones inferiores
const int EXTENSION = 270; // mayor extension
const int APERTURA = 55;
int intensidad = 70;      // empieza al 70%, subir de 10% en 10%
const int TIEMPO_CICLO = 2200;
const int NUM_CICLOS = 3;
const int PASO_MAXIMO = 18;
const unsigned long INTERVALO = 20;
```

Comandos: `p` postura extendida, `w` caminar, `+` aumentar intensidad 10 %, `-` reducir intensidad 10 %, `c` centro, `x` congelar última orden sin cortar energía.

**Punto crítico:** canal 1 **pretende** alcanzar aprox. `1500 + 270 = 1770 µs` en extensión plena y `1500 - 280 = 1220 µs` en flexión plena; canal 4 lo hace en dirección espejo (si el montaje lo confirma). A 70 %, el movimiento es menor. **Ninguno de estos extremos fue confirmado como límite seguro del robot real.**

Esta última versión usa consigna más amplia que la validada anteriormente, y modificar `PASO_MAXIMO=18` aumenta la rapidez de cambio: validar primero con el brazo suspendido sin interferencias, y sin carga sobre las patas. **No se reportó prueba posterior de CAMINATA 2.0.**

---

## 9. Problemas encontrados y explicaciones correctas

1. **No funcionaban inicialmente**: se revisó separación de alimentación lógico/servos y GND común; posteriormente funcionó.
2. **Movimiento muy leve**: el código usaba variaciones de 35, 75, 90 o 100 µs; se aumentó recorrido progresivamente.
3. **Monitor Serie no conectado aunque programa subía**: no tener puerto COM abierto/seleccionado; se resolvió y pudo usar comandos.
4. **Escribir `+` y Enter continuamente era lento**: surgió solicitud de aplicación Windows con sliders y selección COM (aún no consta entrega terminada).
5. **Lecturas de corriente parecían muy bajas**: eran con patas suspendidas y medidor posiblemente sin captura de picos; no medir solo chip PCA si amperímetro se intercala en V+ sino conjunto de servos, según cableado.
6. **0,80 A canal 1 era un error de lectura reportada**: usuario rectificó a **0,08 A** durante la prueba ligera. Existe **otra prueba bajo carga** en la que un servo llegó a **~1 A o más**; son escenarios distintos.
7. **Máximo 7,7 V fue corregido a 7,5 V** en prueba con 3 servos.
8. **Secuencia se cortó a mitad del segundo ciclo**: el usuario luego descubrió **batería desconectada por movimiento de una pierna**. Solucionado, programa funcionó.
9. **No se puede leer posición al encender si fue movido manualmente sin tensión**: 3 hilos sin feedback angular identificado; órdenes PWM no representan sensor.
10. **Un número «180°» en Serial no demostró tope**: interpolación matemática de PWM, no medición de eje.
11. **Canal 1 no estira bastante al usar postura**: `EXTENSION=35` y rangos estrechos limitaban su recorrido; se prepararon códigos más amplios, pero faltan límites reales.
12. **¿Se para con 2 patas delanteras?** Aún no validado. Implica problemas de centro de gravedad, torque y equilibrio; no se debe confundir con un movimiento de caminata suspendido.

---

## 10. Seguridad y restricciones que NO deben omitirse

- Las pruebas exitosas de seis servos se realizaron **con el cuerpo apoyado sobre un soporte y las patas en el aire**, no caminando ni cargando masa real.
- Conectores de la batería deben quedar **firmes y con alivio de tensión**, porque ya hubo desconexión mecánica al moverse la pata.
- Una LiPo 3S requiere manejo correcto, protección ante cortos, monitoreo de celdas/bajo voltaje y carga balanceada. No conectar 11,1/12,6 V directamente a servos diseñados para menos.
- No mover hasta topar contra las piezas impresas; el bloqueo puede causar corrientes muy elevadas, daño de servo y calor. Los supuestos límites PWM de un servo no son automáticamente límites de articulación segura.
- Para probar extensión máxima **mecánica** de un servo, idealmente desacoplar el brazo del mecanismo y explorar por pequeños pasos. Mantener dedos, cables y ropa apartados.
- El `x` de los programas detiene la **trayectoria de órdenes**, pero los servos aún pueden estar energizados y haciendo fuerza; no reemplaza un corte físico de energía.
- El PCA9685 es generador de señales; no se debe usar la barra V+ o sus pistas como distribuidor de potencia de alta corriente sin verificar su capacidad real.
- Antes de añadir los seis servos de atrás: revisar el **segundo regulador** (modelo, voltaje, capacidad) y diseñar distribución separada de positivos; **no unir salidas de reguladores independientes directamente**.
- Para ponerse de pie sin soporte se requiere evaluar centro de gravedad, apoyo geométrico, torque/corriente y posiblemente sensado de inclinación; incluso con patas rectas el cuerpo puede caerse.

---

## 11. Información que todavía NO se conoce (no inventar)

1. **Posición mínima segura, neutra de pie y máxima segura** de los seis canales. Falta la tabla real por canal.
2. Datos geométricos completos: longitud de segmentos, ángulos de instalación de servohorns, orientación de las dos patas, offsets reales y articulación exacta que produce abducción/aducción.
3. Peso total del Dog Bot con chasis, batería, electrónica y patas; distribución del centro de gravedad.
4. Voltaje real de LiPo bajo carga y capacidad de descarga `C`.
5. Corriente pico bajo peso de los **seis juntos** y corriente de bloqueo; el máximo de pantalla 0,41 A no la representa.
6. Confirmación exacta del regulador frontal (chip/modelo, corriente continua confiable, ventilación) y del segundo regulador trasero.
7. Presencia/ausencia de interruptor principal, fusibles, detector de bajo voltaje y limitación de corriente confiable.
8. Confirmación individual de sentidos, cero y límites de canales **3,4,5** en el montaje espejo.
9. Si «DC5535 180°» corresponde a subvariante genuinamente posicional y cuál es su rango real de pulso; las etiquetas impresas podrían variar.
10. Si la aplicación Windows solicitada en otro flujo se implementó e instaló.
11. Ninguna prueba documentada del robot sosteniéndose o desplazándose completamente sin soporte con estas dos patas.
12. Ningún sensor IMU, contacto del suelo, encoder externo o modelo cinemático calibrado confirmado como instalado.

---

## 12. Plan de trabajo recomendado al retomar en otro chat

### Fase A — preservar estado actual (muy importante)

- Guardar la versión `CAMINATA_FLUIDA_PROBADA.ino` como baseline que **sí funcionó** suspendido.
- Guardar `CAMINATA_2_0_EXPERIMENTAL.ino` como propuesta con mayor amplitud **todavía por validar**.
- Guardar capturas/fotos donde se observa ubicación de canales 0, 1, 2 y las dos patas delanteras.
- Describir físicamente qué se ve al mover cada canal 3/4/5 por separado.

### Fase B — calibración real con postura apoyada, no equilibrio todavía

- Calibrar **uno por uno** centro funcional, flexión y extensión sin tocar topes mecánicos, usando el sketch de calibración y robot suspendido (preferiblemente desacoplar brazo para buscar recorrido intrínseco del servo).
- Registrar seis tríos `{mínimoSeguro, referenciaDePie, máximoSeguro}`, en µs.
- Confirmar sentido de segunda pata (espejo real).
- Calcular trayectorias en espacio cartesiano del pie según longitudes y offsets reales; la posición del servo 1 no debe elegirse solo por amplitud visual.

### Fase C — alimentación

- Reconfirmar modelo/capacidad del XL4015 y corriente bajo carga con medidor que capture picos.
- Verificar el segundo regulador antes de diseñar el cableado trasero, con positivos de cada banco aislados y masa común.
- Poner fijación de batería, conectores adecuados y revisar disipación, fusible/interruptor y seguridad de la LiPo.

### Fase D — control natural y locomoción

- Movimiento de dos patas más natural mediante perfiles suaves, control de posición y calibración individual.
- Integrar patas traseras: total 12 servos.
- Estimar centro de gravedad, longitud de los cuatro apoyos y estabilidad estática.
- Si se requiere marcha autónoma: considerar IMU, cinemática inversa, fases de contacto y transferencia de peso, con controles para detectar caída y cortar potencia de forma segura.

### Fase E — interfaz Windows

App de escritorio que envíe comandos por COM a Arduino con 6 y luego 12 canales, sliders µs por articulación, botón de selección y calibración, registro de límites, presets de postura y marcha, límites de software y reconexión. Puede hacerse con Python/Tkinter + pyserial, o C# .NET. Nota: el firmware Arduino tendrá que aceptar protocolo acorde y cerrar Serial Monitor para liberar COM. **No confundir enviar consignas con leer posición física**.

---

## 13. PROMPT LISTO PARA PEGAR EN OTRO CHAT

> Actúa como ingeniero mecatrónico especializado en robótica cuadrúpeda, control de servos, sistemas embebidos y electrónica de potencia. Quiero que continúes MI proyecto físico Dog Bot a partir de este archivo maestro y los tres sketches adjuntos. No asumas que ya camina por el suelo: actualmente hay dos patas delanteras, seis DC5535 en PCA9685 canales 0–5, Arduino UNO y LiPo 3S de 11,1 V/4000 mAh con regulador aparentemente XL4015 a ~7 V. La prueba suspendida con seis servos simultáneos alcanzó 0,41 A visible y 7,02 V, pero se registró más de 1 A en un servo cuando la pata intentó sostener parte del cuerpo; NO extrapoles consumo sin carga. El canal 1 extiende cuando aumento el pulso. Quiero que uses primero la versión `CAMINATA_FLUIDA_PROBADA.ino` como referencia estable y trates `CAMINATA_2_0_EXPERIMENTAL.ino` como aún no probada. Respeta seguridad de LiPo, posiciones físicas desconocidas y riesgo de sobrecorriente. Pregúntame solo los datos de calibración que de verdad falten; explica el porqué de cada decisión de forma práctica y relativamente sencilla. No copies supuestos de otras patas como datos comprobados. Si propones código, entrégalo completo, compilable y con instrucciones de prueba gradual.

---

## 14. Ficheros de este paquete

- `README_DOGBOT_MASTER.md` — **este dossier**: hechos, historia, conexiones, mediciones, algoritmos, dudas y próximos pasos.
- `CAMINATA_FLUIDA_PROBADA.ino` — sketch de 6 servos simultáneos alternados, reportado funcionando **suspendido**.
- `CAMINATA_2_0_EXPERIMENTAL.ino` — última propuesta de más amplitud, especialmente canal 1, **no hay confirmación de prueba**.
- `CALIBRACION_6_SERVOS.ino` — sketch para selección individual, pequeños incrementos, registro mínimo/referencia/máximo en RAM.

Los `.ino` son transcripciones/reconstrucciones organizadas de los últimos sketches conversados; **no se compilaron ni cargaron físicamente desde este paquete**. Cuando se pase a otro chat conviene adjuntar también las **fotos originales** del montaje y la distribución de canales: el archivo Markdown no contiene las imágenes del chat anterior y un chat nuevo no necesariamente las tendrá disponibles.

---

## 15. Resumen corto de 10 hechos para no perder el hilo

1. Es un cuadrúpedo Dog Bot, estructura roja 3D, tres servos por pata, 12 previstos.
2. **Seis DC5535 ya están montados y conectados:** dos patas delanteras, no traseras.
3. Pata 1 = 0 superior, 1 inferior, 2 cadera; pata 2 = 3, 4, 5.
4. Aumentar PWM: 0 mueve hacia atrás, 1 extiende, 2 abre hacia afuera. Segunda pata se programó en espejo, falta tabla individual confirmada.
5. Arduino UNO + PCA9685 `0x40`, 50 Hz; UNO A4/SDA, A5/SCL, 5V/VCC, GND común.
6. LiPo 3S 11,1 V/4000 mAh; regulador delantero aparente XL4015 ~7 V; **hay un segundo regulador** planeado para la parte trasera.
7. Con seis servos moviéndose suspendidos: reposo ~0,20 A; máximo visible ~0,41 A; salida ~7,02 V; **no son picos máximos reales**.
8. Al intentar levantar peso en otra prueba, un servo llegó a **~1 A o más**, aunque el voltaje permanecía estable.
9. La caminata fluida simultánea desfasada 0,5 ciclo **funcionó suspendida**; versión 2.0 de más recorrido aún sin informe de prueba.
10. **Canal 1 no extiende suficientemente con códigos centrados en 1500**; hace falta calibrar posición recta y límites reales; aún no se ha demostrado soporte sin apoyo ni caminar sobre el suelo.

**FIN DEL DOSSIER.**


---

## ANEXO A. Código completo: caminata fluida reportada funcionando suspendida

```cpp
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <math.h>
Adafruit_PWMServoDriver pwm(0x40);

// Dog Bot - DOS patas delanteras, movimiento alternado continuo.
// VERSION que el usuario reporto funcionando suspendida;
// no implica validacion para soportar peso ni limites mecanicos.
const int CENTRO = 1500;
const int AVANCE = 190;
const int FLEXION = 175;
const int EXTENSION = 25;
const int APERTURA = 45;
const int DURACION_CICLO = 2400;
const int INTERVALO = 20;
const int CICLOS = 3;
const int MINIMO = 1300;
const int MAXIMO = 1700;
const int direccion[2][3] = {{-1, -1, +1}, {+1, +1, -1}};
int posicion[6] = {1500,1500,1500,1500,1500,1500};

float suavizar(float t) {
  t = constrain(t, 0.0f, 1.0f);
  return t*t*(3.0f-2.0f*t);
}

void calcularPata(int pata, float fase, int destino[3]) {
  const float FASE_VUELO = 0.43f;
  float avance, flexion, apertura;
  if (fase < FASE_VUELO) {
    float t = fase/FASE_VUELO;
    avance = -AVANCE + 2.0f*AVANCE*suavizar(t);
    float elevacion = sin(PI*t);
    elevacion *= elevacion;
    flexion = FLEXION*elevacion;
    apertura = APERTURA*elevacion;
  } else {
    float t = (fase-FASE_VUELO)/(1.0f-FASE_VUELO);
    avance = AVANCE - 2.0f*AVANCE*suavizar(t);
    float apoyo = sin(PI*t);
    apoyo *= apoyo;
    flexion = -EXTENSION*apoyo;
    apertura = 0;
  }
  destino[0] = constrain(CENTRO+direccion[pata][0]*avance,MINIMO,MAXIMO);
  destino[1] = constrain(CENTRO+direccion[pata][1]*flexion,MINIMO,MAXIMO);
  destino[2] = constrain(CENTRO+direccion[pata][2]*apertura,MINIMO,MAXIMO);
}

void escribirServos(int destino[6]) {
  for (int i=0; i<6; i++) {
    int pulso=constrain(destino[i],MINIMO,MAXIMO);
    pwm.writeMicroseconds(i,pulso);
    posicion[i]=pulso;
  }
}

void transicion(int destino[6], int duracion) {
  int inicio[6];
  for (int i=0; i<6; i++) inicio[i]=posicion[i];
  int pasos=max(1,duracion/INTERVALO);
  for (int p=1; p<=pasos; p++) {
    float t=suavizar((float)p/pasos);
    int temporal[6];
    for (int i=0; i<6; i++) temporal[i]=inicio[i]+(destino[i]-inicio[i])*t;
    escribirServos(temporal);
    delay(INTERVALO);
  }
}

void calcularDosPatas(float fase, int destino[6]) {
  int a[3],b[3];
  calcularPata(0,fase,a);
  float fase2=fase+0.5f;
  if(fase2>=1.0f) fase2-=1.0f;
  calcularPata(1,fase2,b);
  for(int i=0;i<3;i++){ destino[i]=a[i]; destino[i+3]=b[i]; }
}

void caminarFluido() {
  int destino[6];
  int pasos=DURACION_CICLO/INTERVALO;
  Serial.println("CAMINATA INICIADA");
  for(int ciclo=0;ciclo<CICLOS;ciclo++) {
    Serial.print("CICLO ");Serial.println(ciclo+1);
    for(int p=0;p<pasos;p++) {
      float fase=(float)p/pasos;
      calcularDosPatas(fase,destino);
      escribirServos(destino);
      delay(INTERVALO);
    }
  }
  Serial.println("CAMINATA TERMINADA");
}

void setup() {
  Serial.begin(9600);
  pwm.begin();pwm.setPWMFreq(50);delay(500);
  for(int i=0;i<6;i++){pwm.writeMicroseconds(i,CENTRO);delay(300);}
  Serial.println("DOG BOT LISTO");delay(2000);
  int comienzo[6]; calcularDosPatas(0.0f,comienzo);
  transicion(comienzo,1500);
  delay(500);
  caminarFluido();
  int centroFinal[6]={1500,1500,1500,1500,1500,1500};
  transicion(centroFinal,1500);
  Serial.println("PRUEBA FINALIZADA");
}

void loop() {}
```


---

## ANEXO B. Código completo: caminata 2.0 de amplitud mayor, pendiente de validación

```cpp
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <math.h>

Adafruit_PWMServoDriver pwm(0x40);

// DOG BOT - CAMINATA 2.0 (PROPUESTA TODAVIA NO VALIDADA)
// Pata delantera 1: 0 superior, 1 inferior, 2 cadera
// Pata delantera 2: 3 superior, 4 inferior, 5 cadera
// PRECAUCION: limites 1200-1800 us NO calibrados mecanicamente.
// Probar suspendido; no usar para sostener el robot sin verificar
// distribucion de peso, corriente de pico y limites de articulaciones.

const int CENTRO = 1500;
const int MINIMO[6] = {1250, 1200, 1400, 1250, 1200, 1400};
const int MAXIMO[6] = {1750, 1800, 1600, 1750, 1800, 1600};
const int AVANCE = 240;
const int FLEXION = 280;
const int EXTENSION = 270;
const int APERTURA = 55;
int intensidad = 70;
const int TIEMPO_CICLO = 2200;
const int NUM_CICLOS = 3;
const int PASO_MAXIMO = 18;
const unsigned long INTERVALO = 20;
const int dirAvance[2] = {-1, +1};
const int dirFlexion[2] = {-1, +1};
const int dirCadera[2] = {+1, -1};
int actual[6] = {1500, 1500, 1500, 1500, 1500, 1500};
int objetivo[6] = {1500, 1500, 1500, 1500, 1500, 1500};
bool caminando = false;
unsigned long inicioCaminata = 0;
unsigned long ultimoUpdate = 0;

float suave(float t) {
  t = constrain(t, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}
float escala() { return intensidad / 100.0f; }

void postura() {
  caminando = false;
  for (int pata = 0; pata < 2; pata++) {
    int base = pata * 3;
    objetivo[base] = CENTRO;
    objetivo[base + 1] = CENTRO - dirFlexion[pata] * EXTENSION * escala();
    objetivo[base + 2] = CENTRO;
  }
  Serial.println("POSTURA EXTENDIDA");
}

void calcularPata(int pata, float fase) {
  const float VUELO = 0.42f;
  float desplazamiento = 0;
  float flexion = 0;
  float apertura = 0;
  float amplitud = escala();

  if (fase < VUELO) {
    float t = fase / VUELO;
    desplazamiento = -AVANCE + 2.0f * AVANCE * suave(t);
    float elevacion = sin(PI * t);
    elevacion = elevacion * elevacion;
    flexion = -EXTENSION + (FLEXION + EXTENSION) * elevacion;
    apertura = APERTURA * elevacion;
  } else {
    float t = (fase - VUELO) / (1.0f - VUELO);
    desplazamiento = AVANCE - 2.0f * AVANCE * suave(t);
    flexion = -EXTENSION;
    apertura = 0;
  }

  int base = pata * 3;
  objetivo[base] = CENTRO + dirAvance[pata] * desplazamiento * amplitud;
  objetivo[base + 1] = CENTRO + dirFlexion[pata] * flexion * amplitud;
  objetivo[base + 2] = CENTRO + dirCadera[pata] * apertura * amplitud;
}

void calcularCaminata() {
  unsigned long transcurrido = millis() - inicioCaminata;
  if (transcurrido >= (unsigned long)TIEMPO_CICLO * NUM_CICLOS) {
    postura();
    Serial.println("CAMINATA TERMINADA");
    return;
  }

  float fase = (transcurrido % TIEMPO_CICLO) / (float)TIEMPO_CICLO;
  calcularPata(0, fase);
  float fase2 = fase + 0.5f;
  if (fase2 >= 1.0f) fase2 -= 1.0f;
  calcularPata(1, fase2);
}

void actualizarServos() {
  for (int i = 0; i < 6; i++) {
    objetivo[i] = constrain(objetivo[i], MINIMO[i], MAXIMO[i]);
    int diferencia = objetivo[i] - actual[i];
    int cambio = constrain(diferencia, -PASO_MAXIMO, PASO_MAXIMO);
    actual[i] += cambio;
    pwm.writeMicroseconds(i, actual[i]);
  }
}

void mostrarIntensidad() {
  Serial.print("INTENSIDAD: ");
  Serial.print(intensidad);
  Serial.println("%");
}

void comandos() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'p') postura();
    else if (c == 'w') {
      caminando = true;
      inicioCaminata = millis();
      Serial.println("CAMINATA INICIADA");
      mostrarIntensidad();
    }
    else if (c == '+') {
      intensidad = min(intensidad + 10, 100);
      mostrarIntensidad();
      if (!caminando) postura();
    }
    else if (c == '-') {
      intensidad = max(intensidad - 10, 30);
      mostrarIntensidad();
      if (!caminando) postura();
    }
    else if (c == 'c') {
      caminando = false;
      for (int i = 0; i < 6; i++) objetivo[i] = CENTRO;
      Serial.println("VOLVIENDO AL CENTRO");
    }
    else if (c == 'x') {
      caminando = false;
      for (int i = 0; i < 6; i++) objetivo[i] = actual[i];
      Serial.println("MOVIMIENTO DETENIDO");
    }
  }
}

void setup() {
  Serial.begin(9600);
  pwm.begin();
  pwm.setPWMFreq(50);
  delay(500);
  for (int i = 0; i < 6; i++) {
    pwm.writeMicroseconds(i, CENTRO);
    delay(300);
  }
  ultimoUpdate = millis();
  Serial.println("DOG BOT - CAMINATA 2.0");
  Serial.println("p = Extender patas");
  Serial.println("w = Caminar");
  Serial.println("+ = Aumentar amplitud");
  Serial.println("- = Disminuir amplitud");
  Serial.println("c = Volver al centro");
  Serial.println("x = Detener trayectoria (no corta potencia)");
  mostrarIntensidad();
}

void loop() {
  comandos();
  if (millis() - ultimoUpdate >= INTERVALO) {
    ultimoUpdate = millis();
    if (caminando) calcularCaminata();
    actualizarServos();
  }
}
```


---

## ANEXO C. Código completo: calibración individual de seis servos

```cpp
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
Adafruit_PWMServoDriver pwm(0x40);

// Dog Bot - calibracion individual manual de 6 servos.
// ADVERTENCIA: el controlador NO conoce la posicion fisica real.
// Comando 'c' puede causar salto inmediato a 1500 us.
// Rango 500-2500 us es de EXPLORACION, no limites mecanicos seguros.
// Desacoplar brazos antes de explorar extremos.
const int MIN_PULSO=500, MAX_PULSO=2500, CENTRO=1500;
int canal=0;
int posicion[6]={1500,1500,1500,1500,1500,1500};
bool activo[6]={false,false,false,false,false,false};
int minimo[6]={-1,-1,-1,-1,-1,-1};
int neutro[6]={-1,-1,-1,-1,-1,-1};
int maximo[6]={-1,-1,-1,-1,-1,-1};

void mover(int destino){
  if(!activo[canal]){Serial.println("Primero usa c para activar en 1500 us");return;}
  destino=constrain(destino,MIN_PULSO,MAX_PULSO);
  while(posicion[canal]!=destino){
    int dif=destino-posicion[canal];
    posicion[canal]+=constrain(dif,-5,5);
    pwm.writeMicroseconds(canal,posicion[canal]);
    delay(20);
  }
  Serial.print("CANAL ");Serial.print(canal);
  Serial.print(" = ");Serial.print(posicion[canal]);Serial.println(" us");
}

void activarCentro(){
  if(!activo[canal]){
    activo[canal]=true;
    posicion[canal]=CENTRO;
    pwm.writeMicroseconds(canal,CENTRO);
    Serial.println("Servo activado en 1500 us");
  } else mover(CENTRO);
}

void mostrar(){
  Serial.println("===== CALIBRACION =====");
  for(int i=0;i<6;i++){
    Serial.print("Canal ");Serial.print(i);
    Serial.print(" | MIN: ");Serial.print(minimo[i]);
    Serial.print(" | CENTRO: ");Serial.print(neutro[i]);
    Serial.print(" | MAX: ");Serial.println(maximo[i]);
  }
  Serial.println("-1 = no calibrado");
}

void procesar(String cmd){
  cmd.trim(); if(cmd.length()==0)return;
  if(cmd.length()==1 && cmd[0]>='0' && cmd[0]<='5'){
    canal=cmd[0]-'0';
    Serial.print("CANAL SELECCIONADO: ");Serial.println(canal);
    if(!activo[canal])Serial.println("Sin activar. Usa c.");
    return;
  }
  if(cmd=="c"){activarCentro();return;}
  if(cmd=="x"){
    pwm.setPWM(canal,0,4096);activo[canal]=false;
    Serial.println("Senal del servo desactivada");return;
  }
  if(cmd=="X"){
    for(int i=0;i<6;i++){pwm.setPWM(i,0,4096);activo[i]=false;}
    Serial.println("Todas las senales desactivadas");return;
  }
  if(cmd=="r"){mostrar();return;}
  if(cmd=="l"&&activo[canal]){minimo[canal]=posicion[canal];Serial.println("MIN guardado");return;}
  if(cmd=="n"&&activo[canal]){neutro[canal]=posicion[canal];Serial.println("REFERENCIA guardada");return;}
  if(cmd=="u"&&activo[canal]){maximo[canal]=posicion[canal];Serial.println("MAX guardado");return;}
  if(cmd=="+"){mover(posicion[canal]+10);return;}
  if(cmd=="-"){mover(posicion[canal]-10);return;}
  if(cmd==">"){mover(posicion[canal]+50);return;}
  if(cmd=="<"){mover(posicion[canal]-50);return;}
  if(cmd.startsWith("m")){
    String n=cmd.substring(1); if(!n.length())return;
    for(unsigned int i=0;i<n.length();i++)if(!isDigit(n[i])){Serial.println("Numero invalido");return;}
    long val=n.toInt();
    if(val<MIN_PULSO||val>MAX_PULSO){Serial.println("Fuera del rango de pulsos");return;}
    mover((int)val);return;
  }
  Serial.println("Comando desconocido");
}

void setup(){
  Serial.begin(9600);Serial.setTimeout(100);
  pwm.begin();pwm.setPWMFreq(50);delay(300);
  for(int i=0;i<6;i++)pwm.setPWM(i,0,4096);
  Serial.println("DOG BOT CALIBRACION: 0-5 seleccionar; c centrar; +/- 10us; >/< 50us; m1700 mover;");
  Serial.println("l minimo; n centro; u maximo; r resultados; x apagar senal; X todas");
}
void loop(){
  if(Serial.available())procesar(Serial.readStringUntil('\n'));
}
```
