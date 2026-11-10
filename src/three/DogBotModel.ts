// Modelo paramétrico aproximado del Dog Bot (basado en fotografías).
//
// Jerarquía por pata (pivotes reales, no centros de pieza):
//   cuerpo → cadera (eje X, en el horn de la placa extrema)
//          → hombro → superior (eje Z, servo del hombro)
//          → muslo → inferior (eje Z, rodilla) → tramo inferior / pie
//
// Convención anatómica de ángulos (grados, ESTIMADOS):
//   cadera: + = hacia afuera del cuerpo
//   superior: + = hacia adelante (+X)
//   inferior: + = flexión (el tramo inferior gira hacia adelante)

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { JointId, JointKind, LEGS, LegId } from '../../shared/joints';
import { ModelParams } from './modelParams';

export const S = 0.01; // 1 unidad de escena = 100 mm

/** Desplazamiento lateral (mm) del plano medio de la pata respecto al pivote del servo superior. */
export const LEG_MID = 4;
/** Cuerpo del servo de rodilla (mm): ancho × alto a lo largo del muslo × grosor sobre el eje. */
export const KNEE_SERVO = { w: 40, h: 40, d: 22 } as const;

export const COLORS = {
  body: 0xf07a1c,
  bodyDark: 0xc95f12,
  red: 0xe23a34,
  redDark: 0xb82c28,
  green: 0x4fcf55,
  servo: 0x16171b,
  servoLabel: 0x8b8f99,
  metal: 0xc7ccd4,
  screw: 0x9aa0aa,
  rubber: 0x26272c,
  pcb: 0x1e5aa8,
  pcbGreen: 0x1f6f4a,
  wire: [0xe23a34, 0x2b2d33, 0xf0c419, 0x3a7bd5, 0xf2f3f5],
};

export interface LegRig {
  leg: LegId;
  side: 1 | -1;
  front: boolean;
  hip: THREE.Group;
  upper: THREE.Group;
  knee: THREE.Group;
  /** Cuerpo del servo de rodilla (fijo al muslo, centrado en el eje de la rodilla). */
  kneeServo: THREE.Object3D;
  foot: THREE.Object3D;
  label: THREE.Object3D;
}

export interface JointPickInfo {
  joint: JointId;
}

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...opts });
}

function rbox(w: number, h: number, d: number, r: number, color: number | THREE.Material) {
  const g = new RoundedBoxGeometry(w * S, h * S, d * S, 3, Math.min(r, w / 2, h / 2, d / 2) * S);
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r: number, h: number, color: number | THREE.Material, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * S, r * S, h * S, seg), color instanceof THREE.Material ? color : mat(color));
  m.castShadow = true;
  return m;
}

/** Horn de servo en estrella de 6 brazos (como en la foto de la placa extrema). */
function starHorn(radius: number, thickness: number) {
  const shape = new THREE.Shape();
  const arms = 6;
  const inner = radius * 0.34;
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * Math.PI * 2;
    const a1 = a0 + Math.PI / arms;
    const tipW = 0.2;
    const p = (a: number, r: number) => new THREE.Vector2(Math.cos(a) * r * S, Math.sin(a) * r * S);
    const v0 = p(a0 - tipW, radius * 0.92);
    const v1 = p(a0 + tipW, radius * 0.92);
    const vi = p(a1, inner);
    if (i === 0) shape.moveTo(v0.x, v0.y);
    else shape.lineTo(v0.x, v0.y);
    shape.quadraticCurveTo(Math.cos(a0) * radius * 1.08 * S, Math.sin(a0) * radius * 1.08 * S, v1.x, v1.y);
    shape.lineTo(vi.x, vi.y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness * S, bevelEnabled: false });
  const m = new THREE.Mesh(g, mat(0x111214, { roughness: 0.45 }));
  m.castShadow = true;
  const screw = cyl(radius * 0.18, thickness * 1.6, mat(COLORS.metal, { metalness: 0.8, roughness: 0.3 }), 16);
  screw.rotation.x = Math.PI / 2;
  screw.position.z = thickness * 0.8 * S;
  const grp = new THREE.Group();
  grp.add(m, screw);
  return grp;
}

