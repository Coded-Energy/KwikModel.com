// The sample house: one WebGL scene that stays on screen while the page scrolls over it.
//
// Two looks are rendered each frame and blended in a final pass:
//   A  "classified"  the shell of the house only, crushed into a mosaic
//   B  "revealed"    the full system: rooms, loads, equipment and ducts
// The lens (and, once cleared, the whole screen) shows B through A.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const COL = {
  ice: new THREE.Color('#eaf3ff'),
  line: new THREE.Color('#9cc4ff'),
  blue: new THREE.Color('#4f86d9'),
  gold: new THREE.Color('#e6b510'),
  fog: new THREE.Color('#071a3a'),
};

const SYSTEM = 1; // layer for everything that only shows in the revealed look
const SOLID = 2;  // layer for the opaque massing that only the classified look uses

// --- geometry helpers -------------------------------------------------------

const PIECE = 0.34; // long lines are cut into short pieces so they can draw on smoothly

class Strokes {
  constructor() { this.p = []; }
  line(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / PIECE));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      this.p.push(a[0] + dx * t0, a[1] + dy * t0, a[2] + dz * t0, a[0] + dx * t1, a[1] + dy * t1, a[2] + dz * t1);
    }
    return this;
  }
  path(pts, closed = false) {
    for (let i = 0; i < pts.length - 1; i++) this.line(pts[i], pts[i + 1]);
    if (closed) this.line(pts[pts.length - 1], pts[0]);
    return this;
  }
  box(x0, y0, z0, x1, y1, z1) {
    this.path([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], true);
    [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z]) => this.line([x, y0, z], [x, y1, z]));
    this.path([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], true);
    return this;
  }
  circle(cx, cy, cz, r, n = 28) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]); }
    return this.path(pts, true);
  }
}

