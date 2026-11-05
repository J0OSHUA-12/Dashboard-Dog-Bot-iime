// Escena 3D: renderizador, cámara orbital, vistas, rejilla, selección y etiquetas.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ALL_JOINTS, JointId, LEG_LABEL, LEGS, LegId, jointKind } from '../../shared/joints';
import { estimatedAngleDeg, getJoint } from '../../shared/profile';
import { realDisplayUs, useApp } from '../state/store';
import { DogBotModel, S } from './DogBotModel';
import { ModelParams } from './modelParams';

export type ViewName = 'iso' | 'frontal' | 'lateral' | 'superior';

const SCENE_THEME = {
  dark: { bg: 0x111217, gridMain: 0x2c2f3a, gridSub: 0x1e2029 },
  light: { bg: 0xe9ecf1, gridMain: 0xbcc2cc, gridSub: 0xd3d7df },
} as const;
const BG = SCENE_THEME.dark.bg;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,122,26,0.30)');
  grd.addColorStop(0.45, 'rgba(239,62,54,0.10)');
  grd.addColorStop(1, 'rgba(239,62,54,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DogBotScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private model!: DogBotModel;
  private ghost!: DogBotModel;
  private grid: THREE.Group;
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
  private gridLines: THREE.GridHelper | null = null;
  private theme: keyof typeof SCENE_THEME = 'dark';

  constructor(
    private host: HTMLElement,
    params: ModelParams,
  ) {
    this.params = params;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(BG, 1);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'viewport-canvas';
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'viewport-labels';
    host.appendChild(this.labels.domElement);

    this.scene.fog = new THREE.Fog(BG, 14, 30);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
    });

    // Luces
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1410, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(5, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9a4a, 0.75);
    rim.position.set(-6, 4, -5);
    this.scene.add(rim);

    // Suelo, rejilla y plataforma con brillo naranja
    this.grid = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.42 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.setGridLines(SCENE_THEME.dark.gridMain, SCENE_THEME.dark.gridSub);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.002;
    this.grid.add(glow);
    const plat = new THREE.Shape();
    const w = 2.6;
    const h = 1.9;
    const r = 0.25;
    plat.moveTo(-w + r, -h);
    plat.lineTo(w - r, -h);
    plat.quadraticCurveTo(w, -h, w, -h + r);
    plat.lineTo(w, h - r);
    plat.quadraticCurveTo(w, h, w - r, h);
    plat.lineTo(-w + r, h);
    plat.quadraticCurveTo(-w, h, -w, h - r);
    plat.lineTo(-w, -h + r);
    plat.quadraticCurveTo(-w, -h, -w + r, -h);
    const pts = plat.getPoints(48).map((p) => new THREE.Vector3(p.x, 0.004, p.y));
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55 }));
    this.grid.add(outline);
    const inner = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x * 0.94, 0.004, p.z * 0.92))),
      new THREE.LineBasicMaterial({ color: 0xef3e36, transparent: true, opacity: 0.25 }),
    );
    this.grid.add(inner);
    this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(1.6);
    this.axes.position.y = 0.01;
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
    this.target.set(0, this.model.standHeight * 0.75, 0);
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

  setView(v: ViewName, animate = true) {
    this.lastView = v;
    if (animate) this.userMoved = false;
    const aspect = this.camera.aspect || 1.6;
    const d = 8.6 * Math.max(1, Math.pow(1.25 / Math.min(1.25, aspect), 0.6));
    const t = this.target;
    const pos =
      v === 'iso'
        ? new THREE.Vector3(d * 0.72, d * 0.5, d * 0.78)
        : v === 'frontal'
          ? new THREE.Vector3(d, 0.35, 0.001)
          : v === 'lateral'
            ? new THREE.Vector3(0.001, 0.35, d)
            : new THREE.Vector3(0.001, d * 1.05, 0.002);
    pos.add(t);
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
      const k = Math.min(1, (performance.now() - start) / 450);
      const e = k * k * (3 - 2 * k);
      this.camera.position.lerpVectors(from, pos, e);
      this.controls.target.lerpVectors(fromT, t, e);
      this.controls.update();
      if (k < 1 && !this.disposed) requestAnimationFrame(step);
    };
    step();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.setView(this.lastView, false);
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
    this.updateFromState();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  private setGridLines(main: number, sub: number) {
    if (this.gridLines) {
      this.grid.remove(this.gridLines);
      this.gridLines.geometry.dispose();
      (this.gridLines.material as THREE.Material).dispose();
    }
    const gh = new THREE.GridHelper(24, 48, main, sub);
    (gh.material as THREE.Material).transparent = true;
    (gh.material as THREE.Material).opacity = 0.9;
    this.grid.add(gh);
    this.gridLines = gh;
  }

  /** Fondo, niebla y rejilla según el tema claro/oscuro de la interfaz. */
  private applyTheme(theme: keyof typeof SCENE_THEME) {
    this.theme = theme;
    const t = SCENE_THEME[theme];
    this.renderer.setClearColor(t.bg, 1);
    (this.scene.fog as THREE.Fog).color.setHex(t.bg);
    this.setGridLines(t.gridMain, t.gridSub);
  }

  private updateFromState() {
    const s = useApp.getState();
    const now = performance.now();
    this.model.cover.visible = s.ui.showCover;
    this.grid.visible = s.ui.showGrid;
    if (s.ui.theme !== this.theme) this.applyTheme(s.ui.theme);
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
      const target = estimatedAngleDeg(cfg, us);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
