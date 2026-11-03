# Plan de trabajo · Fase 1: que se pare y dé unos pasos (solo Arduino UNO)

**Objetivo de la fase:** que el Dog Bot se ponga de pie, se sostenga solo y dé unos pocos
pasos sobre una superficie plana, de forma repetible para una demostración en feria.

**Fuera de esta fase:** Raspberry Pi, IMU, voz e IA.

Cada etapa tiene un **criterio para darla por terminada**. No se pasa a la siguiente sin
cumplirlo y anotarlo en *Registro de ensayos* del dashboard. Las cifras de los criterios son
**propuestas** para ajustar con tus mediciones, no límites validados.

---

## Etapa 0 · Preparación y seguridad

- [ ] Soporte estable que mantenga el robot con las patas en el aire.
- [ ] Interruptor general accesible entre batería y reguladores.
- [ ] Un fusible por banco de servos, del lado de la batería.
- [ ] Conectores de batería firmes, con alivio de tensión. Ya hubo una desconexión al mover
      una pata.
- [ ] Alarma de tensión baja para la LiPo 3S (zumbador de celdas): no descargar por debajo de
      lo que indique el fabricante.
- [ ] Multímetro y, si es posible, un medidor de corriente DC que registre picos.

**Terminada cuando:** puedes cortar la energía de los servos con una mano en menos de un
segundo, sin desconectar el USB.

---

## Etapa 1 · Alimentación con dos reguladores (delanteras / traseras)

Un regulador para las patas delanteras (canales 0–5) y otro para las traseras (canales 6–11).

### Regla crítica: los positivos de los dos reguladores nunca se unen

En las placas PCA9685 habituales, **el pin rojo central de todos los conectores de servo está
unido a una misma barra V+**. Si enchufas los 12 servos normalmente al PCA9685 y alimentas
cada grupo con un regulador distinto, **unirás las dos salidas a través de la placa** y podrías
dañarlas.

Cableado recomendado:

```text
LiPo 3S ─ fusible ─┬─ IN Regulador A ── OUT+ A ──► rojo (+) de los servos 0–5
                   └─ IN Regulador B ── OUT+ B ──► rojo (+) de los servos 6–11
OUT− A, OUT− B, GND del PCA9685, GND del Arduino ──► masa común (todas unidas)
PCA9685 (pines de señal) ──► cable de señal de cada servo
PCA9685 bornera V+ ──► SIN CONECTAR (o solo uno de los bancos, nunca los dos)
```

- El cable **rojo** de cada servo va a la barra de su banco (bornera o regleta), **no** al
  conector del PCA9685. Al PCA9685 llegan solo **señal y GND** de cada servo. Se puede usar un
  cable alargador al que se le saca el pin rojo.
- Antes de conectar servos, comprueba con el multímetro en continuidad que **OUT+ A y OUT+ B
  no tienen continuidad entre sí**.
- Ajusta ambos reguladores **a la misma tensión** sin carga. Hasta ahora usaste unos 7 V;
  confirma que está dentro del rango de tus DC5535.
- Pon disipador a los reguladores. Un módulo tipo XL4015 suele anunciarse como de 5 A como
  máximo, y entrega menos en continuo y sin disipación. Seis servos sosteniendo peso pueden
  superarlo: **mide** antes de suponer que alcanza.

### Mediciones a registrar (en *Mediciones* del dashboard)

1. Banco A con las 2 patas suspendidas moviéndose: tensión mínima y corriente máxima visible.
2. Lo mismo con el banco B.
3. Temperatura del regulador tras 5 minutos de movimiento (termómetro IR o tacto con cuidado).

**Terminada cuando:**
- se confirmó que no hay continuidad entre OUT+ A y OUT+ B;
- cada banco mueve sus 6 servos suspendidos sin que la tensión caiga de forma notable;
- el regulador no se calienta tanto que no puedas tocarlo;
- todo queda anotado.

> Si al ponerse de pie (etapa 6) la tensión cae o el regulador se calienta mucho, el
> siguiente paso es un regulador o BEC de más corriente por banco. No es un fallo del
> software.

---

## Etapa 2 · Software y firmware en Windows

