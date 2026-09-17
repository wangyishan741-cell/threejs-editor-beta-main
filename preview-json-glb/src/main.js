import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createPreviewWaterSurface } from '../../src/editor/previewWaterSurface.js';
import './styles.css';

const canvas = document.querySelector('#previewCanvas');
const statusEl = document.querySelector('#status');
const dropHint = document.querySelector('#dropHint');
const jsonUrlInput = document.querySelector('#jsonUrl');
const glbUrlInput = document.querySelector('#glbUrl');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b10);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
camera.position.set(8, 6, 8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

const root = new THREE.Group();
root.name = 'PreviewRoot';
scene.add(root);
const previewWater = createPreviewWaterSurface(root);

const grid = new THREE.GridHelper(40, 40, 0x3c5966, 0x1d3038);
grid.name = 'PreviewGrid';
scene.add(grid);

const axes = new THREE.AxesHelper(5);
axes.name = 'PreviewAxes';
scene.add(axes);

const mixers = [];
const clock = new THREE.Clock();

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

setStatus('等待加载...');
wireUi();
loadJsonFromUrl(jsonUrlInput.value);
animate();

function wireUi() {
  document.querySelector('#loadJsonUrl').addEventListener('click', () => loadJsonFromUrl(jsonUrlInput.value));
  document.querySelector('#loadGlbUrl').addEventListener('click', () => loadModel(glbUrlInput.value, { source: 'url' }));
  document.querySelector('#jsonFile').addEventListener('change', event => loadJsonFile(event.target.files?.[0]));
  document.querySelector('#glbFile').addEventListener('change', event => loadModelFile(event.target.files?.[0]));
  document.querySelector('#frameScene').addEventListener('click', () => frameObject(root));
  document.querySelector('#clearScene').addEventListener('click', clearPreview);
  document.querySelector('#toggleGrid').addEventListener('click', event => toggleObject(grid, event.currentTarget));
  document.querySelector('#toggleAxes').addEventListener('click', event => toggleObject(axes, event.currentTarget));

  window.addEventListener('resize', resize);
  window.addEventListener('dragover', event => {
    event.preventDefault();
    dropHint.classList.add('is-hot');
  });
  window.addEventListener('dragleave', () => dropHint.classList.remove('is-hot'));
  window.addEventListener('drop', event => {
    event.preventDefault();
    dropHint.classList.remove('is-hot');
    const files = [...event.dataTransfer.files];
    files.forEach(file => {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.json')) loadJsonFile(file);
      if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')) loadModelFile(file);
    });
  });

  resize();
}

async function loadJsonFromUrl(url) {
  if (!url) return setStatus('请先填写 JSON 地址。');
  try {
    setStatus(`加载 JSON: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const json = await response.json();
    await applyEditorJson(json, { label: url });
  } catch (error) {
    setStatus(`JSON 加载失败:\n${error.message}`);
  }
}

async function loadJsonFile(file) {
  if (!file) return;
  try {
    setStatus(`读取本地 JSON: ${file.name}`);
    const json = JSON.parse(await file.text());
    await applyEditorJson(json, { label: file.name });
  } catch (error) {
    setStatus(`JSON 文件解析失败:\n${error.message}`);
  }
}

async function applyEditorJson(config, meta = {}) {
  clearPreview({ withDefaultLights: false });
  previewWater.setJsonConfig(config);
  applyRendererConfig(config.webglRenderer);
  applyCameraConfig(config.perspectiveCamera);
  applyOrbitConfig(config.orbitControls);
  await applySceneEnvironment(config.scene);

  const stats = {
    json: meta.label || '未命名 JSON',
    lights: 0,
    meshes: 0,
    models: 0,
    modelUrls: []
  };

  for (const lightCore of config.lightCores || []) {
    const light = createLight(lightCore);
    if (light) {
      root.add(light);
      stats.lights += 1;
    }
  }

  for (const meshCore of config.innerCores || []) {
    const mesh = await createMesh(meshCore);
    if (mesh) {
      root.add(mesh);
      stats.meshes += 1;
    }
  }

  const modelItems = collectModelItems(config);
  for (const item of modelItems) {
    const modelUrl = item?.modelInfo?.url || item?.url;
    if (!isGltfUrl(modelUrl)) continue;
    stats.modelUrls.push(modelUrl);
    try {
      const model = await loadModel(modelUrl, { source: 'json', addToRoot: false });
      applyTransform(model, item.group || item);
      root.add(model);
      previewWater.addModel(model);
      stats.models += 1;
    } catch (error) {
      stats.modelUrls.push(`失败: ${modelUrl} - ${error.message}`);
    }
  }

  if (!stats.lights) addDefaultLights();
  if (!stats.meshes && !stats.models) addEmptyMarker();
  previewWater.refresh();
  frameObject(root, config);

  setStatus([
    `JSON: ${stats.json}`,
    `灯光: ${stats.lights}`,
    `基础网格: ${stats.meshes}`,
    `GLB/GLTF: ${stats.models}`,
    ...(previewWater.getStatus().active ? [`水面细波纹: 已恢复 ${previewWater.getStatus().materials} 个材质`] : []),
    stats.modelUrls.length ? `模型地址:\n${stats.modelUrls.map(url => `- ${url}`).join('\n')}` : '未在 JSON 中发现 GLB/GLTF 引用',
    '',
    '提示: geoCores、particleCores、designCores 等编辑器专有组件不会完整复刻；这里主要验证 JSON + GLB 文件组合。'
  ].join('\n'));
}

function clearPreview(options = {}) {
  const { withDefaultLights = true } = options;
  previewWater.clear();
  mixers.length = 0;
  while (root.children.length) {
    const child = root.children.pop();
    disposeObject(child);
  }
  if (withDefaultLights) addDefaultLights();
}

function addDefaultLights() {
  const ambient = new THREE.AmbientLight(0xeaf7ff, 0.55);
  ambient.name = 'DefaultAmbient';
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.name = 'DefaultKey';
  key.position.set(8, 10, 6);
  key.castShadow = true;
  root.add(ambient, key);
}

function addEmptyMarker() {
  const geometry = new THREE.TorusKnotGeometry(1, 0.28, 120, 12);
  const material = new THREE.MeshStandardMaterial({ color: 0x7be1c9, roughness: 0.35, metalness: 0.12 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'EmptyJsonMarker';
  mesh.castShadow = true;
  root.add(mesh);
}

function applyRendererConfig(config = {}) {
  renderer.outputColorSpace = config.outputColorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  renderer.toneMapping = toneMappingFromValue(config.toneMapping);
  renderer.toneMappingExposure = Number.isFinite(config.toneMappingExposure) ? config.toneMappingExposure : 1;
  renderer.shadowMap.enabled = Boolean(config.shadowMap?.enabled);
  renderer.setClearColor(config.color ?? 0x070b10, config.opacity ?? 1);
}

function applyCameraConfig(config = {}) {
  camera.fov = config.fov ?? 50;
  camera.near = config.near ?? 0.1;
  camera.far = config.far ?? 100000;
  camera.zoom = config.zoom ?? 1;
  copyVector(camera.position, config.position, new THREE.Vector3(8, 6, 8));
  camera.updateProjectionMatrix();
}

function applyOrbitConfig(config = {}) {
  controls.autoRotate = Boolean(config.autoRotate);
  controls.autoRotateSpeed = config.autoRotateSpeed ?? 2;
  controls.enableDamping = config.enableDamping ?? true;
  controls.dampingFactor = config.dampingFactor ?? 0.05;
  controls.minDistance = config.minDistance ?? 0.01;
  controls.maxDistance = config.maxDistance ?? 1000000;
  controls.enablePan = config.enablePan ?? true;
  controls.enableRotate = config.enableRotate ?? true;
  controls.enableZoom = config.enableZoom ?? true;
  controls.panSpeed = config.panSpeed ?? 1;
  controls.rotateSpeed = config.rotateSpeed ?? 1;
  controls.zoomSpeed = config.zoomSpeed ?? 1;
  copyVector(controls.target, config.target, new THREE.Vector3());
  controls.update();
}

async function applySceneEnvironment(config = {}) {
  scene.background = new THREE.Color(0x070b10);
  scene.environment = null;

  const urls = config.envBackgroundUrls || config.backgroundUrls;
  if (Array.isArray(urls) && urls.length === 6) {
    try {
      const cubeTexture = await new THREE.CubeTextureLoader().loadAsync(urls);
      cubeTexture.colorSpace = THREE.SRGBColorSpace;
      if (config.environmentEnabled !== false) scene.environment = cubeTexture;
      scene.background = cubeTexture;
    } catch (error) {
      console.warn('Skybox load failed:', error);
    }
  }
}

function createLight(config = {}) {
  const color = config.color ?? 0xffffff;
  const intensity = config.intensity ?? 1;
  let light;
  if (config.type === 'AmbientLight') light = new THREE.AmbientLight(color, intensity);
  else if (config.type === 'PointLight') light = new THREE.PointLight(color, intensity, config.distance ?? 0, config.decay ?? 2);
  else if (config.type === 'SpotLight') light = new THREE.SpotLight(color, intensity, config.distance ?? 0, config.angle ?? Math.PI / 6, config.penumbra ?? 0, config.decay ?? 2);
  else if (config.type === 'HemisphereLight') light = new THREE.HemisphereLight(color, config.groundColor ?? 0x222222, intensity);
  else light = new THREE.DirectionalLight(color, intensity);

  light.name = config.name || config.type || 'Light';
  light.visible = config.visible ?? true;
  light.castShadow = Boolean(config.castShadow);
  applyTransform(light, config);

  if (light.target && config.target) {
    copyVector(light.target.position, config.target, new THREE.Vector3());
    root.add(light.target);
  }

  return light;
}

async function createMesh(config = {}) {
  if (config.visible === false) return null;
  const geometry = createGeometry(config.geometry);
  if (!geometry) return null;
  const material = await createMaterial(config.material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = config.name || config.geometry?.type || 'Mesh';
  mesh.castShadow = Boolean(config.castShadow);
  mesh.receiveShadow = Boolean(config.receiveShadow);
  applyTransform(mesh, config);
  return mesh;
}

function createGeometry(geometryConfig = {}) {
  const params = geometryConfig.parameters || {};
  switch (geometryConfig.type) {
    case 'BoxGeometry':
      return new THREE.BoxGeometry(params.width ?? 1, params.height ?? 1, params.depth ?? 1, params.widthSegments ?? 1, params.heightSegments ?? 1, params.depthSegments ?? 1);
    case 'SphereGeometry':
      return new THREE.SphereGeometry(params.radius ?? 1, params.widthSegments ?? 32, params.heightSegments ?? 16);
    case 'PlaneGeometry':
      return new THREE.PlaneGeometry(params.width ?? 1, params.height ?? 1, params.widthSegments ?? 1, params.heightSegments ?? 1);
    case 'CylinderGeometry':
      return new THREE.CylinderGeometry(params.radiusTop ?? 1, params.radiusBottom ?? 1, params.height ?? 1, params.radialSegments ?? 32);
    case 'ConeGeometry':
      return new THREE.ConeGeometry(params.radius ?? 1, params.height ?? 1, params.radialSegments ?? 32);
    case 'CircleGeometry':
      return new THREE.CircleGeometry(params.radius ?? 1, params.segments ?? 32);
    case 'TorusGeometry':
      return new THREE.TorusGeometry(params.radius ?? 1, params.tube ?? 0.4, params.radialSegments ?? 12, params.tubularSegments ?? 48);
    default:
      return null;
  }
}

async function createMaterial(config = {}) {
  const type = config.type || 'MeshStandardMaterial';
  const base = {
    color: config.color ?? 0xffffff,
    side: config.side ?? THREE.FrontSide,
    wireframe: Boolean(config.wireframe),
    transparent: Boolean(config.transparent),
    opacity: config.opacity ?? 1,
    depthTest: config.depthTest ?? true,
    depthWrite: config.depthWrite ?? true,
    toneMapped: config.toneMapped ?? true
  };

  if (config.map?.textureUrl) {
    try {
      const texture = await new THREE.TextureLoader().loadAsync(config.map.textureUrl);
      texture.colorSpace = config.map.colorSpace?.includes('srgb') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = config.map.wrapS ?? THREE.ClampToEdgeWrapping;
      texture.wrapT = config.map.wrapT ?? THREE.ClampToEdgeWrapping;
      if (config.map.repeat) texture.repeat.set(config.map.repeat.x ?? 1, config.map.repeat.y ?? 1);
      if (config.map.offset) texture.offset.set(config.map.offset.x ?? 0, config.map.offset.y ?? 0);
      texture.rotation = config.map.rotation ?? 0;
      base.map = texture;
    } catch (error) {
      console.warn('Texture load failed:', error);
    }
  }

  if (type === 'MeshBasicMaterial' || type === 'ShaderMaterial') return new THREE.MeshBasicMaterial(base);
  if (type === 'MeshPhongMaterial') return new THREE.MeshPhongMaterial({ ...base, shininess: config.shininess ?? 30 });
  return new THREE.MeshStandardMaterial({
    ...base,
    metalness: config.metalness ?? 0,
    roughness: config.roughness ?? 1,
    emissive: config.emissive ?? 0x000000,
    emissiveIntensity: config.emissiveIntensity ?? 1,
    envMapIntensity: config.envMapIntensity ?? 1
  });
}

async function loadModel(url, options = {}) {
  if (!url) throw new Error('模型地址为空');
  const gltf = await gltfLoader.loadAsync(url);
  const model = gltf.scene || gltf.scenes?.[0];
  if (!model) throw new Error('GLTF 中没有 scene');
  model.name = model.name || url.split('/').pop() || 'GLBModel';
  model.traverse(child => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material?.map) child.material.map.colorSpace = THREE.SRGBColorSpace;
  });

  if (gltf.animations?.length) {
    const mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach(clip => mixer.clipAction(clip).play());
    mixers.push(mixer);
  }

  if (options.addToRoot !== false) {
    root.add(model);
    previewWater.addModel(model);
    frameObject(model);
    const waterStatus = previewWater.getStatus();
    setStatus(`已加载模型:\n${url}\n动画数量: ${gltf.animations?.length || 0}${waterStatus.active ? `\n水面细波纹: 已恢复 ${waterStatus.materials} 个材质` : ''}`);
  }
  return model;
}

async function loadModelFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    await loadModel(url, { source: 'file' });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function normalizeModelCores(modelCores) {
  if (Array.isArray(modelCores)) return modelCores;
  if (modelCores?.list && Array.isArray(modelCores.list)) return modelCores.list;
  return [];
}

function collectModelItems(config) {
  const explicit = normalizeModelCores(config.modelCores);
  const found = [...explicit];
  const looseUrls = new Set();

  walkJson(config, (value, parent) => {
    if (!isGltfUrl(value)) return;
    const isExplicit = explicit.some(item => (item?.modelInfo?.url || item?.url) === value);
    if (isExplicit || looseUrls.has(value)) return;
    looseUrls.add(value);
    found.push({ modelInfo: { url: value, type: value.toLowerCase().endsWith('.glb') ? 'GLB' : 'GLTF' }, group: parent });
  });

  return found;
}

function walkJson(value, visitString, parent = null) {
  if (typeof value === 'string') {
    visitString(value, parent);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => walkJson(item, visitString, parent));
    return;
  }
  Object.values(value).forEach(item => walkJson(item, visitString, value));
}

function isGltfUrl(url = '') {
  const clean = String(url).split('?')[0].toLowerCase();
  return clean.endsWith('.glb') || clean.endsWith('.gltf');
}

function applyTransform(object, config = {}) {
  copyVector(object.position, config.position, object.position);
  copyEuler(object.rotation, config.rotation, object.rotation);
  copyVector(object.scale, config.scale, object.scale);
  object.visible = config.visible ?? true;
  object.renderOrder = config.renderOrder ?? 0;
}

function copyVector(target, value, fallback) {
  if (!value) {
    target.copy(fallback);
    return;
  }
  target.set(value.x ?? fallback.x, value.y ?? fallback.y, value.z ?? fallback.z);
}

function copyEuler(target, value, fallback) {
  if (!value) {
    target.copy(fallback);
    return;
  }
  target.set(value.x ?? fallback.x, value.y ?? fallback.y, value.z ?? fallback.z);
}

function toneMappingFromValue(value) {
  const map = {
    0: THREE.NoToneMapping,
    1: THREE.LinearToneMapping,
    2: THREE.ReinhardToneMapping,
    3: THREE.CineonToneMapping,
    4: THREE.ACESFilmicToneMapping
  };
  return map[value] ?? THREE.ACESFilmicToneMapping;
}

function frameObject(object, config = {}) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    applyCameraConfig(config.perspectiveCamera);
    applyOrbitConfig(config.orbitControls);
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) || 1;
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const direction = new THREE.Vector3(1, 0.8, 1).normalize();

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance * 0.75);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = Math.max(distance * 10, 1000);
  camera.updateProjectionMatrix();
  controls.update();
}

function disposeObject(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        Object.values(material).forEach(value => {
          if (value?.isTexture) value.dispose();
        });
        material.dispose();
      });
    }
  });
}

function toggleObject(object, button) {
  object.visible = !object.visible;
  button.classList.toggle('is-on', object.visible);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixers.forEach(mixer => mixer.update(delta));
  controls.update();
  renderer.render(scene, camera);
}
