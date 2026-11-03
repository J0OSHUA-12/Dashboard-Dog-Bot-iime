# Medidas del Dog Bot (completar a mano)

Mide en **milímetros**, de **eje a eje**: del centro de un eje de giro al centro del
siguiente. No midas de borde a borde. Lo ideal es un calibre (pie de rey); una regla sirve
con ±1 mm. Si tienes los **archivos STL o CAD** del diseño (por ejemplo, si es una variante de
SpotMicro), envíalos también: de ahí salen las medidas exactas.

Puedes mandar los valores por el chat o completar esta tabla en el repositorio. Si dudas qué
punto es cada uno, una **foto con una regla al lado** ayuda mucho.

## A. Pata (mide una delantera y, cuando esté montada, una trasera)

| Código | Qué medir | Delantera | Trasera |
|---|---|---|---|
| L0 | Distancia **lateral** entre el eje de la cadera (horn de la placa extrema) y el plano central del muslo | | |
| L0v | Distancia **vertical** entre el eje de cadera y el eje del servo superior (0 si están a la misma altura) | | |
| L0h | Distancia **adelante-atrás** entre el eje de cadera y el eje del servo superior | | |
| L1 | Eje del servo superior (hombro) → eje de la rodilla (centro del rodamiento) | | |
| L2 | Eje de la rodilla → **punto del pie que toca el suelo** | | |

## B. Cuerpo

| Código | Qué medir | Valor |
|---|---|---|
| B1 | Distancia **adelante-atrás** entre el eje de cadera delantero y el trasero | |
| B2 | Distancia **lateral** entre los ejes de cadera de la izquierda y la derecha | |
| B3 | Largo total del cuerpo, de placa extrema a placa extrema | |
| B4 | Ancho del cuerpo (bandeja naranja) | |
| B5 | Altura del cuerpo (sin tapa) | |

## C. Peso y centro de gravedad

| Código | Qué medir | Valor |
|---|---|---|
| P1 | Peso total con batería y electrónica (balanza de cocina), en g | |
| P2 | Peso de la batería, en g | |
| P3 | **Punto de equilibrio**: apoya el cuerpo, con patas y batería en su lugar, sobre un lápiz atravesado. Mide la distancia desde el eje de cadera **delantero** hasta el punto donde queda en equilibrio | |

## D. Calibración angular (por servo, durante la calibración)

Con un transportador o la app de nivel/inclinómetro del celular apoyada en la pieza:

| Canal | Pulso A (µs) | Ángulo A (°) | Pulso B (µs) | Ángulo B (°) | Pulso con el muslo vertical / el tramo inferior a 90° |
|---|---|---|---|---|---|
| 0 | | | | | |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6–11 | (cuando estén montadas) | | | | |

Con dos puntos por servo se obtiene la relación real µs ↔ grados. Con ella, la cinemática del
dashboard pasa de «ángulo estimado» a **ángulo calibrado**. Sigue sin ser una medición en
tiempo real, porque los servos no tienen realimentación.
