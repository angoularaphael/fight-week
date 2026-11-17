/**
 * Collision 3D (three.js) : voiture rouge contre voiture graphite, impact au
 * milieu de la progression, etincelles et eclats, puis une carte "40 EUR"
 * jaillit du point d'impact et se place face camera.
 * Tout est fonction de la progression p (0..1) : rejouable dans les deux sens.
 * API : const c = await createCrash(canvas, { mobile, price }); c.setProgress(p); c.setVisible(v); c.dispose();
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const RED = 0xd11414;
const IMPACT = 0.42; // progression de l'impact
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b) => clamp((p - a) / (b - a));
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Generateur pseudo-aleatoire stable (memes etincelles a chaque rendu).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8f8f8f';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i += 1) {
    const v = 100 + Math.random() * 120;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  for (let i = 0; i < 10; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 40 + Math.random() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(15,15,15,0.8)');
    grd.addColorStop(1, 'rgba(15,15,15,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  return t;
}

/** Texture de la carte offre (dessinee apres chargement des polices). */
async function offerTexture(price) {
  try {
    await Promise.all([document.fonts.load('400 160px Michroma'), document.fonts.load('600 40px "Jost Variable"')]);
  } catch {
    /* polices systeme en secours */
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1024, 640);
  bg.addColorStop(0, '#1d1d1f');
  bg.addColorStop(1, '#0d0d0d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 640);
  g.fillStyle = '#d11414';
  g.fillRect(0, 0, 1024, 18);
  // trois barres
  for (let i = 0; i < 3; i += 1) {
    const x = 64 + i * 46;
    g.beginPath();
    g.moveTo(x + 34, 70);
    g.lineTo(x + 56, 70);
    g.lineTo(x + 22, 130);
    g.lineTo(x, 130);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#999b9a';
  g.font = '600 34px "Jost Variable", Jost, Arial, sans-serif';
  g.fillText('FIGHT AND FURIOUS', 230, 112);
  g.fillStyle = '#ffffff';
  g.font = '400 210px Michroma, Arial, sans-serif';
  const priceText = String(price);
  g.fillText(priceText, 64, 400);
  const w = g.measureText(priceText).width;
  g.fillStyle = '#d11414';
  g.font = '400 84px Michroma, Arial, sans-serif';
  g.fillText('EUR', 64 + w + 28, 400);
  g.fillStyle = '#ffffff';
  g.font = '600 46px "Jost Variable", Jost, Arial, sans-serif';
  g.fillText('OFFRE EXCLUSIVE SITE', 64, 520);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 4;
  g.strokeRect(14, 14, 996, 612);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function createCrash(canvas, { mobile = false, price = 40 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.3 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.05);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

  // Sol beton mouille
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.5, roughnessMap: floorTexture(), metalness: 0.65 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Marquage au sol : ligne centrale rouge
  const line = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.08), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.55 }));
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.005;
  scene.add(line);

  // Mur du fond + neons
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 16), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }));
  wall.position.set(0, 8, -9);
  scene.add(wall);
  const neonMat = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
  for (let i = -4; i <= 4; i += 1) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.05), neonMat);
    n.position.set(i * 4.2, 6.2, -8.9);
    scene.add(n);
  }

  // Lumieres
  scene.add(new THREE.AmbientLight(0xffffff, 0.07));
  const spotL = new THREE.SpotLight(RED, 160, 30, Math.PI / 6, 0.6, 1.3);
  spotL.position.set(-5, 9, 3);
  spotL.target.position.set(-2, 0, 0);
  const spotR = new THREE.SpotLight(RED, 160, 30, Math.PI / 6, 0.6, 1.3);
  spotR.position.set(5, 9, 3);
  spotR.target.position.set(2, 0, 0);
  const key = new THREE.SpotLight(0xffffff, 70, 30, Math.PI / 5, 0.7, 1.4);
  key.position.set(0, 10, 6);
  key.target.position.set(0, 0, 0);
  [spotL, spotR, key].forEach((l) => {
    l.castShadow = !mobile;
    l.shadow.mapSize.set(1024, 1024);
    scene.add(l, l.target);
  });
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(0, 5, -8);
  scene.add(rim);
  const impactLight = new THREE.PointLight(0xffd0c0, 0, 18, 1.6);
  impactLight.position.set(0, 1, 0);
  scene.add(impactLight);

  // Voitures
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/3d/car-concept.glb');
  const red = gltf.scene;
  red.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !mobile;
    }
  });
  const black = red.clone(true);
  const paintCache = new Map();
  black.traverse((o) => {
    if (!o.isMesh) return;
    // Apres compression (gltf-transform palette), la peinture n'a plus de nom
    // "Paint" : ce sont les materiaux a vernis (clearcoat) de la carrosserie.
    const isPaint = (m) => /paint/i.test(m?.name || '') || (m?.clearcoat > 0 && /^Body/i.test(o.name || ''));
    const swap = (m) => {
      if (!m || !isPaint(m)) return m;
      if (!paintCache.has(m)) {
        const c = m.clone();
        c.map = null;
        c.color = new THREE.Color(0x1c1c1f);
        if ('clearcoat' in c) c.clearcoat = 1;
        c.metalness = Math.max(c.metalness ?? 0, 0.6);
        c.roughness = 0.28;
        paintCache.set(m, c);
      }
      return paintCache.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  // Avant du modele = +z local. Rouge vient de la gauche (vers +x), graphite de la droite.
  const HALF = 2.35; // demi-longueur approximative (avant)
  const redRig = new THREE.Group();
  red.rotation.y = Math.PI / 2;
  redRig.add(red);
  const blackRig = new THREE.Group();
  black.rotation.y = -Math.PI / 2;
  blackRig.add(black);
  scene.add(redRig, blackRig);

  // Etincelles
  const N = mobile ? 260 : 700;
  const rand = rng(7);
  const sparkPos = new Float32Array(N * 3);
  const sparkVel = [];
  const sparkCol = new Float32Array(N * 3);
  for (let i = 0; i < N; i += 1) {
    const a = rand() * Math.PI * 2;
    const up = 0.3 + rand() * 1.2;
    const sp = 3 + rand() * 9;
    sparkVel.push([Math.cos(a) * sp * 0.6, up * sp * 0.55, Math.sin(a) * sp * 0.9, 0.4 + rand() * 0.8]);
    const warm = rand();
    sparkCol.set(warm > 0.5 ? [1, 0.75 + rand() * 0.25, 0.4] : [1, 0.18, 0.12], i * 3);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({ size: mobile ? 0.09 : 0.07, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);

  // Eclats (petits fragments sombres et rouges)
  const SH = mobile ? 24 : 60;
  const shardGeo = new THREE.TetrahedronGeometry(0.09);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, metalness: 0.8, roughness: 0.3 });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, SH);
  shards.castShadow = !mobile;
  const shardVel = [];
  for (let i = 0; i < SH; i += 1) {
    const a = rand() * Math.PI * 2;
    shardVel.push([Math.cos(a) * (2 + rand() * 4), 2 + rand() * 4, Math.sin(a) * (2 + rand() * 5), rand() * 10, 0.6 + rand() * 1.4]);
    if (i % 3 === 0) shards.setColorAt(i, new THREE.Color(RED));
    else shards.setColorAt(i, new THREE.Color(0x2b2b2e));
  }
  scene.add(shards);
  const dummy = new THREE.Object3D();

  // Onde de choc au sol
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  // Carte offre
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2, 0.05),
    [
      new THREE.MeshStandardMaterial({ color: RED }),
      new THREE.MeshStandardMaterial({ color: RED }),
      new THREE.MeshStandardMaterial({ color: RED }),
      new THREE.MeshStandardMaterial({ color: RED }),
      new THREE.MeshBasicMaterial({ map: await offerTexture(price), toneMapped: false }),
      new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.5, roughness: 0.4 }),
    ]
  );
  card.visible = false;
  scene.add(card);

  let progress = 0;
  let shown = 0; // progression lissee
  let visible = false;
  let raf = 0;
  const clock = new THREE.Clock();

  function apply(p, t) {
    // Approche : acceleration jusqu'a l'impact.
    const a = easeIn(seg(p, 0, IMPACT));
    const after = seg(p, IMPACT, 1);
    const recoil = easeOut(seg(p, IMPACT, IMPACT + 0.22));
    const impactX = HALF;
    const startX = 10.5;
    const redX = after > 0 ? lerp(-impactX, -impactX - 2.4, recoil) : lerp(-startX, -impactX, a);
    const blackX = after > 0 ? lerp(impactX, impactX + 2.0, recoil) : lerp(startX, impactX, a);
    redRig.position.set(redX, 0, 0.35);
    blackRig.position.set(blackX, 0, -0.35);
    // Apres le choc, les deux voitures pivotent et se soulevent un instant.
    redRig.rotation.y = lerp(0, 0.55, recoil);
    blackRig.rotation.y = lerp(0, -0.75, recoil);
    const hop = after > 0 ? Math.sin(Math.min(1, seg(p, IMPACT, IMPACT + 0.12)) * Math.PI) * 0.18 : 0;
    redRig.position.y = hop;
    blackRig.position.y = hop * 0.8;
    redRig.rotation.z = -hop * 0.35;
    blackRig.rotation.z = hop * 0.35;
    // Petites vibrations moteur avant le choc
    if (after === 0) {
      redRig.position.y = Math.sin(t * 40) * 0.006;
      blackRig.position.y = Math.cos(t * 37) * 0.006;
    }

    // Etincelles : trajectoire balistique depuis le point d'impact.
    const st = seg(p, IMPACT, IMPACT + 0.28) * 1.6; // "secondes"
    sparks.visible = after > 0 && st < 1.6;
    if (sparks.visible) {
      for (let i = 0; i < N; i += 1) {
        const [vx, vy, vz, life] = sparkVel[i];
        const tt = Math.min(st, life);
        sparkPos[i * 3] = vx * tt;
        sparkPos[i * 3 + 1] = Math.max(0.02, 0.8 + vy * tt - 4.9 * tt * tt);
        sparkPos[i * 3 + 2] = vz * tt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = 1 - seg(st, 0.5, 1.6);
    }

    // Eclats
    const et = seg(p, IMPACT, IMPACT + 0.3) * 1.4;
    shards.visible = after > 0;
    for (let i = 0; i < SH; i += 1) {
      const [vx, vy, vz, spin, life] = shardVel[i];
      const tt = Math.min(et, life);
      const y = 0.8 + vy * tt - 4.9 * tt * tt;
      dummy.position.set(vx * tt, Math.max(0.05, y), vz * tt);
      dummy.rotation.set(spin * tt, spin * tt * 0.7, 0);
      dummy.scale.setScalar(after > 0 ? 1 : 0.0001);
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;

    // Onde de choc + lumiere d'impact
    const w = seg(p, IMPACT, IMPACT + 0.14);
    ring.scale.setScalar(lerp(0.2, 7, easeOut(w)));
    ring.material.opacity = after > 0 ? (1 - w) * 0.8 : 0;
    impactLight.intensity = after > 0 ? (1 - seg(p, IMPACT, IMPACT + 0.12)) * 260 : 0;

    // Carte : jaillit du point d'impact, tourne, se pose face camera.
    const c = easeInOut(seg(p, IMPACT + 0.08, 0.8));
    card.visible = c > 0;
    if (c > 0) {
      const camPos = camera.position;
      // Point d'arrivee : 60 % du chemin vers la camera, un peu sous l'axe de visee.
      const target = new THREE.Vector3(0, 1.1, 0).lerp(camPos, 0.5);
      // Laisse la place a l'offre HTML : a gauche sur ecran large, en haut sur mobile.
      if (camera.aspect >= 0.8) {
        target.x -= 1.9;
        target.y += 0.15;
      } else {
        target.y += 1.15;
      }
      card.position.set(
        lerp(0, target.x, c),
        lerp(0.9, target.y, c) + Math.sin(c * Math.PI) * 1.8 + (c >= 1 ? Math.sin(t * 1.6) * 0.04 : 0),
        lerp(0, target.z, c)
      );
      card.scale.setScalar(lerp(0.12, camera.aspect >= 0.8 ? 0.9 : 0.8, c));
      // La face +z (texture) regarde la camera, puis la vrille s'amortit.
      card.lookAt(camPos);
      card.rotateY((1 - c) * Math.PI * 3);
      card.rotateX((1 - c) * -1.1);
    }

    // Lumieres qui respirent
    spotL.intensity = 150 + Math.sin(t * 2) * 25;
    spotR.intensity = 150 + Math.cos(t * 1.7) * 25;
  }

  function placeCamera(p, t) {
    // Plan large bas, travelling lateral leger, recul apres le choc.
    const a = easeInOut(seg(p, 0, IMPACT));
    const b = easeInOut(seg(p, IMPACT, 1));
    const narrow = camera.aspect < 0.8;
    const dist = narrow ? 17 : 11.5;
    camera.position.set(lerp(-3.5, 0, a) + lerp(0, 1.2, b), lerp(1.3, 1.6, a) + lerp(0, 0.9, b), lerp(dist + 1, dist, a) + lerp(0, -1.5, b));
    // Secousse a l'impact
    const shake = Math.max(0, 1 - seg(p, IMPACT, IMPACT + 0.1)) * (p > IMPACT ? 1 : 0);
    if (shake > 0) {
      camera.position.x += Math.sin(t * 90) * 0.12 * shake;
      camera.position.y += Math.cos(t * 77) * 0.09 * shake;
    }
    camera.lookAt(0, lerp(0.7, 1.1, b), 0);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 50 : 36;
    camera.updateProjectionMatrix();
  }

  function draw(t) {
    placeCamera(shown, t);
    apply(shown, t);
    renderer.render(scene, camera);
  }

  function frame() {
    raf = 0;
    if (!visible) return;
    shown += (progress - shown) * 0.18;
    if (Math.abs(progress - shown) < 0.0005) shown = progress;
    draw(clock.getElapsedTime());
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  draw(0);

  return {
    setProgress(p) {
      progress = clamp(p);
    },
    /** Rendu immediat a une progression donnee (captures). */
    renderAt(p, t = 1) {
      progress = shown = clamp(p);
      draw(t);
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
