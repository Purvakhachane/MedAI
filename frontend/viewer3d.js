// ============================================================
// viewer3d.js - Three.js Interactive 3D Medical Viewer
// ============================================================

let scene, camera, renderer, controls3D, animFrame3D;
let currentOrganMesh = null;
let tumorMesh = null;

function init3DViewer(containerId = 'viewer-3d') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Check Three.js availability
  if (typeof THREE === 'undefined') {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:#475569">
        <div style="font-size:48px;">🧠</div>
        <div style="font-size:14px;font-weight:600;color:#94a3b8">3D Viewer Loading...</div>
        <div style="font-size:12px;">Three.js is being loaded</div>
      </div>`;
    return;
  }

  cleanup3D();

  const w = container.clientWidth || 500;
  const h = container.clientHeight || 500;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000913);
  scene.fog = new THREE.FogExp2(0x000913, 0.012);

  // Camera
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 0, 4.5);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x1a2a4a, 1.2);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x06b6d4, 2.5);
  dirLight.position.set(5, 8, 5);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x8b5cf6, 1.0);
  rimLight.position.set(-5, -3, -5);
  scene.add(rimLight);

  const pointLight = new THREE.PointLight(0x38bdf8, 1.5, 8);
  pointLight.position.set(0, 2, 2);
  scene.add(pointLight);

  // Add particle field
  addParticleField();

  // Add grid plane
  addGridPlane();

  // Default organ: brain
  addBrainModel();

  // Orbit controls (manual)
  controls3D = createOrbitControls(container);

  // Handle resize
  window.addEventListener('resize', () => on3DResize(container));

  // Animate
  animate3D();
}

function cleanup3D() {
  if (animFrame3D) cancelAnimationFrame(animFrame3D);
  if (renderer) {
    renderer.dispose();
    const old = renderer.domElement;
    if (old.parentNode) old.parentNode.removeChild(old);
  }
  scene = camera = renderer = null;
  currentOrganMesh = tumorMesh = null;
}

function on3DResize(container) {
  if (!camera || !renderer) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ============================================================
// Particle Field
// ============================================================
function addParticleField() {
  const count = 300;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 14;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.025,
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(geo, mat));
}

// ============================================================
// Grid Plane
// ============================================================
function addGridPlane() {
  const grid = new THREE.GridHelper(12, 24, 0x0a2040, 0x0a2040);
  grid.position.y = -2.2;
  scene.add(grid);
}

// ============================================================
// Brain Model
// ============================================================
function addBrainModel() {
  if (currentOrganMesh) {
    scene.remove(currentOrganMesh);
    currentOrganMesh = null;
  }
  if (tumorMesh) {
    scene.remove(tumorMesh);
    tumorMesh = null;
  }

  const group = new THREE.Group();

  // Main cerebrum (two hemispheres)
  const brainGeo = new THREE.SphereGeometry(1.1, 64, 64);
  // Deform slightly to look more organic
  const posArr = brainGeo.attributes.position.array;
  for (let i = 0; i < posArr.length; i += 3) {
    const x = posArr[i], y = posArr[i + 1], z = posArr[i + 2];
    const noise = 0.08 * (Math.sin(x * 4.5) * Math.cos(y * 3.7) + Math.sin(z * 5.2));
    const len = Math.sqrt(x * x + y * y + z * z);
    const scale = (len + noise) / len;
    posArr[i] *= scale;
    posArr[i + 1] *= scale;
    posArr[i + 2] *= scale;
  }
  brainGeo.attributes.position.needsUpdate = true;
  brainGeo.computeVertexNormals();

  const brainMat = new THREE.MeshStandardMaterial({
    color: 0xd4a4a4,
    roughness: 0.55,
    metalness: 0.08,
    transparent: true,
    opacity: 0.88,
    wireframe: false,
  });

  const brainMesh = new THREE.Mesh(brainGeo, brainMat);
  brainMesh.castShadow = true;
  brainMesh.receiveShadow = true;
  group.add(brainMesh);

  // Cerebellum
  const cbGeo = new THREE.SphereGeometry(0.5, 32, 32);
  const cbMat = new THREE.MeshStandardMaterial({ color: 0xb89090, roughness: 0.6, metalness: 0.05 });
  const cbMesh = new THREE.Mesh(cbGeo, cbMat);
  cbMesh.position.set(0, -0.85, -0.7);
  cbMesh.scale.set(1.4, 0.8, 1.0);
  group.add(cbMesh);

  // Brainstem
  const bsGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.7, 16);
  const bsMat = new THREE.MeshStandardMaterial({ color: 0xa07070, roughness: 0.6 });
  const bsMesh = new THREE.Mesh(bsGeo, bsMat);
  bsMesh.position.set(0, -1.4, -0.4);
  group.add(bsMesh);

  // Tumor (glowing red sphere)
  const tumorGeo = new THREE.SphereGeometry(0.22, 32, 32);
  const tumorMat = new THREE.MeshStandardMaterial({
    color: 0xff3333,
    roughness: 0.3,
    metalness: 0.2,
    emissive: 0xff0000,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.95,
  });
  tumorMesh = new THREE.Mesh(tumorGeo, tumorMat);
  tumorMesh.position.set(0.5, 0.3, 0.6);
  group.add(tumorMesh);

  // Tumor glow ring
  const ringGeo = new THREE.TorusGeometry(0.28, 0.02, 16, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(tumorMesh.position);
  group.add(ring);

  // Wireframe overlay for "scan" feel
  const wireGeo = new THREE.SphereGeometry(1.16, 24, 24);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });
  group.add(new THREE.Mesh(wireGeo, wireMat));

  scene.add(group);
  currentOrganMesh = group;
}

// ============================================================
// Lung Model
// ============================================================
function addLungModel() {
  if (currentOrganMesh) { scene.remove(currentOrganMesh); currentOrganMesh = null; }
  if (tumorMesh) { scene.remove(tumorMesh); tumorMesh = null; }

  const group = new THREE.Group();

  // Left lung
  const leftGeo = new THREE.SphereGeometry(0.7, 32, 32);
  leftGeo.applyMatrix4(new THREE.Matrix4().makeScale(0.85, 1.4, 0.7));
  const lungMat = new THREE.MeshStandardMaterial({
    color: 0xe8857a,
    roughness: 0.5,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
  });
  const leftMesh = new THREE.Mesh(leftGeo, lungMat);
  leftMesh.position.set(-0.85, 0, 0);
  group.add(leftMesh);

  // Right lung
  const rightGeo = new THREE.SphereGeometry(0.7, 32, 32);
  rightGeo.applyMatrix4(new THREE.Matrix4().makeScale(0.95, 1.4, 0.7));
  const rightMesh = new THREE.Mesh(rightGeo, lungMat.clone());
  rightMesh.position.set(0.9, 0, 0);
  group.add(rightMesh);

  // Trachea
  const trGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 12);
  const trMat = new THREE.MeshStandardMaterial({ color: 0xd4b4a4, roughness: 0.5 });
  const trMesh = new THREE.Mesh(trGeo, trMat);
  trMesh.position.set(0, 0.8, 0);
  group.add(trMesh);

  // Nodule (tumor)
  const nodGeo = new THREE.SphereGeometry(0.14, 24, 24);
  const nodMat = new THREE.MeshStandardMaterial({
    color: 0xff5500,
    emissive: 0xff3300,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.1,
  });
  tumorMesh = new THREE.Mesh(nodGeo, nodMat);
  tumorMesh.position.set(0.6, 0.3, 0.4);
  group.add(tumorMesh);

  // Wireframes
  const wires = [leftGeo, rightGeo].map(g => {
    const wm = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.07 });
    return new THREE.Mesh(g.clone(), wm);
  });
  wires[0].position.copy(leftMesh.position);
  wires[1].position.copy(rightMesh.position);
  wires.forEach(w => group.add(w));

  scene.add(group);
  currentOrganMesh = group;
}

// ============================================================
// Liver Model
// ============================================================
function addLiverModel() {
  if (currentOrganMesh) { scene.remove(currentOrganMesh); currentOrganMesh = null; }
  if (tumorMesh) { scene.remove(tumorMesh); tumorMesh = null; }

  const group = new THREE.Group();

  const liverGeo = new THREE.SphereGeometry(1.0, 48, 48);
  liverGeo.applyMatrix4(new THREE.Matrix4().makeScale(1.5, 0.7, 1.0));
  const liverMat = new THREE.MeshStandardMaterial({
    color: 0x8b3a2a,
    roughness: 0.5,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });
  const liverMesh = new THREE.Mesh(liverGeo, liverMat);
  liverMesh.position.set(0.3, 0, 0);
  group.add(liverMesh);

  // Lesion
  const lesGeo = new THREE.SphereGeometry(0.2, 24, 24);
  const lesMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: 0xff2200,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });
  tumorMesh = new THREE.Mesh(lesGeo, lesMat);
  tumorMesh.position.set(0.7, 0.2, 0.5);
  group.add(tumorMesh);

  const wireGeo = liverGeo.clone();
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true, transparent: true, opacity: 0.07 });
  const wire = new THREE.Mesh(wireGeo, wireMat);
  wire.position.copy(liverMesh.position);
  group.add(wire);

  scene.add(group);
  currentOrganMesh = group;
}

// ============================================================
// Manual Orbit Controls
// ============================================================
function createOrbitControls(container) {
  let isDown = false, lastX = 0, lastY = 0;
  let rotX = 0, rotY = 0, zoom = 1;

  container.addEventListener('mousedown', e => { isDown = true; lastX = e.clientX; lastY = e.clientY; });
  container.addEventListener('mousemove', e => {
    if (!isDown || !currentOrganMesh) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    rotY += dx * 0.008;
    rotX += dy * 0.008;
    currentOrganMesh.rotation.y = rotY;
    currentOrganMesh.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  container.addEventListener('mouseup', () => isDown = false);
  container.addEventListener('mouseleave', () => isDown = false);
  container.addEventListener('wheel', e => {
    zoom = Math.max(0.5, Math.min(3, zoom + e.deltaY * 0.001));
    if (camera) camera.position.z = 4.5 * zoom;
  });

  // Touch
  container.addEventListener('touchstart', e => { isDown = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; });
  container.addEventListener('touchmove', e => {
    if (!isDown || !currentOrganMesh) return;
    const dx = e.touches[0].clientX - lastX;
    const dy = e.touches[0].clientY - lastY;
    rotY += dx * 0.008;
    rotX += dy * 0.008;
    currentOrganMesh.rotation.y = rotY;
    currentOrganMesh.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  });
  container.addEventListener('touchend', () => isDown = false);

  return { rotX, rotY };
}

// ============================================================
// Animation Loop
// ============================================================
function animate3D() {
  animFrame3D = requestAnimationFrame(animate3D);

  if (currentOrganMesh && !controls3D?.isDown) {
    currentOrganMesh.rotation.y += 0.003;
  }

  if (tumorMesh) {
    tumorMesh.scale.setScalar(1 + 0.05 * Math.sin(Date.now() * 0.003));
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ============================================================
// Public API
// ============================================================
function switch3DOrgan(organ) {
  switch (organ) {
    case 'brain': addBrainModel(); break;
    case 'lung': addLungModel(); break;
    case 'liver': addLiverModel(); break;
    default: addBrainModel();
  }
}

function toggle3DWireframe() {
  if (!currentOrganMesh) return;
  currentOrganMesh.traverse(child => {
    if (child.isMesh && child.material.wireframe !== undefined) {
      if (!child.material.wireframe) {
        child.material.wireframe = !child.material.wireframe;
      }
    }
  });
}

function resetCamera3D() {
  if (camera) {
    camera.position.set(0, 0, 4.5);
    camera.lookAt(0, 0, 0);
  }
  if (currentOrganMesh) {
    currentOrganMesh.rotation.set(0, 0, 0);
  }
}