/** Placa extrema roja con ventana cuadrada (vista frontal de la foto). */
function endPlate(w: number, h: number, t: number) {
  const r = h * 0.32;
  const shape = new THREE.Shape();
  const W = (w / 2) * S;
  const H = (h / 2) * S;
  const R = r * S;
  shape.moveTo(-W + R, -H);
  shape.lineTo(W - R, -H);
  shape.quadraticCurveTo(W, -H, W, -H + R);
  shape.lineTo(W, H - R);
  shape.quadraticCurveTo(W, H, W - R, H);
  shape.lineTo(-W + R, H);
  shape.quadraticCurveTo(-W, H, -W, H - R);
  shape.lineTo(-W, -H + R);
  shape.quadraticCurveTo(-W, -H, -W + R, -H);
  const hole = new THREE.Path();
  const hw = w * 0.17 * S;
  const hh = h * 0.27 * S;
  const hr = 6 * S;
  hole.moveTo(-hw + hr, -hh);
  hole.lineTo(hw - hr, -hh);
  hole.quadraticCurveTo(hw, -hh, hw, -hh + hr);
  hole.lineTo(hw, hh - hr);
  hole.quadraticCurveTo(hw, hh, hw - hr, hh);
  hole.lineTo(-hw + hr, hh);
  hole.quadraticCurveTo(-hw, hh, -hw, hh - hr);
  hole.lineTo(-hw, -hh + hr);
  hole.quadraticCurveTo(-hw, -hh, -hw + hr, -hh);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: t * S, bevelEnabled: true, bevelSize: 1.2 * S, bevelThickness: 1.2 * S, bevelSegments: 2 });
  const m = new THREE.Mesh(g, mat(COLORS.red));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Tramo inferior curvo ("garra") con calado triangular y pie en gancho. */
function shinMesh(L: number, thickness: number, material: THREE.Material) {
  const s = (x: number, y: number) => new THREE.Vector2(x * S, y * S);
  const shape = new THREE.Shape();
  const w0 = 17; // semiancho en la rodilla
  // Contorno: rodilla (y=0) hacia abajo (y=-L) con curvatura hacia +X (adelante).
  shape.moveTo(s(-w0, 6).x, s(-w0, 6).y);
  shape.quadraticCurveTo(-w0 * S, 22 * S, 0, 22 * S);
  shape.quadraticCurveTo(w0 * S, 22 * S, w0 * S, 6 * S);
  shape.bezierCurveTo(16 * S, -L * 0.35 * S, 24 * S, -L * 0.7 * S, 20 * S, -L * 0.92 * S);
  shape.quadraticCurveTo(18 * S, -(L + 10) * S, 6 * S, -(L + 8) * S);
  shape.quadraticCurveTo(-6 * S, -(L + 6) * S, -8 * S, -(L - 6) * S);
  shape.bezierCurveTo(-4 * S, -L * 0.72 * S, -14 * S, -L * 0.35 * S, -w0 * S, 6 * S);
  const hole = new THREE.Path();
  hole.moveTo(2 * S, -L * 0.58 * S);
  hole.lineTo(11 * S, -L * 0.82 * S);
  hole.lineTo(-1 * S, -L * 0.8 * S);
  hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness * S, bevelEnabled: true, bevelSize: 2 * S, bevelThickness: 2 * S, bevelSegments: 3, curveSegments: 18 });
  g.translate(0, 0, (-thickness / 2) * S);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Servo DC5535 representativo: carcasa negra con etiqueta gris. */
