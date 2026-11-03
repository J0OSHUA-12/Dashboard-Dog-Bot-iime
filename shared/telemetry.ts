// Telemetría honesta: cada señal declara unidad, fuente y validez.
// Ausencia de dato = null ("Sin sensor"), nunca cero.

export type SignalSource =
  | 'sensor'
  | 'firmware'
  | 'pc'
  | 'manual-historico'
  | 'manual'
  | 'estimado'
  | 'simulado';

export const SOURCE_LABEL: Record<SignalSource, string> = {
  sensor: 'Sensor',
  firmware: 'Firmware (orden escrita)',
  pc: 'Medido por la PC',
  'manual-historico': 'Histórico manual (dossier)',
  manual: 'Registro manual',
  estimado: 'Estimación',
  simulado: 'SIMULADO',
};

export type Validity = 'valido' | 'desactualizado' | 'sin-sensor' | 'no-disponible' | 'sin-datos';

export const VALIDITY_LABEL: Record<Validity, string> = {
  valido: 'Válido',
  desactualizado: 'Desactualizado',
  'sin-sensor': 'Sin sensor',
  'no-disponible': 'No disponible',
  'sin-datos': 'Sin datos',
};

export interface SignalDef {
  id: string;
  label: string;
  unit: string;
  /** Hay un sensor/medio real que entregue la señal al sistema. */
  disponible: boolean;
  nota: string;
}

/** Señales físicas previstas. Ninguna tiene sensor integrado confirmado. */
export const PHYSICAL_SIGNALS: SignalDef[] = [
  { id: 'bateria_v', label: 'Tensión batería (LiPo 3S)', unit: 'V', disponible: false, nota: 'Pendiente de medir bajo carga. Sin porcentaje ni autonomía.' },
  { id: 'banco_v', label: 'Tensión banco servos (V+)', unit: 'V', disponible: false, nota: 'Sólo lecturas manuales históricas (~7 V).' },
  { id: 'corriente_total_a', label: 'Corriente total banco', unit: 'A', disponible: false, nota: 'Sin sensor integrado. Ver historial manual.' },
  { id: 'corriente_servo_a', label: 'Corriente por servo', unit: 'A', disponible: false, nota: 'No hay sensores por rama. No se divide la corriente total.' },
  { id: 'temp_c', label: 'Temperaturas (regulador / servos)', unit: '°C', disponible: false, nota: 'No documentadas cuantitativamente.' },
  { id: 'imu', label: 'Inclinación / contacto / equilibrio', unit: '—', disponible: false, nota: 'No hay IMU ni sensores de contacto.' },
  { id: 'angulo', label: 'Ángulo físico de articulaciones', unit: '°', disponible: false, nota: 'Servos de 3 hilos sin feedback: sólo ángulo ESTIMADO visual.' },
];

export interface HistoricMeasurement {
  id: string;
  fecha: string;
  magnitud: 'tension' | 'corriente';
  valor: string;
  unidad: string;
  condicion: string;
  montaje: 'suspendido' | 'carga parcial' | 'desconocido';
  instrumento: string;
  nota: string;
}

/** Mediciones históricas del dossier, con sus condiciones. NO son telemetría en vivo. */
export const DOSSIER_MEASUREMENTS: HistoricMeasurement[] = [
  { id: 'h1', fecha: '2026-10-26', magnitud: 'tension', valor: '7,06', unidad: 'V', condicion: '2 servos saludando, reposo', montaje: 'suspendido', instrumento: 'Multímetro', nota: 'En movimiento 7,02–7,06 V.' },
  { id: 'h2', fecha: '2026-11-03', magnitud: 'tension', valor: '7,1–7,5', unidad: 'V', condicion: '3 servos (pata 1)', montaje: 'suspendido', instrumento: 'Multímetro', nota: 'La cifra 7,7 V fue corregida y se descarta.' },
  { id: 'h3', fecha: '2026-11-03', magnitud: 'corriente', valor: '0,15', unidad: 'A', condicion: 'Mueve canal 0', montaje: 'suspendido', instrumento: 'Multímetro en serie OUT+ → V+', nota: 'Mide el banco completo.' },
  { id: 'h4', fecha: '2026-11-03', magnitud: 'corriente', valor: '0,08', unidad: 'A', condicion: 'Mueve canal 1', montaje: 'suspendido', instrumento: 'Multímetro en serie OUT+ → V+', nota: '0,80 A fue un error de lectura corregido.' },
  { id: 'h5', fecha: '2026-11-03', magnitud: 'corriente', valor: '0,13', unidad: 'A', condicion: 'Mueve canal 2', montaje: 'suspendido', instrumento: 'Multímetro en serie OUT+ → V+', nota: '' },
  { id: 'h6', fecha: '2026-11-03', magnitud: 'corriente', valor: '0,23', unidad: 'A', condicion: 'Canales 0,1,2 juntos', montaje: 'suspendido', instrumento: 'Multímetro en serie OUT+ → V+', nota: '' },
  { id: 'h7', fecha: '2026-11-03', magnitud: 'corriente', valor: '~0,20', unidad: 'A', condicion: '6 servos, reposo', montaje: 'suspendido', instrumento: 'Multímetro en serie', nota: '' },
  { id: 'h8', fecha: '2026-11-03', magnitud: 'corriente', valor: '~0,41', unidad: 'A', condicion: '6 servos, caminata fluida (máximo visible)', montaje: 'suspendido', instrumento: 'Multímetro en serie', nota: 'Lectura visible, no pico verdadero.' },
  { id: 'h9', fecha: '2026-11-03', magnitud: 'tension', valor: '7,02', unidad: 'V', condicion: '6 servos, caminata fluida', montaje: 'suspendido', instrumento: 'Multímetro', nota: '' },
  { id: 'h10', fecha: '2026-11-03', magnitud: 'corriente', valor: '≥ 1', unidad: 'A', condicion: 'Accionando canal 1 intentando levantar el robot apoyado en la mesa', montaje: 'carga parcial', instrumento: 'Medidor en serie (montaje histórico)', nota: 'Probablemente mide el banco completo; no es corriente aislada del servo ni pico. Tensión se mantuvo.' },
];

export interface Sample {
  t: number;
  v: number | null;
}

export function validityFor(lastAt: number | null, now: number, expectedPeriodMs: number): Validity {
  if (lastAt === null) return 'sin-datos';
  return now - lastAt > expectedPeriodMs * 3 ? 'desactualizado' : 'valido';
}
