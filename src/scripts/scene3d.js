/**
 * Scene signature "le garage devient le ring" (three.js).
 * - Les 3 barres du logo MOTEKA, extrudees, arrivent face camera ;
 * - au defilement elles pivotent et deviennent les 3 cordes avant du ring ;
 * - le ring se monte, la camera tourne autour, la voiture concept (CC-BY,
 *   Khronos) est garee sous les faisceaux rouges.
 * Un seul contexte WebGL, rendu uniquement quand la section est visible.
 * API : const s = await createScene(canvas, { mobile }); s.setProgress(0..1); s.dispose();
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const BC_LOGO = '/brand/boxing-center-blanc.png';
let logoImgPromise = null;
/** Logo Boxing Center blanc (fond transparent), charge une seule fois. */
function loadLogo() {
  if (!logoImgPromise) {
    logoImgPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = BC_LOGO;
    });
  }
  return logoImgPromise;
}

/**
 * Texture canvas peinte deux fois : tout de suite (texte seul), puis quand le
 * logo est charge. paint(ctx, w, h, logo|null).
 */
function brandTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (logo) => {
    ctx.clearRect(0, 0, w, h);
    paint(ctx, w, h, logo);
    tex.needsUpdate = true;
  };
  draw(null);
  loadLogo().then((logo) => logo && draw(logo));
  return tex;
}

/** Dessine le logo (ou a defaut le texte) centre dans une boite. */
function drawLogo(ctx, logo, cx, cy, maxW, maxH) {
  if (logo) {
    const r = Math.min(maxW / logo.width, maxH / logo.height);
    const lw = logo.width * r;
    const lh = logo.height * r;
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(maxH * 0.42)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BOXING CENTER', cx, cy, maxW);
  }
}

const RED = 0xd11414;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Sous-progression d'une phase [a, b] de la progression globale. */
const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));

function barShape() {
  // Meme parallelogramme que le logo (unites logo / 25).
  const s = new THREE.Shape();
  s.moveTo(26 / 25, 1.12);
  s.lineTo(42 / 25, 1.12);
  s.lineTo(16 / 25, -1.12);
  s.lineTo(0, -1.12);
  s.closePath();
  return s;
}

