// FIRMWARE SIMULADO (sólo para pruebas de software del cliente de protocolo).
// Reproduce la semántica de DogBotDashboard.ino de forma simplificada.
// No representa hardware; los movimientos se consideran instantáneos.

export class FakeFirmware {
  out: (line: string) => void = () => undefined;
  received: { line: string; priority: boolean }[] = [];
  proto = 1;
  boot = 'A1B2';
  armed = false;
  silent = false;
  lim = new Map<number, [number, number, number]>();
  enabled = new Set<number>();
  cur = new Map<number, number>();

  reply(line: string) {
    queueMicrotask(() => this.out(line));
  }

  reboot(newBoot = 'C3D4') {
    this.boot = newBoot;
    this.armed = false;
    this.lim.clear();
    this.enabled.clear();
    this.cur.clear();
    this.reply(`BOOT DOGBOT proto=${this.proto} fw=0.1.0 boot=${this.boot}`);
  }

  receive(line: string, priority: boolean) {
    this.received.push({ line, priority });
    if (this.silent) return;
    const t = line.split(' ');
    const id = t[0];
    const cmd = t[1];
    const n = (i: number) => Number(t[i]);
    switch (cmd) {
      case 'HELLO':
        return this.reply(`OK ${id} HELLO dev=DOGBOT proto=${this.proto} fw=0.1.0 boot=${this.boot} ses=${t[2] ?? 0} ch=12 calstep=50 fr=1100`);
      case 'LIMIT': {
        const [c, a, b, d] = [n(2), n(3), n(4), n(5)];
        if (c > 11) return this.reply(`ER ${id} CHANNEL canal`);
        if (!(a < b && b < d)) return this.reply(`ER ${id} ORDER min<ref<max`);
        this.lim.set(c, [a, b, d]);
        return this.reply(`OK ${id} LIMIT ch=${c}`);
      }
      case 'ARM':
        this.armed = true;
        return this.reply(`OK ${id} ARM`);
      case 'DISARM':
        this.armed = false;
        this.enabled.clear();
        return this.reply(`OK ${id} DISARM`);
      case 'ENABLE': {
        const c = n(2);
        const us = n(3);
        if (!this.armed) return this.reply(`ER ${id} STATE desarmado`);
        const l = this.lim.get(c);
        if (!l) return this.reply(`ER ${id} NOLIMIT sin limites`);
        if (us < l[0] || us > l[2]) return this.reply(`ER ${id} RANGE fuera`);
        this.enabled.add(c);
        this.cur.set(c, us);
        return this.reply(`OK ${id} ENABLE ch=${c} us=${us}`);
      }
      case 'MOVE': {
        if (!this.armed) return this.reply(`ER ${id} STATE desarmado`);
        for (let i = 3; i < t.length; i += 2) {
          const c = n(i);
          const us = n(i + 1);
          if (!this.enabled.has(c)) return this.reply(`ER ${id} DISABLED canal`);
          const l = this.lim.get(c)!;
          if (us < l[0] || us > l[2]) return this.reply(`ER ${id} RANGE fuera de limites`);
        }
        for (let i = 3; i < t.length; i += 2) this.cur.set(n(i), n(i + 1));
        return this.reply(`OK ${id} MOVE n=${(t.length - 3) / 2}`);
      }
      case 'STOP':
        return this.reply(`OK ${id} STOP`);
      case 'PULSES':
        this.reply(`PW 1000 ${[...this.enabled].map((c) => `${c}:${this.cur.get(c)}`).join(' ')}`.trim());
        return this.reply(`OK ${id} PULSES`);
      case 'OFF':
        if (t[2] === 'ALL') this.enabled.clear();
        else this.enabled.delete(n(2));
        return this.reply(`OK ${id} OFF en=0000`);
      case 'HB':
        return this.reply(`OK ${id} HB up=1234`);
      case 'MODE':
      case 'LINK':
      case 'RATE':
      case 'SLEW':
        return this.reply(`OK ${id} ${cmd}`);
      default:
        return this.reply(`ER ${id} UNKNOWN comando`);
    }
  }
}