Sigue [INSTALACION_WINDOWS.md](INSTALACION_WINDOWS.md) y las pruebas 1–5 de
[PRUEBAS.md](PRUEBAS.md#pruebas-físicas-pendientes-no-realizadas):

- [ ] La app abre en simulación.
- [ ] Arduino CLI detectado; `DogBotDashboard` compila.
- [ ] Carga en el UNO con el robot sostenido o los servos sin energía.
- [ ] Al conectar aparece **Compatible · desarmado** y **ningún servo se mueve** al arrancar ni
      al conectar.
- [ ] DETENER, PWM OFF y Desarmar responden.

**Terminada cuando:** las cinco casillas están marcadas.

---

## Etapa 3 · Calibrar las patas delanteras (canales 0–5)

Procedimiento: [CALIBRACION.md](CALIBRACION.md). Orden: **1 → 0 → 2**, después **4 → 3 → 5**.

Para cada canal, anota:

- [ ] mínimo y máximo **seguros**, sin tocar topes;
- [ ] el sentido de +µs. En 3, 4 y 5 hay que confirmar si de verdad es el espejo de 0, 1 y 2;
- [ ] **calibración angular de 2 puntos**: con un transportador o una app de inclinómetro en el
      celular, mide el ángulo real de la pieza en dos pulsos distintos (por ejemplo 1300 y
      1700 µs). De ahí sale cuántos µs equivalen a 1° **en tu robot**. La cinemática lo
      necesita: sin esto, el «ángulo» del dashboard es solo una estimación;
- [ ] el pulso donde el muslo queda **vertical** y donde el tramo inferior queda **perpendicular**
      al muslo.

**Terminada cuando:** los 6 canales están «calibrados» en el perfil, exportado como
`perfil_v2_delanteras.json`, y la secuencia «Ensayo suspendido · delanteras» funciona en
el robot real al 50 % de amplitud.

---

## Etapa 4 · Montar y calibrar las patas traseras (canales 6–11)

- [ ] Montaje mecánico y cableado al banco B (etapa 1).
- [ ] En el dashboard: Perfil → «Proponer 6–11», y después en Calibración, para cada canal,
      cambiar el estado a **probado** cuando confirmes qué servo responde.
- [ ] Mismas comprobaciones que en la etapa 3 para los canales 6–11.
- [ ] Decidir y anotar qué pata es izquierda y cuál derecha mirando el robot desde atrás, y
      renombrar en el perfil si hace falta.

**Terminada cuando:** los 12 canales están calibrados, con calibración angular, y el perfil
está exportado como `perfil_v3_12canales.json`.

---

## Etapa 5 · Medidas del robot → cinemática y marcha (en simulación)

Completa [MEDICIONES_ROBOT.md](MEDICIONES_ROBOT.md). Se puede hacer en cualquier momento,
incluso antes de la etapa 1.

Con esas medidas, **yo agrego al dashboard**:

1. **Cinemática inversa** por pata: posición del pie (x, y, z) → ángulos → µs, usando tu
   calibración angular.
2. **Poses**: acostado, sentado, de pie (con la altura ajustable) y dar la pata.
3. **Marcha creep**: una pata a la vez, con tres siempre apoyadas, y el cuerpo que se
   desplaza para que el centro de gravedad quede dentro del triángulo de apoyo. Parámetros:
   largo y altura del paso, velocidad y desplazamiento del cuerpo.
4. **Margen de estabilidad** dibujado en el 3D: el triángulo de apoyo y la proyección
   estimada del centro de gravedad, a partir del peso y del punto de equilibrio que midas.
   Es una estimación, no una medición.
5. **Asignación de banco** (A o B) por canal en el perfil, para registrar la corriente por
   regulador.

**Terminada cuando:** en simulación el robot pasa de acostado a de pie, de pie a sentado, y
da 4 ciclos de marcha creep sin que el centro de gravedad estimado salga del triángulo de
apoyo.

---

## Etapa 6 · Ponerse de pie (robot real)

Avanza poco a poco, y en cada paso mide la corriente de cada banco:

1. [ ] Suspendido: reproducir la secuencia «acostado → de pie» con las patas en el aire.
2. [ ] **Apoyado pero con ayuda**: con una cinta o tu mano sosteniendo parte del peso,
       pasar a «de pie» a velocidad baja.
3. [ ] Soltar poco a poco el apoyo. Si el robot se hunde, una articulación cede o un
       regulador se calienta: **DETENER**, anotar y revisar (alimentación, límites, altura de
       la pose).
4. [ ] Mantener de pie 30 s, después 2 min, controlando la temperatura de servos y
       reguladores.

**Terminada cuando:** se pone de pie solo desde acostado 5 veces seguidas y se mantiene
2 minutos sin calentamiento excesivo. La corriente de cada banco queda registrada.

---

## Etapa 7 · Primeros pasos

1. [ ] Marcha creep **suspendido**, al 50 % de amplitud.
2. [ ] Marcar el paso **en el sitio**, sobre el suelo, con apoyo de seguridad (cinta floja).
3. [ ] Avanzar 3–5 pasos sobre una superficie que agarre (alfombra fina o goma
       antideslizante; conviene poner gomas en los pies).
4. [ ] Ajustar el largo del paso, la altura, la velocidad y el desplazamiento del cuerpo.
       Cambia un parámetro cada vez y anótalo.

**Terminada cuando:** avanza 5 pasos sin caerse en 8 de cada 10 intentos, con la
batería cargada. Este criterio es tuyo: ajústalo a lo que quieras mostrar.

---

## Etapa 8 · Rutina para la feria

- [ ] Secuencia de demostración: acostado → de pie → saludar (una pata) → 3–5 pasos →
      sentarse → acostado.
- [ ] Ensayarla 10 veces seguidas y anotar fallos.
- [ ] Lista de repuestos: un servo, tornillos, fusibles, batería cargada, cargador balanceador.
- [ ] Explicación sencilla para el público: qué es el robot, qué hace el Arduino y qué hacen
      los servos.

---

## Riesgos conocidos

| Riesgo | Síntoma | Qué hacer |
|---|---|---|
| Alimentación insuficiente | Cae la tensión, el regulador se calienta, el UNO se reinicia | Regulador o BEC de más corriente por banco; cables más gruesos |
| Torque insuficiente en la rodilla | La pata se hunde de pie | Pose más agachada, menos peso, batería centrada |
| Centro de gravedad mal ubicado | Se cae hacia adelante o atrás al levantar una pata | Mover la batería; más desplazamiento del cuerpo en la marcha |
| Estructura impresa flexible | Las patas se abren al apoyar | Refuerzos o más relleno de impresión |
| Servos calientes | Olor, servo blando | Pausas, poses menos exigentes, revisar límites |
| Batería LiPo baja | Comportamiento errático | Alarma de celdas; cargar antes de cada demostración |