function floorTexture() {
  // Beton mouille : bruit + flaques, sert de carte de rugosite.
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i += 1) {
    const v = 110 + Math.random() * 110;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  for (let i = 0; i < 18; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 30 + Math.random() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(10,10,10,0.95)');
    grd.addColorStop(1, 'rgba(10,10,10,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

export async function createScene(canvas, { mobile = false, onCarLoaded } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.3 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.045);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(mobile ? 52 : 40, 1, 0.1, 100);

  // Sol beton mouille
  const rough = floorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55, roughnessMap: rough, metalness: 0.6 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Mur du fond + bandes lumineuses (ateliers)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), wallMat);
  wall.position.set(0, 7, -12);
  scene.add(wall);
  const neonMat = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
  for (let i = -2; i <= 2; i += 1) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.06), neonMat);
    n.position.set(i * 5, 8.5, -11.9);
    scene.add(n);
  }

  // Banderole du fond : BOXING CENTER x MOTEKA
  const bannerTex = brandTexture(1024, 160, (ctx, w, h, logo) => {
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d11414';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h - 8, w, 8);
    drawLogo(ctx, logo, w * 0.3, h / 2, w * 0.36, h * 0.74);
    ctx.fillStyle = '#999b9a';
    ctx.font = '700 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x', w * 0.52, h / 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 70px Arial Black, Arial, sans-serif';
    ctx.fillText('MOTEKA', w * 0.74, h / 2 + 2);
  });
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 2.03),
    new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bannerTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8 })
  );
  banner.position.set(0, 5.4, -11.85);
  scene.add(banner);

  // Lumieres : faisceaux rouges du haut, contre-jour blanc
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const spots = [];
  const beamMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  [
    [-3.2, 9, 2.5],
    [3.2, 9, 2.5],
    [0, 9, -2.5],
  ].forEach(([x, y, z], i) => {
    const sp = new THREE.SpotLight(i === 2 ? 0xffffff : RED, i === 2 ? 60 : 140, 26, Math.PI / 7, 0.55, 1.4);
    sp.position.set(x, y, z);
    sp.target.position.set(x * 0.25, 0, z * 0.2);
    sp.castShadow = !mobile && i < 2;
    sp.shadow.mapSize.set(1024, 1024);
    scene.add(sp, sp.target);
    spots.push(sp);
    if (i < 2) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 32, 1, true), beamMat);
      beam.position.set(x * 0.62, 4.5, z * 0.6);
      beam.rotation.z = (x > 0 ? 1 : -1) * 0.25;
      scene.add(beam);
    }
  });
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  // Ring
  const ring = new THREE.Group();
  scene.add(ring);
  const S = 5.4; // cote
  const H = 0.9; // hauteur plateau
  // Tablier du ring : bande noire avec logo Boxing Center sur les 4 faces.
  const apronTex = brandTexture(1024, 154, (ctx, w, h, logo) => {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d11414';
    ctx.fillRect(0, 0, w, 6);
    drawLogo(ctx, logo, w * 0.5, h * 0.52, w * 0.34, h * 0.8);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (const x of [w * 0.12, w * 0.88]) {
      ctx.beginPath();
      ctx.moveTo(x - 40, h * 0.5);
      ctx.lineTo(x + 40, h * 0.5);
      ctx.stroke();
    }
  });
  const apronSide = new THREE.MeshStandardMaterial({ map: apronTex, emissiveMap: apronTex, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.6 });
  const apronPlain = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const apron = new THREE.Mesh(new THREE.BoxGeometry(S + 0.6, H, S + 0.6), [apronSide, apronSide, apronPlain, apronPlain, apronSide, apronSide]);
  apron.position.y = H / 2;
  apron.castShadow = apron.receiveShadow = true;
  const canvasTop = new THREE.Mesh(new THREE.BoxGeometry(S + 0.7, 0.06, S + 0.7), new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.85 }));
  canvasTop.position.y = H + 0.03;
  canvasTop.receiveShadow = true;
  // Logo discret au centre du tapis.
  const matTex = brandTexture(1024, 480, (ctx, w, h, logo) => drawLogo(ctx, logo, w / 2, h / 2, w * 0.96, h * 0.96));
  const matLogo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.22),
    new THREE.MeshStandardMaterial({ map: matTex, transparent: true, opacity: 0.42, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  matLogo.rotation.x = -Math.PI / 2;
  matLogo.position.y = H + 0.065;
  matLogo.receiveShadow = true;
  ring.add(matLogo);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(S + 0.62, 0.18, S + 0.62), new THREE.MeshStandardMaterial({ color: RED, roughness: 0.4, emissive: 0x2a0000 }));
  skirt.position.y = H - 0.12;
  ring.add(apron, canvasTop, skirt);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x999b9a, metalness: 0.9, roughness: 0.25 });
  // Coussins de coin : "BOXING CENTER" a la verticale, rouge et blanc en alternance.
  const padTex = (bg, fg) =>
    brandTexture(128, 704, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = fg;
      ctx.font = '900 58px Arial Black, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BOXING CENTER', 0, 4, h * 0.92);
      ctx.restore();
    });
  const padMat = new THREE.MeshStandardMaterial({ map: padTex('#d11414', '#ffffff'), roughness: 0.45 });
  const padMatLight = new THREE.MeshStandardMaterial({ map: padTex('#e4e5e1', '#141414'), roughness: 0.5 });
  const corners = [
    [-S / 2, -S / 2],
    [S / 2, -S / 2],
    [S / 2, S / 2],
    [-S / 2, S / 2],
  ];
  const posts = corners.map(([x, z], i) => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 16), postMat);
    p.position.y = 0.8;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.22), i % 2 ? padMat : padMatLight);
    pad.position.y = 0.75;
    g.add(p, pad);
    g.position.set(x, H, z);
    g.castShadow = true;
    ring.add(g);
    return g;
  });

  // Cordes : 3 niveaux x 4 cotes. Les 3 cordes avant sont les barres MOTEKA.
  const ropeY = [H + 0.45, H + 0.85, H + 1.25];
  const ropeMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.3, metalness: 0.2, emissive: 0x330000 });
  const sideRopes = [];
  const sides = [
    { pos: [0, S / 2 * -1], rotY: 0 }, // arriere
    { pos: [S / 2, 0], rotY: Math.PI / 2 }, // droite
    { pos: [-S / 2, 0], rotY: Math.PI / 2 }, // gauche
  ];
  for (const y of ropeY) {
    for (const s of sides) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, S, 12), ropeMat);
      r.rotation.z = Math.PI / 2;
      const g = new THREE.Group();
      g.add(r);
      g.position.set(s.pos[0], y, s.pos[1]);
      g.rotation.y = s.rotY;
      g.scale.set(0.0001, 1, 1);
      ring.add(g);
      sideRopes.push(g);
    }
  }

  // Les 3 barres MOTEKA
  const barGeo = new THREE.ExtrudeGeometry(barShape(), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 });
  barGeo.center();
  const barMat = new THREE.MeshPhysicalMaterial({ color: RED, metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x1a0000 });
  const bars = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(barGeo, barMat);
    m.castShadow = true;
    scene.add(m);
    return m;
  });
  // Pose "logo" (face camera, au-dessus du ring) et pose "corde" (avant du ring).
  const logoPose = (i) => ({ x: (i - 1) * 1.2, y: 3.3, z: 3.2, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
  const ropePose = (i) => ({ x: 0, y: ropeY[i], z: S / 2, rx: 0, ry: 0, rz: Math.PI / 2, sx: 0.06, sy: S / 2.24, sz: 0.25 });
  const flyPose = (i) => ({ x: (i - 1) * 7, y: 5 + i, z: -6, rx: 1.2 * (i - 1), ry: 2, rz: -1, sx: 1, sy: 1, sz: 1 });

  // Marquage de la voiture : plaque "BOXING CENTER" + logo sur les portieres.
  const plateTex = brandTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f4f5f2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d11414';
    ctx.fillRect(0, 0, 34, h);
    ctx.fillStyle = '#141414';
    ctx.font = '900 54px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BOXING CENTER', w / 2 + 16, h / 2 + 2, w - 60);
  });
  function brandCar(model) {
    let body = null;
    let bodySize = 0;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.name === 'License') {
          m.map = plateTex;
          m.color?.set(0xffffff);
          m.needsUpdate = true;
        }
      }
      // Carrosserie peinte la plus grande = support des stickers. Les noms de
      // materiaux sont fusionnes a l'optimisation : on repere la peinture rouge.
      const isPaint = (m) => /^Paint/.test(m?.name || '') || (m?.color && m.color.r > 0.25 && m.color.r > m.color.g * 3 && m.color.r > m.color.b * 3);
      if (mats.some(isPaint)) {
        o.geometry.computeBoundingBox();
        const s = o.geometry.boundingBox.getSize(new THREE.Vector3()).length();
        if (s > bodySize) {
          bodySize = s;
          body = o;
        }
      }
    });
    const dbg = [];
    model.traverse((o) => o.isMesh && dbg.push([o.name, (Array.isArray(o.material) ? o.material : [o.material]).map((m) => `${m.name}|${m.color?.getHexString()}|${Boolean(m.map)}`).join(',')]));
    window.__galaCarMats = dbg;
    if (!body) return;
    model.updateMatrixWorld(true);
    const decalTex = new THREE.TextureLoader().load(BC_LOGO);
    decalTex.colorSpace = THREE.SRGBColorSpace;
    const decalMat = new THREE.MeshStandardMaterial({
      map: decalTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness: 0.35,
      metalness: 0.1,
    });
    const ray = new THREE.Raycaster();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion).normalize();
    for (const side of [-1, 1]) {
      // Tir depuis l'exterieur, a hauteur de portiere, vers le centre de la voiture.
      const from = model.localToWorld(new THREE.Vector3(side * 4, 0.55, 0.15));
      const to = model.localToWorld(new THREE.Vector3(0, 0.55, 0.15));
      ray.set(from, to.clone().sub(from).normalize());
      const hit = ray.intersectObject(body, false)[0];
      if (!hit?.face) continue;
      const normal = hit.face.normal.clone().transformDirection(body.matrixWorld).normalize();
      // Repere du sticker : z = normale, x = avant de la voiture (texte lisible).
      const xAxis = fwd.clone().multiplyScalar(side === -1 ? 1 : -1);
      xAxis.sub(normal.clone().multiplyScalar(xAxis.dot(normal))).normalize();
      const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
      const rot = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
      const geo = new DecalGeometry(body, hit.point, rot, new THREE.Vector3(1.5, 0.7, 0.8));
      const decal = new THREE.Mesh(geo, decalMat);
      scene.add(decal);
      decals.push(decal);
    }
    window.__galaDecals = { body: body.name, count: decals.length, verts: decals.map((d) => d.geometry.attributes.position?.count || 0) };
  }
  const decals = [];

  // Voiture concept (chargee apres coup, non bloquante)
  let car = null;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader
    .loadAsync('/3d/car-concept.glb')
    .then((gltf) => {
      car = gltf.scene;
      car.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = !mobile;
          o.receiveShadow = false;
        }
      });
      car.scale.setScalar(1.25);
      car.position.set(-6.3, 0, 1.8);
      car.rotation.y = 0.75;
      scene.add(car);
      brandCar(car);
      onCarLoaded?.();
    })
    .catch((err) => console.warn('[3d] voiture non chargee', err));

  // Camera : trajectoire pilotee par la progression
  const camAt = (p) => {
    const a = seg(p, 0, 0.35); // recul depuis le logo
    const b = seg(p, 0.35, 0.75); // orbite autour du ring
    const c = seg(p, 0.75, 1); // plan large voiture + ring
    const angle = lerp(0, -0.95, b) + lerp(0, 0.55, c);
    const dist = lerp(lerp(6.2, 11.5, a), 13.5, c);
    const y = lerp(lerp(3.4, 4.2, a), 3.1, c);
    const look = new THREE.Vector3(lerp(0, -1.4, c), lerp(3.2, 1.4, a), lerp(3.2, 0, a));
    return { pos: new THREE.Vector3(Math.sin(angle) * dist + look.x * 0.3, y, Math.cos(angle) * dist), look };
  };

  let progress = 0;
  let visible = true;
  let raf = 0;
  const clock = new THREE.Clock();

  function apply(p, t) {
    const assemble = seg(p, 0.12, 0.55);
    const enter = seg(p, 0, 0.12);
    bars.forEach((m, i) => {
      const A = flyPose(i);
      const B = logoPose(i);
      const C = ropePose(i);
      const from = enter < 1 ? A : B;
      const to = enter < 1 ? B : C;
      const k = enter < 1 ? enter : seg(p, 0.12 + i * 0.04, 0.5 + i * 0.04);
      m.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + (enter >= 1 && k < 1 ? Math.sin(k * Math.PI) * 0.8 : 0), lerp(from.z, to.z, k));
      m.rotation.set(lerp(from.rx, to.rx, k), lerp(from.ry, to.ry, k) + (k < 1 ? Math.sin(t * 0.8 + i) * 0.05 * (1 - k) : 0), lerp(from.rz, to.rz, k));
      m.scale.set(lerp(from.sx, to.sx, k), lerp(from.sy, to.sy, k), lerp(from.sz, to.sz, k));
    });
    const grow = seg(p, 0.45, 0.7);
    sideRopes.forEach((r) => r.scale.set(Math.max(0.0001, grow), 1, 1));
    ring.position.y = lerp(-1.2, 0, seg(p, 0.05, 0.4));
    posts.forEach((g, i) => (g.scale.y = Math.max(0.0001, seg(p, 0.2 + i * 0.03, 0.45))));
    const cam = camAt(p);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    // Faisceaux qui respirent
    spots[0].intensity = 120 + Math.sin(t * 2.1) * 25;
    spots[1].intensity = 120 + Math.cos(t * 1.7) * 25;
    if (car) car.position.y = Math.sin(t * 1.3) * 0.004;
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 58 : mobile ? 52 : 40;
    camera.updateProjectionMatrix();
  }

  function frame() {
    raf = 0;
    if (!visible) return;
    apply(progress, clock.getElapsedTime());
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  apply(0, 0);
  renderer.render(scene, camera);

  return {
    /** Plan fixe (studio d'images) : etat de la scene + camera libre. */
    still({ p = 1, pos, look, fov, t = 1.2, exposure } = {}) {
      apply(p, t);
      if (pos) camera.position.set(...pos);
      if (fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      if (look) camera.lookAt(new THREE.Vector3(...look));
      if (exposure) renderer.toneMappingExposure = exposure;
      renderer.render(scene, camera);
    },
    carReady: () => Boolean(car),
    setProgress(p) {
      progress = clamp(p);
    },
    setVisible(v) {
      visible = v;
      if (v && !raf) {
        clock.start();
        raf = requestAnimationFrame(frame);
      } else if (!v) {
        cancelAnimationFrame(raf);
        raf = 0;
        clock.stop();
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      pmrem.dispose();
    },
  };
}
