// Catálogo de placas controladoras admitidas. Lo comparten la interfaz (selector
// de placa) y el servicio (lista blanca de FQBN, core e instalación).
//
// El firmware DogBotDashboard.ino es el mismo para todas: se adapta con
// #if defined(ESP32) / __AVR__ y habla el mismo protocolo DOGBOT v1.

export type BoardFamily = 'avr' | 'esp32';

export interface CoreDef {
  /** Identificador de plataforma de Arduino CLI. */
  id: string;
  label: string;
  /** Para qué placas hace falta (texto de ayuda). */
  usedBy: string;
  /** Índice adicional de placas; se pasa con --additional-urls al instalar. */
  indexUrl: string | null;
  /** Extensión del binario principal que Arduino CLI deja en --output-dir. */
  binExt: '.hex' | '.bin';
  /** Descarga de cientos de MB: instalación y primera compilación lentas. */
  heavy: boolean;
}

export interface BoardDef {
  fqbn: string;
  label: string;
  /** Nombre corto, igual al campo mcu= que informa el firmware cuando aplica. */
  short: string;
  family: BoardFamily;
  core: string;
}

export const CORES: CoreDef[] = [
  { id: 'arduino:avr', label: 'Arduino AVR', usedBy: 'Arduino UNO, Nano y Mega', indexUrl: null, binExt: '.hex', heavy: false },
  {
    id: 'esp32:esp32',
    label: 'ESP32 (Espressif)',
    usedBy: 'placas ESP32',
    indexUrl: 'https://espressif.github.io/arduino-esp32/package_esp32_index.json',
    binExt: '.bin',
    heavy: true,
  },
];

export const BOARDS: BoardDef[] = [
  { fqbn: 'arduino:avr:uno', label: 'Arduino UNO', short: 'UNO', family: 'avr', core: 'arduino:avr' },
  { fqbn: 'esp32:esp32:esp32', label: 'ESP32 Dev Module (DevKit, WROOM-32)', short: 'ESP32', family: 'esp32', core: 'esp32:esp32' },
  { fqbn: 'arduino:avr:nano', label: 'Arduino Nano (no usado en Dog Bot)', short: 'Nano', family: 'avr', core: 'arduino:avr' },
  { fqbn: 'arduino:avr:mega:cpu=atmega2560', label: 'Arduino Mega 2560 (no usado)', short: 'Mega', family: 'avr', core: 'arduino:avr' },
];

export const DEFAULT_FQBN = BOARDS[0].fqbn;

export function boardByFqbn(fqbn: string): BoardDef | null {
  return BOARDS.find((b) => b.fqbn === fqbn) ?? null;
}

export function coreById(id: string): CoreDef | null {
  return CORES.find((c) => c.id === id) ?? null;
}

export function coreOfBoard(fqbn: string): CoreDef | null {
  const b = boardByFqbn(fqbn);
  return b ? coreById(b.core) : null;
}

/** Familia que corresponde al campo mcu= del firmware (UNO, AVR, ESP32…). */
export function familyOfMcu(mcu: string | null | undefined): BoardFamily | null {
  if (!mcu) return null;
  if (/^ESP32/i.test(mcu)) return 'esp32';
  if (/^(UNO|AVR|NANO|MEGA)/i.test(mcu)) return 'avr';
  return null;
}
