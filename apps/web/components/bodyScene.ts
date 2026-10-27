/* Illustrative body-twin scene (no real anatomy). Framework-free: no React here. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type RegionId =
  | "head" | "chest" | "abdomen" | "shoulder-left" | "shoulder-right"
  | "hip" | "knee-left" | "knee-right";

export type RegionHighlight = { region: string; label: string; note?: string };

export type BodySceneHandle = {
  setHighlights: (h: RegionHighlight[]) => void;
  setSelected: (id: RegionId | null) => void;
  onSelect: (cb: (id: RegionId | null) => void) => void;
  dispose: () => void;
};

/* Anchors on the figure surface. Figure faces +z; subject-left is +x. */
const ANCHORS: Record<RegionId, [number, number, number]> = {
  head: [0, 1.63, 0.1],
  chest: [0, 1.3, 0.16],
  abdomen: [0, 1.08, 0.15],
  "shoulder-left": [0.22, 1.44, 0.03],
  "shoulder-right": [-0.22, 1.44, 0.03],
  hip: [0, 0.97, 0.14],
  "knee-left": [0.11, 0.5, 0.09],
  "knee-right": [-0.11, 0.5, 0.09],
};

const BODY = 0x9aa3b5;
const JOINT = 0x7c8497;
const MARKER = 0xf5a524;
const MARKER_HOT = 0x8b5cf6;

function limb(
  from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(0.02, dir.length() - radius * 2);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 6, 20), mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function ball(at: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat);
  mesh.position.copy(at);
  mesh.castShadow = true;
  return mesh;
}

function buildFigure(bodyMat: THREE.Material, jointMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Torso: lathed profile (hips -> waist -> chest -> shoulders).
  const profile = [
    new THREE.Vector2(0.001, 0.92), new THREE.Vector2(0.13, 0.94),
    new THREE.Vector2(0.145, 1.05), new THREE.Vector2(0.125, 1.18),
    new THREE.Vector2(0.15, 1.32), new THREE.Vector2(0.155, 1.4),
    new THREE.Vector2(0.1, 1.47), new THREE.Vector2(0.05, 1.49),
  ];
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), bodyMat);
  torso.castShadow = true;
  g.add(torso);

  // Neck + head.
  g.add(limb(v(0, 1.46, 0), v(0, 1.55, 0), 0.045, bodyMat));
  g.add(ball(v(0, 1.65, 0.01), 0.11, bodyMat));

  for (const side of [1, -1]) {
    const x = (n: number) => n * side;
    // Legs: hip -> knee -> ankle, plus foot.
    const hip = v(x(0.09), 0.95, 0), knee = v(x(0.11), 0.5, 0.02), ankle = v(x(0.11), 0.1, 0.01);
    g.add(limb(hip, knee, 0.075, bodyMat));
    g.add(limb(knee, ankle, 0.055, bodyMat));
    g.add(ball(knee, 0.07, jointMat));
    const foot = ball(v(x(0.11), 0.045, 0.07), 0.06, bodyMat);
    foot.scale.set(0.9, 0.55, 1.6);
    g.add(foot);
    // Arms: shoulder -> elbow -> wrist, plus hand.
    const sh = v(x(0.2), 1.42, 0), el = v(x(0.235), 1.14, 0.01), wr = v(x(0.25), 0.9, 0.02);
    g.add(ball(sh, 0.07, jointMat));
    g.add(limb(sh, el, 0.05, bodyMat));
    g.add(ball(el, 0.05, jointMat));
    g.add(limb(el, wr, 0.042, bodyMat));
    g.add(ball(wr, 0.05, bodyMat));
  }
  return g;
}

export type BodySceneOpts = {
  /** Initial camera azimuth in degrees around the figure (0 = front). */
  azimuth?: number;
  /** Slow turntable; honors prefers-reduced-motion by default. */
  autoRotate?: boolean;
};

export function createBodyScene(
  container: HTMLElement,
  opts?: BodySceneOpts,
): BodySceneHandle {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0.5, 1.3, 3.4);
  if (opts?.azimuth) {
    const pivot = new THREE.Vector3(0, 0.92, 0);
    const off = camera.position.clone().sub(pivot);
    const a = (opts.azimuth * Math.PI) / 180;
    camera.position.set(
      off.x * Math.cos(a) + off.z * Math.sin(a),
      off.y,
      -off.x * Math.sin(a) + off.z * Math.cos(a),
    ).add(pivot);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a2030, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 4, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.5;
  key.shadow.camera.right = 1.5;
  key.shadow.camera.top = 2.2;
  key.shadow.camera.bottom = -0.5;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0001;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8b5cf6, 0.6);
  rim.position.set(-2, 2, -2.5);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 48),
    new THREE.ShadowMaterial({ opacity: 0.28 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.PolarGridHelper(1.7, 12, 5, 64, 0x3a4560, 0x2a3350);
  grid.position.y = 0.002;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  scene.add(grid);

  const bodyMat = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.55, metalness: 0.15 });
  const jointMat = new THREE.MeshStandardMaterial({ color: JOINT, roughness: 0.6, metalness: 0.1 });
  scene.add(buildFigure(bodyMat, jointMat));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.92, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 6;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.autoRotate = opts?.autoRotate ?? !reduced;
  controls.autoRotateSpeed = 0.7;

  // Markers.
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  let highlights: RegionHighlight[] = [];
  let selected: RegionId | null = null;
  let selectCb: (id: RegionId | null) => void = () => {};

  function rebuildMarkers() {
    markerGroup.clear();
    for (const h of highlights) {
      const hot = h.region === selected;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(hot ? 0.05 : 0.038, 20, 14),
        new THREE.MeshStandardMaterial({
          color: hot ? MARKER_HOT : MARKER,
          emissive: hot ? MARKER_HOT : MARKER,
          emissiveIntensity: hot ? 1.2 : 0.55,
          roughness: 0.35,
        }),
      );
      mesh.position.set(...ANCHORS[h.region as RegionId]);
      mesh.userData.region = h.region;
      markerGroup.add(mesh);
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let lastHover = 0;
  function pick(e: PointerEvent): RegionId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markerGroup.children, false);
    return hits.length > 0 ? (hits[0].object.userData.region as RegionId) : null;
  }
  function onPointerDown(e: PointerEvent) {
    // Click (not drag): select on pointerup near pointerdown.
    const x0 = e.clientX, y0 = e.clientY;
    const up = (u: PointerEvent) => {
      renderer.domElement.removeEventListener("pointerup", up);
      if (Math.hypot(u.clientX - x0, u.clientY - y0) < 6) selectCb(pick(u));
    };
    renderer.domElement.addEventListener("pointerup", up);
  }
  function onPointerMove(e: PointerEvent) {
    const now = Date.now();
    if (now - lastHover < 60) return;
    lastHover = now;
    renderer.domElement.style.cursor = pick(e) ? "pointer" : "grab";
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);

  // Resize.
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // Loop.
  const timer = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    timer.update();
    const t = timer.getElapsed();
    if (!reduced) {
      const s = 1 + 0.12 * Math.sin(t * 3);
      for (const m of markerGroup.children) m.scale.setScalar(s);
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setHighlights(h) {
      highlights = h.filter((x) => x.region in ANCHORS);
      rebuildMarkers();
    },
    setSelected(id) {
      selected = id;
      rebuildMarkers();
    },
    onSelect(cb) {
      selectCb = cb;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
