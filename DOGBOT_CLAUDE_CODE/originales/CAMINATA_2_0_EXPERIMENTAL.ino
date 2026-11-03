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
