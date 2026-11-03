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