function servoBlock(w: number, h: number, d: number) {
  const grp = new THREE.Group();
  const body = rbox(w, h, d, 2.5, mat(COLORS.servo, { roughness: 0.5 }));
  const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7 * S, h * 0.42 * S), mat(COLORS.servoLabel, { roughness: 0.8 }));
  label.position.z = (d / 2 + 0.3) * S;
  grp.add(body, label);
  // tornillos de las orejetas
  for (const sx of [-1, 1]) {
    const scr = cyl(2.2, 2, mat(COLORS.screw, { metalness: 0.7, roughness: 0.35 }), 10);
    scr.rotation.x = Math.PI / 2;
    scr.position.set(sx * (w / 2 - 4) * S, (h / 2 + 3) * S, (d / 2) * S);
    grp.add(scr);
  }
  return grp;
}

function bearing(r: number) {
  const grp = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78 * S, r * 0.26 * S, 12, 32), mat(COLORS.metal, { metalness: 0.85, roughness: 0.25 }));
  const inner = cyl(r * 0.5, 3, mat(0x2a2c31, { metalness: 0.4 }), 20);
  inner.rotation.x = Math.PI / 2;
  grp.add(outer, inner);
  return grp;
}

function tagJoint(obj: THREE.Object3D, joint: JointId) {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).userData.joint = joint;
  });
}

export interface BuildOptions {
  ghost?: boolean;
}

