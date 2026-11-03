// Acceso a sketches con rutas validadas.
//  - mis-sketches: sketches/<Nombre>/<Nombre>.ino (lectura/escritura)
//  - firmware:     firmware/DogBotDashboard (solo lectura desde la interfaz)
//  - originales:   DOGBOT_CLAUDE_CODE/originales/*.ino (solo lectura)

import fs from 'node:fs';
import path from 'node:path';
import { SketchEntry, SketchSource, isValidSketchName } from '../../shared/serviceApi';
import { AppPaths, safeJoin } from './paths';

export const ORIGINAL_FICHAS: Record<string, string> = {
  CAMINATA_FLUIDA_PROBADA:
    'REPORTADO PROBADO sólo suspendido. ¡ATENCIÓN! Su setup() centra los servos uno por uno y ejecuta 3 ciclos AUTOMÁTICAMENTE al arrancar o reiniciar (abrir el puerto reinicia el UNO). Sin parser: "x" no lo detiene. No usar como firmware del dashboard.',
  CAMINATA_2_0_EXPERIMENTAL:
    'EXPERIMENTAL, no probado. Centra al arrancar; "x" congela la consigna (no desenergiza); "+/-" pueden provocar postura incluso detenido; intensidad 30–100 % (arranca al 70 %). Límites provisionales no validados.',
  CALIBRACION_6_SERVOS:
    'Herramienta de calibración (9600 baudios). Desactiva señal al inicio; "c" ordena 1500 µs (posible salto). Los límites l/n/u se guardan en RAM pero NO limitan movimientos. Movimientos bloqueantes: "x" puede tardar ~4 s en atenderse.',
};

export const FIRMWARE_FICHA =
  'Firmware NUEVO del dashboard (protocolo DOGBOT v1, 115200 baudios). Compilado sólo en software; PENDIENTE DE VALIDACIÓN FÍSICA. Arranca sin mover nada.';

export class SketchStore {
  constructor(private p: AppPaths) {}

  list(): SketchEntry[] {
    const out: SketchEntry[] = [];
    if (fs.existsSync(this.p.mySketches)) {
      for (const d of fs.readdirSync(this.p.mySketches, { withFileTypes: true })) {
        if (!d.isDirectory() || !isValidSketchName(d.name)) continue;
        if (fs.existsSync(path.join(this.p.mySketches, d.name, `${d.name}.ino`))) {
          out.push({ source: 'mis-sketches', name: d.name, readOnly: false, displayPath: `sketches/${d.name}/${d.name}.ino`, ficha: null });
        }
      }
    }
    if (fs.existsSync(path.join(this.p.firmware, 'DogBotDashboard', 'DogBotDashboard.ino'))) {
      out.push({
        source: 'firmware',
        name: 'DogBotDashboard',
        readOnly: true,
        displayPath: 'firmware/DogBotDashboard/DogBotDashboard.ino',
        ficha: FIRMWARE_FICHA,
      });
    }
    if (fs.existsSync(this.p.originals)) {
      for (const f of fs.readdirSync(this.p.originals)) {
        if (!f.endsWith('.ino')) continue;
        const name = f.slice(0, -4);
        if (!isValidSketchName(name)) continue;
        out.push({ source: 'originales', name, readOnly: true, displayPath: `DOGBOT_CLAUDE_CODE/originales/${f}`, ficha: ORIGINAL_FICHAS[name] ?? 'Original histórico (solo lectura).' });
      }
    }
    return out;
  }

  private filePath(source: SketchSource, name: string): string {
    if (!isValidSketchName(name)) throw new Error('Nombre de sketch inválido');
    switch (source) {
      case 'mis-sketches':
        return safeJoin(this.p.mySketches, name, `${name}.ino`);
      case 'firmware':
        if (name !== 'DogBotDashboard') throw new Error('Firmware desconocido');
        return safeJoin(this.p.firmware, name, `${name}.ino`);
      case 'originales':
        return safeJoin(this.p.originals, `${name}.ino`);
      default:
        throw new Error('Origen desconocido');
    }
  }

  read(source: SketchSource, name: string): string {
    const f = this.filePath(source, name);
    if (!fs.existsSync(f)) throw new Error('No existe: ' + name);
    return fs.readFileSync(f, 'utf8');
  }

  /** Solo "mis-sketches" admite escritura. Los originales nunca se modifican. */
  save(name: string, content: string, overwrite: boolean): string {
    if (typeof content !== 'string' || content.length > 400_000) throw new Error('Contenido inválido o demasiado grande');
    const f = this.filePath('mis-sketches', name);
    if (fs.existsSync(f) && !overwrite) throw new Error(`Ya existe un sketch llamado ${name}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, f);
    return `sketches/${name}/${name}.ino`;
  }
}
