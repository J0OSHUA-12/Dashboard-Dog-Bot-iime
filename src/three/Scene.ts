// Escena 3D: renderizador, cámara orbital, vistas, entorno marciano, selección y etiquetas.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ALL_JOINTS, JointId, LEG_LABEL, LEGS, LegId, jointKind } from '../../shared/joints';
import { estimatedAngleDeg, getJoint } from '../../shared/profile';
import { idleWalkActive, idleWalkPose } from '../services/idleWalk';
import { SceneKind, realDisplayUs, useApp } from '../state/store';
import { DogBotModel, S } from './DogBotModel';
import { SceneEnvironment } from './CalibrationOverlay';
import { HangarEnvironment } from './HangarEnvironment';
import { EnvTheme, MarsEnvironment } from './MarsEnvironment';
import { ModelParams } from './modelParams';

export type ViewName = 'iso' | 'frontal' | 'lateral' | 'superior';

/** Márgenes (px) que ocupan los paneles flotantes: el robot se centra en el área libre. */
export interface SceneInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Orientación de la cámara para el dial: azimut y elevación en radianes, distancia en u. */
export interface CameraPose {
  azimuth: number;
  polar: number;
  distance: number;
}

export class DogBotScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private model!: DogBotModel;
  private ghost!: DogBotModel;
  private env!: SceneEnvironment;
  private sceneKind: SceneKind | null = null;
  /** Mezcla 0–1 hacia la caminata de reposo y su reloj (ms). */
  private idleK = 0;
  private idleT = 0;
  private axes: THREE.AxesHelper;
  private ring: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt: { x: number; y: number } | null = null;
  private displayed = new Map<JointId, number>();
  private legLabels = new Map<LegId, HTMLDivElement>();
  private frame = 0;
  private lastLabelUpdate = 0;
  private resizeObs: ResizeObserver;
  private disposed = false;
  private params: ModelParams;
  private target = new THREE.Vector3(0, 1.45, 0);
  private userMoved = false;
  private lastView: ViewName = 'iso';
  private theme: EnvTheme = 'dark';
  private insets: SceneInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  private shift = new THREE.Vector2();
  private size = new THREE.Vector2(1, 1);
  private lastFrame = performance.now();
  private viewAnim = 0;
  private footPos = new THREE.Vector3();
  /** Aviso por fotograma con la orientación de la cámara (para el dial de la interfaz). */
  onCamera: ((pose: CameraPose) => void) | null = null;

  constructor(
    private host: HTMLElement,
    params: ModelParams,
  ) {
    this.params = params;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tono neutro: conserva los colores de las piezas (naranja, rojo, verde) bajo la luz cálida.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x120b08, 1);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'viewport-canvas';
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'viewport-labels';
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 4000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.492;
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
      this.viewAnim++;
    });

    // Entorno: terreno marciano, cielo, luz de atardecer y trazos de calibración.
    this.setEnvironment(useApp.getState().ui.scene);
    this.axes = new THREE.AxesHelper(1.6);
    this.axes.position.y = 0.04;
    this.scene.add(this.axes);

    // Anillo de articulación seleccionada
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb15c, transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.ring.renderOrder = 10;
    this.scene.add(this.ring);

    this.buildModel(params);
    this.setView('iso', false);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', () => useApp.getState().hover(null));
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.loop();
  }

  private buildModel(p: ModelParams) {
    if (this.model) {
      this.scene.remove(this.model.root);
      this.scene.remove(this.ghost.root);
      this.model.dispose();
      this.ghost.dispose();
      for (const el of this.legLabels.values()) el.remove();
      this.legLabels.clear();
    }
    this.model = new DogBotModel(p);
    this.model.indexMeshes();
    this.ghost = new DogBotModel(p, { ghost: true });
    this.ghost.indexMeshes();
    this.model.root.position.y = this.model.standHeight;
    this.ghost.root.position.y = this.model.standHeight;
    this.target.set(0, this.model.standHeight * 0.92, 0);
    this.scene.add(this.model.root, this.ghost.root);
    for (const leg of LEGS) {
      const div = document.createElement('div');
      div.className = 'leg-label';
      const obj = new CSS2DObject(div);
      this.model.legs.get(leg)!.label.add(obj);
      this.legLabels.set(leg, div);
    }
    this.displayed.clear();
  }

  setParams(p: ModelParams) {
    if (JSON.stringify(p) === JSON.stringify(this.params)) return;
    this.params = p;
    this.buildModel(p);
  }

  /** Distancia de encuadre: el robot debe caber en el ancho libre entre paneles. */
  private fitDistance(): number {
    const free = Math.max(240, this.size.x - this.insets.left - this.insets.right);
    const aspect = free / Math.max(1, this.size.y);
    return 11.2 * Math.max(1, Math.pow(1.3 / Math.min(1.3, aspect), 0.7));
  }

  setView(v: ViewName, animate = true) {
    this.lastView = v;
    if (animate) this.userMoved = false;
    const d = this.fitDistance();
    const t = this.target;
    // «iso»: tres cuartos con la cámara baja, para que el horizonte y las montañas entren en cuadro.
    const pos =
      v === 'iso'
        ? new THREE.Vector3(d * 0.72, d * 0.15, d * 0.68)
        : v === 'frontal'
          ? new THREE.Vector3(d, 0.35, 0.001)
          : v === 'lateral'
            ? new THREE.Vector3(0.001, 0.35, d)
            : new THREE.Vector3(0.001, d * 1.05, 0.002);
    pos.add(t);
    const anim = ++this.viewAnim;
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(t);
      this.controls.update();
      return;
    }
    const from = this.camera.position.clone();
    const fromT = this.controls.target.clone();
    const start = performance.now();
    const step = () => {
      if (anim !== this.viewAnim || this.disposed) return;
      const k = Math.min(1, (performance.now() - start) / 520);
      const e = 1 - Math.pow(1 - k, 4);
      this.camera.position.lerpVectors(from, pos, e);
      this.controls.target.lerpVectors(fromT, t, e);
      this.controls.update();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  /** Paneles abiertos: desplaza el encuadre al área libre (y reencuadra si el operador no movió la cámara). */
  setInsets(i: SceneInsets) {
    const prev = this.insets;
    if (prev.left === i.left && prev.right === i.right && prev.top === i.top && prev.bottom === i.bottom) return;
    const widthChanged = prev.left !== i.left || prev.right !== i.right;
    this.insets = { ...i };
    if (widthChanged && !this.userMoved) this.setView(this.lastView, true);
  }

  /** Gira la cámara alrededor del robot (radianes). */
  orbit(dAzimuth: number, dPolar: number) {
    this.userMoved = true;
    this.viewAnim++;
    const off = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += dAzimuth;
    sph.phi = Math.min(this.controls.maxPolarAngle, Math.max(0.06, sph.phi + dPolar));
    this.camera.position.copy(this.controls.target).add(off.setFromSpherical(sph));
    this.controls.update();
  }

  /** Acerca (< 1) o aleja (> 1) la cámara. */
  zoom(factor: number) {
    this.userMoved = true;
    this.viewAnim++;
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, off.length() * factor));
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
    this.controls.update();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyShift(true);
    if (!this.userMoved) this.setView(this.lastView, false);
  }

  /** Centra el punto de fuga en el área libre desplazando la ventana de proyección (suavizado). */
  private applyShift(snap = false) {
    const i = this.insets;
    const tx = (i.left - i.right) / 2;
    const ty = (i.top - i.bottom) / 2;
    const k = snap ? 1 : 0.14;
    const nx = this.shift.x + (tx - this.shift.x) * k;
    const ny = this.shift.y + (ty - this.shift.y) * k;
    if (!snap && Math.abs(nx - this.shift.x) < 0.01 && Math.abs(ny - this.shift.y) < 0.01) return;
    this.shift.set(Math.abs(tx - nx) < 0.3 ? tx : nx, Math.abs(ty - ny) < 0.3 ? ty : ny);
    this.camera.setViewOffset(this.size.x, this.size.y, -this.shift.x, -this.shift.y, this.size.x, this.size.y);
  }

  private pick(ev: PointerEvent): JointId | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.model.root, true);
    for (const h of hits) {
      const j = (h.object as THREE.Mesh).userData.joint as JointId | undefined;
      if (j && h.object.visible) return j;
    }
    return null;
  }

  private onMove = (ev: PointerEvent) => {
    const j = this.pick(ev);
    if (j !== useApp.getState().hovered) useApp.getState().hover(j);
    this.renderer.domElement.style.cursor = j ? 'pointer' : 'grab';
  };
  private onDown = (ev: PointerEvent) => {
    this.downAt = { x: ev.clientX, y: ev.clientY };
  };
  private onUp = (ev: PointerEvent) => {
    if (!this.downAt) return;
    const moved = Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > 5) return;
    const j = this.pick(ev);
    if (j) useApp.getState().select(j);
  };

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.updateFromState(dt);
    this.applyShift();
    this.controls.update();
    // La cámara nunca queda bajo el relieve.
    const cam = this.camera.position;
    const floor = this.env.heightAt(cam.x, cam.z) + 0.3;
    if (cam.y < floor) cam.y = floor;
    this.env.update(dt);
    if (this.onCamera) {
      this.onCamera({ azimuth: this.controls.getAzimuthalAngle(), polar: this.controls.getPolarAngle(), distance: this.controls.getDistance() });
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  /** Cambia de escenario (Marte ⇄ Hangar) en caliente; el robot y la cámara no se tocan. */
  private setEnvironment(kind: SceneKind) {
    if (this.env) {
      this.scene.remove(this.env.world, this.env.overlay);
      this.env.dispose();
    }
    this.sceneKind = kind;
    this.env = kind === 'hangar' ? new HangarEnvironment(this.renderer) : new MarsEnvironment(this.renderer);
    this.env.setTheme(this.theme);
    this.scene.fog = this.env.fog;
    this.scene.add(this.env.world, this.env.overlay);
  }

  private updateFromState(dt: number) {
    const s = useApp.getState();
    if (s.ui.scene !== this.sceneKind) this.setEnvironment(s.ui.scene);
    // Caminata de reposo: entra y sale con una mezcla suave (~0,5 s).
    const idle = idleWalkActive(s);
    this.idleK += ((idle ? 1 : 0) - this.idleK) * Math.min(1, dt * 5);
    if (!idle && this.idleK < 0.002) this.idleK = 0;
    const walk = this.idleK > 0 ? idleWalkPose((this.idleT += dt * 1000), s.profile) : null;
    const walkMix = this.idleK * this.idleK * (3 - 2 * this.idleK);
    const now = performance.now();
    this.model.cover.visible = s.ui.showCover;
    this.env.overlay.visible = s.ui.showGrid;
    if (s.ui.theme !== this.theme) {
      this.theme = s.ui.theme;
      this.env.setTheme(s.ui.theme);
    }
    this.axes.visible = s.ui.showAxes;
    this.labels.domElement.style.display = s.ui.showLabels ? '' : 'none';
    let ghostVisible = false;
    for (const id of ALL_JOINTS) {
      const cfg = getJoint(s.profile, id);
      const rt = s.joints[id];
      let us: number;
      let unknown = false;
      if (s.mode === 'sim') us = rt.simUs;
      else {
        const d = realDisplayUs(rt);
        if (d.us === null) {
          unknown = true;
          us = cfg.refUs ?? cfg.exploracion?.refUs ?? 1500;
        } else us = d.us;
      }
      let target = estimatedAngleDeg(cfg, us);
      const walkUs = walk?.[id];
      if (walkUs !== undefined) target += (estimatedAngleDeg(cfg, walkUs) - target) * walkMix;
      const prev = this.displayed.get(id) ?? target;
      const cur = prev + (target - prev) * 0.22;
      this.displayed.set(id, cur);
      this.model.setJointAngle(id, cur);
      if (s.mode === 'real' && s.ui.showGhost && rt.reqUs !== null) {
        ghostVisible = true;
        this.ghost.setJointAngle(id, estimatedAngleDeg(cfg, rt.reqUs));
      } else {
        this.ghost.setJointAngle(id, cur);
      }
      const hl = id === s.selected ? 'sel' : id === s.hovered ? 'hover' : unknown ? 'unknown' : 'none';
      this.model.setHighlight(id, hl);
    }
    this.ghost.root.visible = ghostVisible;
    // Marcas de proyección de los pies sobre el suelo.
    LEGS.forEach((leg, i) => {
      this.model.legs.get(leg)!.foot.getWorldPosition(this.footPos);
      this.env.setFootMark(i, this.footPos.x, this.footPos.z);
    });
    // Anillo en el pivote seleccionado, orientado al eje de giro
    const piv = this.model.pivots.get(s.selected);
    if (piv) {
      piv.obj.updateWorldMatrix(true, false);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      piv.obj.getWorldPosition(pos);
      piv.obj.parent!.getWorldQuaternion(q);
      this.ring.position.copy(pos);
      this.ring.quaternion.copy(q);
      if (piv.axis === 'x') this.ring.rotateY(Math.PI / 2);
      const kind = jointKind(s.selected);
      const sc = kind === 'cadera' ? 0.75 : kind === 'superior' ? 0.85 : 0.7;
      const pulse = 1 + Math.sin(now / 260) * 0.04;
      this.ring.scale.setScalar(sc * pulse);
      this.ring.visible = true;
    } else this.ring.visible = false;

    if (now - this.lastLabelUpdate > 200) {
      this.lastLabelUpdate = now;
      for (const leg of LEGS) {
        const el = this.legLabels.get(leg)!;
        const parts: string[] = [];
        let selLeg = false;
        for (const k of ['superior', 'inferior', 'cadera'] as const) {
          const id = `${leg}-${k}` as JointId;
          const cfg = getJoint(s.profile, id);
          const rt = s.joints[id];
          const v = s.mode === 'sim' ? rt.simUs : realDisplayUs(rt).us;
          if (id === s.selected) selLeg = true;
          parts.push(`<span class="${id === s.selected ? 'sel' : ''}">${k[0].toUpperCase()}${cfg.canal ?? '—'} <b>${v ?? '—'}</b></span>`);
        }
        const chans = s.profile.joints.filter((j) => j.joint.startsWith(leg) && j.canal !== null).map((j) => j.canal as number).sort((a, b) => a - b);
        el.innerHTML = `<div class="ll-head"><i></i>${leg} · ${LEG_LABEL[leg]}</div>${
          selLeg ? `<div class="ll-body">${parts.join('')}</div>` : `<div class="ll-note2">${chans.length ? 'CH ' + chans.join('·') : 'sin canal físico'}</div>`
        }`;
      }
    }
    void S;
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.model.dispose();
    this.ghost.dispose();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