export class DogBotModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly cover = new THREE.Group();
  readonly legs = new Map<LegId, LegRig>();
  readonly jointMeshes = new Map<JointId, THREE.Mesh[]>();
  readonly pivots = new Map<JointId, { obj: THREE.Object3D; axis: 'x' | 'z' }>();
  private materialsByJoint = new Map<JointId, THREE.MeshStandardMaterial[]>();
  readonly standHeight: number;

  constructor(
    readonly p: ModelParams,
    readonly opts: BuildOptions = {},
  ) {
    this.root.add(this.body);
    this.buildBody();
    for (const leg of LEGS) this.buildLeg(leg);
    // Altura aproximada de pie en la pose de referencia (muslo -30°, rodilla +60°).
    const t = (-30 * Math.PI) / 180;
    const k = (30 * Math.PI) / 180;
    this.standHeight = (p.thighLength * Math.cos(t) + (p.shinLength + 8) * Math.cos(k)) * S;
    this.body.position.y = 0;
    if (opts.ghost) this.applyGhost();
  }

  private buildBody() {
    const { bodyLength: L, bodyWidth: W, bodyHeight: H } = this.p;
    const trayL = L * 0.66;
    const wall = 5;
    // Bandeja naranja abierta (estructura visible en fotos)
    const bottom = rbox(trayL, wall, W - 6, 2, COLORS.body);
    bottom.position.y = (-H / 2 + wall / 2) * S;
    this.body.add(bottom);
    for (const sz of [-1, 1]) {
      const side = rbox(trayL, H * 0.82, wall, 2, COLORS.body);
      side.position.set(0, (-H / 2 + (H * 0.82) / 2) * S, sz * (W / 2 - wall / 2) * S);
      this.body.add(side);
      // tornillos laterales de la bandeja
      for (const sx of [-1, 1]) {
        const scr = cyl(1.8, 2, mat(COLORS.screw, { metalness: 0.7 }), 8);
        scr.rotation.x = Math.PI / 2;
        scr.position.set(sx * (trayL / 2 - 10) * S, (H * 0.2) * S, sz * (W / 2 + 0.5) * S);
        this.body.add(scr);
      }
    }
    // Electrónica visible: PCA9685 (azul), Arduino UNO, regulador, borneras y cables
    const pca = rbox(62, 3, 25, 1, COLORS.pcb);
    pca.position.set(-20 * S, (-H / 2 + 9) * S, 8 * S);
    const uno = rbox(68, 3, 53, 1, 0x1b4f8f);
    uno.position.set(45 * S, (-H / 2 + 9) * S, -14 * S);
    const reg = rbox(43, 12, 21, 1, 0x2b6cb8);
    reg.position.set(-60 * S, (-H / 2 + 13) * S, -22 * S);
    const term = rbox(36, 10, 12, 1, 0xf2f3f5);
    term.position.set(5 * S, (-H / 2 + 12) * S, 26 * S);
    this.body.add(pca, uno, reg, term);
    const wires = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = new THREE.Vector3((-90 + i * 22) * S, (-H / 2 + 12) * S, (((i * 37) % 60) - 30) * S);
      const b = new THREE.Vector3((-70 + ((i * 53) % 140)) * S, (H / 2 + 8 + (i % 3) * 6) * S, (((i * 19) % 50) - 25) * S);
      const c = new THREE.Vector3((60 - i * 15) * S, (-H / 2 + 10) * S, (((i * 41) % 50) - 25) * S);
      const curve = new THREE.CatmullRomCurve3([a, b, c]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.1 * S, 6), mat(COLORS.wire[i % COLORS.wire.length], { roughness: 0.5 }));
      wires.add(tube);
    }
    this.body.add(wires);
    // Soportes verdes y placas rojas en ambos extremos
    for (const sx of [-1, 1]) {
      const bracketL = (L - trayL) / 2 + 6;
      const xc = sx * (trayL / 2 + bracketL / 2 - 3);
      const green = rbox(bracketL, H * 0.9, W - 4, 5, COLORS.green);
      green.position.set(xc * S, (-H / 2 + (H * 0.9) / 2) * S, 0);
      this.body.add(green);
      const gTop = rbox(bracketL * 0.7, 6, W * 0.45, 2, COLORS.green);
      gTop.position.set(xc * S, (H * 0.45 + 3) * S, 0);
      this.body.add(gTop);
      const plate = endPlate(W * 1.08, H * 1.02, 8);
      plate.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      plate.position.set(sx * (L / 2 - 4) * S, 0, 0);
      this.body.add(plate);
      for (const sz of [-1, 1]) {
        const scr = cyl(2.2, 3, mat(COLORS.metal, { metalness: 0.8, roughness: 0.3 }), 10);
        scr.rotation.z = Math.PI / 2;
        scr.position.set(sx * (L / 2 + 5) * S, (H * 0.4) * S, sz * 16 * S);
        this.body.add(scr);
      }
    }
    // Cubierta superior curva (opcional, para inspección)
    const coverShape = new THREE.Shape();
    const cw = (W / 2) * S;
    coverShape.moveTo(-cw, 0);
    coverShape.lineTo(-cw, 8 * S);
    coverShape.quadraticCurveTo(-cw, 30 * S, 0, 30 * S);
    coverShape.quadraticCurveTo(cw, 30 * S, cw, 8 * S);
    coverShape.lineTo(cw, 0);
    coverShape.lineTo(cw - 4 * S, 0);
    coverShape.lineTo(cw - 4 * S, 8 * S);
    coverShape.quadraticCurveTo(cw - 4 * S, 26 * S, 0, 26 * S);
    coverShape.quadraticCurveTo(-cw + 4 * S, 26 * S, -cw + 4 * S, 8 * S);
    coverShape.lineTo(-cw + 4 * S, 0);
    coverShape.closePath();
    const cg = new THREE.ExtrudeGeometry(coverShape, { depth: trayL * S, bevelEnabled: false, curveSegments: 20 });
    cg.translate(0, 0, (-trayL / 2) * S);
    const cover = new THREE.Mesh(cg, mat(COLORS.body, { roughness: 0.55 }));
    cover.rotation.y = Math.PI / 2;
    cover.position.y = (H / 2 - 4) * S;
    cover.castShadow = true;
    // ranuras del techo (como en la foto de feria)
    for (let i = -2; i <= 2; i++) {
      const groove = rbox(trayL * 0.95, 1.2, 1.6, 0.5, COLORS.bodyDark);
      groove.position.set(0, (H / 2 + 24.6 - Math.abs(i) * 1.8) * S, i * 9 * S);
      this.cover.add(groove);
    }
    this.cover.add(cover);
    this.body.add(this.cover);
  }

  private buildLeg(leg: LegId) {
    const p = this.p;
    const front = leg === 'D1' || leg === 'D2';
    // Convención visual: D1/P1 en z negativo, D2/P2 en z positivo (lado físico NO confirmado).
    const side: 1 | -1 = leg === 'D1' || leg === 'P1' ? -1 : 1;
    const sx = front ? 1 : -1;
    const redMat = mat(COLORS.red);
    const hip = new THREE.Group();
    hip.position.set(sx * (p.bodyLength / 2 + 4) * S, 4 * S, side * p.hipInset * S);
    this.body.add(hip);
    // Horn de cadera sobre la placa extrema (eje X)
    const hornHip = starHorn(17, 2.5);
    hornHip.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    hornHip.position.x = sx * 5 * S;
    hip.add(hornHip);
    // Hombro: carcasa roja que sale hacia afuera hasta el servo superior
    const shoulder = new THREE.Group();
    hip.add(shoulder);
    const out = p.shoulderOut - p.hipInset;
    const housing = rbox(46, 58, out + 6, 9, redMat);
    housing.position.set(-sx * 22 * S, -6 * S, side * (out / 2) * S);
    shoulder.add(housing);
    const cap = rbox(30, 44, 10, 6, mat(COLORS.body));
    cap.position.set(-sx * 22 * S, -6 * S, side * 6 * S);
    shoulder.add(cap);
    const upperServo = servoBlock(40, 40, 20);
    upperServo.rotation.y = side > 0 ? 0 : Math.PI;
    upperServo.position.set(-sx * 22 * S, -4 * S, side * (out - 4) * S);
    shoulder.add(upperServo);
    tagJoint(shoulder, `${leg}-cadera`);
    tagJoint(hornHip, `${leg}-cadera`);
    // Pivote del servo superior (eje Z)
    const upper = new THREE.Group();
    upper.position.set(-sx * 22 * S, -4 * S, side * (out + 12) * S);
    hip.add(upper);
    const thigh = new THREE.Group();
    upper.add(thigh);
    // Plano medio de la pata: el muslo, el servo de rodilla, el tramo inferior y el pie
    // comparten este desplazamiento lateral, de modo que la rodilla queda centrada.
    const zc = side * LEG_MID;
    // La carcasa del muslo termina sobre el servo de rodilla, que queda a la vista en el
    // extremo inferior (como en el robot real), en vez de cubrirlo.
    const thighTop = 17;
    const thighBottom = -p.thighLength + KNEE_SERVO.h / 2 - 6;
    const thighMesh = rbox(42, thighTop - thighBottom, 30, 10, redMat);
    thighMesh.position.set(0, ((thighTop + thighBottom) / 2) * S, zc * S);
    thigh.add(thighMesh);
    const hornUp = starHorn(15, 2.4);
    hornUp.rotation.y = side > 0 ? 0 : Math.PI;
    hornUp.position.z = side * 20 * S;
    thigh.add(hornUp);
    // Cable en espiral negro por el muslo
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-sx * 6 * S, 30 * S, -side * 10 * S),
      new THREE.Vector3(-14 * S, -p.thighLength * 0.3 * S, side * 18 * S),
      new THREE.Vector3(-18 * S, -p.thighLength * 0.75 * S, side * 16 * S),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 20, 3 * S, 8), mat(0x0e0f12, { roughness: 0.4 }));
    thigh.add(cable);
    // Servo de rodilla (DC5535): cuerpo fijo al muslo, CENTRADO en el eje de la rodilla
    // (x = 0, sobre el pivote) y en el plano medio de la pata. Antes quedaba desplazado
    // hacia adelante y hacia la cara interior del muslo.
    const kneeServo = servoBlock(KNEE_SERVO.w, KNEE_SERVO.h, KNEE_SERVO.d);
    kneeServo.rotation.y = side > 0 ? 0 : Math.PI; // etiqueta hacia la cara exterior
    kneeServo.position.set(0, -p.thighLength * S, zc * S);
    thigh.add(kneeServo);
    tagJoint(thigh, `${leg}-superior`);
    tagJoint(kneeServo, `${leg}-inferior`);
    const knee = new THREE.Group();
    knee.position.set(0, -p.thighLength * S, 0);
    thigh.add(knee);
    // Sobre el eje: horn en la cara exterior (gira con el tramo inferior) y rodamiento en la interior.
    const face = KNEE_SERVO.d / 2;
    const hornKnee = starHorn(12, 2.4);
    hornKnee.rotation.y = side > 0 ? 0 : Math.PI;
    hornKnee.position.z = (zc + side * (face + 0.6)) * S;
    knee.add(hornKnee);
    const brg = bearing(9);
    brg.position.z = (zc - side * (face + 1)) * S;
    knee.add(brg);
    const shin = shinMesh(p.shinLength, 16, redMat);
    shin.position.z = zc * S;
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(7 * S, 16, 12), mat(COLORS.rubber, { roughness: 0.9 }));
    foot.position.set(8 * S, -(p.shinLength + 2) * S, zc * S);
    foot.castShadow = true;
    knee.add(foot);
    tagJoint(knee, `${leg}-inferior`);
    const label = new THREE.Object3D();
    // Las etiquetas de un lado van más altas para que no se tapen con las del otro en vistas bajas.
    label.position.set(-sx * 22 * S, (side < 0 ? 88 : 52) * S, side * (out + 14) * S);
    hip.add(label);
    this.legs.set(leg, { leg, side, front, hip, upper, knee, kneeServo, foot, label });
    this.pivots.set(`${leg}-cadera`, { obj: hip, axis: 'x' });
    this.pivots.set(`${leg}-superior`, { obj: upper, axis: 'z' });
    this.pivots.set(`${leg}-inferior`, { obj: knee, axis: 'z' });
    // Índices de mallas por articulación (para selección / resaltado)
    this.root.updateMatrixWorld(true);
  }

  /** Recoge las mallas etiquetadas y clona materiales por articulación para resaltar. */
  indexMeshes() {
    this.jointMeshes.clear();
    this.materialsByJoint.clear();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.userData.joint) return;
      const j = m.userData.joint as JointId;
      if (!this.opts.ghost) {
        m.material = (m.material as THREE.MeshStandardMaterial).clone();
        const list = this.materialsByJoint.get(j) ?? [];
        list.push(m.material as THREE.MeshStandardMaterial);
        this.materialsByJoint.set(j, list);
      }
      const arr = this.jointMeshes.get(j) ?? [];
      arr.push(m);
      this.jointMeshes.set(j, arr);
    });
  }

  private applyGhost() {
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffb15c, transparent: true, opacity: 0.18, depthWrite: false });
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = ghostMat;
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    this.body.visible = true;
    // Sólo patas visibles en el fantasma (el cuerpo no cambia)
    for (const c of this.body.children) {
      if (![...this.legs.values()].some((l) => l.hip === c)) c.visible = false;
    }
  }

  /** Aplica ángulos ESTIMADOS (grados, convención anatómica). */
  setJointAngle(joint: JointId, deg: number) {
    const [legStr, kind] = joint.split('-') as [LegId, JointKind];
    const rig = this.legs.get(legStr);
    if (!rig) return;
    const rad = (deg * Math.PI) / 180;
    if (kind === 'cadera') rig.hip.rotation.x = -rig.side * rad;
    else if (kind === 'superior') rig.upper.rotation.z = rad;
    else rig.knee.rotation.z = rad;
  }

  /** Resalta: 'sel' (seleccionada), 'hover', 'warn' (sin pose conocida) o ninguno. */
  setHighlight(joint: JointId, mode: 'sel' | 'hover' | 'none' | 'unknown') {
    const mats = this.materialsByJoint.get(joint);
    if (!mats) return;
    for (const m of mats) {
      if (mode === 'sel') {
        m.emissive.setHex(0xffb15c);
        m.emissiveIntensity = 0.42;
      } else if (mode === 'hover') {
        m.emissive.setHex(0xff7a1a);
        m.emissiveIntensity = 0.22;
      } else if (mode === 'unknown') {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
      const tr = mode === 'unknown';
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.depthWrite = !tr;
        m.needsUpdate = true;
      }
      m.opacity = tr ? 0.38 : 1;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mm = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm.dispose();
      }
    });
  }
}