function quadFaces(list) {
  // list: [{ pts: [a,b,c,(d)], tone }]
  const pos = [], col = [];
  for (const { pts, tone } of list) {
    const tri = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (const i of tri) { pos.push(...pts[i]); col.push(tone, tone, tone); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function roundedCurve(points, r = 0.28) {
  // Polyline with soft elbows
  const v = points.map((p) => new THREE.Vector3(...p));
  const out = [v[0].clone()];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i].clone().sub(v[i - 1]).normalize();
    const b = v[i + 1].clone().sub(v[i]).normalize();
    out.push(v[i].clone().addScaledVector(a, -r), v[i].clone().addScaledVector(a, -r * 0.3).addScaledVector(b, r * 0.3), v[i].clone().addScaledVector(b, r));
  }
  out.push(v[v.length - 1].clone());
  const path = new THREE.CurvePath();
  for (let i = 0; i < out.length - 1; i++) path.add(new THREE.LineCurve3(out[i], out[i + 1]));
  return path;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// --- the model -------------------------------------------------------------

const H = 3;            // wall height
const RIDGE = 5.3;      // main ridge
const WRIDGE = 4.7;     // wing ridge
const M = { x0: -7, x1: 3, z0: -4, z1: 4 };       // main block
const W = { x0: 3, x1: 7, z0: -1.5, z1: 3.5 };    // wing
const HALL = -0.5;      // z of the central partition and the supply trunk
const DUCT_Y = 3.42;

export const ROOMS = [
  { name: 'Living', x0: -7, x1: -1.2, z0: HALL, z1: 4, load: 0.95 },
  { name: 'Kitchen', x0: -1.2, x1: 3, z0: HALL, z1: 4, load: 0.72 },
  { name: 'Bed 1', x0: -7, x1: -3.6, z0: -4, z1: HALL, load: 0.45 },
  { name: 'Bath', x0: -3.6, x1: -1.2, z0: -4, z1: HALL, load: 0.16 },
  { name: 'Bed 2', x0: -1.2, x1: 3, z0: -4, z1: HALL, load: 0.36 },
  { name: 'Suite', x0: 3, x1: 7, z0: -1.5, z1: 3.5, load: 0.58 },
];

const RAMP = ['#2a78d6', '#6fa8ee', '#e6b510', '#f08a24'].map((c) => new THREE.Color(c));
function ramp(t) {
  const s = clamp01(t) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(s));
  return RAMP[i].clone().lerp(RAMP[i + 1], s - i);
}

export function createScene({ canvas, labels }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COL.fog, 30, 62);
  const camera = new THREE.PerspectiveCamera(26, 1, 1, 200);
  const target = new THREE.Vector3(0, 1.5, 0);

  const lineMats = [];
  function strokes(s, { color = COL.line, width = 1.3, opacity = 1, layer = 0, parent = scene, order = 2 } = {}) {
    const g = new LineSegmentsGeometry();
    g.setPositions(s.p);
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false, fog: true });
    m.userData.width = width;
    m.userData.base = opacity;
    lineMats.push(m);
    const o = new LineSegments2(g, m);
    o.userData.count = s.p.length / 6;
    o.layers.set(layer);
    o.renderOrder = order;
    o.frustumCulled = false;
    parent.add(o);
    return o;
  }
  const draw = (o, t) => {
    const n = Math.floor(o.userData.count * clamp01(t));
    o.visible = n > 0;
    o.geometry.instanceCount = n;
  };

  // Site: boundary, dimension strings, north point
  const site = new Strokes();
  site.path([[-10.6, 0, -6.6], [10.4, 0, -6.6], [10.4, 0, 7.4], [-10.6, 0, 7.4]], true);
  const dimF = 5.9, dimL = -9.9;
  site.line([M.x0, 0, dimF], [W.x1, 0, dimF]);
  [M.x0, M.x1, W.x1].forEach((x) => { site.line([x, 0, dimF - 0.35], [x, 0, dimF + 0.35]); site.line([x - 0.2, 0, dimF + 0.2], [x + 0.2, 0, dimF - 0.2]); });
  site.line([M.x0, 0, 4.5], [M.x0, 0, dimF - 0.5]).line([M.x1, 0, 4.5], [M.x1, 0, dimF - 0.5]).line([W.x1, 0, 4.0], [W.x1, 0, dimF - 0.5]);
  site.line([dimL, 0, M.z0], [dimL, 0, M.z1]);
  [M.z0, M.z1].forEach((z) => { site.line([dimL - 0.35, 0, z], [dimL + 0.35, 0, z]); site.line([dimL - 0.2, 0, z - 0.2], [dimL + 0.2, 0, z + 0.2]); });
  site.circle(8.6, 0, -4.9, 0.7).line([8.6, 0, -4.2], [8.6, 0, -5.9]).line([8.6, 0, -5.9], [8.3, 0, -5.3]);
  const siteLines = strokes(site, { color: COL.blue, width: 1, opacity: 0.8 });

  // Shell: walls, openings
  const shell = new Strokes();
  shell.path([[M.x0, 0, M.z0], [M.x1, 0, M.z0], [M.x1, 0, M.z1], [M.x0, 0, M.z1]], true);
  shell.path([[W.x0, 0, W.z0], [W.x1, 0, W.z0], [W.x1, 0, W.z1], [W.x0, 0, W.z1]]);
  [[M.x0, M.z0], [M.x1, M.z0], [M.x1, M.z1], [M.x0, M.z1], [W.x1, W.z0], [W.x1, W.z1], [W.x0, W.z0], [W.x0, W.z1]].forEach(([x, z]) => shell.line([x, 0, z], [x, H, z]));
  const win = (axis, c, a0, a1, y0 = 0.9, y1 = 2.2, mull = true) => {
    const P = (a, y) => (axis === 'z' ? [a, y, c] : [c, y, a]);
    shell.path([P(a0, y0), P(a1, y0), P(a1, y1), P(a0, y1)], true);
    if (mull) shell.line(P((a0 + a1) / 2, y0), P((a0 + a1) / 2, y1));
  };
  win('z', M.z1, -6.0, -4.3); win('z', M.z1, -3.5, -1.8); win('z', M.z1, 1.0, 2.4, 1.1, 2.2);
  win('z', M.z1, -0.95, 0.05, 0, 2.15, false);                     // front door
  win('x', M.x0, 1.2, 2.9); win('x', M.x0, -3.0, -1.5, 1.1, 2.2);
  win('z', M.z0, -6.0, -4.6, 1.1, 2.2); win('z', M.z0, -0.3, 1.9, 1.1, 2.2);
  win('z', W.z1, 4.1, 5.9); win('x', W.x1, 0.0, 2.0);
  shell.path([[M.x0, H, M.z0], [M.x1, H, M.z0], [M.x1, H, M.z1], [M.x0, H, M.z1]], true);
  shell.path([[W.x0, H, W.z0], [W.x1, H, W.z0], [W.x1, H, W.z1], [W.x0, H, W.z1]]);
  const shellLines = strokes(shell, { width: 1.45 });

  const wallFaces = new THREE.Mesh(quadFaces([
    { pts: [[M.x0, 0, M.z1], [M.x1, 0, M.z1], [M.x1, H, M.z1], [M.x0, H, M.z1]], tone: 1.0 },
    { pts: [[M.x0, 0, M.z0], [M.x1, 0, M.z0], [M.x1, H, M.z0], [M.x0, H, M.z0]], tone: 0.35 },
    { pts: [[M.x0, 0, M.z0], [M.x0, 0, M.z1], [M.x0, H, M.z1], [M.x0, H, M.z0]], tone: 0.7 },
    { pts: [[M.x1, 0, M.z0], [M.x1, 0, M.z1], [M.x1, H, M.z1], [M.x1, H, M.z0]], tone: 0.4 },
    { pts: [[W.x0, 0, W.z1], [W.x1, 0, W.z1], [W.x1, H, W.z1], [W.x0, H, W.z1]], tone: 0.9 },
    { pts: [[W.x0, 0, W.z0], [W.x1, 0, W.z0], [W.x1, H, W.z0], [W.x0, H, W.z0]], tone: 0.3 },
    { pts: [[W.x1, 0, W.z0], [W.x1, 0, W.z1], [W.x1, H, W.z1], [W.x1, H, W.z0]], tone: 0.5 },
  ]), new THREE.MeshBasicMaterial({ color: COL.blue, vertexColors: true, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  wallFaces.renderOrder = 0;
  wallFaces.layers.set(SYSTEM);
  scene.add(wallFaces);
  const solidMat = new THREE.MeshBasicMaterial({ color: COL.blue, vertexColors: true, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const wallSolid = new THREE.Mesh(wallFaces.geometry, solidMat);
  wallSolid.layers.set(SOLID);
  scene.add(wallSolid);

  // Roof (its own group so it can lift off)
  const roof = new THREE.Group();
  scene.add(roof);
  const o = 0.42;                                   // overhang
  const mEave = H - (o * (RIDGE - H)) / 4;          // eave drops with the slope
  const wHalf = (W.z1 - W.z0) / 2, wMid = (W.z0 + W.z1) / 2;
  const wEave = H - (o * (WRIDGE - H)) / wHalf;
  const mx0 = M.x0 - o, mx1 = M.x1 + 0.05, wx1 = W.x1 + o;
  const roofS = new Strokes();
  roofS.path([[mx0, mEave, M.z1 + o], [mx0, RIDGE, 0], [mx0, mEave, M.z0 - o]]);
  roofS.path([[mx1, mEave, M.z1 + o], [mx1, RIDGE, 0], [mx1, mEave, M.z0 - o]]);
  roofS.line([mx0, mEave, M.z1 + o], [mx1, mEave, M.z1 + o]).line([mx0, mEave, M.z0 - o], [mx1, mEave, M.z0 - o]).line([mx0, RIDGE, 0], [mx1, RIDGE, 0]);
  roofS.path([[wx1, wEave, W.z1 + o], [wx1, WRIDGE, wMid], [wx1, wEave, W.z0 - o]]);
  roofS.line([mx1, wEave, W.z1 + o], [wx1, wEave, W.z1 + o]).line([mx1, wEave, W.z0 - o], [wx1, wEave, W.z0 - o]).line([mx1, WRIDGE, wMid], [wx1, WRIDGE, wMid]);
  const roofLines = strokes(roofS, { width: 1.45, parent: roof });
  const rafters = new Strokes();
  for (let x = M.x0 + 0.6; x < M.x1; x += 1.0) rafters.path([[x, mEave, M.z1 + o], [x, RIDGE, 0], [x, mEave, M.z0 - o]]);
  for (let x = W.x0 + 0.8; x < W.x1; x += 1.0) rafters.path([[x, wEave, W.z1 + o], [x, WRIDGE, wMid], [x, wEave, W.z0 - o]]);
  const rafterLines = strokes(rafters, { width: 1, opacity: 0.3, parent: roof });
  const roofFaces = new THREE.Mesh(quadFaces([
    { pts: [[mx0, mEave, M.z1 + o], [mx1, mEave, M.z1 + o], [mx1, RIDGE, 0], [mx0, RIDGE, 0]], tone: 0.4 },
    { pts: [[mx0, mEave, M.z0 - o], [mx1, mEave, M.z0 - o], [mx1, RIDGE, 0], [mx0, RIDGE, 0]], tone: 0.22 },
    { pts: [[mx0, mEave, M.z1 + o], [mx0, RIDGE, 0], [mx0, mEave, M.z0 - o]], tone: 0.7 },
    { pts: [[mx1, wEave, W.z1 + o], [wx1, wEave, W.z1 + o], [wx1, WRIDGE, wMid], [mx1, WRIDGE, wMid]], tone: 0.34 },
    { pts: [[mx1, wEave, W.z0 - o], [wx1, wEave, W.z0 - o], [wx1, WRIDGE, wMid], [mx1, WRIDGE, wMid]], tone: 0.2 },
    { pts: [[wx1, wEave, W.z1 + o], [wx1, WRIDGE, wMid], [wx1, wEave, W.z0 - o]], tone: 0.52 },
  ]), new THREE.MeshBasicMaterial({ color: COL.blue, vertexColors: true, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  roofFaces.renderOrder = 0;
  roofFaces.layers.set(SYSTEM);
  roof.add(roofFaces);
  const roofSolidMat = solidMat.clone();
  const roofSolid = new THREE.Mesh(roofFaces.geometry, roofSolidMat);
  roofSolid.layers.set(SOLID);
  roof.add(roofSolid);

  // Interior partitions
  const inner = new Strokes();
  const wall = (a, b) => inner.path([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], H, b[1]], [a[0], H, a[1]]], true);
  wall([M.x0, HALL], [M.x1, HALL]); wall([-1.2, HALL], [-1.2, M.z1]); wall([-3.6, M.z0], [-3.6, HALL]); wall([-1.2, M.z0], [-1.2, HALL]);
  const innerLines = strokes(inner, { width: 1, opacity: 0.55, layer: SYSTEM });

  // Room load plates
  const plates = ROOMS.map((r, i) => {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0 - 0.16, r.z1 - r.z0 - 0.16);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ramp(r.load), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set((r.x0 + r.x1) / 2, 0.03, (r.z0 + r.z1) / 2);
    m.layers.set(SYSTEM);
    m.renderOrder = 1;
    m.userData.i = i;
    scene.add(m);
    return m;
  });

  // Equipment: air handler in the attic, condenser outside, line set between them
  const AH = { x0: -2.6, x1: -1.2, y0: 3.04, y1: 3.86, z0: -1.0, z1: 0.0 };
  const CU = { x0: -8.95, x1: -7.95, y0: 0.14, y1: 1.12, z0: 1.6, z1: 2.6 };
  const eq = new Strokes();
  eq.box(AH.x0, AH.y0, AH.z0, AH.x1, AH.y1, AH.z1);
  eq.line([AH.x0, AH.y0, AH.z1], [AH.x1, AH.y1, AH.z1]).line([AH.x0, AH.y1, AH.z1], [AH.x1, AH.y0, AH.z1]);
  eq.path([[CU.x0 - 0.18, 0.02, CU.z0 - 0.18], [CU.x1 + 0.18, 0.02, CU.z0 - 0.18], [CU.x1 + 0.18, 0.02, CU.z1 + 0.18], [CU.x0 - 0.18, 0.02, CU.z1 + 0.18]], true);
  eq.box(CU.x0, CU.y0, CU.z0, CU.x1, CU.y1, CU.z1);
  eq.circle((CU.x0 + CU.x1) / 2, CU.y1, (CU.z0 + CU.z1) / 2, 0.36, 22).circle((CU.x0 + CU.x1) / 2, CU.y1, (CU.z0 + CU.z1) / 2, 0.12, 12);
  for (let y = 0.34; y < 1.0; y += 0.2) eq.line([CU.x0, y, CU.z1], [CU.x1, y, CU.z1]);
  eq.path([[CU.x1, 0.6, 2.1], [M.x0, 0.6, 2.1], [M.x0, 3.2, 2.1], [M.x0, 3.2, -0.92], [AH.x0, 3.2, -0.92]]);
  const equipLines = strokes(eq, { color: COL.gold, width: 1.5, layer: SYSTEM, order: 4 });
  const boxGeo = (b) => { const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0); g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); return g; };
  const equipMat = new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0, depthWrite: false });
  const equipFill = [new THREE.Mesh(boxGeo(AH), equipMat), new THREE.Mesh(boxGeo(CU), equipMat)];
  equipFill.forEach((m) => { m.layers.set(SYSTEM); m.renderOrder = 3; scene.add(m); });

  // Ducts
  const tubeVS = /* glsl */`
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const tubeFS = /* glsl */`
    uniform float uDraw, uTime, uAlpha, uLen;
    uniform vec3 uColor;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      if (vUv.x > uDraw || uAlpha < 0.01) discard;
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
      float flow = smoothstep(0.72, 1.0, fract(vUv.x * uLen * 0.42 - uTime * 0.55));
      float head = smoothstep(0.05, 0.0, uDraw - vUv.x) * step(uDraw, 0.999);
      vec3 c = uColor * (0.42 + 0.85 * fres) + vec3(1.0, 0.93, 0.62) * (flow * 0.3 + head * 0.9);
      gl_FragColor = vec4(c, uAlpha);
    }`;
  const ducts = [];
  const duct = (pts, r, start, end) => {
    const curve = roundedCurve(pts, r * 1.7);
    const len = curve.getLength();
    const g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(len * 14)), r, 12, false);
    const m = new THREE.ShaderMaterial({
      vertexShader: tubeVS, fragmentShader: tubeFS, transparent: true,
      uniforms: { uDraw: { value: 0 }, uTime: { value: 0 }, uAlpha: { value: 1 }, uLen: { value: len }, uColor: { value: COL.gold.clone() } },
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.layers.set(SYSTEM);
    mesh.renderOrder = 5;
    mesh.userData = { start, end };
    scene.add(mesh);
    ducts.push(mesh);
  };
  const regs = new Strokes();
  const branch = (x, z, start, ceil = H) => {
    duct([[x, DUCT_Y, HALL], [x, DUCT_Y, z], [x, ceil + 0.03, z]], 0.115, start, start + 0.36);
    regs.path([[x - 0.3, ceil - 0.01, z - 0.3], [x + 0.3, ceil - 0.01, z - 0.3], [x + 0.3, ceil - 0.01, z + 0.3], [x - 0.3, ceil - 0.01, z + 0.3]], true);
    regs.line([x - 0.3, ceil - 0.01, z], [x + 0.3, ceil - 0.01, z]);
  };
  duct([[AH.x0, DUCT_Y, HALL], [-5.6, DUCT_Y, HALL]], 0.19, 0.0, 0.3);
  duct([[AH.x1, DUCT_Y, HALL], [5.0, DUCT_Y, HALL]], 0.19, 0.0, 0.52);
  branch(-3.3, 1.9, 0.14); branch(-3.3, -2.5, 0.18);
  branch(-5.3, 1.9, 0.3); branch(-5.3, -2.4, 0.34);
  branch(0.9, 1.9, 0.26); branch(0.9, -2.4, 0.3);
  branch(5.0, 1.7, 0.56);
  const regLines = strokes(regs, { color: COL.gold, width: 1.2, layer: SYSTEM, order: 4 });

  // --- labels (DOM, projected each frame) ---
  const tags = [];
  const tag = (html, pos, kind, cls = '') => {
    const el = document.createElement('div');
    el.className = `tag ${cls}`;
    el.innerHTML = html;
    labels.appendChild(el);
    tags.push({ el, pos: new THREE.Vector3(...pos), kind, o: -1 });
  };
  ROOMS.forEach((r) => {
    const n = Math.max(1, Math.round(r.load * 5));
    const bars = Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    tag(`${r.name}<span class="tag__bars">${bars}</span>`, [(r.x0 + r.x1) / 2, 0.05, (r.z0 + r.z1) / 2], 'room');
    tags[tags.length - 1].el.style.setProperty('--c', `#${ramp(r.load).getHexString()}`);
  });
  tag('Air handler', [(AH.x0 + AH.x1) / 2, AH.y1 + 0.5, HALL], 'equip', 'tag--equip');
  tag('Outdoor unit', [(CU.x0 + CU.x1) / 2, CU.y1 + 0.75, (CU.z0 + CU.z1) / 2], 'equip', 'tag--equip');
  tag('40′-0″', [(M.x0 + M.x1) / 2, 0, dimF + 0.7], 'dim', 'tag--dim');
  tag('16′-0″', [(W.x0 + W.x1) / 2, 0, dimF + 0.7], 'dim', 'tag--dim');
  tag('32′-0″', [dimL - 0.9, 0, 0], 'dim', 'tag--dim');

  // --- composite ---
  let rtA, rtB, w = 1, h = 1, dpr = 1;
  const post = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: {
      tA: { value: null }, tB: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uLens: { value: new THREE.Vector2(-9999, -9999) },
      uRadius: { value: 0 }, uCell: { value: 14 }, uReveal: { value: 0 }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tA, tB;
      uniform vec2 uRes, uLens;
      uniform float uRadius, uCell, uReveal, uTime;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 px = vUv * uRes;
        vec2 id = floor(px / uCell);
        vec2 base = id * uCell;

        // A: average the tile, then crush it to a few flat tones
        vec4 acc = vec4(0.0);
        for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
          acc += texture2D(tA, (base + (vec2(float(i), float(j)) + 0.5) * 0.25 * uCell) / uRes);
        }
        acc *= 0.0625;
        float cov = clamp(acc.a * 1.9, 0.0, 1.0);
        vec3 lin = acc.a > 0.001 ? acc.rgb / acc.a : vec3(0.0);
        float lum = pow(dot(lin, vec3(0.3, 0.5, 0.2)), 1.0 / 2.2);
        // five flat tones, with the odd tile misreading
        float tone = floor(clamp((lum - 0.26) * 2.1, 0.0, 1.0) * 6.0 + 0.5) / 6.0;
        float flick = step(0.975, hash(id + floor(uTime * 5.0)));
        tone = clamp(tone + flick * 0.28 + (hash(id * 0.71) - 0.5) * 0.07, 0.0, 1.0);
        vec3 tint = mix(vec3(0.05, 0.13, 0.3), vec3(0.3, 0.52, 0.85), smoothstep(0.0, 0.9, tone));
        tint = mix(tint, vec3(0.74, 0.86, 1.0), smoothstep(0.82, 1.0, tone));
        vec2 f = fract(px / uCell) * uCell;
        float gap = step(1.0, f.x) * step(1.0, f.y);
        float a = step(0.14, cov) * mix(0.82, 1.0, cov) * gap;
        vec4 A = vec4(tint * a, a);

        // B: the real thing
        vec4 B = texture2D(tB, vUv);
        vec3 b = B.a > 0.001 ? B.rgb / B.a : vec3(0.0);
        b = pow(b, vec3(1.0 / 2.2));
        B = vec4(b * B.a, B.a);

        float d = distance(px, uLens);
        float m = 1.0 - smoothstep(uRadius - 1.5, uRadius + 1.5, d);
        // Tiles flip over one by one as clearance comes through
        m = max(m, step(hash(id * 1.37) * 0.9 + 0.1, uReveal * 1.02));

        gl_FragColor = mix(A, B, m);
      }`,
  });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  quad.frustumCulled = false;
  postScene.add(quad);

  function setSize(width, height) {
    w = width; h = height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    rtA?.dispose(); rtB?.dispose();
    const opts = { samples: 4, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    rtA = new THREE.WebGLRenderTarget(pw, ph, opts);
    rtB = new THREE.WebGLRenderTarget(pw, ph, opts);
    post.uniforms.uRes.value.set(pw, ph);
    post.uniforms.uCell.value = Math.round((w < 700 ? 11 : 15) * dpr);
    lineMats.forEach((m) => { m.resolution.set(pw, ph); m.linewidth = m.userData.width * dpr; });
    camera.aspect = w / h;
  }

  const v = new THREE.Vector3();
  const setOpacity = (o, a) => { o.material.opacity = o.material.userData.base * a; };

  // s: state  { ground, shell, roof, roofLift, roofA, interior, plates, tags, equip, ducts, dims, plan, az, el, dist }
  // view: { time, lens:{x,y,r}, reveal, shiftX, shiftY, lensLook }
  function render(s, view) {
    const { time } = view;

    // camera
    const az = s.az, el = Math.min(1.5607, s.el);
    camera.position.set(target.x + s.dist * Math.cos(el) * Math.sin(az), target.y + s.dist * Math.sin(el), target.z + s.dist * Math.cos(el) * Math.cos(az));
    // In plan the camera looks straight down, so "up" swings round to the back of the house
    camera.up.set(0, 1 - s.plan, -s.plan).normalize();
    camera.lookAt(target);
    camera.fov = 26;
    camera.setViewOffset(w, h, -view.shiftX * w, -view.shiftY * h, w, h);
    camera.updateProjectionMatrix();
    scene.fog.near = s.dist - 12; scene.fog.far = s.dist + 26;

    // geometry state shared by both looks
    draw(siteLines, s.ground);
    draw(shellLines, s.shell);
    draw(roofLines, s.roof);
    draw(rafterLines, clamp01(s.roof * 1.6 - 0.6));
    roof.position.y = s.roofLift * 3.1;
    draw(innerLines, s.interior);
    draw(equipLines, s.equip);
    equipMat.opacity = 0.16 * smooth(s.equip * 1.6 - 0.6);
    equipFill.forEach((m) => { m.visible = equipMat.opacity > 0.002; });
    plates.forEach((p) => {
      const t = smooth(s.plates * 1.8 - p.userData.i * 0.14);
      p.material.opacity = 0.5 * Math.min(t, s.plates * 1.4);
      p.visible = p.material.opacity > 0.004;
    });
    ducts.forEach((d) => {
      const u = d.material.uniforms;
      u.uDraw.value = clamp01((s.ducts - d.userData.start) / (d.userData.end - d.userData.start));
      u.uTime.value = time;
      d.visible = u.uDraw.value > 0.001;
    });
    draw(regLines, clamp01(s.ducts * 3 - 2));

    const needA = view.reveal < 0.999;
    const needB = view.reveal > 0.001 || view.lens.r > 1;

    if (needA) {
      camera.layers.set(0); camera.layers.enable(SOLID);
      solidMat.opacity = smooth(s.shell * 1.6 - 0.45);
      roofSolidMat.opacity = smooth(s.roof * 1.6 - 0.45);
      wallSolid.visible = solidMat.opacity > 0.01; roofSolid.visible = roofSolidMat.opacity > 0.01;
      setOpacity(roofLines, 1); setOpacity(rafterLines, 1); setOpacity(shellLines, 1);
      siteLines.material.opacity = 0.25;
      renderer.setRenderTarget(rtA);
      renderer.clear();
      renderer.render(scene, camera);
    }
    if (needB) {
      camera.layers.set(0); camera.layers.enable(SYSTEM);
      const ra = view.lensLook ? Math.min(s.roofA, 0.16) : s.roofA;
      wallFaces.material.opacity = 0.05 * s.shell;
      roofFaces.material.opacity = 0.07 * ra * s.roof;
      setOpacity(roofLines, 0.12 + 0.88 * ra); setOpacity(rafterLines, ra); setOpacity(shellLines, 1);
      roof.visible = ra > 0.004 || s.roofA > 0.004;
      siteLines.material.opacity = 0.8;
      renderer.setRenderTarget(rtB);
      renderer.clear();
      renderer.render(scene, camera);
      roof.visible = true;
    }

    const u = post.uniforms;
    u.tA.value = rtA.texture; u.tB.value = rtB.texture;
    u.uTime.value = time;
    u.uReveal.value = view.reveal;
    u.uRadius.value = view.lens.r * dpr;
    u.uLens.value.set(view.lens.x * dpr, (h - view.lens.y) * dpr);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);

    // labels
    const show = { room: s.tags, equip: view.lensLook ? 0 : smooth(s.equip * 2 - 1) * (1 - s.plan), dim: s.dims };
    for (const t of tags) {
      const op = view.reveal > 0.5 ? show[t.kind] : 0;
      if (op < 0.01) { if (t.o !== 0) { t.el.style.opacity = 0; t.o = 0; } continue; }
      v.copy(t.pos);
      if (t.kind === 'room') v.y = 0.05;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      t.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      t.el.style.opacity = op.toFixed(3);
      t.o = op;
    }
  }

  return { setSize, render, renderer };
}
