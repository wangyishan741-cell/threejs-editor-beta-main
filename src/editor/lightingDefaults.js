import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'

export const SUN_LIGHT_NAME = 'Realistic Sun Key Light'
export const SKY_FILL_NAME = 'Realistic Ambient Fill'
const SUN_TARGET_NAME = 'Realistic Sun Target'
const SHADOW_FLOOR_NAME = 'Realistic Shadow Receiver'
const DISPLAY_GROUND_NAME = '灰色栅格地面'
const LEGACY_DISPLAY_GROUND_NAME = 'Realistic Display Ground'
const ATMOSPHERE_SKY_NAME = 'Realistic Atmosphere Sky'
const NEUTRAL_SUN_COLOR = 0xf7f9ff
const NEUTRAL_AMBIENT_COLOR = 0xeef4ff
const LEGACY_AMBIENT_INTENSITY = 0.06
const SETTINGS_VERSION = 7

export const REALISTIC_LIGHTING_STORAGE_KEY = 'new_realistic_lighting_settings'
export const REALISTIC_LIGHTING_DEFAULTS = {
  version: SETTINGS_VERSION,
  sunIntensity: 0.9,
  ambientIntensity: 0.35,
  exposure: 0.55,
  skyEnabled: true,
  shadowFloorEnabled: false,
  ambientOcclusionEnabled: false,
}

const scratchBox = new THREE.Box3()
const scratchSize = new THREE.Vector3()
const scratchCenter = new THREE.Vector3()
const scratchShadowSize = new THREE.Vector3()

function createGridGroundTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#9da3a9'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(82, 88, 94, 0.36)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(68, 74, 80, 0.48)'
  ctx.lineWidth = 1.5
  for (let i = 0; i <= 256; i += 128) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function createGridGroundMaterial() {
  const texture = createGridGroundTexture()
  return new THREE.MeshBasicMaterial({
    color: 0xb0b5ba,
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
}

function getMaterials(material) {
  if (!material) return []
  return Array.isArray(material) ? material.filter(Boolean) : [material]
}

function isTransparentEffectMaterial(material) {
  if (!material) return true
  if (material.userData?.keepUnlit) return true
  if (material.transparent || material.opacity < 0.98) return true
  if (material.blending && material.blending !== THREE.NormalBlending) return true
  if (material.isSpriteMaterial || material.isShaderMaterial) return true
  return false
}

function createLitMaterial(material) {
  const color = material.color?.clone?.() || new THREE.Color(0xffffff)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  if (!material.map && hsl.s < 0.12 && hsl.l > 0.82) {
    color.setHSL(hsl.h, hsl.s, 0.72)
  }

  const lit = new THREE.MeshStandardMaterial({
    name: material.name,
    color,
    map: material.map || null,
    alphaMap: material.alphaMap || null,
    aoMap: material.aoMap || null,
    lightMap: material.lightMap || null,
    normalMap: material.normalMap || null,
    roughnessMap: material.roughnessMap || null,
    metalnessMap: material.metalnessMap || null,
    emissiveMap: material.emissiveMap || null,
    emissive: material.emissive?.clone?.() || new THREE.Color(0x000000),
    emissiveIntensity: material.emissiveIntensity ?? 0,
    opacity: material.opacity,
    transparent: material.transparent,
    side: material.side === THREE.FrontSide ? THREE.DoubleSide : material.side,
    vertexColors: material.vertexColors,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    roughness: 0.78,
    metalness: 0.02,
  })

  lit.userData = {
    ...(material.userData || {}),
    upgradedFromUnlit: true,
  }
  return lit
}

function upgradeMaterial(material) {
  if (Array.isArray(material)) {
    let changed = false
    const next = material.map(item => {
      if (!item?.isMeshBasicMaterial || isTransparentEffectMaterial(item)) return item
      changed = true
      return createLitMaterial(item)
    })
    return changed ? next : material
  }

  if (!material?.isMeshBasicMaterial || isTransparentEffectMaterial(material)) return material
  return createLitMaterial(material)
}

function getContentBox(scene) {
  const box = new THREE.Box3()
  let hasMesh = false

  scene?.traverse?.(child => {
    if (!child.visible || !child.isMesh || child.isLight || child.isCamera) return
    if (child.name === SHADOW_FLOOR_NAME || child.name === DISPLAY_GROUND_NAME || child.name === LEGACY_DISPLAY_GROUND_NAME) return
    const name = `${child.name || ''} ${child.parent?.name || ''}`.toLowerCase()
    if (/helper|grid|axis|transform|control|sky|cloud/.test(name)) return

    scratchBox.setFromObject(child)
    if (Number.isFinite(scratchBox.min.x) && Number.isFinite(scratchBox.max.x)) {
      box.union(scratchBox)
      hasMesh = true
    }
  })

  return hasMesh ? box : null
}

export function getRealisticLightingSettings() {
  let stored = {}
  try {
    stored = JSON.parse(window.localStorage.getItem(REALISTIC_LIGHTING_STORAGE_KEY) || '{}') || {}
  } catch (error) {}
  if (stored.version !== SETTINGS_VERSION) return { ...REALISTIC_LIGHTING_DEFAULTS }
  return {
    ...REALISTIC_LIGHTING_DEFAULTS,
    ...stored,
  }
}

export function setRealisticLightingSettings(settings, editor) {
  const next = {
    ...getRealisticLightingSettings(),
    ...settings,
  }
  try {
    window.localStorage.setItem(REALISTIC_LIGHTING_STORAGE_KEY, JSON.stringify(next))
  } catch (error) {}
  if (editor) applyRealisticLightingDefaults(editor, next)
  return next
}

function ensureAtmosphereSky(scene, target, sunDirection, span, enabled) {
  let sky = scene.getObjectByName(ATMOSPHERE_SKY_NAME)
  if (!enabled) {
    if (sky) sky.visible = false
    return
  }
  if (!sky) {
    sky = new Sky()
    sky.name = ATMOSPHERE_SKY_NAME
    sky.editorType = 'isInnerMesh'
    sky.userData.skipEditorTree = true
    sky.userData.skipExport = true
    sky.frustumCulled = false
    sky.castShadow = false
    sky.receiveShadow = false
    sky.raycast = () => {}
    scene.add(sky)
  }

  const uniforms = sky.material?.uniforms
  if (uniforms) {
    uniforms.turbidity.value = 2.2
    uniforms.rayleigh.value = 1.15
    uniforms.mieCoefficient.value = 0.002
    uniforms.mieDirectionalG.value = 0.72
    uniforms.sunPosition.value.copy(sunDirection)
  }

  sky.position.copy(target)
  sky.scale.setScalar(Math.max(span * 80, 120000))
  sky.visible = true
}

function applyAmbientOcclusion(editor, enabled) {
  const pass = editor.effectComposer?.effectPass?.saoPass || editor.effectComposer?.saoPass
  if (!pass) return
  pass.enabled = !!enabled
  if ('saoBias' in pass) pass.saoBias = 0.12
  if ('saoIntensity' in pass) pass.saoIntensity = 0.006
  if ('saoScale' in pass) pass.saoScale = 18
  if ('saoKernelRadius' in pass) pass.saoKernelRadius = 20
}

function isLargeFlatReceiver(object) {
  if (!object?.isMesh) return false
  const name = `${object.name || ''} ${object.parent?.name || ''}`.toLowerCase()
  if (/light|lamp|beam|cone|helper|axis|control/.test(name)) return false

  scratchBox.setFromObject(object)
  if (!Number.isFinite(scratchBox.min.x) || !Number.isFinite(scratchBox.max.x)) return false
  scratchBox.getSize(scratchShadowSize)

  const width = Math.max(scratchShadowSize.x, scratchShadowSize.z)
  const height = scratchShadowSize.y
  return width > 80 && height < Math.max(width * 0.025, 2)
}

export function enableObjectShadows(object, options = {}) {
  const { castShadow = true, receiveShadow = true, maxShadowCasters = 900 } = options
  if (!object) return

  let shadowCasters = 0
  object.castShadow = castShadow
  object.receiveShadow = receiveShadow

  object.traverse?.(child => {
    if (!child.isMesh || !child.material) return
    if (child.geometry && !child.geometry.attributes?.normal) child.geometry.computeVertexNormals()

    child.material = upgradeMaterial(child.material)
    const materials = getMaterials(child.material)
    const effectOnly = materials.every(isTransparentEffectMaterial)
    const receiverOnly = isLargeFlatReceiver(child)

    child.frustumCulled = true
    child.castShadow = castShadow && !effectOnly && !receiverOnly && shadowCasters < maxShadowCasters
    child.receiveShadow = receiveShadow && !effectOnly
    if (child.castShadow) shadowCasters += 1

    materials.forEach(material => {
      if (!material) return
      if (receiverOnly) {
        material.polygonOffset = true
        material.polygonOffsetFactor = 1
        material.polygonOffsetUnits = 1
      }
      const color = material.color
      if (color && !material.map) {
        const hsl = { h: 0, s: 0, l: 0 }
        color.getHSL(hsl)
        if (hsl.s < 0.12 && hsl.l > 0.82) color.setHSL(hsl.h, hsl.s, 0.72)
      }
      if ('roughness' in material) material.roughness = Math.max(material.roughness ?? 0.6, 0.72)
      if ('metalness' in material) material.metalness = Math.min(material.metalness ?? 0, 0.08)
      if ('envMapIntensity' in material) material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.35)
      material.needsUpdate = true
    })
  })
}

function ensureShadowFloor(editor) {
  const { scene } = editor
  const contentBox = getContentBox(scene)
  const size = new THREE.Vector3(1000, 80, 1000)
  const center = new THREE.Vector3(0, 0, 0)

  if (contentBox) {
    contentBox.getSize(size)
    contentBox.getCenter(center)
  }

  const floorWidth = Math.min(Math.max(size.x * 1.4 + 320, 1600), 12000)
  const floorDepth = Math.min(Math.max(size.z * 1.4 + 320, 1600), 12000)
  const groundY = 0

  const legacyShadowReceiver = scene.getObjectByName(SHADOW_FLOOR_NAME)
  if (legacyShadowReceiver) legacyShadowReceiver.visible = false

  let displayGround = scene.getObjectByName(DISPLAY_GROUND_NAME) || scene.getObjectByName(LEGACY_DISPLAY_GROUND_NAME)
  if (!displayGround) {
    const geometry = new THREE.PlaneGeometry(1, 1)
    const material = createGridGroundMaterial()
    displayGround = new THREE.Mesh(geometry, material)
    scene.add(displayGround)
  } else {
    if (!displayGround.geometry?.isPlaneGeometry) {
      displayGround.geometry?.dispose?.()
      displayGround.geometry = new THREE.PlaneGeometry(1, 1)
    }
    if (!displayGround.material?.isMeshBasicMaterial || !displayGround.material?.map) {
      displayGround.material?.dispose?.()
      displayGround.material = createGridGroundMaterial()
    }
    const materials = getMaterials(displayGround.material)
    materials.forEach(material => {
      if (!material) return
      if (!material.isMeshBasicMaterial) {
        displayGround.material?.dispose?.()
        displayGround.material = createGridGroundMaterial()
        return
      }
      material.color?.set?.(0xb0b5ba)
      material.toneMapped = false
      material.polygonOffset = true
      material.polygonOffsetFactor = 1
      material.polygonOffsetUnits = 1
      if (material.map) {
        material.map.repeat.set(Math.max(floorWidth / 256, 1), Math.max(floorDepth / 256, 1))
        material.map.needsUpdate = true
      }
      material.needsUpdate = true
    })
  }

  displayGround.name = DISPLAY_GROUND_NAME
  displayGround.editorType = 'isInnerMesh'
  displayGround.castShadow = false
  displayGround.receiveShadow = false
  displayGround.userData = {
    ...(displayGround.userData || {}),
    isInitialGridGround: true,
  }
  delete displayGround.userData.skipExport
  delete displayGround.userData.skipEditorTree
  displayGround.position.set(center.x, groundY, center.z)
  displayGround.rotation.set(-Math.PI / 2, 0, 0)
  displayGround.scale.set(floorWidth, floorDepth, 1)
  displayGround.receiveShadow = true
  displayGround.visible = true
}

function disposeObjectResources(object) {
  object?.traverse?.(child => {
    child.geometry?.dispose?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach(material => {
      Object.keys(material).forEach(key => {
        const value = material[key]
        if (value?.isTexture) value.dispose?.()
      })
      material.dispose?.()
    })
  })
}

function removeGeneratedGround(scene) {
  ;[SHADOW_FLOOR_NAME, DISPLAY_GROUND_NAME, LEGACY_DISPLAY_GROUND_NAME].forEach(name => {
    const object = scene.getObjectByName(name)
    if (!object) return
    disposeObjectResources(object)
    object.parent?.remove(object)
  })
}

export function applyRealisticLightingDefaults(editor, overrideSettings = {}) {
  if (!editor?.scene || !editor?.renderer) return
  if (editor.__nanjingRestoreActive) return

  const settings = {
    ...getRealisticLightingSettings(),
    ...overrideSettings,
  }
  const { scene, renderer } = editor
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = true
  renderer.shadowMap.needsUpdate = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = settings.exposure
  applyAmbientOcclusion(editor, settings.ambientOcclusionEnabled)

  const contentBox = getContentBox(scene)
  const contentSize = new THREE.Vector3(1000, 1000, 1000)
  const target = editor.controls?.target?.clone?.() || new THREE.Vector3()
  if (contentBox) {
    contentBox.getSize(contentSize)
    contentBox.getCenter(scratchCenter)
    target.copy(scratchCenter)
  }

  scene.traverse(child => {
    if (child.isAmbientLight && child.name !== SKY_FILL_NAME) {
      child.intensity = Math.min(child.intensity ?? LEGACY_AMBIENT_INTENSITY, LEGACY_AMBIENT_INTENSITY)
    }
  })

  let ambient = scene.getObjectByName(SKY_FILL_NAME)
  if (!ambient) {
    ambient = new THREE.AmbientLight(NEUTRAL_AMBIENT_COLOR, settings.ambientIntensity)
    ambient.name = SKY_FILL_NAME
    ambient.editorType = 'isLight'
    scene.add(ambient)
  } else {
    ambient.color.set(NEUTRAL_AMBIENT_COLOR)
    ambient.intensity = settings.ambientIntensity
  }

  let sun = scene.getObjectByName(SUN_LIGHT_NAME)
  if (!sun) {
    sun = new THREE.DirectionalLight(NEUTRAL_SUN_COLOR, settings.sunIntensity)
    sun.name = SUN_LIGHT_NAME
    sun.editorType = 'isLight'
    scene.add(sun)
  } else {
    sun.color.set(NEUTRAL_SUN_COLOR)
    sun.intensity = settings.sunIntensity
  }

  const span = Math.max(contentSize.x, contentSize.y, contentSize.z, 800)
  const lightDistance = Math.min(Math.max(span * 0.9, 800), 6000)
  const shadowExtent = Math.min(Math.max(Math.max(contentSize.x, contentSize.z) * 0.65, 600), 4200)
  sun.position.set(target.x - lightDistance * 0.65, target.y + lightDistance * 1.1, target.z + lightDistance * 0.45)
  sun.castShadow = true
  sun.shadow.bias = 0.00008
  sun.shadow.normalBias = 0.08
  sun.shadow.radius = 1.5
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = lightDistance * 4
  sun.shadow.camera.left = -shadowExtent
  sun.shadow.camera.right = shadowExtent
  sun.shadow.camera.top = shadowExtent
  sun.shadow.camera.bottom = -shadowExtent
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.needsUpdate = true

  if (!sun.target || !sun.target.parent) {
    const sunTarget = sun.target || new THREE.Object3D()
    sunTarget.name = SUN_TARGET_NAME
    scene.add(sunTarget)
    sun.target = sunTarget
  }
  sun.target.position.copy(target)
  sun.target.updateMatrixWorld()

  const sunDirection = scratchSize.copy(sun.position).sub(target).normalize()
  ensureAtmosphereSky(scene, target, sunDirection, span, settings.skyEnabled)

  scene.traverse(child => {
    if (child.isMesh && child.name !== SHADOW_FLOOR_NAME && child.name !== DISPLAY_GROUND_NAME) enableObjectShadows(child)
  })
  if (settings.shadowFloorEnabled) {
    ensureShadowFloor(editor)
  } else {
    removeGeneratedGround(scene)
  }
}

export function scheduleRealisticLightingRefresh(editor) {
  if (!editor) return
  applyRealisticLightingDefaults(editor)
  requestAnimationFrame(() => applyRealisticLightingDefaults(editor))
  ;[300, 1000, 2500].forEach(delay => {
    window.setTimeout(() => applyRealisticLightingDefaults(editor), delay)
  })
}
