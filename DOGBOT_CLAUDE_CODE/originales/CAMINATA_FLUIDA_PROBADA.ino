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
