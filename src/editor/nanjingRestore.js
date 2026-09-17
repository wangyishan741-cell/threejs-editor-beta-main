import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { createNanjingInstancing } from './nanjingInstancing.js'
import { createNanjingProfiler, isNanjingBenchmarkBaseline } from './nanjingProfiler.js'
import { getNanjingDeviceProfile, isNanjingMacPlatform } from './nanjingDeviceProfile.js'
import { createNanjingFrameBudget } from './nanjingFrameBudget.js'
import { readNanjingDisplayQuality, writeNanjingDisplayQuality, resolveNanjingDisplayQuality, snapshotNanjingDisplayQuality } from './nanjingDisplayQuality.js'
import { createNanjingLod } from './nanjingLod.js'
import { loadNanjingTrunkLodBuilder, NANJING_TRUNK_LOD_DEFAULTS } from './nanjingTrunkLod.js'
import { createNanjingSelection } from './nanjingSelection.js'
import { createNanjingClarity } from './nanjingClarity.js'
import { createNanjingShadows } from './nanjingShadows.js'
import { compareNanjingShadows } from './nanjingShadowComparison.js'
import { compareNanjingGlass } from './nanjingGlassComparison.js'
import { createNanjingSurfaceLighting } from './nanjingSurfaceLighting.js'
import { createNanjingEnvironmentColorBalance } from './nanjingEnvironmentColorBalance.js'
import { compareNanjingSurfaceLighting } from './nanjingSurfaceComparison.js'
import { createNanjingParameterComparison, NANJING_PARAMETER_COMPARISON_VIEWS } from './nanjingParameterComparison.js'
import { repairNanjingFoliageTexture } from './nanjingFoliageTexture.js'
import { restoreNanjingMaterialBindings } from './nanjingMaterialBindings.js'
import { createNanjingGuiInvalidation } from './nanjingGuiInvalidation.js'
import { createNanjingAssetInvalidation } from './nanjingAssetInvalidation.js'
import { createNanjingAppearanceClient, fetchNanjingAppearance } from './nanjingAppearanceClient.js'
import { mergeNanjingAppearance } from './nanjingAppearanceSync.js'
export { readNanjingSharedAppearance } from './nanjingAppearanceClient.js'
import { createNanjingFog, NANJING_FOG_DEFAULTS } from './nanjingFog.js'
import { createNanjingTransparentShadows } from './nanjingTransparentShadows.js'
import { createNanjingContactShadows } from './nanjingContactShadows.js'
import { createNanjingTransparency } from './nanjingTransparency.js'
import { createNanjingTransparentBlocks } from './nanjingTransparentBlocks.js'
import { createNanjingFoliageZeroAlpha } from './nanjingFoliageZeroAlpha.js'
import { applyNanjingContextMaterial } from './nanjingContextMaterial.js'
import { applyNanjingCurbMaterial } from './nanjingCurbMaterial.js'
import { createNanjingRoadLevels } from './nanjingRoadLevels.js'
import { createNanjingTreePlacements } from './nanjingTreePlacements.js'
import { createNanjingTreeDensity } from './nanjingTreeDensity.js'
import { createNanjingWaterSurface } from './nanjingWaterSurface.js'
import { suppressNanjingImportedUtilities } from './nanjingImportedUtilities.js'
import { applyRequestedWaterUpdate } from './nanjingRequestedWaterUpdate.js'
import { createNanjingInternalRoadSurfaces } from './nanjingInternalRoadSurfaces.js'
import { createNanjingContextTextures } from './nanjingContextTextures.js'
import { createNanjingFacadeFrameFinish } from './nanjingFacadeFrameFinish.js'
import { createNanjingRoadMarkingRecovery } from './nanjingRoadMarkingRecovery.js'
import { createNanjingJunctionPaving } from './nanjingJunctionPaving.js'
import { createNanjingMaterialTangents } from './nanjingMaterialTangents.js'
import { createNanjingGroundOrder } from './nanjingGroundOrder.js'
import { migrateNanjingGlassComposition, setNanjingGlassComposition } from './nanjingGlassComposition.js'
import { createNanjingBuildingReflections, createNanjingReflectionResources } from './nanjingReflections.js'
import { prepareNanjingFacadeCladding } from './nanjingFacadeCladding.js'
import { prepareNanjingRoofEquipment } from './nanjingRoofEquipment.js'
import { createNanjingDistantBuildingTexture } from './nanjingDistantBuildingTexture.js'
import { prepareNanjingFacadeGlazing, applyNanjingFacadeGlazingMode } from './nanjingFacadeGlazing.js'
import { saveProjectScene } from './projectRecords.js'
import { publishNanjingProjectSnapshot, nanjingSnapshotEditorUrl } from './nanjingProjectSharing.js'
import { isProjectHistoryRestore, captureNanjingProjectSnapshot, restoreNanjingProjectSnapshot } from './nanjingProjectSnapshot.js'
import { createNanjingWorkspacePanel } from './nanjingWorkspacePanel.js'
import './nanjingWorkspacePanel.css'
import { readNanjingLightingControls, updateNanjingLightingControls } from './nanjingLightingControls.js'
import { restoreProjectLightingBackgrounds } from './lightingDefaults.js'

export const NANJING_SCENE_NAME = '南京数智城A地块 · Blender还原'
const CONFIG_URL = '/nanjing-restore/reference-73trees-3db12591b264.json'
const MODEL_URL = '/nanjing-restore/nanjing-0911-36c1aee71981.glb'
const METADATA_KEY = 'nanjingRestore'
const NANJING_916_DISTANT_GLASS = Object.freeze({
  roughness: 0.79, metalness: 1, transmission: 0, ior: 1, opacity: 0.6,
  alphaTest: 0, emissiveIntensity: 0.5, envMapIntensity: 1, clearcoat: 0,
  clearcoatRoughness: 0, thickness: 0, specularIntensity: 1, sheen: 0,
  sheenRoughness: 1, iridescence: 0, iridescenceIOR: 1.3, bumpScale: 1,
  aoMapIntensity: 1, side: 2, polygonOffsetFactor: 0, polygonOffsetUnits: 0,
  transparent: true, depthWrite: false, depthTest: true, wireframe: false,
  toneMapped: true, vertexColors: false, alphaToCoverage: false, polygonOffset: false,
  forceSinglePass: false, color: [0.8713671191959567, 0.9215818562755338, 1],
  emissive: [1, 1, 1], specularColor: [0, 0, 0], sheenColor: [0, 0, 0],
  attenuationColor: [1, 1, 1]
})
const NANJING_ORIGINAL_ENVIRONMENT_BALANCE = Object.freeze({
  version: 1, enabled: true, gains: [2.422016243249, 0.946907197286, 0.460104586885], scope: 'lighting-only'
})
const MATERIAL_NUMBERS = ['roughness', 'metalness', 'transmission', 'ior', 'opacity', 'alphaTest', 'emissiveIntensity', 'envMapIntensity', 'clearcoat', 'clearcoatRoughness', 'thickness', 'specularIntensity', 'sheen', 'sheenRoughness', 'iridescence', 'iridescenceIOR', 'attenuationDistance', 'bumpScale', 'aoMapIntensity', 'side', 'shadowSide', 'polygonOffsetFactor', 'polygonOffsetUnits']
const MATERIAL_BOOLEANS = ['transparent', 'depthWrite', 'depthTest', 'wireframe', 'toneMapped', 'vertexColors', 'alphaToCoverage', 'polygonOffset', 'forceSinglePass']
const MATERIAL_COLORS = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor']
const PHYSICAL_FIELDS = ['transmission', 'ior', 'clearcoat', 'thickness', 'specularIntensity', 'sheen', 'iridescence']

function projectDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nanjingRestoreProjects', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scenes')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readNanjingSavedScene(params, sceneName) {
  if (params?.[METADATA_KEY]?.storage !== 'indexedDB') return params
  const db = await projectDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('scenes').objectStore('scenes').get(sceneName)
      request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('找不到已保存的南京工程'))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export function isNanjingRestoreRoute() {
  const hashQuery = window.location.hash.split('?')[1] || ''
  return new URLSearchParams(hashQuery).get('restore') === 'nanjing'
    || new URLSearchParams(window.location.search).get('restore') === 'nanjing'
}

export function prepareNanjingSceneParams(params, sceneName) {
  if (isProjectHistoryRestore(params) && params?.[METADATA_KEY]) return params
  if (params?.[METADATA_KEY]) {
    if (params[METADATA_KEY].modelUrl === MODEL_URL && params[METADATA_KEY].configUrl === CONFIG_URL) return params
    const previous = params[METADATA_KEY].config || {}
    // A new reference replaces its camera, lights and environment together.
    // Keep client quality/shadow preferences, without copying old mesh materials.
    const preserveKeys = params[METADATA_KEY].configUrl === CONFIG_URL
      ? ['camera', 'renderer', 'lights', 'environment', 'helpers', 'background', 'performance', 'shadows', 'shadowLayers', 'fog', 'transparentShadows', 'contactShadows', 'surfaceLighting']
      : ['performance', 'shadows', 'shadowLayers', 'helpers', 'fog', 'transparentShadows', 'contactShadows', 'surfaceLighting']
    const preservedConfig = Object.fromEntries(preserveKeys.filter(key => previous[key] !== undefined).map(key => [key, previous[key]]))
    if (params[METADATA_KEY].configUrl !== CONFIG_URL && previous.surfaceLighting && typeof previous.surfaceLighting === 'object') {
      // A different reference has different source lights/materials. Keep the
      // chosen amount without reusing numerical baselines from the old model.
      preservedConfig.surfaceLighting = { version: 1, enabled: previous.surfaceLighting.enabled !== false,
        amount: previous.surfaceLighting.amount }
    }
    return { ...params, modelCores: [], [METADATA_KEY]: { version: 2, configUrl: CONFIG_URL, modelUrl: MODEL_URL, preservedConfig } }
  }
  if (!isNanjingRestoreRoute() || sceneName !== NANJING_SCENE_NAME) return params
  return { ...params, lightCores: [], modelCores: [], innerCores: [], designCores: [], [METADATA_KEY]: { version: 2, configUrl: CONFIG_URL, modelUrl: MODEL_URL } }
}

function setVector(target, value) {
  if (!target || !value) return
  if (Array.isArray(value)) target.set(...value)
  else target.set(value.x, value.y, value.z)
}

function setColor(target, value) {
  if (!target || value == null) return
  if (Array.isArray(value)) target.setRGB(value[0], value[1], value[2], THREE.LinearSRGBColorSpace)
  else target.set(value)
}

function resolveNanjingEnvironmentUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('blob:nanjing-hdr:')) return url
  const name = url.slice('blob:nanjing-hdr:'.length)
  const item = globalThis.window?.threeEditorDB?.list?.find(entry => entry.name === name)
  return item?.blob ? URL.createObjectURL(item.blob) : url
}

function materialRules(config) {
  return Array.isArray(config.materials)
    ? config.materials
    : Object.entries(config.materials || {}).map(([name, props]) => ({ name, ...props }))
}

function migrateNanjingConfig(config) {
  if ((config.renderFixVersion || 0) >= 3) return config
  // Restore the original blended foliage appearance requested by the user.
  const foliage = { transparent: true, alphaTest: 0, depthWrite: false, side: THREE.DoubleSide }
  if (Array.isArray(config.materials)) {
    const existing = config.materials.find(rule => rule.name === 'Material_25')
    if (existing) Object.assign(existing, foliage)
    else config.materials.push({ name: 'Material_25', ...foliage })
  } else {
    config.materials ||= {}
    config.materials.Material_25 = { ...config.materials.Material_25, ...foliage }
  }
  config.renderFixVersion = 3
  return config
}

function applyMaterials(editor, config) {
  const rules = materialRules(config)
  const exact = new Map(rules.filter(rule => rule.name).map(rule => [rule.name, rule]))
  const patterns = rules.filter(rule => rule.match).map(rule => ({ ...rule, regex: new RegExp(rule.match) }))
  const patched = new Map()
  let meshCount = 0
  editor.scene.traverse(object => {
    if (!object.isMesh || !object.material || object.userData?.nanjingUtility) return
    meshCount += 1
    if (!object.geometry?.attributes?.normal) object.geometry?.computeVertexNormals()
    const transform = source => {
      if (patched.has(source)) return patched.get(source)
      const props = { ...config.materialDefaults, ...patterns.find(rule => rule.regex.test(source.name)), ...exact.get(source.name) }
      let material = source
      if (!source.isMeshPhysicalMaterial && (props.type === 'MeshPhysicalMaterial' || PHYSICAL_FIELDS.some(key => props[key] != null))) {
        material = new THREE.MeshPhysicalMaterial()
        // Copy the common standard-material fields, preserving all GLB textures.
        if (source.isMeshStandardMaterial) {
          THREE.MeshStandardMaterial.prototype.copy.call(material, source)
          material.defines = { STANDARD: '', PHYSICAL: '' }
        }
        else {
          for (const key of [...MATERIAL_NUMBERS, ...MATERIAL_BOOLEANS]) if (source[key] != null && key in material) material[key] = source[key]
          material.name = source.name
          material.userData = { ...source.userData }
          setColor(material.color, source.color?.toArray())
          for (const key of Object.keys(source)) if (source[key]?.isTexture) material[key] = source[key]
        }
      }
      for (const key of MATERIAL_NUMBERS) if (props[key] != null && key in material) material[key] = props[key]
      for (const key of MATERIAL_BOOLEANS) if (props[key] != null && key in material) material[key] = !!props[key]
      for (const key of MATERIAL_COLORS) setColor(material[key], props[key])
      if (props.normalScale) setVector(material.normalScale, props.normalScale)
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
        if (props[key] === null) material[key] = null
        const texture = material[key]
        if (texture) texture.anisotropy = Math.min(16, editor.renderer.capabilities.getMaxAnisotropy())
      }
      material.needsUpdate = true
      patched.set(source, material)
      return material
    }
    object.material = Array.isArray(object.material) ? object.material.map(transform) : transform(object.material)
    // Apply legacy name-based defaults only on first load. A later GLB/material
    // refresh must not overwrite individual edits on already-loaded collections.
    if (!editor.modelCollectionEdits?.shouldPreserveObjectState(object)) {
      object.castShadow = config.shadows?.castShadow ?? true
      object.receiveShadow = config.shadows?.receiveShadow ?? true
      const objectProps = config.objects?.[object.name]
      if (objectProps) {
        for (const key of ['visible', 'castShadow', 'receiveShadow', 'renderOrder']) if (objectProps[key] != null) object[key] = objectProps[key]
        for (const key of ['position', 'rotation', 'scale']) setVector(object[key], objectProps[key])
      }
    }
  })
  // The editor serializes this material list separately from the GLB hierarchy.
  editor.scene.children.filter(object => object.editorType === 'isModelGroup').forEach(root => {
    const materials = new Set()
    root.traverse(object => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach(material => materials.add(material)))
    root.RootMaterials = [...materials]
    if (root.modelConfig) Object.assign(root.modelConfig, { isSaveChildren: true, isSaveMaterials: true, useGlobalMaterial: false, useGlobalShadow: false })
  })
  return { meshes: meshCount, materials: patched.size, foliageMaterials: [...patched.values()].filter(material => material.name === 'Material_25') }
}

function applyLights(editor, config) {
  RectAreaLightUniformsLib.init()
  const supported = new Set(['AmbientLight', 'DirectionalLight', 'HemisphereLight', 'PointLight', 'SpotLight', 'RectAreaLight'])
  for (const object of [...editor.scene.children]) {
    if (object.isLight || object.userData?.nanjingLightTarget || ['Realistic Atmosphere Sky', '灰色栅格地面', 'Realistic Shadow Receiver', 'Realistic Sun Target'].includes(object.name)) {
      object.parent?.remove(object)
      object.shadow?.map?.dispose()
    }
  }
  for (const item of config.lights || []) {
    if (!supported.has(item.type)) continue
    const light = new THREE[item.type]()
    light.name = item.name || item.type
    light.editorType = 'isLight'
    setColor(light.color, item.color ?? '#ffffff')
    if (light.groundColor) setColor(light.groundColor, item.groundColor ?? '#808080')
    for (const key of ['intensity', 'distance', 'decay', 'angle', 'penumbra', 'width', 'height', 'visible']) if (item[key] != null) light[key] = item[key]
    setVector(light.position, item.position)
    setVector(light.rotation, item.rotation)
    light.castShadow = !!item.castShadow
    if (light.target) {
      setVector(light.target.position, item.target || [0, 0, 0])
      light.target.userData.nanjingLightTarget = true
      light.target.name = `${light.name} Target`
      editor.scene.add(light.target)
    }
    else if (item.target) {
      const target = new THREE.Vector3()
      setVector(target, item.target)
      light.lookAt(target)
    }
    if (light.shadow) {
      const shadow = item.shadow || {}
      const mapSize = shadow.mapSize || 2048
      light.shadow.mapSize.set(...(Array.isArray(mapSize) ? mapSize : [mapSize, mapSize]))
      for (const key of ['bias', 'normalBias', 'radius', 'intensity']) if (shadow[key] != null) light.shadow[key] = shadow[key]
      const camera = light.shadow.camera
      if (shadow.extent && camera.isOrthographicCamera) Object.assign(camera, { left: -shadow.extent, right: shadow.extent, top: shadow.extent, bottom: -shadow.extent })
      Object.assign(camera, shadow.camera || {})
      if (shadow.near != null) camera.near = shadow.near
      if (shadow.far != null) camera.far = shadow.far
      camera.updateProjectionMatrix()
    }
    editor.scene.add(light)
  }
}

async function applyEnvironment(editor, config, state, isCurrent = () => true) {
  if (!isCurrent()) return
  const environment = config.environment || {}
  const environmentUrl = resolveNanjingEnvironmentUrl(environment.url)
  const loaderHint = environment.url || environmentUrl
  const previousTexture = state.environmentTexture
  const previousSkySource = state.environmentSourceTexture
  state.environmentColorBalance ||= createNanjingEnvironmentColorBalance()
  if (!environment.url) {
    editor.scene.environment = null
    if (editor.scene.background === previousTexture || editor.scene.background === previousSkySource) editor.scene.background = null
    state.environmentColorBalance.update(null, false)
    state.environmentSourceTexture?.dispose()
    state.environmentSourceTexture = null
    state.environmentTexture = null
    state.environmentUrl = null
    return
  }
  let source = state.environmentSourceTexture
  let loaded = false
  if (!source || state.environmentUrl !== environmentUrl) {
    const Loader = /\.exr(?:\?|$)/i.test(loaderHint) ? EXRLoader : /\.hdr(?:\?|$)/i.test(loaderHint) ? RGBELoader : THREE.TextureLoader
    source = await new Loader().loadAsync(environmentUrl)
    if (!isCurrent()) { source.dispose(); return }
    source.mapping = THREE.EquirectangularReflectionMapping
    if (Loader === THREE.TextureLoader) source.colorSpace = THREE.SRGBColorSpace
    loaded = true
  }
  let texture
  try {
    texture = state.environmentColorBalance.update(source, environment.colorBalance)
  } catch (error) {
    if (loaded) source.dispose()
    throw error
  }
  const previousSource = state.environmentSourceTexture
  state.environmentSourceTexture = source
  state.environmentTexture = texture
  state.environmentUrl = environmentUrl
  editor.scene.environment = texture
  editor.scene.environmentIntensity = environment.intensity ?? 1
  setVector(editor.scene.environmentRotation, environment.rotation || [0, 0, 0])
  if (environment.background) {
    editor.scene.background = state.environmentColorBalance.getStatus().scope === 'lighting-only' ? source : texture
    editor.scene.backgroundIntensity = environment.backgroundIntensity ?? environment.intensity ?? 1
    setVector(editor.scene.backgroundRotation, environment.rotation || [0, 0, 0])
  } else if (editor.scene.background === previousTexture || editor.scene.background === previousSkySource) {
    editor.scene.background = null
  }
  if (loaded && previousSource !== source) previousSource?.dispose()
}

function snapshotConfig(editor, state) {
  const config = structuredClone(state.config || {})
  const materialNumberDefaults = { roughness: 1, metalness: 0, transmission: 0, ior: 1.5, opacity: 1,
    alphaTest: 0, emissiveIntensity: 1, envMapIntensity: 1, clearcoat: 0, clearcoatRoughness: 0,
    thickness: 0, specularIntensity: 1, sheen: 0, sheenRoughness: 1, iridescence: 0,
    iridescenceIOR: 1.3, bumpScale: 1, aoMapIntensity: 1, lightMapIntensity: 1, side: 0,
    polygonOffsetFactor: 0, polygonOffsetUnits: 0, anisotropy: 0, anisotropyRotation: 0,
    displacementScale: 1, displacementBias: 0, normalMapType: 0 }
  const materialBooleanDefaults = { transparent: false, depthWrite: true, depthTest: true,
    wireframe: false, toneMapped: true, vertexColors: false, alphaToCoverage: false,
    polygonOffset: false, forceSinglePass: false }
  const materialColorDefaults = { color: [1, 1, 1], emissive: [0, 0, 0], specularColor: [1, 1, 1],
    sheenColor: [0, 0, 0], attenuationColor: [1, 1, 1] }
  config.sceneName = state.getProjectName?.() || NANJING_SCENE_NAME
  config.camera = { position: editor.camera.position.toArray(), target: editor.controls.target.toArray(), fov: editor.camera.fov, near: editor.camera.near, far: editor.camera.far, zoom: editor.camera.zoom }
  config.renderer = { ...config.renderer, toneMapping: editor.renderer.toneMapping, exposure: editor.renderer.toneMappingExposure }
  config.performance = { ...config.performance, gpuInstancing: state.instancing?.enabled !== false, quality: snapshotNanjingDisplayQuality(state),
    foliageZeroAlpha: state.foliageZeroAlpha?.getStatus().configuredEnabled ?? (config.performance?.foliageZeroAlpha === true) }
  if (state.shadows) config.shadows = { ...config.shadows, sampling: state.shadows.getStatus().settings }
  if (state.fog) {
    const fog = state.fog.getStatus()
    config.fog = { ...config.fog, enabled: fog.enabled, type: fog.type, near: fog.near, far: fog.far,
      density: fog.density, color: fog.colorLinear }
  }
  if (state.reflections) {
    const reflection = state.reflections.getStatus()
    config.reflections = { ...config.reflections, enabled: reflection.enabled, size: reflection.size }
  }
  config.helpers = { axes: !!editor.handler.helpers.axes.showAxes, grid: !!editor.handler.helpers.grid.showGrid }
  if (config.environment?.url) config.environment = { ...config.environment, intensity: editor.scene.environmentIntensity, rotation: editor.scene.environmentRotation.toArray().slice(0, 3), background: editor.scene.background === (state.environmentColorBalance?.getStatus().scope === 'lighting-only' ? state.environmentSourceTexture : state.environmentTexture), backgroundIntensity: editor.scene.backgroundIntensity }
  if (editor.scene.background?.isColor) config.background = editor.scene.background.getHex()
  for (const key of ['waterSurface', 'contextTextures', 'facadeFrameFinish', 'internalRoadSurfaces']) {
    if (config[key]?.version === 1 && state[key]) config[key] = structuredClone(state[key].getStatus().settings)
  }
  config.materials = {}
  config.objects = {}
  editor.scene.traverse(object => {
    if (!object.isMesh || object.userData?.nanjingUtility) return
    // Transform gizmos are editable UI, not project materials. Their X/Y/Z
    // meshes use infinite renderOrder and must never enter a shared preset.
    for (let parent = object; parent; parent = parent.parent) {
      if (parent.userData?.nanjingUtility || parent.isHelper || parent.isTransformControlsRoot || parent.type?.endsWith('Helper')) return
    }
    const objectFlags = {}
    if (object.visible !== true) objectFlags.visible = object.visible
    if (object.castShadow !== true) objectFlags.castShadow = object.castShadow
    if (object.receiveShadow !== true) objectFlags.receiveShadow = object.receiveShadow
    if (object.renderOrder !== 0) objectFlags.renderOrder = object.renderOrder
    if (Object.keys(objectFlags).length) config.objects[object.name] = objectFlags
    for (const renderedMaterial of (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)) {
      // Public getConfig can run outside source-save wrappers. Never publish
      // display-only texture/PBR copies as same-name editable source rules.
      const material = [state.waterSurface, state.contextTextures, state.facadeFrameFinish, state.internalRoadSurfaces]
        .reduce((value, controller) => controller?.getOriginalMaterial?.(value) || value, renderedMaterial)
      if (!material.name || config.materials[material.name]) continue
      const props = material.type === 'MeshPhysicalMaterial' ? { type: material.type } : {}
      for (const key of MATERIAL_NUMBERS) {
        const value = material[key]
        if (!Number.isFinite(value) || value === materialNumberDefaults[key]) continue
        props[key] = value
      }
      for (const key of MATERIAL_BOOLEANS) {
        const value = material[key]
        if (typeof value !== 'boolean' || value === materialBooleanDefaults[key]) continue
        props[key] = value
      }
      for (const key of MATERIAL_COLORS) {
        if (!material[key]?.isColor) continue
        const value = material[key].toArray()
        if (value.every((channel, index) => channel === materialColorDefaults[key][index])) continue
        props[key] = value
      }
      if (Object.keys(props).length) config.materials[material.name] = props
    }
  })
  config.lights = editor.scene.children.filter(object => object.isLight).map(light => ({
    name: light.name, type: light.type, color: light.color.toArray(), groundColor: light.groundColor?.toArray(), intensity: light.intensity,
    position: light.position.toArray(), rotation: light.rotation.toArray().slice(0, 3), target: light.target?.position.toArray(),
    castShadow: light.castShadow, visible: light.visible,
    ...Object.fromEntries(['distance', 'decay', 'angle', 'penumbra', 'width', 'height'].filter(key => light[key] != null).map(key => [key, light[key]])),
    shadow: light.shadow ? { mapSize: light.shadow.mapSize.toArray(), bias: light.shadow.bias, normalBias: light.shadow.normalBias, radius: light.shadow.radius, intensity: light.shadow.intensity,
      camera: Object.fromEntries(['near', 'far', 'left', 'right', 'top', 'bottom'].filter(key => light.shadow.camera[key] != null).map(key => [key, light.shadow.camera[key]])) } : undefined,
  }))
  return config
}

function download(data, name, type = 'application/json') {
  const url = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function installNanjingRestore(editor, initialParams, { getProjectName } = {}) {
  if (!editor || editor.__nanjingRestoreInstalled) return
  editor.__nanjingRestoreInstalled = true
  const baseline = isNanjingBenchmarkBaseline()
  const state = { active: !!initialParams?.[METADATA_KEY], metadata: initialParams?.[METADATA_KEY], params: initialParams, config: null, meshes: 0, materials: 0, generation: 0, loading: null, renderDirty: true, previousShadowAutoUpdate: editor.renderer.shadowMap.autoUpdate }
  function currentProjectName() {
    const name = getProjectName ? getProjectName() : state.metadata?.config?.sceneName || NANJING_SCENE_NAME
    if (typeof name !== 'string' || !name.trim()) throw new Error('当前工程名称无效，已阻止保存')
    return name
  }
  state.getProjectName = currentProjectName
  const historyMode = () => isProjectHistoryRestore(state.params)
  state.clientQualityPreference = readNanjingDisplayQuality()
  state.benchmarkQualityRestore = null
  state.shaderErrors = []
  const previousShaderError = editor.renderer.debug.onShaderError
  const shaderError = (gl, program, vertexShader, fragmentShader) => {
    const message = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join('\n')
    state.shaderErrors.push(message.slice(0, 3000))
    if (state.shaderErrors.length > 8) state.shaderErrors.shift()
    if (previousShaderError) previousShaderError.call(editor.renderer.debug, gl, program, vertexShader, fragmentShader)
    else console.error('场景着色器编译失败', message)
  }
  editor.renderer.debug.onShaderError = shaderError
  const clientPlatform = { platform: navigator.platform, userAgent: navigator.userAgent,
    userAgentDataPlatform: navigator.userAgentData?.platform, maxTouchPoints: navigator.maxTouchPoints }
  const macClient = isNanjingMacPlatform(clientPlatform)
  const originalTransmissionScale = editor.renderer.transmissionResolutionScale
  const deviceProfile = ({ adaptive = true } = {}) => getNanjingDeviceProfile({ ...clientPlatform, gpu: state.profiler?.gpu, quality: state.quality,
    nativePixelRatio: window.devicePixelRatio * (Number(localStorage.getItem('new_threeEditor_pixelRatio')) || 1),
    width: editor.renderer.domElement.clientWidth, height: editor.renderer.domElement.clientHeight,
    interacting: state.interacting, motionPixelRatio: state.autoPixelRatio,
    adaptivePixelRatio: adaptive ? state.autoPixelRatio : undefined, capture: state.capturing, baseline })
  const resetTiming = reason => {
    state.profiler?.resetFrameTiming()
    if (reason === 'visibility' || reason === 'hidden') state.frameBudget?.resetAdaptation(reason)
    else if (reason === 'shadows') state.frameBudget?.resetSamples(reason)
    else state.frameBudget?.resetTiming?.(reason)
  }
  const visibilityChanged = () => {
    resetTiming('visibility')
    if (document.visibilityState === 'hidden') state.profiler?.cancel()
    else if (state.reflectionPending) scheduleReflectionCapture()
    invalidateRender()
    if (document.visibilityState === 'visible' && !historyMode()) void state.appearanceClient?.check()
  }
  state.clarity = baseline ? null : createNanjingClarity(editor)
  state.transparency = baseline ? null : createNanjingTransparency(editor)
  state.groundOrder = baseline ? null : createNanjingGroundOrder(editor)
  state.transparentBlocks = baseline ? null : createNanjingTransparentBlocks(editor)
  editor.__nanjingRestoreActive = state.active
  if (state.active) editor.renderer.shadowMap.autoUpdate = false
  const invalidateRender = () => { if (state.active) state.renderDirty = true }
  let lodTimer = null
  let shadowTimer = null
  let sceneRefreshTimer = null
  let deferredMaterialRefresh = false
  let sceneRefreshEpoch = 0
  const cancelSceneRefresh = () => {
    clearTimeout(sceneRefreshTimer)
    sceneRefreshTimer = null
    deferredMaterialRefresh = false
    sceneRefreshEpoch += 1
  }
  const markAppearanceEdited = () => {
    if (!state.active || state.applyingAppearance || !state.config) return
    state.appearanceDirty = true
    state.appearanceEditVersion = (state.appearanceEditVersion || 0) + 1
    updateAppearanceStatus()
  }
  const syncEditedMaterials = () => {
    state.waterSurface?.syncMaterialEdits?.()
    state.contextTextures?.syncMaterialEdits?.()
    state.facadeFrameFinish?.syncMaterialEdits?.()
    state.internalRoadSurfaces?.syncMaterialEdits?.()
  }
  const refreshSceneDependencies = () => {
    state.importedUtilities = suppressNanjingImportedUtilities(editor)
    state.waterSurface?.refresh()
    state.contextTextures?.refresh()
    state.facadeFrameFinish?.refresh()
    state.internalRoadSurfaces?.refresh()
    state.treeDensity?.refresh()
    state.treePlacements?.refresh()
    state.roadMarkingRecovery?.refresh()
    state.junctionPaving?.refresh()
    state.contactShadows?.invalidate?.({ structure: true })
    state.transparentBlocks?.refresh()
    state.foliageZeroAlpha?.refresh()
    invalidateRender()
    state.instancing?.invalidate()
    state.selection?.invalidate({ structure: true })
  }
  const refreshEditedScene = ({ materialsOnly = false } = {}) => {
    if (!state.active || state.destroyed) return
    // Material values and source copies update before the next frame/save.
    // Rebuilding thousands of scene dependencies can wait until a slider settles.
    if (materialsOnly) {
      syncEditedMaterials()
      invalidateRender()
      deferredMaterialRefresh = true
    } else {
      refreshSceneDependencies()
      deferredMaterialRefresh = false
    }
    clearTimeout(sceneRefreshTimer)
    const epoch = ++sceneRefreshEpoch
    const generation = state.generation, application = state.application
    sceneRefreshTimer = setTimeout(() => {
      if (!state.active || state.destroyed || epoch !== sceneRefreshEpoch
        || generation !== state.generation || application !== state.application) return
      sceneRefreshTimer = null
      if (deferredMaterialRefresh) refreshSceneDependencies()
      deferredMaterialRefresh = false
      invalidateShadows()
      if (state.reflections && state.config?.reflections?.autoCapture) {
        state.reflectionAttempted = false
        state.reflectionPending = true
        scheduleReflectionCapture()
      }
    }, 240)
  }
  const previousMaterialSourceResolver = editor.getNanjingSourceMaterial
  const materialSourceResolver = material => {
    if (!state.active || state.destroyed) return material
    const controllers = [state.waterSurface, state.contextTextures, state.facadeFrameFinish, state.internalRoadSurfaces]
    controllers.forEach(controller => controller?.syncMaterialEdits?.())
    return controllers.reduce((value, controller) => controller?.getOriginalMaterial?.(value) || value, material)
  }
  editor.getNanjingSourceMaterial = materialSourceResolver
  const previousMaterialRenderRequest = editor.requestNanjingMaterialRender
  const materialRenderRequest = material => {
    if (!state.active || state.destroyed) return previousMaterialRenderRequest?.call(editor, material) === true
    markAppearanceEdited()
    refreshEditedScene({ materialsOnly: true })
    return true
  }
  editor.requestNanjingMaterialRender = materialRenderRequest
  const lodControllers = () => [state.lod, state.trunkLod].filter(Boolean)
  const beginMotion = () => {
    if (!state.active || state.destroyed || baseline || state.quality !== 'balanced' || state.interacting) return
    state.interacting = true
    const policy = deviceProfile({ adaptive: false })
    const maxRatio = policy.maxPixelRatio
    state.frameBudget ||= createNanjingFrameBudget({ initialRatio: policy.pixelRatio, maxRatio, minRatio: policy.minPixelRatio })
    state.autoPixelRatio = state.frameBudget.beginGesture({ minRatio: policy.minPixelRatio, maxRatio })
    resetTiming('gesture-start')
    setQuality('balanced', { transient: true })
  }
  const endMotion = () => {
    if (!state.interacting) return false
    state.interacting = false
    state.frameBudget?.endGesture()
    resetTiming('gesture-end')
    setQuality(state.quality, { transient: true })
    if (state.reflectionPending) scheduleReflectionCapture()
    return true
  }
  const updateLod = () => {
    if (!state.active || !state.lod || baseline) return
    const height = editor.renderer.domElement.clientHeight * editor.renderer.getPixelRatio()
    let changed = false
    lodControllers().forEach((controller, index) => {
      if (controller.update(editor.camera, height, { force: true, updateMatrices: index === 0 })) changed = true
    })
    if (changed) {
      state.instancing?.invalidate({ rebuild: true })
      // Camera-dependent LOD keeps cached shadows stable; geometry edits still refresh them.
      state.renderDirty = true
    }
  }
  const scheduleLod = () => {
    if (!state.active || baseline || state.profiler?.running) return
    clearTimeout(lodTimer)
    lodTimer = setTimeout(() => { if (state.inputActive || !endMotion()) updateLod() }, macClient ? 350 : 160)
  }
  const inputStart = () => { state.inputActive = true; clearTimeout(lodTimer); beginMotion() }
  const inputEnd = () => { state.inputActive = false; scheduleLod(); if (state.reflectionPending) scheduleReflectionCapture() }
  const transformDrag = event => {
    state.transformDragging = !!event.value
    if (event.value) inputStart()
    else {
      inputEnd()
      if (state.pendingShadows) { state.pendingShadows = false; invalidateShadows() }
      markAppearanceEdited(); refreshEditedScene()
    }
  }
  const invalidateShadows = () => {
    if (state.active) {
      if (state.transformDragging) { state.pendingShadows = true; state.renderDirty = true; return }
      editor.renderer.shadowMap.needsUpdate = true
      state.renderDirty = true
    }
  }
  editor.transformControls.addEventListener('objectChange', invalidateShadows)
  const collectionChanged = event => {
    const structure = !!event.structure
    state.instancing?.invalidate({ rebuild: structure })
    state.selection?.invalidate({ structure })
    state.contactShadows?.invalidate?.({ structure })
    if (structure) state.cssInventoryDirty = true
    invalidateShadows(); invalidateRender()
  }
  editor.scene.addEventListener('collection-changed', collectionChanged)
  editor.transformControls.addEventListener('change', invalidateRender)
  editor.controls.addEventListener('change', invalidateRender)
  editor.controls.addEventListener('change', scheduleLod)
  editor.controls.addEventListener('start', inputStart)
  editor.controls.addEventListener('end', inputEnd)
  editor.transformControls.addEventListener('dragging-changed', transformDrag)
  editor.transformControls.addEventListener('object-changed', scheduleLod)
  editor.transformControls.addEventListener('objectChange', scheduleLod)
  const needsRender = () => !state.active || state.renderDirty || state.profiler?.running || editor.renderer.shadowMap.needsUpdate || editor.controls.autoRotate || (editor.scene.COMMON_UPDATE_LIST?.length || 0) > 0
  let effectUpdate = editor.effectComposer.effectUpdate
  const drawIfNeeded = function (...args) {
    if (state.destroyed) return
    if (!state.active) return effectUpdate.apply(editor.effectComposer, args)
    if (document.visibilityState === 'hidden') { resetTiming('hidden'); return }
    if (!needsRender()) { resetTiming('idle'); return }
    state.renderDirty = false
    if (editor.renderer.shadowMap.needsUpdate) resetTiming('shadows')
    state.profiler?.begin()
    const started = performance.now()
    const rebuildingShadows = editor.renderer.shadowMap.needsUpdate
    state.selection?.tick({ animated: (editor.scene.COMMON_UPDATE_LIST?.length || 0) > 0 })
    if (baseline) state.instancing?.sync()
    else state.instancing?.syncIfNeeded({ animated: (editor.scene.COMMON_UPDATE_LIST?.length || 0) > 0 })
    const info = editor.renderer.info
    const previousAutoReset = info.autoReset
    info.autoReset = false
    info.reset()
    try { return effectUpdate.apply(editor.effectComposer, args) }
    finally {
      state.frameStats = { calls: info.render.calls, triangles: info.render.triangles, cpuSubmitMs: performance.now() - started, rebuildingShadows }
      info.autoReset = previousAutoReset
      state.profiler?.end(state.frameStats)
      state.frameBudget?.observe({ ...state.profiler?.getFrameTiming(), now: performance.now(),
        interacting: state.interacting, visible: document.visibilityState === 'visible', rendered: true, rebuildingShadows })
      if (state.reflectionPending && !waitingForShadows()) scheduleReflectionCapture()
      if (state.metrics && performance.now() - (state.lastMetricsUpdate || 0) > 250) {
        state.lastMetricsUpdate = performance.now()
        const instances = state.instancing?.getStats()
        const frame = rebuildingShadows ? '阴影缓存已更新 · 静止时按需刷新' : `绘制 ${state.frameStats.calls.toLocaleString()} 次 / ${(state.frameStats.triangles / 10000).toFixed(1)} 万三角形 / CPU 提交 ${state.frameStats.cpuSubmitMs.toFixed(1)} ms`
        state.metrics.textContent = `${instances?.enabled ? `GPU 实例：${instances.activeInstances} 个 / ${instances.activeBatches} 批` : 'GPU 实例：关闭'} · ${frame}`
      }
    }
  }
  // renderWay changes replace effectUpdate; retain that behavior behind the idle gate.
  Object.defineProperty(editor.effectComposer, 'effectUpdate', {
    configurable: true,
    get: () => drawIfNeeded,
    set: value => { effectUpdate = value; state.renderDirty = true },
  })
  for (const cssRenderer of [editor.css2DRender, editor.css3DRender]) {
    const render = cssRenderer.render.bind(cssRenderer)
    cssRenderer.render = (...args) => {
      if (!needsRender()) return
      if (state.cssInventoryDirty !== false) {
        state.cssObjects = { two: false, three: false }
        editor.scene.traverse(object => {
          if (object.isCSS2DObject) state.cssObjects.two = true
          if (object.isCSS3DObject) state.cssObjects.three = true
        })
        state.cssInventoryDirty = false
      }
      if (!state.active || baseline || state.cssObjects[cssRenderer === editor.css2DRender ? 'two' : 'three'] || editor.scene.COMMON_UPDATE_LIST?.length) return render(...args)
    }
  }
  const captureImage = editor.getSceneEditorImage.bind(editor)
  editor.getSceneEditorImage = (...args) => {
    state.profiler?.cancel()
    endMotion()
    state.renderDirty = true
    if (!state.active) return captureImage(...args)
    state.capturing = true
    const helpers = []
    editor.scene.traverse(object => {
      if (object.visible && (object.isHelper || object.type?.endsWith('Helper') || object.isTransformControlsRoot)) {
        helpers.push(object)
        object.visible = false
      }
    })
    try {
      if (state.capturing) setQuality(state.quality, { transient: true })
      const capture = () => captureImage(...args)
      return state.foliageZeroAlpha ? state.foliageZeroAlpha.withOriginals(capture) : capture()
    }
    finally {
      if (state.capturing) { state.capturing = false; setQuality(state.quality, { transient: true }) }
      helpers.forEach(object => { object.visible = true })
      state.renderDirty = true
    }
  }
  const resize = editor.renderSceneResize.bind(editor)
  state.lastViewport = `${editor.renderer.domElement.clientWidth}x${editor.renderer.domElement.clientHeight}`
  editor.renderSceneResize = (...args) => {
    invalidateRender()
    resetTiming('resize')
    const result = resize(...args)
    const viewport = `${editor.renderer.domElement.clientWidth}x${editor.renderer.domElement.clientHeight}`
    if (state.lastViewport && state.lastViewport !== viewport) {
      // A resize changes the pixel workload. Resume learning with fresh bounds
      // at the next gesture instead of comparing samples from two viewports.
      state.frameBudget?.endGesture()
      state.frameBudget?.resetAdaptation('viewport')
    }
    state.lastViewport = viewport
    if (state.active && state.quality && !state.applyingQuality) setQuality(state.quality, { transient: true })
    state.clarity?.sync()
    return result
  }
  const editorInput = event => {
    // History search/notes do not edit the scene or invalidate cached shadows.
    if (event.target?.closest?.('.project-records')) return
    invalidateRender()
    if (event.type === 'input' || event.type === 'change' || event.type === 'keyup') {
      // lil-gui already reports the actual edited object through its own hook.
      // Do not turn the same material slider's bubbling DOM event into a scene scan.
      if (event.target?.closest?.('.lil-gui') && state.guiInvalidation?.getStatus().attached) return
      const materialPanel = event.target?.closest?.('#realistic-material-panel')
      if (materialPanel && event.target !== materialPanel) {
        if (event.type !== 'keyup') markAppearanceEdited()
        refreshEditedScene({ materialsOnly: true })
        return
      }
      if (event.type !== 'keyup' && event.target !== qualitySelect) markAppearanceEdited()
      // Fog edits only change renderer uniforms. They must not rescan thousands
      // of instance transforms and selection bounds on every typed digit.
      if (event.target?.closest?.('[data-nanjing-uniform-control]')) return
      if (!event.target?.closest?.('#nanjing-restore-tools')) state.frameBudget?.resetAdaptation('scene-edit')
      state.instancing?.invalidate()
      state.selection?.invalidate({ structure: true })
      state.cssInventoryDirty = true
      if (!event.target?.closest?.('#nanjing-restore-tools')) {
        refreshEditedScene()
      }
    }
  }
  for (const event of ['input', 'change', 'click', 'keyup']) document.addEventListener(event, editorInput)
  const isViewControl = event => [editor.camera, editor.camera.position, editor.camera.rotation, editor.camera.quaternion,
    editor.camera.up, editor.controls, editor.controls.target].includes(event.object)
  state.guiInvalidation = createNanjingGuiInvalidation(editor, {
    onChange: event => {
      if (!state.active) return
      if (isViewControl(event)) { invalidateRender(); scheduleLod(); return }
      markAppearanceEdited(); refreshEditedScene({ materialsOnly: !!event.object?.isMaterial })
    },
    onFinishChange: event => {
      if (state.active && !isViewControl(event)) refreshEditedScene({ materialsOnly: !!event.object?.isMaterial })
    }
  })
  state.assetInvalidation = createNanjingAssetInvalidation({ onLoad: () => {
    if (state.active && state.config) refreshEditedScene()
  } })
  document.addEventListener('visibilitychange', visibilityChanged)
  const originalSave = editor.saveSceneEdit.bind(editor)
  const previousSourceScene = editor.withNanjingSourceScene
  const originalReset = editor.resetEditorStorage.bind(editor)
  const panel = document.createElement('div')
  panel.id = 'nanjing-restore-tools'
  panel.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:250;background:#202830ed;color:#edf4fa;border:1px solid #506576;border-radius:8px;padding:9px 12px;font:12px sans-serif;display:none;box-shadow:0 4px 18px #0006;max-width:70vw'
  const status = document.createElement('div')
  status.style.cssText = 'margin-bottom:7px;color:#d9e6ef;text-align:center'
  panel.append(status)
  state.metrics = document.createElement('div')
  state.metrics.style.cssText = 'margin:0 0 7px;color:#bbd3e4;text-align:center;font-size:11px'
  panel.append(state.metrics)
  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;gap:7px;justify-content:center;flex-wrap:wrap'
  panel.append(buttonRow)
  document.body.append(panel)
  const report = document.createElement('div')
  report.style.cssText = 'margin-top:6px;max-width:720px;max-height:24vh;overflow:auto;white-space:pre-wrap;line-height:1.5'
  panel.append(report)
  state.profiler = createNanjingProfiler(editor, { invalidate: invalidateRender, onResult: result => {
    try {
    result.quality = baseline ? 'baseline' : state.quality
    result.lod = state.lod?.getStats().objectsByLevel || [2469, 0, 0]
    result.trunkLod = state.trunkLod?.getStats().objectsByLevel || [2469, 0, 0]
    result.instanceSyncs = state.instancing?.getStats().syncCount
    result.adaptive = !!state.interacting
    result.rendererRevision = 'surface-shadow-v25-model-36c1aee71981'
    result.modelUrl = state.metadata?.modelUrl || MODEL_URL
    result.reference = state.config?.reference
    result.deviceProfile = deviceProfile()
    result.frameBudget = state.frameBudget?.getStats()
    result.platform = clientPlatform
    result.glassComposition = state.config?.glassComposition
    result.facadeCladding = state.facadeCladding
    result.facadeGlazing = state.facadeGlazing
    result.reflections = state.reflections?.getStatus()
    result.shadows = state.shadows?.getStatus()
    result.fog = state.fog?.getStatus()
    result.transparentShadows = state.transparentShadows?.getStatus()
    result.contactShadows = state.contactShadows?.getStatus()
    result.transparency = state.transparency?.getStats()
    result.transparentBlocks = state.transparentBlocks?.getStatus()
    result.foliageZeroAlpha = state.foliageZeroAlpha?.getStatus()
    result.materialTangents = state.materialTangents?.getStatus()
    result.groundOrder = state.groundOrder?.getStats()
    result.contactLampDepth = state.contactShadows?.getStatus().lampDepth
    result.fullQuality60 = {
      targetFps: 60, targetFrameMs: 1000 / 60,
      quality: result.quality === 'full' && result.deviceProfile.transmissionScale === 1 && !result.deviceProfile.singlePass,
      nativeResolution: result.pixelRatio === result.nativePixelRatio && result.sampledDrawingBuffers.length === 1,
      adapterMatched: result.targetDevice === 'rtx5080' ? /NVIDIA.*RTX\s*5080/i.test(result.gpu) : null,
      rtx5080Active: /NVIDIA.*RTX\s*5080/i.test(result.gpu),
      measuredFps: result.fps, frameP95Ms: result.frameP95Ms,
    }
    const ms = value => value === null ? '不可用' : value.toFixed(1) + ' ms'
    report.textContent = `${result.quality === 'full' ? '最高画质' : '固定轨迹'}测试：${result.fps?.toFixed(1)} FPS · 帧间隔中位 ${ms(result.frameMedianMs)} / P95 ${ms(result.frameP95Ms)}\nCPU 同步及提交 ${ms(result.cpuMedianMs)} · GPU ${ms(result.gpuMedianMs)} · 绘制 ${result.drawCalls} 次 · ${(result.triangles / 1e6).toFixed(2)} 百万三角形\n${result.drawingBuffer.join('×')} · ${result.gpu}${result.quality === 'full' && !result.fullQuality60.rtx5080Active ? '\n当前使用的不是 RTX 5080，此结果不能作为 5080 验收。' : ''}`
    report.dataset.result = JSON.stringify(result)
    endMotion()
    scheduleLod()
    if (state.reflectionPending) scheduleReflectionCapture()
    } finally { restoreBenchmarkQuality() }
  } })
  const gpuStatus = document.createElement('div')
  gpuStatus.style.cssText = 'margin:0 0 6px;color:#bbd3e4;text-align:center;font-size:11px'
  const actualGpu = state.profiler.gpu || '浏览器未提供型号'
  gpuStatus.textContent = `当前 GPU：${deviceProfile().gpuLabel}`
  gpuStatus.title = actualGpu
  panel.insertBefore(gpuStatus, state.metrics)
  const appearanceStatus = document.createElement('div')
  appearanceStatus.setAttribute('aria-label', '效果同步状态')
  appearanceStatus.style.cssText = gpuStatus.style.cssText
  panel.insertBefore(appearanceStatus, state.metrics)
  function updateAppearanceStatus() {
    if (historyMode()) {
      appearanceStatus.textContent = `历史回档 ${state.params.projectHistory.sourceVersionId?.slice(0, 8) || ''} · 自动同步暂停，可继续编辑并保存新版本`
      appearanceStatus.dataset.sync = JSON.stringify({ history: true, automatic: false })
      return
    }
    const sync = state.appearanceClient?.getStatus()
    const saved = state.metadata?.sharedAppearance
    const revision = sync?.revision || saved?.revision
    const error = sync?.error || saved?.syncError
    appearanceStatus.textContent = error ? `效果同步：${error}`
      : sync?.updateAvailable ? '检测到新版效果 · 点击检测并同步'
      : state.appearanceDirty || sync?.localChanges ? `效果版本 ${revision?.slice(0, 8) || '本地'} · 有本地调整`
      : revision ? `效果版本 ${revision.slice(0, 8)} · 已同步` : '效果仅保存在此浏览器 · 可同步当前效果'
    appearanceStatus.dataset.sync = JSON.stringify(sync || { revision: saved?.revision || null, error: saved?.syncError || null })
  }
  updateAppearanceStatus()
  const deviceStatus = document.createElement('div')
  deviceStatus.style.cssText = gpuStatus.style.cssText
  panel.insertBefore(deviceStatus, state.metrics)
  const qualitySelect = document.createElement('select')
  qualitySelect.setAttribute('aria-label', '显示质量')
  qualitySelect.style.cssText = 'border:1px solid #607b8f;border-radius:4px;background:#354c5d;color:white;padding:5px 9px'
  for (const [value, label] of [['balanced', '自动适配'], ['full', '完整细节'], ['fast', '流畅']]) {
    const option = document.createElement('option')
    option.value = value; option.textContent = label; qualitySelect.append(option)
  }
  qualitySelect.title = '本机显示偏好，工程回档后保留选择。自动适配：识别浏览器实际使用的 GPU，并根据运行耗时调整预算；完整细节：使用原生清晰度；流畅：优先降低显示开销。截图使用完整细节。'
  qualitySelect.onchange = () => selectDisplayQuality(qualitySelect.value)
  buttonRow.append(qualitySelect)
  const shadowLabel = document.createElement('label')
  shadowLabel.style.cssText = 'display:flex;align-items:center;gap:5px'
  shadowLabel.textContent = '阴影浓度'
  const shadowStrength = document.createElement('input')
  shadowStrength.type = 'range'; shadowStrength.min = '0'; shadowStrength.max = '1'; shadowStrength.step = '0.05'
  shadowStrength.setAttribute('aria-label', '阴影浓度')
  shadowStrength.style.width = '72px'
  shadowStrength.title = '降低浓度可减弱地面阴影，保留贴地关系'
  shadowStrength.oninput = () => { state.shadows?.update({ strength: Number(shadowStrength.value) }); state.renderDirty = true }
  shadowLabel.append(shadowStrength)
  buttonRow.append(shadowLabel)
  const shadowResolutionLabel = document.createElement('label')
  shadowResolutionLabel.style.cssText = shadowLabel.style.cssText
  shadowResolutionLabel.textContent = '投影精度'
  const shadowResolution = document.createElement('select')
  shadowResolution.setAttribute('aria-label', '投影精度')
  for (const [value, label] of [[1024, '1024'], [2048, '2048 · 标准'], [4096, '4096 · 精细'], [8192, '8192 · 超精细']]) {
    const option = document.createElement('option')
    option.value = String(value); option.textContent = label
    option.disabled = value > editor.renderer.capabilities.maxTextureSize
    shadowResolution.append(option)
  }
  shadowResolution.title = '只调整主光投影精度；提高一档让阴影边缘更细，同时增加阴影缓存占用。'
  shadowResolution.onchange = () => {
    state.shadows?.updateResolution(Number(shadowResolution.value))
    markAppearanceEdited(); syncShadowResolutionControl(); invalidateRender()
  }
  shadowResolutionLabel.append(shadowResolution)
  buttonRow.append(shadowResolutionLabel)
  function syncShadowResolutionControl() {
    const status = state.shadows?.getStatus()
    const primary = status?.lights?.find(light => light.name === status.shadowLightSelection?.primary?.name)
    shadowResolution.value = String(primary?.mapSize?.[0] ?? 2048)
    shadowResolution.disabled = baseline || !primary
  }
  const layerLabel = document.createElement('label'); layerLabel.style.cssText = shadowLabel.style.cssText
  layerLabel.dataset.nanjingUniformControl = 'true'
  const layerEnabled = document.createElement('input'); layerEnabled.type = 'checkbox'
  layerEnabled.setAttribute('aria-label', '阴影叠加')
  layerLabel.append(layerEnabled, '阴影叠加')
  layerLabel.title = '仅建筑阴影与植物、路灯阴影的交集加深。建筑之间、植物和路灯之间都不额外叠黑。'
  buttonRow.append(layerLabel)
  const layerStrengthLabel = document.createElement('label'); layerStrengthLabel.style.cssText = shadowLabel.style.cssText
  layerStrengthLabel.dataset.nanjingUniformControl = 'true'; layerStrengthLabel.textContent = '叠加强度'
  const layerStrength = document.createElement('input'); layerStrength.type = 'range'
  layerStrength.min = '0'; layerStrength.max = '0.9'; layerStrength.step = '0.01'; layerStrength.style.width = '66px'
  layerStrength.setAttribute('aria-label', '叠加强度')
  const layerValue = document.createElement('span'); layerValue.style.minWidth = '28px'
  layerStrengthLabel.append(layerStrength, layerValue); buttonRow.append(layerStrengthLabel)
  layerEnabled.onchange = () => {
    state.shadows?.updateLayers?.({ enabled: layerEnabled.checked })
    state.frameBudget?.resetAdaptation('shadow-layers'); syncShadowLayerControls(); invalidateRender()
  }
  layerStrength.oninput = () => {
    state.shadows?.updateLayers?.({ strength: Number(layerStrength.value) })
    syncShadowLayerControls(); invalidateRender()
  }
  function syncShadowLayerControls() {
    const layers = state.shadows?.getStatus().layers
    layerEnabled.checked = layers?.enabled ?? true
    layerEnabled.disabled = baseline || !layers || !!layers.unsupported
    layerStrength.value = String(layers?.strength ?? 0.65)
    layerStrength.disabled = layerEnabled.disabled || !layerEnabled.checked
    layerValue.textContent = `${Math.round(Number(layerStrength.value) * 100)}%`
  }
  const surfaceLabel = document.createElement('label'); surfaceLabel.style.cssText = shadowLabel.style.cssText
  surfaceLabel.dataset.nanjingUniformControl = 'true'; surfaceLabel.textContent = '光影层次'
  const surfaceAmount = document.createElement('input'); surfaceAmount.type = 'range'
  surfaceAmount.min = '0'; surfaceAmount.max = '1'; surfaceAmount.step = '.05'; surfaceAmount.style.width = '66px'
  surfaceAmount.setAttribute('aria-label', '光影层次')
  surfaceAmount.title = '增强主光与补光的区别，减少叶片泛灰；0为调整前的光照。'
  const surfaceValue = document.createElement('span'); surfaceValue.style.minWidth = '28px'
  surfaceLabel.append(surfaceAmount, surfaceValue); buttonRow.append(surfaceLabel)
  function syncSurfaceLightingControls() {
    const lighting = state.surfaceLighting?.getStatus()
    surfaceAmount.value = String(lighting?.amount ?? 1)
    surfaceAmount.disabled = baseline || !lighting
    surfaceValue.textContent = `${Math.round(Number(surfaceAmount.value) * 100)}%`
    syncHdrCorrectionControl()
  }
  function syncSurfaceEnvironment() {
    // Local captures use an explicit material intensity; ordinary surfaces use
    // scene.environmentIntensity. Apply the same environment control to both.
    for (const material of facadeMaterials()) if (material.envMap) material.envMapIntensity = editor.scene.environmentIntensity
    environmentStrength.value = String(editor.scene.environmentIntensity)
    backgroundStrength.value = String(editor.scene.backgroundIntensity)
  }
  surfaceAmount.oninput = () => {
    state.surfaceLighting?.update({ amount: Number(surfaceAmount.value) })
    syncSurfaceEnvironment(); syncSurfaceLightingControls(); invalidateRender()
  }
  surfaceAmount.onchange = () => {
    if (state.environmentTexture) initializeReflections()
  }
  const glassMode = document.createElement('select')
  glassMode.setAttribute('aria-label', '玻璃显示')
  glassMode.style.cssText = qualitySelect.style.cssText
  for (const [value, label] of [['physical', '幕墙玻璃'], ['source', '源材质']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; glassMode.append(option)
  }
  glassMode.title = '幕墙玻璃：保留原低金属度，独立透射、轻微粗糙度、去掉绒面反射；静止时捕获一次周边。源材质：恢复原粗糙度、Alpha、透射和绒面反射。'
  const facadeMaterials = () => {
    const materials = new Set()
    editor.scene.traverse(object => {
      for (const material of (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean))
        if (material.name === '建筑_蓝灰玻璃') materials.add(material)
    })
    return materials
  }
  glassMode.onchange = () => {
    if (!state.config) return
    state.profiler?.cancel(); endMotion()
    setNanjingGlassComposition(state.config, glassMode.value)
    if (state.config.facadeGlazing?.enabled !== false) state.facadeGlazing = applyNanjingFacadeGlazingMode(editor, state.config)
    const rule = materialRules(state.config).find(rule => rule.name === '建筑_蓝灰玻璃')
    for (const material of facadeMaterials()) {
      for (const key of ['opacity', 'transparent', 'depthWrite', 'transmission', 'sheen', 'metalness', 'roughness']) material[key] = rule[key]
      setColor(material.color, rule.color)
      material.needsUpdate = true
    }
    glassTransmission.value = String(rule.transmission)
    state.transparentShadows?.update()
    initializeReflections()
    invalidateRender()
  }
  const glassDetails = document.createElement('details')
  const glassSummary = document.createElement('summary'); glassSummary.textContent = '幕墙与环境'; glassSummary.style.cursor = 'pointer'
  glassDetails.append(glassSummary); buttonRow.append(glassDetails)
  const glassControls = document.createElement('div')
  glassControls.style.cssText = 'position:absolute;bottom:100%;left:0;right:0;display:flex;flex-wrap:wrap;justify-content:center;gap:14px;align-items:center;background:#202830fa;border:1px solid #506576;border-radius:8px;padding:12px'
  glassControls.append(glassMode); glassDetails.append(glassControls)
  const addRange = (label, max, title, change) => {
    const wrapper = document.createElement('label'); wrapper.style.cssText = shadowLabel.style.cssText; wrapper.textContent = label
    const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = String(max); input.step = '0.05'
    input.style.width = '66px'; input.setAttribute('aria-label', label); input.title = title
    input.oninput = () => { change(Number(input.value)); invalidateRender() }
    wrapper.append(input); glassControls.append(wrapper); return input
  }
  const glassTransmission = addRange('玻璃透射', 1, '降低可弱化整栋通透感；原模型层间没有内墙，平视仍可能看见后方。', value => {
    for (const material of facadeMaterials()) { material.transmission = value; material.needsUpdate = true }
    if (Array.isArray(state.config?.materials)) {
      for (const rule of state.config.materials) if (rule.name === '建筑_蓝灰玻璃') rule.transmission = value
    } else if (state.config?.materials?.['建筑_蓝灰玻璃']) state.config.materials['建筑_蓝灰玻璃'].transmission = value
    state.transparentShadows?.update()
  })
  const environmentStrength = addRange('环境反射', 2, '调整场景环境光与反射亮度，不改变天空背景亮度。', value => {
    editor.scene.environmentIntensity = value
    // Explicit local captures use the material uniform instead of scene intensity.
    for (const material of facadeMaterials()) if (material.envMap) material.envMapIntensity = value
  })
  const backgroundStrength = addRange('天空亮度', 2, '仅调整天空背景亮度，不影响环境光照。', value => {
    editor.scene.backgroundIntensity = value
    if (state.config?.environment) state.config.environment.backgroundIntensity = value
  })
  const hdrCorrectionLabel = document.createElement('label')
  hdrCorrectionLabel.style.cssText = shadowLabel.style.cssText
  hdrCorrectionLabel.dataset.nanjingUniformControl = 'true'
  const hdrCorrection = document.createElement('input')
  hdrCorrection.type = 'checkbox'; hdrCorrection.setAttribute('aria-label', 'HDR 色彩校正')
  hdrCorrectionLabel.append(hdrCorrection, 'HDR 色彩校正')
  hdrCorrectionLabel.title = '关闭后恢复原始 HDR 的天空和环境照明，可随工程版本回档。'
  glassControls.append(hdrCorrectionLabel)
  function syncHdrCorrectionControl() {
    hdrCorrection.checked = state.config?.environment?.colorBalance?.enabled === true
    hdrCorrection.disabled = !state.environmentSourceTexture || !state.config?.environment?.colorBalance
    roadTextureToggle.checked = state.internalRoadSurfaces?.getStatus().settings.visibleRoadDecks === true
    roadTextureToggle.disabled = !state.internalRoadSurfaces
  }
  hdrCorrection.onchange = async () => {
    if (!state.config?.environment?.colorBalance || state.destroyed) return
    const generation = state.generation
    state.config.environment.colorBalance.enabled = hdrCorrection.checked
    hdrCorrection.disabled = true
    markAppearanceEdited()
    try {
      await applyEnvironment(editor, state.config, state, () => !state.destroyed && generation === state.generation)
      if (state.destroyed || generation !== state.generation) return
      syncSurfaceEnvironment(); initializeReflections(); invalidateRender()
    } catch (error) { setStatus(`HDR 更新失败：${error.message}`) }
    finally { if (!state.destroyed && generation === state.generation) syncHdrCorrectionControl() }
  }
  const roadTextureLabel = document.createElement('label')
  roadTextureLabel.style.cssText = shadowLabel.style.cssText
  roadTextureLabel.dataset.nanjingUniformControl = 'true'
  const roadTextureToggle = document.createElement('input')
  roadTextureToggle.type = 'checkbox'; roadTextureToggle.setAttribute('aria-label', '区块车行道贴图')
  roadTextureLabel.append(roadTextureToggle, '区块车行道贴图')
  roadTextureToggle.onchange = () => {
    state.internalRoadSurfaces?.update({ enabled: roadTextureToggle.checked, visibleRoadDecks: roadTextureToggle.checked })
    markAppearanceEdited(); state.instancing?.invalidate(); invalidateRender()
  }
  const waterDetails = document.createElement('details')
  const waterSummary = document.createElement('summary'); waterSummary.textContent = '水面'; waterSummary.style.cursor = 'pointer'
  const waterControls = document.createElement('div'); waterControls.style.cssText = glassControls.style.cssText
  waterControls.dataset.nanjingUniformControl = 'true'
  waterDetails.append(waterSummary, waterControls); buttonRow.append(waterDetails)
  const waterLabel = document.createElement('label'); waterLabel.style.cssText = shadowLabel.style.cssText
  const waterEnabled = document.createElement('input'); waterEnabled.type = 'checkbox'; waterEnabled.setAttribute('aria-label', '自然水面')
  waterLabel.append(waterEnabled, '自然水面'); waterControls.append(waterLabel)
  const waterStatus = document.createElement('span'); waterStatus.setAttribute('role', 'status')
  waterStatus.style.cssText = 'font-size:12px;color:#b7ccdb'
  waterControls.append(waterStatus)
  const waterNumbers = {}
  for (const [key, label, min, max] of [['rippleStrength', '水纹强度', 0, 1], ['rippleScale', '水纹密度', .05, 8], ['roughness', '水面粗糙度', .08, 1], ['envMapIntensity', '水面反射', 0, 2]]) {
    const wrapper = document.createElement('label'); wrapper.style.cssText = shadowLabel.style.cssText; wrapper.textContent = label
    const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = '.01'
    input.setAttribute('aria-label', label); input.style.cssText = qualitySelect.style.cssText + ';width:65px'
    input.onkeydown = event => event.stopPropagation()
    input.onchange = () => {
      if (input.value.trim() && Number.isFinite(Number(input.value))) {
        state.waterSurface?.update({ [key]: Number(input.value) }); markAppearanceEdited(); invalidateRender()
      }
      syncWaterControls()
    }
    wrapper.append(input); waterControls.append(wrapper); waterNumbers[key] = input
  }
  function syncWaterControls() {
    const status = state.waterSurface?.getStatus(), settings = status?.settings
    waterEnabled.checked = settings?.enabled === true; waterEnabled.disabled = baseline || !state.waterSurface
    waterStatus.textContent = settings?.enabled ? status?.active ? '自然水面已生效' : '水面尚未生效，请检查模型是否已加载' : '原水面材质'
    for (const [key, input] of Object.entries(waterNumbers)) { input.value = Number(settings?.[key] ?? 0).toFixed(2); input.disabled = !settings?.enabled }
  }
  waterEnabled.onchange = async () => {
    if (!state.waterSurface || !state.applicationReady) { syncWaterControls(); return }
    const enabled = waterEnabled.checked; waterEnabled.disabled = true
    const generation = state.generation, config = state.config
    const isCurrent = () => !state.destroyed && generation === state.generation && config === state.config
    const previous = structuredClone(config.waterSurface), hadSettings = Object.hasOwn(config, 'waterSurface')
    const previousSettings = state.waterSurface.getStatus().settings
    try {
      await save({ label: '调整自然水面前' })
      if (!isCurrent()) return
      state.waterSurface.update({ enabled }); markAppearanceEdited(); invalidateRender()
      if (enabled && !state.waterSurface.getStatus().active) throw new Error('未找到可启用的水面对象，已保留原材质')
      await save({ label: enabled ? '启用自然细波纹水面' : '恢复原水面材质' })
    } catch (error) {
      if (isCurrent()) {
        state.waterSurface?.update(previousSettings)
        if (hadSettings) config.waterSurface = previous
        else delete config.waterSurface
        invalidateRender(); setStatus('水面更新失败：' + error.message)
      }
    }
    finally { if (isCurrent()) syncWaterControls() }
  }
  const fogDetails = document.createElement('details')
  const fogSummary = document.createElement('summary'); fogSummary.textContent = '远景雾'; fogSummary.style.cursor = 'pointer'
  const fogControls = document.createElement('div'); fogControls.style.cssText = glassControls.style.cssText
  fogControls.dataset.nanjingUniformControl = 'true'
  fogDetails.append(fogSummary, fogControls); buttonRow.append(fogDetails)
  const fogLabel = document.createElement('label'); fogLabel.style.cssText = shadowLabel.style.cssText
  const fogEnabled = document.createElement('input'); fogEnabled.type = 'checkbox'; fogEnabled.setAttribute('aria-label', '开启远景雾')
  fogLabel.append(fogEnabled, '开启雾'); fogControls.append(fogLabel)
  const fogType = document.createElement('select'); fogType.setAttribute('aria-label', '雾类型'); fogType.style.cssText = qualitySelect.style.cssText
  for (const [value, label] of [['linear', '距离雾'], ['exp2', '指数雾']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; fogType.append(option)
  }
  fogControls.append(fogType)
  const fogNumbers = {}
  for (const [key, label, step] of [['near', '雾起点', '1'], ['far', '雾远端', '1'], ['density', '雾密度', '0.001']]) {
    const wrapper = document.createElement('label'); wrapper.style.cssText = shadowLabel.style.cssText; wrapper.textContent = label
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = step
    input.setAttribute('aria-label', label); input.style.cssText = `${qualitySelect.style.cssText};width:68px`
    input.title = key === 'near' ? '此距离以内保持清晰，使用模型的场景单位。' : key === 'far' ? '此距离以外融入雾色，必须大于起点。' : '数值越大，远景雾越浓。'
    input.oninput = () => {
      // Preview valid values immediately; keep incomplete typed numbers intact
      // until blur. Some editor shortcuts consume Tab before a native change.
      if (input.value.trim() !== '') {
        try { state.fog?.update({ [key]: Number(input.value) }) } catch { /* Validate the completed entry on change. */ }
      }
    }
    input.onkeydown = event => {
      event.stopPropagation()
      if (event.key === 'Enter') { event.preventDefault(); input.blur() }
    }
    input.onchange = () => {
      if (input.value.trim() === '') { syncFogControls(); return }
      updateFog({ [key]: Number(input.value) })
    }
    wrapper.append(input); fogControls.append(wrapper); fogNumbers[key] = { input, wrapper }
  }
  const fogColorLabel = document.createElement('label'); fogColorLabel.style.cssText = shadowLabel.style.cssText; fogColorLabel.textContent = '雾颜色'
  const fogColor = document.createElement('input'); fogColor.type = 'color'; fogColor.setAttribute('aria-label', '雾颜色')
  fogColor.style.cssText = 'width:34px;height:28px;border:1px solid #607b8f;padding:1px;background:#354c5d'
  fogColorLabel.append(fogColor); fogControls.append(fogColorLabel)
  function syncFogControls() {
    const fog = state.fog?.getStatus()
    fogEnabled.checked = fog?.enabled ?? false
    fogEnabled.disabled = baseline || !fog
    fogType.value = fog?.type || 'linear'; fogType.disabled = baseline || !fog?.enabled
    for (const [key, { input, wrapper }] of Object.entries(fogNumbers)) {
      input.value = String(fog?.[key] ?? NANJING_FOG_DEFAULTS[key])
      input.disabled = baseline || !fog?.enabled
      wrapper.style.display = (key === 'density') === (fog?.type === 'exp2') ? 'flex' : 'none'
    }
    fogColor.value = fog?.color || NANJING_FOG_DEFAULTS.color; fogColor.disabled = baseline || !fog?.enabled
  }
  function updateFog(patch) {
    try { state.fog?.update(patch) }
    catch { setStatus('雾距离需满足：0 ≤ 起点 < 远端；密度不能为负数。') }
    syncFogControls()
  }
  fogEnabled.onchange = () => updateFog({ enabled: fogEnabled.checked })
  fogType.onchange = () => updateFog({ type: fogType.value })
  fogColor.oninput = () => updateFog({ color: fogColor.value })
  fogDetails.ontoggle = () => { if (fogDetails.open) { glassDetails.open = false; syncFogControls() } }
  glassDetails.ontoggle = () => { if (glassDetails.open) fogDetails.open = false }
  const transparentShadowLabel = document.createElement('label'); transparentShadowLabel.style.cssText = shadowLabel.style.cssText
  const transparentShadowEnabled = document.createElement('input'); transparentShadowEnabled.type = 'checkbox'
  transparentShadowEnabled.setAttribute('aria-label', '透明物体实体投影')
  transparentShadowLabel.append(transparentShadowEnabled, '透明物体实体投影')
  transparentShadowLabel.title = '玻璃和透明建筑按实体轮廓投影，取消随机采样噪点；显示材质保持原效果。'
  glassControls.append(transparentShadowLabel)
  transparentShadowEnabled.onchange = () => {
    state.transparentShadows?.update({ enabled: transparentShadowEnabled.checked })
    syncTransparentShadowControls()
  }
  function syncTransparentShadowControls() {
    const shadow = state.transparentShadows?.getStatus()
    transparentShadowEnabled.checked = shadow?.enabled ?? false
    transparentShadowEnabled.disabled = baseline || !shadow
  }
  const contactLabel = document.createElement('label'); contactLabel.style.cssText = shadowLabel.style.cssText
  const contactEnabled = document.createElement('input'); contactEnabled.type = 'checkbox'
  contactEnabled.setAttribute('aria-label', '接触阴影'); contactLabel.append(contactEnabled, '接触阴影')
  contactLabel.title = '增强墙脚、树根和台阶在大楼阴影内的接触层次。'
  glassControls.append(contactLabel)
  contactEnabled.onchange = () => { state.contactShadows?.update({ enabled: contactEnabled.checked }); state.frameBudget?.resetAdaptation('contact-shadows') }
  function syncContactShadowControls() {
    const contact = state.contactShadows?.getStatus()
    contactEnabled.checked = contact?.enabled ?? true
    contactEnabled.disabled = baseline || !contact || !!contact.unsupported
  }
  function preferredDisplayQuality() {
    return resolveNanjingDisplayQuality({ preference: state.clientQualityPreference, gpu: state.profiler?.gpu, baseline })
  }
  function selectDisplayQuality(value) {
    if (!['full', 'balanced', 'fast'].includes(value)) return
    state.clientQualityPreference = value
    writeNanjingDisplayQuality(value)
    setQuality(value)
  }
  function restoreBenchmarkQuality() {
    const previous = state.benchmarkQualityRestore
    state.benchmarkQualityRestore = null
    if (!previous || !state.active || state.destroyed) return
    setQuality(previous, { transient: true })
  }
  function startFullQualityBenchmark({ extended = true } = {}) {
    if (!state.active || state.destroyed || state.profiler?.running) return false
    state.benchmarkQualityRestore = state.quality || preferredDisplayQuality()
    try {
      setQuality('full')
      clearTimeout(lodTimer)
      state.profiler.startBenchmark({ extended })
      updateLod()
      if (!state.profiler.running) restoreBenchmarkQuality()
      return !!state.profiler.running
    } catch (error) { restoreBenchmarkQuality(); throw error }
  }
  function setQuality(value, { transient = false } = {}) {
    if (!transient) state.profiler?.cancel()
    const quality = ['full', 'balanced', 'fast'].includes(value) ? value : 'balanced'
    if (!transient && state.quality !== quality) state.frameBudget?.resetAdaptation('quality-change')
    if (!transient && quality !== 'balanced') { state.interacting = false; state.frameBudget?.endGesture() }
    state.quality = baseline ? 'full' : quality
    qualitySelect.value = state.quality
    qualitySelect.disabled = baseline
    const policy = deviceProfile()
    state.displayPolicy = { ...policy, pixelRatio: policy.pixelRatio, drawingBuffer: [
      Math.floor(editor.renderer.domElement.clientWidth * policy.pixelRatio), Math.floor(editor.renderer.domElement.clientHeight * policy.pixelRatio)] }
    deviceStatus.textContent = policy.quality === 'balanced'
      ? `自动适配：${policy.gpuLabel} · 按运行耗时调整`
      : `${policy.quality === 'full' ? '完整细节' : '流畅模式'} · 自动调节已暂停`
    deviceStatus.title = policy.adaptationReason
    for (const controller of lodControllers()) if (controller.setEnabled(policy.quality !== 'full')) state.instancing?.invalidate({ rebuild: true })
    for (const material of state.foliageMaterials || []) {
      const singlePass = policy.singlePass
      if (material.forceSinglePass !== singlePass) { material.forceSinglePass = singlePass; material.needsUpdate = true }
    }
    if (baseline) return
    editor.renderer.transmissionResolutionScale = policy.transmissionScale
    const ratio = policy.pixelRatio
    if (editor.renderer.getPixelRatio() !== ratio) {
      state.applyingQuality = true
      try {
        editor.renderer.setPixelRatio(ratio)
        editor.effectComposer.setPixelRatio?.(ratio)
        editor.renderSceneResize()
      } finally { state.applyingQuality = false }
    }
    state.clarity?.sync()
    updateLod()
    state.instancing?.invalidate()
    if (!transient) invalidateShadows()
    state.renderDirty = true
  }
  function setStatus(message) {
    status.textContent = message
    state.message = message
    panel.style.display = state.active ? 'block' : 'none'
  }
  function disposeReflections() {
    if (state.reflectionFrame != null) cancelAnimationFrame(state.reflectionFrame)
    state.reflectionFrame = null
    state.reflectionPending = false
    state.reflectionAttempted = false
    state.reflections?.dispose()
    state.reflections = null
  }
  function initializeReflections(isCurrent = () => state.active && !state.destroyed, { manual = false } = {}) {
    disposeReflections()
    if (!isCurrent() || baseline || (!manual && !state.config?.reflections?.enabled)) return
    const instances = state.instancing
    const selection = state.selection
    try {
      const size = state.config?.reflections?.size ?? 512
      if (state.reflectionResources && state.reflectionResources.size !== size) {
        state.reflectionResources.dispose(); state.reflectionResources = null
      }
      state.reflectionResources ||= createNanjingReflectionResources(editor.renderer, size)
      const controller = createNanjingBuildingReflections(editor, {
        size: state.config?.reflections?.size ?? 512,
        resources: state.reflectionResources,
        facades: state.config?.facadeGlazing?.enabled === true && state.config?.glassComposition?.mode !== 'source',
        groundY: -2.25,
        withCaptureScene: capture => {
          if (!isCurrent() || state.reflections !== controller) throw new Error('场景已更换，本次反射更新已取消')
          const sourceFoliage = () => state.foliageZeroAlpha ? state.foliageZeroAlpha.withOriginals(capture) : capture()
          const sourceObjects = () => instances ? instances.withOriginals(sourceFoliage) : sourceFoliage()
          return selection ? selection.withOriginals(sourceObjects) : sourceObjects()
        },
        beforeCapture: () => { state.profiler?.cancel(); endMotion() },
        onChange: () => { if (isCurrent() && state.reflections === controller) invalidateRender() }
      })
      state.reflections = controller
      state.shadows?.update()
      if (!manual && state.config?.reflections?.autoCapture) {
        state.reflectionPending = true
        scheduleReflectionCapture()
      }
    } catch (error) {
      if (isCurrent()) setStatus(`局部反射未启用：${error.message} · 场景仍可编辑`)
    }
  }
  function scheduleReflectionCapture() {
    if (!state.reflectionPending || !state.reflections || !state.active || state.destroyed || state.reflectionAttempted) return
    if (document.visibilityState !== 'visible' || state.interacting || state.inputActive || state.transformDragging || state.profiler?.running || waitingForShadows()) return
    if (state.reflectionFrame != null) return
    const controller = state.reflections, generation = state.generation, application = state.application
    const isCurrent = () => state.active && !state.destroyed && state.reflections === controller
      && generation === state.generation && application === state.application
    state.reflectionPending = true
    // Allow the normal view to render its new lighting/shadow maps first. This
    // schedules one capture, not a recurring or orbit-driven update.
    state.reflectionFrame = requestAnimationFrame(() => {
      if (!isCurrent()) return
      state.reflectionFrame = requestAnimationFrame(() => {
        state.reflectionFrame = null
        if (isCurrent()) void updateReflections({ automatic: true })
      })
    })
  }
  async function updateReflections({ automatic = false } = {}) {
    if (!state.active || state.destroyed || baseline) return
    if (automatic && (state.reflectionAttempted || !state.config?.reflections?.autoCapture)) return
    if (automatic && (document.visibilityState !== 'visible' || state.interacting || state.inputActive || state.transformDragging || waitingForShadows())) {
      state.reflectionPending = true
      return
    }
    if (!state.config || !state.environmentTexture) { setStatus('场景仍在载入，反射实验暂不可用'); return }
    if (state.profiler?.running) {
      if (automatic) state.reflectionPending = true
      else setStatus('性能测试期间不更新反射，请等待测试完成')
      return
    }
    if (!state.reflections) {
      if (automatic) return
      state.config.reflections = { ...state.config.reflections, enabled: true }
      initializeReflections(undefined, { manual: true })
    }
    const controller = state.reflections
    if (!controller || controller.getStatus().capturing) return
    if (state.reflectionFrame != null) cancelAnimationFrame(state.reflectionFrame)
    state.reflectionFrame = null
    state.reflectionPending = false
    state.reflectionAttempted = true
    const generation = state.generation, application = state.application
    const isCurrent = () => state.active && !state.destroyed && state.reflections === controller
      && generation === state.generation && application === state.application
    setStatus('正在更新玻璃幕墙反射…仅本次捕获')
    try {
      const result = await controller.update()
      if (!isCurrent()) return
      setStatus(`${result.buildings?.length || 1} 栋玻璃楼反射已更新 · ${result.size} 像素 / 静态缓存`)
      state.renderDirty = true
      return result
    } catch (error) {
      if (isCurrent()) {
        setStatus(`局部反射更新失败：${error.message} · 当前场景仍可编辑`)
        state.renderDirty = true
      }
    } finally {
      if (isCurrent()) readyBenchmark()
    }
  }
  function readyBenchmark() {
    state.profiler?.ready?.({ canStart: () => state.active && !state.destroyed && !state.reflectionPending && !state.reflections?.getStatus().capturing,
      start: () => {
        const requestedQuality = new URLSearchParams(window.location.hash.split('?')[1] || '').get('benchmarkQuality')
        if (requestedQuality === 'full') { startFullQualityBenchmark({ extended: false }); return }
        clearTimeout(lodTimer); state.profiler.startBenchmark(); beginMotion(); updateLod()
      } })
  }
  function waitingForShadows() {
    return editor.renderer.shadowMap.enabled && editor.renderer.shadowMap.needsUpdate
      && editor.scene.children.some(object => object.isLight && object.visible && object.castShadow)
  }
  function applyTreeDensity(ratio = state.config?.performance?.treeDensity ?? 100) {
    state.treeDensity ||= createNanjingTreeDensity(editor, {
      getInstancingGroup: () => state.instancing?.group,
      getOriginalGeometry: geometry => {
        const source = state.trunkLod?.getOriginalGeometry(geometry) || geometry
        return state.lod?.getOriginalGeometry(source) || source
      }, onChange: () => {
      state.instancing?.invalidate()
      state.instancing?.syncIfNeeded({ force: true })
      state.shadows?.updateLayers({ invalidate: true })
      state.contactShadows?.invalidate?.({ structure: true })
      invalidateShadows(); invalidateRender()
    } })
    state.treeDensity.setRatio(ratio)
    treeDensity.value = String(state.treeDensity.getStatus().ratio)
  }
  async function apply(config, { view = true, lights = true } = {}) {
    if (!state.active) return
    cancelSceneRefresh()
    state.applicationReady = false
    state.frameBudget?.resetAdaptation('scene-apply')
    state.profiler?.cancelReady?.()
    if (state.benchmarkQualityRestore) state.profiler?.cancel()
    const generation = state.generation
    const application = state.application = (state.application || 0) + 1
    const isCurrent = () => state.active && !state.destroyed && generation === state.generation && application === state.application
    disposeReflections()
    state.foliageZeroAlpha?.dispose()
    state.foliageZeroAlpha = null
    state.fog?.dispose()
    state.fog = null
    state.contactShadows?.dispose()
    state.contactShadows = null
    state.surfaceLighting?.dispose()
    state.surfaceLighting = null
    if (!historyMode()) migrateNanjingConfig(config)
    if (!baseline && !historyMode()) migrateNanjingGlassComposition(config)
    // The source's IOR=1 is omitted from this GLB. Avoid adding a dielectric
    // reflection to this small, deliberately non-reflective rooftop material.
    if (!config.glassFixVersion && !historyMode()) {
      const glass = { type: 'MeshPhysicalMaterial', ior: 1 }
      if (Array.isArray(config.materials)) {
        const rule = config.materials.find(item => item.name === '建筑_立面玻璃')
        if (rule) Object.assign(rule, glass)
        else config.materials.push({ name: '建筑_立面玻璃', ...glass })
      } else {
        config.materials ||= {}
        config.materials['建筑_立面玻璃'] = { ...config.materials['建筑_立面玻璃'], ...glass }
      }
      config.glassFixVersion = 1
    }
    state.config = config
    if (config.background != null) {
      editor.scene.background = new THREE.Color()
      setColor(editor.scene.background, config.background)
    }
    const toneMapping = { AgX: THREE.AgXToneMapping, ACES: THREE.ACESFilmicToneMapping, None: THREE.NoToneMapping, Neutral: THREE.NeutralToneMapping, Linear: THREE.LinearToneMapping }
    editor.renderer.toneMapping = typeof config.renderer?.toneMapping === 'number' ? config.renderer.toneMapping : toneMapping[config.renderer?.toneMapping] ?? THREE.AgXToneMapping
    editor.renderer.toneMappingExposure = config.renderer?.exposure ?? 1
    editor.renderer.outputColorSpace = THREE.SRGBColorSpace
    editor.renderer.setClearAlpha(1)
    editor.renderer.shadowMap.enabled = config.shadows?.enabled ?? true
    editor.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    editor.renderer.shadowMap.autoUpdate = false
    if (view && config.camera) {
      setVector(editor.camera.position, config.camera.position)
      setVector(editor.controls.target, config.camera.target)
      for (const key of ['fov', 'near', 'far', 'zoom']) if (config.camera[key] != null) editor.camera[key] = config.camera[key]
      editor.camera.updateProjectionMatrix()
      editor.controls.update()
    }
    state.shadows?.dispose()
    state.shadows = null
    if (lights && (!historyMode() || Array.isArray(config.lights))) applyLights(editor, config)
    state.fogRecovery = null
    if (!baseline) {
      try { state.fog = createNanjingFog(editor, config, { onChange: invalidateRender }) }
      catch (error) {
        // The editor's native near/far fields permit invalid saved ranges. A
        // malformed fog must not abort restoring the rest of the GLB scene.
        state.fogRecovery = '原雾参数无效，已关闭雾；可在“远景雾”重新设置。'
        config.fog = { ...NANJING_FOG_DEFAULTS, enabled: false }
        state.fog = createNanjingFog(editor, config, { onChange: invalidateRender })
        console.warn(state.fogRecovery, error)
      }
    }
    syncFogControls()
    state.selection?.dispose()
    state.selection = null
    state.instancing?.dispose()
    state.instancing = null
    state.transparentShadows?.dispose()
    state.transparentShadows = null
    state.materialTangents?.dispose()
    state.materialTangents = null
    state.lod?.dispose()
    state.lod = null
    state.trunkLod?.dispose()
    state.trunkLod = null
    state.junctionPaving?.dispose()
    state.junctionPaving = null
    state.roadMarkingRecovery?.dispose()
    state.roadMarkingRecovery = null
    state.waterSurface?.dispose()
    state.waterSurface = null
    state.contextTextures?.dispose()
    state.contextTextures = null
    state.facadeFrameFinish?.dispose()
    state.facadeFrameFinish = null
    state.internalRoadSurfaces?.dispose()
    state.internalRoadSurfaces = null
    state.treeDensity?.dispose()
    state.treeDensity = null
    state.treePlacements?.dispose()
    state.treePlacements = null
    state.roadLevels?.dispose()
    state.roadLevels = null
    state.distantBuildingTexture?.dispose()
    state.distantBuildingTexture = null
    state.facadeCladding = baseline || historyMode() || config.facadeCladding?.enabled === false ? null : prepareNanjingFacadeCladding(editor, config)
    state.facadeGlazing = baseline || historyMode() || config.facadeGlazing?.enabled === false ? null : prepareNanjingFacadeGlazing(editor, config)
    state.roofEquipment = baseline || historyMode() ? null : prepareNanjingRoofEquipment(editor, config)
    Object.assign(state, applyMaterials(editor, config))
    editor.modelCollectionEdits?.restoreAll()
    await editor.materialTexturePersistence?.restoreAll()
    if (!isCurrent()) return
    state.contextMaterial = baseline || historyMode() ? null : applyNanjingContextMaterial(editor, config)
    state.curbMaterial = baseline || historyMode() ? null : applyNanjingCurbMaterial(editor, config)
    if (historyMode()) {
      state.historySnapshot = await restoreNanjingProjectSnapshot(editor, state.metadata?.historySnapshot, { isCurrent })
      if (!isCurrent()) return
    } else if (!baseline) {
      state.distantBuildingTexture = createNanjingDistantBuildingTexture(editor, {
        enabled: state.config?.distantBuildingTexture?.enabled !== false,
        onChange: invalidateRender
      })
      await state.distantBuildingTexture.ready
      if (!isCurrent()) return
    }
    state.roadLevels = baseline || historyMode() && !state.metadata?.historySnapshot?.roadLevels ? null
      : createNanjingRoadLevels(editor, config, { onChange: invalidateRender,
        snapshot: historyMode() ? state.metadata?.historySnapshot?.roadLevels : undefined })
    state.importedUtilities = baseline ? null : suppressNanjingImportedUtilities(editor)
    state.treePlacements = baseline ? null : createNanjingTreePlacements(editor, config, { onChange: invalidateRender })
    state.internalRoadSurfaces = baseline ? null : createNanjingInternalRoadSurfaces(editor, config, { onChange: invalidateRender })
    state.waterSurface = baseline ? null : createNanjingWaterSurface(editor, config, { onChange: invalidateRender })
    syncWaterControls()
    state.contextTextures = baseline ? null : createNanjingContextTextures(editor, config, { onChange: invalidateRender })
    state.facadeFrameFinish = baseline ? null : createNanjingFacadeFrameFinish(editor, config, { onChange: invalidateRender })
    if (!baseline) state.shadows = createNanjingShadows(editor, config, {
      onChange: invalidateRender,
      getOriginalGeometry: geometry => {
        const source = state.trunkLod?.getOriginalGeometry(geometry) || geometry
        return state.lod?.getOriginalGeometry(source) || source
      }
    })
    shadowStrength.value = String(state.shadows?.getStatus().settings.strength ?? 1)
    shadowStrength.disabled = baseline
    syncShadowLayerControls()
    syncShadowResolutionControl()
    state.transparentBlocks?.refresh()
    state.foliageTextureFix = historyMode() ? null : repairNanjingFoliageTexture(editor, config)
    state.shadows?.update()
    if (!baseline) state.contactShadows = createNanjingContactShadows(editor, config, { onChange: invalidateRender })
    syncContactShadowControls()
    state.transparentShadows = createNanjingTransparentShadows(editor, config, { onChange: invalidateRender })
    syncTransparentShadowControls()
    glassMode.value = config.glassComposition?.mode || 'source'
    glassMode.disabled = baseline
    glassTransmission.value = String([...facadeMaterials()][0]?.transmission ?? 1)
    glassTransmission.disabled = baseline
    environmentStrength.value = String(config.environment?.intensity ?? 1)
    if (!baseline) {
      state.materialTangents = createNanjingMaterialTangents(editor, { onChange: invalidateRender })
      state.lod = createNanjingLod(editor, { enabled: preferredDisplayQuality() !== 'full' })
      try {
        const buildGeometryLods = await loadNanjingTrunkLodBuilder()
        if (!isCurrent()) return
        state.trunkLod = createNanjingLod(editor, { ...NANJING_TRUNK_LOD_DEFAULTS, enabled: preferredDisplayQuality() !== 'full', buildGeometryLods })
      } catch (error) { console.warn('树干 LOD 未启用，保留源几何：', error) }
    }
    if (!isCurrent()) return
    state.groundOrder?.refresh()
    state.instancing = createNanjingInstancing(editor, { enabled: config.performance?.gpuInstancing !== false, cellSize: 8,
      fullSurfaceReceivers: config.shadows?.sampling?.fullSurfaceReceivers === true })
    state.roadMarkingRecovery = baseline ? null : createNanjingRoadMarkingRecovery(editor, config, { onChange: invalidateRender })
    state.junctionPaving = baseline ? null : createNanjingJunctionPaving(editor, config, { onChange: invalidateRender })
    state.instancing.rebuild()
    applyTreeDensity(config.performance?.treeDensity ?? 100)
    if (!baseline) state.selection = createNanjingSelection(editor, { onChange: invalidateRender })
    // Keep the opt-in off for older records until native GPU A/B validation.
    state.foliageZeroAlpha = baseline ? null : createNanjingFoliageZeroAlpha(editor, {
      enabled: config.performance?.foliageZeroAlpha === true, onChange: invalidateRender })
    setQuality(preferredDisplayQuality())
    updateInstancingButton()
    updateFoliageZeroAlphaButton()
    await applyEnvironment(editor, config, state, isCurrent)
    if (!isCurrent()) return
    if (!baseline && (!historyMode() || config.surfaceLighting)) state.surfaceLighting = createNanjingSurfaceLighting(editor, config, { onChange: invalidateRender })
    restoreProjectLightingBackgrounds(editor)
    syncSurfaceLightingControls()
    environmentStrength.value = String(editor.scene.environmentIntensity)
    editor.transformControls.detach()
    editor.setOutlinePass([])
    editor.handler.helpers.axes.showAxes = config.helpers?.axes ?? false
    editor.handler.helpers.grid.showGrid = config.helpers?.grid ?? false
    window.dispatchEvent(new CustomEvent('nanjing-helpers-updated'))
    editor.renderer.shadowMap.needsUpdate = true
    state.renderDirty = true
    window.updateSceneStats?.()
    setStatus(`南京数智城 A 地块 · ${state.meshes} 个网格 / ${state.materials} 个材质`)
    initializeReflections(isCurrent)
    state.shadows?.update()
    if (!state.reflectionPending) readyBenchmark()
    state.applicationReady = true
    editor.scene.dispatchEvent({ type: 'project-lighting-settings-changed' })
    updateAppearanceStatus()
    // Allow the core load-completion callback to clear its loading guard before
    // making the two requested version records. Only the named working copy is
    // eligible; public inspection pages and later history restores stay intact.
    const routeParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const immutableView = routeParams.has('sceneName') && !(routeParams.get('edit') === '1' && routeParams.get('import') === '1')
    if (!baseline && !immutableView && !routeParams.has('inspection')) {
      requestAnimationFrame(() => {
        if (!isCurrent() || state.requestedWaterUpdate) return
        state.requestedWaterUpdate = (async () => {
          const deadline = performance.now() + 30000
          while (isCurrent() && editor.__projectLoading && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
          if (!isCurrent() || editor.__projectLoading) return false
          return applyRequestedWaterUpdate({ projectName: currentProjectName(), config,
          sourceVersionId: state.params?.projectHistory?.sourceVersionId, storage: localStorage, save,
          getWater: () => state.waterSurface, isCurrent })
        })().then(changed => {
          if (changed && isCurrent()) { syncWaterControls(); invalidateRender() }
        }).catch(error => { if (isCurrent()) setStatus('自然水面版本保留失败：' + error.message) })
          .finally(() => { state.requestedWaterUpdate = null })
      })
    }
  }
  function ensureModel() {
    if (editor.scene.children.some(object => object.editorType === 'isModelGroup')) return Promise.resolve()
    if (state.loading) return state.loading
    state.loading = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('模型加载超时，请重新应用配置')), 180000)
      const { loaderService } = editor.modelCores.loadModel({ url: state.metadata?.modelUrl || MODEL_URL, type: 'GLTF' })
      loaderService.progress = progress => setStatus(`正在载入南京数智城模型 ${Number.isFinite(progress) ? Math.round(progress * 100) + '%' : ''}`)
      loaderService.complete = model => {
        clearTimeout(timer)
        model.name = '南京数智城A地块 · 减面版 · 园区73棵远景树'
        resolve(model)
      }
    }).finally(() => { state.loading = null })
    return state.loading
  }
  async function start(force = false, savedModels = false) {
    if (historyMode()) force = false
    state.profiler?.cancel()
    endMotion()
    const generation = ++state.generation
    if (!state.active) return
    setStatus('正在读取 Blender 场景配置…')
    try {
      let config = !force && state.metadata?.config
      if (!config) {
        const response = await fetch(state.metadata?.configUrl || CONFIG_URL, { cache: 'no-store' })
        if (!response.ok) throw new Error('场景配置尚未准备好，请稍后重新应用配置')
        config = await response.json()
        if (!force && state.metadata?.preservedConfig) config = { ...config, ...state.metadata.preservedConfig }
      }
      if (generation !== state.generation || !state.active) return
      if (force) {
        const shared = await fetchNanjingAppearance({ modelUrl: MODEL_URL, configUrl: CONFIG_URL })
        if (generation !== state.generation || !state.active) return
        if (shared) config = mergeNanjingAppearance(config, shared.appearance).config
        state.surfaceLighting?.dispose({ restore: true })
      }
      state.config = config
      if (!savedModels) await ensureModel()
      if (generation !== state.generation || !state.active) return
      await apply(config)
    } catch (error) {
      setStatus(`载入未完成：${error.message}`)
    }
  }
  editor.saveSceneEdit = () => {
    state.profiler?.cancel()
    endMotion()
    state.surfaceLighting?.update()
    const serialize = () => {
      // Single-pass foliage is a client display budget, not a shared edit.
      const foliagePasses = (state.foliageMaterials || []).map(material => [material, material.forceSinglePass])
      try {
        if (state.active) for (const [material] of foliagePasses) material.forceSinglePass = false
        const data = originalSave()
        editor.modelCollectionEdits?.annotateSave(data)
        if (state.active) {
          // The GLB referenced by modelInfo.url already contains the full model
          // hierarchy and source material table. Keep the JSON as a light
          // project descriptor instead of duplicating those large child/Root
          // material structures that the loader can recreate from the GLB.
          for (const entry of data.modelCores || []) {
            if (!entry?.modelInfo?.url || !entry.group) continue
            delete entry.group.children
            delete entry.group.RootMaterials
            delete entry.group.nanjingMaterialBindings
            delete entry.group.nanjingMaterialBindingRecovery
            delete entry.modelInfo.nanjingMaterialBindingId
          }
          // nanjingRestore.applyLights rebuilds the complete light set from
          // config.lights, so the core's duplicated light serialization is not
          // needed in this project file.
          delete data.lightCores
          state.materialBindingSave = { version: 1, externalized: true, models: data.modelCores?.length || 0 }
        }
        if (state.active) data[METADATA_KEY] = { version: 2,
          modelUrl: historyMode() ? state.metadata?.modelUrl || MODEL_URL : MODEL_URL,
          configUrl: historyMode() ? state.metadata?.configUrl || CONFIG_URL : CONFIG_URL,
          sharedAppearance: state.metadata?.sharedAppearance, config: snapshotConfig(editor, state),
          historySnapshot: captureNanjingProjectSnapshot(editor, state.roadLevels) }
        if (historyMode()) data.projectHistory = { ...state.params.projectHistory }
        return data
      } finally { for (const [material, singlePass] of foliagePasses) material.forceSinglePass = singlePass }
    }
    return withNanjingSourceScene(serialize)
  }
  function withNanjingSourceScene(callback) {
    const sourceRoadLevels = () => state.roadLevels ? state.roadLevels.withOriginals(callback) : callback()
    const sourceInternalRoadMaterials = () => state.internalRoadSurfaces ? state.internalRoadSurfaces.withOriginals(sourceRoadLevels) : sourceRoadLevels()
    const sourceWaterMaterials = () => state.waterSurface ? state.waterSurface.withOriginals(sourceInternalRoadMaterials) : sourceInternalRoadMaterials()
    const sourceContextTextureMaterials = () => state.contextTextures ? state.contextTextures.withOriginals(sourceWaterMaterials) : sourceWaterMaterials()
    const sourceFrameMaterials = () => state.facadeFrameFinish ? state.facadeFrameFinish.withOriginals(sourceContextTextureMaterials) : sourceContextTextureMaterials()
    const sourceTreePlacements = () => state.treePlacements ? state.treePlacements.withOriginals(sourceFrameMaterials) : sourceFrameMaterials()
    const sourceShadowMaterials = () => state.transparentShadows ? state.transparentShadows.withOriginals(sourceTreePlacements) : sourceTreePlacements()
    const reflectionMaterials = () => state.reflections ? state.reflections.withOriginals(sourceShadowMaterials) : sourceShadowMaterials()
    const trunkGeometry = () => state.trunkLod ? state.trunkLod.withOriginals(reflectionMaterials) : reflectionMaterials()
    const sourceGeometry = () => state.lod ? state.lod.withOriginals(trunkGeometry) : trunkGeometry()
    const sourceTangents = () => state.materialTangents ? state.materialTangents.withOriginals(sourceGeometry) : sourceGeometry()
    const sourceTreeDensity = () => state.treeDensity ? state.treeDensity.withOriginals(sourceTangents) : sourceTangents()
    const sourceObjects = () => state.instancing ? state.instancing.withOriginals(sourceTreeDensity) : sourceTreeDensity()
    const sourceMarkings = () => state.roadMarkingRecovery ? state.roadMarkingRecovery.withOriginals(sourceObjects) : sourceObjects()
    const sourcePaving = () => state.junctionPaving ? state.junctionPaving.withOriginals(sourceMarkings) : sourceMarkings()
    const sourceFoliage = () => state.foliageZeroAlpha ? state.foliageZeroAlpha.withOriginals(sourcePaving) : sourcePaving()
    return state.selection ? state.selection.withOriginals(sourceFoliage) : sourceFoliage()
  }
  editor.withNanjingSourceScene = withNanjingSourceScene
  editor.resetEditorStorage = params => {
    cancelSceneRefresh()
    state.profiler?.cancel()
    state.profiler?.cancelReady?.()
    endMotion()
    clearTimeout(lodTimer)
    clearTimeout(shadowTimer)
    disposeReflections()
    state.foliageZeroAlpha?.dispose()
    state.foliageZeroAlpha = null
    state.inputActive = false
    state.shadows?.dispose()
    state.shadows = null
    state.fog?.dispose()
    state.fog = null
    state.contactShadows?.dispose()
    state.contactShadows = null
    state.surfaceLighting?.dispose()
    state.surfaceLighting = null
    state.transformDragging = false
    state.pendingShadows = false
    if (params?.[METADATA_KEY]) params = prepareNanjingSceneParams(params, currentProjectName())
    state.selection?.dispose()
    state.selection = null
    state.instancing?.dispose()
    state.instancing = null
    state.transparentShadows?.dispose()
    state.transparentShadows = null
    state.lod?.dispose()
    state.lod = null
    state.trunkLod?.dispose()
    state.trunkLod = null
    state.generation += 1
    state.active = !!params?.[METADATA_KEY]
    state.metadata = params?.[METADATA_KEY]
    state.params = params
    state.transparentBlocks?.refresh()
    state.materialBindings = null
    state.appearanceDirty = false
    updateAppearanceStatus()
    state.materialTangents?.dispose()
    state.materialTangents = null
    state.junctionPaving?.dispose()
    state.junctionPaving = null
    state.roadMarkingRecovery?.dispose()
    state.roadMarkingRecovery = null
    state.waterSurface?.dispose()
    state.waterSurface = null
    state.contextTextures?.dispose()
    state.contextTextures = null
    state.facadeFrameFinish?.dispose()
    state.facadeFrameFinish = null
    state.internalRoadSurfaces?.dispose()
    state.internalRoadSurfaces = null
    state.treeDensity?.dispose()
    state.treeDensity = null
    state.treePlacements?.dispose()
    state.treePlacements = null
    state.roadLevels?.dispose()
    state.roadLevels = null
    state.distantBuildingTexture?.dispose()
    state.distantBuildingTexture = null
    state.config = null
    state.applicationReady = false
    state.frameBudget = null
    state.autoPixelRatio = null
    editor.renderer.transmissionResolutionScale = originalTransmissionScale
    state.cssInventoryDirty = true
    state.renderDirty = true
    editor.__nanjingRestoreActive = state.active
    editor.renderer.shadowMap.autoUpdate = state.active ? false : state.previousShadowAutoUpdate
    panel.style.display = state.active ? 'block' : 'none'
    editor.modelCollectionEdits?.setParams(params)
    const result = originalReset(params)
    if (state.active) start(false, !!params.modelCores?.length || params.modelCollections?.version === 1)
    return result
  }
  const previousAdd = editor.scene.ADDCALL
  editor.scene.ADDCALL = function (object) {
    if (object.userData?.nanjingUtility) return
    editor.modelCollectionEdits?.registerRoot(object)
    if (state.active && object.editorType === 'isModelGroup' && !historyMode()) {
      state.materialBindings = restoreNanjingMaterialBindings(object, state.params)
    }
    previousAdd?.call(this, object)
    if (!state.active && object.editorType === 'isModelGroup') queueMicrotask(() => {
      if (object.parent === editor.scene) editor.modelCollectionEdits?.restoreRoot(object)
    })
    state.contactShadows?.invalidate?.({ structure: true })
    state.cssInventoryDirty = true
    state.instancing?.invalidate({ rebuild: true })
    state.selection?.invalidate({ structure: true })
    invalidateShadows()
    if (object.editorType === 'isModelGroup' && state.active) {
      queueMicrotask(async () => {
        if (state.active && state.config) {
          const generation = state.generation, currentConfig = state.config
          const isCurrent = () => state.active && !state.destroyed && state.generation === generation && state.config === currentConfig
          try {
          disposeReflections()
          state.transparentShadows?.dispose()
          state.transparentShadows = null
          state.waterSurface?.dispose()
    state.waterSurface = null
    state.contextTextures?.dispose()
          state.contextTextures = null
          state.facadeFrameFinish?.dispose()
          state.facadeFrameFinish = null
          state.facadeCladding = baseline || historyMode() || state.config.facadeCladding?.enabled === false ? null : prepareNanjingFacadeCladding(editor, state.config)
          state.facadeGlazing = baseline || historyMode() || state.config.facadeGlazing?.enabled === false ? null : prepareNanjingFacadeGlazing(editor, state.config)
          state.roofEquipment = baseline || historyMode() ? null : prepareNanjingRoofEquipment(editor, state.config)
          // Saved GLB loading can finish after environment/application setup.
          // Rebuild the material inventory once it arrives; dispose BEFORE
          // source restoration so restored values are not mistaken for edits.
          const refreshSurfaceLighting = !!state.surfaceLighting
          state.surfaceLighting?.dispose()
          state.surfaceLighting = null
          state.internalRoadSurfaces?.dispose()
          state.internalRoadSurfaces = null
          Object.assign(state, applyMaterials(editor, state.config))
          editor.modelCollectionEdits?.restoreAll()
          await editor.materialTexturePersistence?.restoreAll()
          if (!isCurrent()) return
          state.contextMaterial = baseline || historyMode() ? null : applyNanjingContextMaterial(editor, state.config)
          state.curbMaterial = baseline || historyMode() ? null : applyNanjingCurbMaterial(editor, state.config)
          if (historyMode()) {
            state.historySnapshot = await restoreNanjingProjectSnapshot(editor, state.metadata?.historySnapshot, { isCurrent })
            if (!isCurrent()) return
          } else state.distantBuildingTexture?.refresh()
          state.importedUtilities = baseline ? null : suppressNanjingImportedUtilities(editor)
          state.internalRoadSurfaces = baseline ? null : createNanjingInternalRoadSurfaces(editor, state.config, { onChange: invalidateRender })
          state.waterSurface = baseline ? null : createNanjingWaterSurface(editor, state.config, { onChange: invalidateRender })
          syncWaterControls()
          state.contextTextures = baseline ? null : createNanjingContextTextures(editor, state.config, { onChange: invalidateRender })
          state.facadeFrameFinish = baseline ? null : createNanjingFacadeFrameFinish(editor, state.config, { onChange: invalidateRender })
          state.roadLevels?.refresh()
          state.treeDensity?.refresh()
          state.treePlacements?.refresh()
          state.roadMarkingRecovery?.refresh()
          state.junctionPaving?.refresh()
          state.transparentBlocks?.refresh()
          state.foliageTextureFix = historyMode() ? null : repairNanjingFoliageTexture(editor, state.config)
          if (refreshSurfaceLighting && !baseline && (!historyMode() || state.config.surfaceLighting)) {
            state.surfaceLighting = createNanjingSurfaceLighting(editor, state.config, { onChange: invalidateRender })
            syncSurfaceLightingControls()
          }
          state.shadows?.update()
          state.transparentShadows = createNanjingTransparentShadows(editor, state.config, { onChange: invalidateRender })
          state.foliageZeroAlpha?.refresh()
          syncTransparentShadowControls()
          state.materialTangents?.scan()
          state.groundOrder?.refresh()
          lodControllers().forEach(controller => controller.scan())
          setQuality(preferredDisplayQuality())
          state.instancing?.rebuild()
          invalidateShadows()
          window.updateSceneStats?.()
          setStatus(`南京数智城 A 地块 · ${state.meshes} 个网格 / ${state.materials} 个材质`)
          if (state.environmentTexture) {
            const textureController = state.distantBuildingTexture
            if (textureController) void textureController.ready.then(() => {
              if (isCurrent() && state.distantBuildingTexture === textureController) {
                state.waterSurface?.refresh()
    state.contextTextures?.refresh()
                state.transparentBlocks?.refresh()
                initializeReflections()
              }
            })
            else initializeReflections()
          }
          } catch (error) {
            if (isCurrent()) {
              state.applicationReady = state.meshes > 0
              setStatus(`工程恢复完成（部分效果未启用）：${error.message}`)
            }
          }
        }
      })
    }
  }
  const previousRemove = editor.scene.REMOVECALL
  editor.scene.REMOVECALL = function (object) {
    if (object.userData?.nanjingUtility) return
    previousRemove?.call(this, object)
    state.contactShadows?.invalidate?.({ structure: true })
    state.cssInventoryDirty = true
    state.instancing?.invalidate({ rebuild: true })
    state.selection?.invalidate({ structure: true })
    if (state.active && object.editorType === 'isModelGroup') queueMicrotask(() => {
      if (!state.active || state.destroyed) return
      state.materialTangents?.scan()
      state.groundOrder?.refresh()
      lodControllers().forEach(controller => controller.scan())
      state.instancing?.rebuild()
      if (state.environmentTexture) initializeReflections()
    })
    invalidateShadows()
  }
  async function save({ label } = {}) {
    if (editor.__projectLoading) throw new Error(editor.__projectLoadError || '模型仍在载入，请稍后保存')
    if (!state.meshes || state.destroyed) throw new Error('模型未载入，请稍后保存')
    const data = editor.saveSceneEdit()
    await saveProjectScene(currentProjectName(), data, { label })
    setStatus('工程已保存 · 可继续编辑或导出 JSON')
    state.metadata = data[METADATA_KEY]
    updateAppearanceStatus()
    return data
  }
  function importProjectFiles() {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json,.glb'; input.multiple = true
    input.onchange = async () => {
      try {
        const files = [...input.files]
        const jsonFile = files.find(file => /\.json$/i.test(file.name))
        const glbFile = files.find(file => /\.glb$/i.test(file.name))
        if (!jsonFile || !glbFile) throw new Error('请同时选择导出的 JSON 和 GLB 文件')
        const params = JSON.parse(await jsonFile.text())
        if (!params?.[METADATA_KEY]) throw new Error('JSON 不是南京工程模板')
        const dbName = `nanjing-import-${Date.now()}-${Math.random().toString(36).slice(2)}`
        await new Promise((resolve, reject) => {
          const open = globalThis.indexedDB.open('new_threeEditor_db', 1)
          open.onupgradeneeded = () => {
            const database = open.result
            if (!database.objectStoreNames.contains('GLB')) database.createObjectStore('GLB', { keyPath: 'name' })
          }
          open.onsuccess = () => {
            const database = open.result
            const transaction = database.transaction(['GLB'], 'readwrite')
            transaction.objectStore('GLB').put({ name: dbName, blob: glbFile })
            transaction.oncomplete = () => { database.close(); resolve() }
            transaction.onerror = () => reject(transaction.error || new Error('本地模型库写入失败'))
          }
          open.onerror = () => reject(open.error || new Error('本地模型库打开失败'))
        })
        const glbUrl = URL.createObjectURL(glbFile)
        const storedUrl = `blob:${dbName}`
        const modelList = globalThis.window?.threeEditorDB?.list || []
        if (!modelList.some(item => item.name === dbName)) modelList.push({ name: dbName, blob: glbFile })
        params[METADATA_KEY].modelUrl = MODEL_URL
        params[METADATA_KEY].configUrl = CONFIG_URL
        for (const entry of params.modelCores || []) if (entry?.modelInfo) {
          entry.modelInfo.url = glbUrl
          entry.modelInfo.threeEditorDBNameUrl = storedUrl
        }
        editor.resetEditorStorage(params)
        setStatus('已导入 JSON + GLB，正在恢复工程')
      } catch (error) {
        setStatus(`导入未完成：${error.message}`)
      }
    }
    input.click()
  }

  const actions = {
    '画面检查': () => {
      const materials = new Map()
      const plantMaterials = new Map()
      const groundMaterials = new Map()
      const buildingOcclusion = []
      editor.scene.traverse(object => {
        if (!object.isMesh || object.userData?.nanjingUtility) return
        if (object.name === '场地区块_近景建筑群_01' || /^a[234]/.test(object.name)) {
          buildingOcclusion.push({ name: object.name, visible: object.visible, castShadow: object.castShadow,
            receiveShadow: object.receiveShadow,
            materials: (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).map(material => ({
              name: material.name, type: material.type, opacity: material.opacity, transmission: material.transmission,
              envMap: !!material.envMap, envMapIntensity: material.envMapIntensity, emissiveIntensity: material.emissiveIntensity,
              color: material.color?.toArray(), emissive: material.emissive?.toArray()
            })) })
        }
        for (const material of (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)) {
          if (material.name === '场地_绿化铺地' || material.name === '远景_绿化底板') {
            const textureInfo = texture => texture && { name: texture.name, repeat: texture.repeat.toArray(),
              offset: texture.offset.toArray(), flipY: texture.flipY, imageSize: [texture.image?.width, texture.image?.height] }
            groundMaterials.set(material.uuid, { name: material.name, object: object.name, type: material.type,
              receiveShadow: object.receiveShadow, metalness: material.metalness, roughness: material.roughness,
              transparent: material.transparent, depthWrite: material.depthWrite, normalScale: material.normalScale?.toArray(),
              map: textureInfo(material.map), normalMap: textureInfo(material.normalMap) })
          }
          if (material.name === 'Material_25' || /叶片|三叶草|花叶|灌木叶|观赏草/.test(material.name)) {
            const plant = plantMaterials.get(material.uuid) || { name: material.name, type: material.type,
              standard: !!material.isMeshStandardMaterial, metalness: material.metalness, roughness: material.roughness,
              color: material.color?.toArray(), opacity: material.opacity, transparent: material.transparent,
              alphaTest: material.alphaTest, alphaToCoverage: material.alphaToCoverage, depthWrite: material.depthWrite, map: !!material.map,
              texture: material.map && { name: material.map.name, repeat: material.map.repeat.toArray(),
                colorSpace: material.map.colorSpace, channel: material.map.channel,
                offset: material.map.offset.toArray(), center: material.map.center.toArray(), rotation: material.map.rotation,
                flipY: material.map.flipY, imageSize: [material.map.image?.width, material.map.image?.height] },
              emissive: material.emissive?.toArray(), emissiveIntensity: material.emissiveIntensity, meshes: 0 }
            plant.meshes++; plantMaterials.set(material.uuid, plant)
          }
          if (!/^建筑_.*玻璃/.test(material.name) || materials.has(material.uuid)) continue
          materials.set(material.uuid, { name: material.name, type: material.type, metalness: material.metalness, roughness: material.roughness,
            transmission: material.transmission, opacity: material.opacity, ior: material.ior, sheen: material.sheen,
            sheenRoughness: material.sheenRoughness, transparent: material.transparent, depthWrite: material.depthWrite,
            localReflection: !!material.envMap, color: material.color?.toArray(), normalMap: !!material.normalMap })
        }
      })
      const data = { rendererRevision: 'surface-shadow-v25-model-36c1aee71981', quality: state.quality, interacting: !!state.interacting, gpu: state.profiler?.gpu, screenPixelRatio: window.devicePixelRatio, shaderErrors: [...state.shaderErrors],
        a1FacadeTransform: (() => { const object = editor.scene.getObjectByName('a1玻璃外墙'); return object ? { matrixWorld: object.matrixWorld.toArray(), parent: object.parent?.name, material: Array.isArray(object.material) ? object.material.map(material => material.name) : object.material?.name } : null })(),
        guiInvalidation: state.guiInvalidation?.getStatus(), assetInvalidation: state.assetInvalidation?.getStatus(),
        appearanceSync: state.appearanceClient?.getStatus(), appearanceDirty: !!state.appearanceDirty,
        deviceProfile: deviceProfile(), frameBudget: state.frameBudget?.getStats(), capabilities: state.profiler?.capabilities,
        clarity: state.clarity?.getStats(), transparency: state.transparency?.getStats(), groundOrder: state.groundOrder?.getStats(),
        transparentBlocks: state.transparentBlocks?.getStatus(),
        foliageZeroAlpha: state.foliageZeroAlpha?.getStatus(),
        contextMaterial: state.contextMaterial,
        curbMaterial: state.curbMaterial,
        materialTangents: state.materialTangents?.getStatus(), treeDensity: state.treeDensity?.getStatus(), waterSurface: state.waterSurface?.getStatus(), roofEquipment: state.roofEquipment, distantBuildingTexture: state.distantBuildingTexture?.getStatus(), roadLevels: state.roadLevels?.getStatus(), roadMarkingRecovery: state.roadMarkingRecovery?.getStatus(), treePlacements: state.treePlacements?.getStatus(), junctionPaving: state.junctionPaving?.getStatus(), internalRoadSurfaces: state.internalRoadSurfaces?.getStatus(), contextTextures: state.contextTextures?.getStatus(), facadeFrameFinish: state.facadeFrameFinish?.getStatus(), shadows: state.shadows?.getStatus(), fog: state.fog?.getStatus(),
        surfaceLighting: state.surfaceLighting?.getStatus(),
        foliageTextureFix: state.foliageTextureFix,
        materialBindings: state.materialBindings, materialBindingSave: state.materialBindingSave,
        transparentShadows: state.transparentShadows?.getStatus(), contactShadows: state.contactShadows?.getStatus(), fogRecovery: state.fogRecovery, reflections: state.reflections?.getStatus(),
        facadeCladding: state.facadeCladding, facadeGlazing: state.facadeGlazing, glass: [...materials.values()], plants: [...plantMaterials.values()],
        buildingOcclusion, groundMaterials: [...groundMaterials.values()], environmentIntensity: editor.scene.environmentIntensity,
        camera: { position: editor.camera.position.toArray(), target: editor.controls.target.toArray(), fov: editor.camera.fov, near: editor.camera.near, far: editor.camera.far },
        shadowReceiverBindings: import.meta.env.DEV ? state.shadows?.inspectReceiverBindings?.() : undefined,
        shadowGpuInspection: import.meta.env.DEV ? state.shadows?.inspectLayers?.() : undefined }
      const size = data.clarity?.canvasSize?.join('×') || '—'
      report.textContent = `画面检查：${size} 像素 · 屏幕 ${data.screenPixelRatio} 倍 / 渲染 ${editor.renderer.getPixelRatio()} 倍\n`
        + (data.shaderErrors.length ? `着色器错误：${data.shaderErrors.length} 条\n` : '')
        + `效果版本：${state.metadata?.sharedAppearance?.revision || '本地，尚未同步'}\n`
        + (data.materialBindings?.error ? `材质恢复：${data.materialBindings.error}；原参数已保留在工程恢复记录中\n` : '')
        + `显卡：${data.gpu || '未识别'}\n`
        + `设备适配：${data.deviceProfile.gpuLabel} / ${data.deviceProfile.gpuTier} · 像素 ${data.deviceProfile.pixelRatio.toFixed(2)} 倍 / 透射背景 ${Math.round(data.deviceProfile.transmissionScale * 100)}%\n`
        + (data.frameBudget?.lastWindow ? `负载判断：${data.frameBudget.lastWindow.bottleneck || data.frameBudget.lastWindow.source} / ${data.frameBudget.lastWindow.decision}\n` : '')
        + `后期：${data.clarity?.enabledPasses?.join('、') || '无'}\n`
        + `光影层次：${Math.round((data.surfaceLighting?.amount ?? 0) * 100)}%\n`
        + `阴影：浓度 ${Math.round((data.shadows?.settings.strength ?? 1) * 100)}% / 采样半径 ${data.shadows?.settings.radius ?? '—'}\n`
        + `投影精度：${data.shadows?.lights?.find(light => light.name === data.shadows?.shadowLightSelection?.primary?.name)?.allocatedMapSize?.join(' × ') || '等待分配'}\n`
        + `道路标高：${data.roadLevels?.active ? `${data.roadLevels.groundMeshes} 个地坪 / ${data.roadLevels.attachments} 个附属物 · 已调整` : '原始标高'}\n`
        + `阴影叠加：${data.shadows?.layers?.enabled ? `${Math.round(data.shadows.layers.strength * 100)}% · ${data.shadows.layers.active ? '仅建筑 × 植物/路灯' : '尚未就绪'}` : '关闭'}\n`
        + `树冠环境遮蔽：${data.shadows?.layers?.canopyShade?.active ? `${data.shadows.layers.canopyShade.trees} 棵 · 已缓存` : data.shadows?.layers?.canopyShade?.unsupported || '等待生成'}\n`
        + `地面自遮挡修正：${data.shadows?.groundCasters?.excluded || 0} 个薄片（仍接收建筑和树影）\n`
        + `远景雾：${data.fog?.enabled ? (data.fog.type === 'linear' ? `起点 ${data.fog.near} / 远端 ${data.fog.far}` : `密度 ${data.fog.density}`) : '关闭'}\n`
        + (data.fogRecovery ? `${data.fogRecovery}\n` : '')
        + `透明物体实体投影：${data.transparentShadows?.enabled ? `${data.transparentShadows.activeObjects} 个对象` : '关闭（可在幕墙与环境开启）'}\n`
        + `透明楼块遮挡：${data.transparentBlocks?.blocks ? `${data.transparentBlocks.blocks} 个独立楼块排序` : data.transparentBlocks?.error || '等待绘制'}\n`
        + `树叶空白跳过：${data.foliageZeroAlpha?.enabled ? '开（仅完全透明像素）' : '关'}\n`
        + `近景楼群材质：${data.contextMaterial?.active ? '已共享灰色透明玻璃' : data.contextMaterial?.errors?.join('；') || '未自动替换'}\n`
        + `园区路缘材质：${data.curbMaterial?.active ? '已共享浅灰路缘石' : data.curbMaterial?.errors?.join('；') || '未自动替换'}\n`
        + `接触阴影：${data.contactShadows?.active ? '开启 · 复用场景深度' : data.contactShadows?.unsupported || '关闭'}\n`
        + `地面采样修正：${data.shadows?.receiverPlane?.enabled ? `${data.shadows.receiverPlane.materials} 个材质` : '关闭'}\n`
        + `建筑采样修正：${data.shadows?.buildingReceiverPlane?.active ? `${data.shadows.buildingReceiverPlane.materials} 个材质 · 已启用` : '关闭'}\n`
        + `入口金属：${data.materialTangents?.activeObjects || 0} 处切线修复 · 地表排序：${data.groundOrder?.reordered ? '已启用' : '待绘制'}\n`
        + `局部反射：${data.reflections?.ready ? `${data.reflections.buildings?.map(item => item.id).join(' / ') || 'a1'} · ${data.reflections.size} 像素 · 已捕获 ${data.reflections.captures} 次` : data.reflections?.lastError || '等待静止时捕获'}\n`
        + (data.reflections?.ready ? `近场视差：${data.reflections.projectionShaderError || (data.reflections.boxProjection ? '已校正（近似）' : '关闭')}\n` : '')
        + data.glass.map(material => `${material.name}：粗糙度 ${material.roughness?.toFixed(3)} / 金属度 ${material.metalness?.toFixed(3)} / 透射 ${material.transmission ?? 0} / IOR ${material.ior ?? '—'} / ${material.localReflection ? '局部场景反射' : '天空环境反射'}`).join('\n')
      report.dataset.diagnostics = JSON.stringify(data)
    },
    '更新反射': () => updateReflections(),
    '玻璃对比': () => {
      state.profiler?.cancel(); endMotion()
      const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '玻璃幕墙对比')
      dialog.style.cssText = 'padding:12px;background:#18232c;color:white;border:1px solid #668094;width:90vw;max-width:1600px'
      const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap'
      const images = document.createElement('div'); images.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px'
      const caption = document.createElement('p')
      const views = [
        { name: '四楼正面', position: [-0.3, 13, 23.5], target: [-0.3, 1.6, -0.5], fov: 45 },
        { name: '四楼背面', position: [-12.3, 13, -21.28460969], target: [-0.3, 1.6, -0.5], fov: 45 },
        { name: '玻璃近景', position: [-12, 5.5, 13], target: [-2.5, 0.8, 2.5], fov: 38 },
        { name: '当前透明遮挡', blocks: true },
        { name: '近景楼群材质', blocks: true, position: [-45, 30, -20], target: [4, 0, 30], fov: 45 },
        { name: '楼块正面遮挡', blocks: true, position: [8.456988098, 0.148359936, -13.676920427], target: [0.456988097, -1.451640064, -13.676920427], fov: 45 },
        { name: '楼块反向遮挡', blocks: true, position: [-12.920621101, 0.148360055, 12.430615689], target: [-4.920621101, -1.451639945, 12.430615689], fov: 45 }
      ]
      const compare = view => {
        const draw = () => {
          updateLod(); state.renderDirty = true; editor.effectComposer.effectUpdate()
        }
        if (view.blocks && !state.transparentBlocks) throw new Error('当前模式没有启用透明楼块排序')
        const comparison = view.blocks ? compareNanjingSurfaceLighting(editor, {
          getStatus: () => state.transparentBlocks.getStatus(),
          withBaseline: callback => state.transparentBlocks.withOriginals(callback)
        }, draw, view.position ? view : null) : compareNanjingGlass(editor, state.reflections, draw, view)
        images.replaceChildren()
        for (const [label, url] of [[view.blocks ? '原透明遮挡' : '原玻璃', comparison.before], [view.blocks ? '当前透明遮挡' : '当前玻璃', comparison.after]]) {
          const figure = document.createElement('figure'); figure.style.margin = '0'
          const name = document.createElement('figcaption'); name.textContent = label
          const image = document.createElement('img'); image.alt = label; image.src = url
          image.style.cssText = 'display:block;width:100%;max-height:74vh;object-fit:contain'
          figure.append(name, image); images.append(figure)
        }
        dialog.dataset.result = JSON.stringify(comparison.result)
        caption.textContent = view.blocks ? `${view.name} · 保持原透明度，对照前后遮挡关系`
          : `${comparison.result.view} · 调整 ${comparison.result.changedObjects} 栋 · 保持当前画质和光照`
      }
      for (const view of views) {
        const button = document.createElement('button'); button.textContent = view.name
        button.onclick = () => { try { compare(view) } catch (error) { caption.textContent = error.message } }; controls.append(button)
      }
      const close = document.createElement('button'); close.textContent = '关闭玻璃对比'
      close.onclick = () => { dialog.close(); dialog.remove() }
      controls.append(close); dialog.append(controls, images, caption); document.body.append(dialog)
      dialog.addEventListener('cancel', () => dialog.remove(), { once: true })
      try { compare(views[0]); dialog.showModal() } catch (error) { dialog.remove(); throw error }
    },
    '光影对比': () => {
      if (!state.surfaceLighting) return
      state.profiler?.cancel(); endMotion()
      const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '表面光影对比')
      dialog.style.cssText = 'padding:12px;background:#18232c;color:white;border:1px solid #668094;width:90vw;max-width:1500px'
      const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap'
      const images = document.createElement('div'); images.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px'
      const caption = document.createElement('p'); caption.style.cssText = 'margin:8px 0;font:13px sans-serif'
      const views = [null, ...NANJING_PARAMETER_COMPARISON_VIEWS,
        { name: '远景轻窗格', contextTextureAudit: true, position: [60, 4, 42], target: [53, -.4, 32.2], fov: 42 },
        { name: '停车入口', contextTextureAudit: true, position: [20, 1.6, 7], target: [17.7, -2.03835, 2.8], fov: 38 },
        { name: '区块步道细石材', contextTextureAudit: true, pedestrianTextureAudit: true, position: [12.55575994, .76084714, 13.11444728], target: [10.35575994, -2.03915286, 15.11444728], fov: 42 },
        { name: '外框质感', facadeFrameAudit: true, position: [-10.5, 3.4, 15.5], target: [-.6, 1.2, 4.65], fov: 40 },
        { name: '区块道路材质', internalRoadSurfaceAudit: true, position: [12, 4, 3.7], target: [10.25, -2.03615, 7.1], fov: 42 },
        { name: '入口两侧铺装补缝', junctionPavingAudit: true, position: [12, 4, 3.7], target: [10.25, -2.03615, 7.1], fov: 42 },
        { name: '入口树木位置', treePlacementAudit: true, position: [12, 4, 3.7], target: [10.25, -2.03615, 7.1], fov: 42 },
        { name: '长人行带连续移动', groundGapAudit: true, groundRestores: { '道路_人行道路面_01': .0004 }, motionPositions: [[-5.2, 1, 1.8], [-5, 1, 2], [-4.8, 1, 2.2]], target: [-9.232877386, -2.039152857, 6.616492458], fov: 40 },
        { name: '高楼颜色提亮20%', a1ColorAudit: true, position: [14, 8, -2], target: [6.09172063, 3.95945849, .07183688], fov: 40 },
        { name: '草带边缘连续移动', groundGapAudit: true, groundRestores: { '场地区块_建筑群路面_02': .0004 }, motionPositions: [[21.6, .8, .3], [21.8, .8, .5], [22, .8, .7]], target: [18.821218, -2.03620286, 3.881924], fov: 40 },
        { name: '缺失双黄线恢复', markingRecovery: true, position: [-16.815227, 28, 10.372705], target: [-18.407882, -2.03615, 12.915037], fov: 36 },
        { name: '双黄线停止线接头', markingRecovery: true, position: [-14.124229, 10.5, 6.256057], target: [-15.185999, -2.03615, 7.950945], fov: 35 },
        { name: '门前铺装连续移动', groundGapAudit: true, motionPositions: [[12.8, 1, -4.2], [13, 1, -4], [13.2, 1, -3.8]], target: [7.7, -2.036, -2.6], fov: 40 },
        { name: '门前铺装移动左', groundGapAudit: true, position: [12.8, 1, -4.2], target: [7.7, -2.036, -2.6], fov: 40 },
        { name: '门前铺装移动中', groundGapAudit: true, position: [13, 1, -4], target: [7.7, -2.036, -2.6], fov: 40 },
        { name: '门前铺装移动右', groundGapAudit: true, position: [13.2, 1, -3.8], target: [7.7, -2.036, -2.6], fov: 40 },
        { name: '叶片近景', position: [8.2, -.55, 7.8], target: [5.95, -1.3, 5.61], fov: 40 },
        { name: '门牌近景', light: '面光.001', position: [10.3, -0.5, 4.8], target: [6.7, -1.9, 2.65], fov: 35 },
        { name: '建筑总览', position: [14, 13, 19], target: [1, -2, 4], fov: 45 },
        { name: '屋面栅格来源', surfaceShadowAudit: true, position: [11, 11, 7], target: [4.4, 6.18, -1.4], fov: 40 },
        { name: '外框玻璃栅格来源', surfaceShadowAudit: true, position: [6, 5, 14], target: [-.57, 1.9, 4.64], fov: 40 },
        { name: '普通楼体栅格来源', surfaceShadowAudit: true, position: [9.05245, 6, -5.82068], target: [3.05245, -.10237, -13.82068], fov: 40 },
        { name: '地面栅格来源', surfaceShadowAudit: true, position: [17.21559903, .99338621, 14.21674567], target: [16.01559903, -2.00661379, 12.71674567], fov: 40 },
        { name: '远景栅格来源', surfaceShadowAudit: true, position: [-100, 95, 135], target: [0, -2, 0], fov: 45 },
        { name: '普通楼体接触阴影', contactAudit: true, position: [9.05245, 6, -5.82068], target: [3.05245, -.10237, -13.82068], fov: 40 },
        { name: '普通楼体分类阴影', layerAudit: true, position: [9.05245, 6, -5.82068], target: [3.05245, -.10237, -13.82068], fov: 40 },
        { name: '透过楼体的水面阴影', groundShadows: true, position: [9.05245, 6, -5.82068], target: [3.05245, -.10237, -13.82068], fov: 40 },
        { name: '屋面法线对照', normalAudit: ['建筑_屋面混凝土', '建筑_楼层混凝土'], position: [11, 11, 7], target: [4.4, 6.18, -1.4], fov: 40 },
        { name: '草坪法线对照', normalAudit: ['场地_绿化铺地'], position: [4, 5, 9], target: [0, -2, 5], fov: 40 },
        { name: '高楼屋面阴影', buildingShadows: true, position: [11, 11, 7], target: [4.4, 6.2, -1.4], fov: 40 },
        { name: '裙楼屋面阴影', buildingShadows: true, position: [6, 10, 12], target: [-.57, 3.9, 4.64], fov: 40 },
        { name: '透明楼块阴影', buildingShadows: true, position: [9.05245, 6, -5.82068], target: [3.05245, -.10237, -13.82068], fov: 40 },
        { name: '玻璃亮面阴影', buildingShadows: true, position: [7.14298688, 4.7, -7.71575987], target: [4.48248819, 4.40007646, -3.48385660], fov: 40 },
        { name: '玻璃侧面阴影', buildingShadows: true, position: [-2.16191588, 4.7, -4.41890320], target: [2.06998564, 4.40007647, -1.75840197], fov: 40 },
        { name: '向光玻璃质感', a1DaylightScale: .25, position: [.610, 5.174, -17.900], target: [4.4051602, 2.1735841, -1.3581647], fov: 50 },
        { name: '向光玻璃零漫反射', a1DaylightScale: 0, position: [.610, 5.174, -17.900], target: [4.4051602, 2.1735841, -1.3581647], fov: 50 },
        { name: '背光玻璃保持对照', a1DaylightScale: .25, position: [8.200, 5.174, 15.183], target: [4.4051602, 2.1735841, -1.3581647], fov: 50 },
        { name: '玻璃面光', a1AreaLighting: true, position: [14, 8, -2], target: [6.09172063, 3.95945849, .07183688], fov: 40 },
        { name: '四楼面光', a1AreaLighting: true, position: [-.3, 13, 23.5], target: [-.3, 1.6, -.5], fov: 45 },
        { name: '草坪接缝', roadLevels: true, position: [9.4, -1.2, 7.1], target: [12.2, -2.045, 3.7], fov: 40 },
        { name: '中央园区标高', roadLevels: true, position: [0, 27, 2], target: [0, -2, 1], fov: 40 },
        { name: '园区内外道路接缝', roadLevels: true, position: [8.1, -1.7, -1.1], target: [6.9, -2.025, -.15], fov: 40 },
        { name: '园区浅色入口接缝', roadLevels: true, position: [2.18, -1.7, 6.83], target: [.978, -2.025, 7.783], fov: 40 },
        { name: '园区停车入口接缝', roadLevels: true, position: [2.7, -1.68, 4.8], target: [4.09, -2.026, 5.27], fov: 40 },
        { name: '路口标线层级', roadLevels: true, position: [4, 15, -13], target: [-1, -2.036, -16], fov: 45 },
        { name: '远景正常标线', roadLevels: true, position: [-18, 12, 25], target: [-23.85, -2.0364, 21.5], fov: 50 },
        { name: '外围连接步道', roadLevels: true, position: [-58.3, 3, 4], target: [-58.3, -2.038, .6], fov: 40 },
        { name: '临河铺装收边', roadLevels: true, position: [66, 4, 8], target: [65.1, -2.0365, 3.8], fov: 40 },
        { name: '道路标高', roadLevels: true, position: [27.31328626, -1.4059679, 10.23036582], target: [27.31328626, -2.0059679, 7.23036582], fov: 40 },
        { name: '远路标高', roadLevels: true, position: [13.09186528, -1.5146512851, -15.08581715], target: [15.21318562, -2.1146512851, -12.96449681], fov: 40 },
        { name: '区块内道路阴影', groundShadows: true, position: [17.21559903, .99338621, 14.21674567], target: [16.01559903, -2.00661379, 12.71674567], fov: 40 },
        { name: '圆形铺装阴影', groundShadows: true, position: [22.68192215, .84599996, 10.55723953], target: [21.48192215, -2.15400004, 9.05723953], fov: 40 },
        { name: '远景深度精度', depthPrecision: true, position: [-100, 95, 135], target: [0, -2, 0], fov: 45 },
        { name: '远景横纹', contactSampling: true, position: [-100, 95, 135], target: [0, -2, 0], fov: 45 }]
      const compare = view => {
        const light = view?.light && editor.scene.getObjectByName(view.light)
        const controller = (view?.shadowResolutionComparison || view?.a1DiffuseComparison) ? createNanjingParameterComparison(editor, state.shadows, view) : view?.contextTextureAudit ? state.contextTextures : view?.facadeFrameAudit ? state.facadeFrameFinish : view?.internalRoadSurfaceAudit ? { getStatus: () => state.internalRoadSurfaces.getStatus(), withBaseline: callback => state.internalRoadSurfaces.withOriginals(callback) } : view?.junctionPavingAudit ? state.junctionPaving : view?.treePlacementAudit ? {
          getStatus: () => state.treePlacements?.getStatus(),
          withBaseline: callback => state.treePlacements.withOriginals(() => {
            const deltas = [['周边乔木_33027', .12498641677488731], ['周边乔木_33028', .12598641582121584], ['周边乔木_33033', .12498632140746135]]
            const rows = deltas.map(([name, delta]) => ({ object: editor.scene.getObjectByName(name), delta })).filter(row => row.object)
            for (const row of rows) { row.y = row.object.position.y; row.object.position.y -= row.delta; row.object.updateMatrix() }
            editor.scene.updateMatrixWorld(true)
            const restore = () => { for (const row of rows) { row.object.position.y = row.y; row.object.updateMatrix() } editor.scene.updateMatrixWorld(true) }
            try { const result = callback(); if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore); restore(); return result } catch (error) { restore(); throw error }
          })
        } : view?.a1ColorAudit ? { getStatus: () => state.shadows.a1GlassDaylight.getStatus(), withBaseline: callback => state.shadows.a1GlassDaylight.withColorBaseline(callback) } : view?.markingRecovery ? state.roadMarkingRecovery : view?.groundGapAudit ? {
          getStatus: () => ({ audit: 'ground-gap', applied: true, maximumLocalShift: .0004 }),
          withBaseline: callback => {
            const shifts = view.groundRestores || { '场地区块_建筑园区块_04': -.0004, '道路_道路地面纹理': -.0004 }
            const records = Object.keys(shifts).map(name => {
              const object = editor.scene.getObjectByName(name)
              if (!object) throw new Error(`未找到铺装 ${name}`)
              return { object, previousY: object.position.y }
            })
            for (const { object } of records) { object.position.y += shifts[object.name] / object.parent.matrixWorld.elements[5]; object.updateMatrixWorld(true) }
            try { return callback() } finally { for (const { object, previousY } of records) { object.position.y = previousY; object.updateMatrixWorld(true) } }
          }
        } : view?.layerAudit ? {
          getStatus: () => state.shadows.getStatus().layers,
          withBaseline: callback => state.shadows.withLayerBaseline(callback)
        } : view?.contactAudit ? {
          getStatus: () => state.contactShadows.getStatus(),
          withBaseline: callback => state.contactShadows.withContactBaseline(callback)
        } : view?.normalAudit ? {
          getStatus: () => ({ audit: 'normal-detail', materials: view.normalAudit }),
          withBaseline: callback => {
            const originals = new Map()
            editor.scene.traverse(object => {
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (material?.normalScale && view.normalAudit.includes(material.name) && !originals.has(material)) {
                  originals.set(material, material.normalScale.clone()); material.normalScale.set(0, 0)
                }
              }
            })
            try { return callback() } finally { for (const [material, value] of originals) material.normalScale.copy(value) }
          }
        } : view?.surfaceShadowAudit ? {
          getStatus: () => ({ main: state.shadows?.getStatus(), contact: state.contactShadows?.getStatus(), audit: 'temporary-shadow-isolation' }),
          withBaseline: callback => {
            const receivers = []
            editor.scene.traverse(object => { if (object.isMesh && object.receiveShadow) { receivers.push(object); object.receiveShadow = false } })
            try { return state.contactShadows ? state.contactShadows.withContactBaseline(callback) : callback() }
            finally { for (const object of receivers) object.receiveShadow = true }
          }
        } : Number.isFinite(view?.a1DaylightScale) ? state.shadows.a1GlassDaylight : view?.contactSampling ? {
          getStatus: () => state.contactShadows.getStatus(),
          withBaseline: callback => state.contactShadows.withSamplingBaseline(callback)
        } : view?.a1AreaLighting ? state.shadows.a1AreaLighting : view?.roadLevels ? {
          getStatus: () => state.roadLevels.getStatus(),
          withBaseline: callback => state.roadLevels.withOriginals(() => {
            editor.renderer.shadowMap.needsUpdate = true
            try { return callback() } finally { editor.renderer.shadowMap.needsUpdate = true }
          })
        } : view?.buildingShadows ? {
          getStatus: () => state.shadows.getStatus().buildingReceiverPlane,
          withBaseline: callback => state.shadows.withBuildingReceiverBaseline(callback)
        } : view?.groundShadows ? {
          getStatus: () => state.shadows.getStatus().receiverPlane,
          withBaseline: callback => state.shadows.withGroundReceiverBaseline(callback)
        } : view?.depthPrecision ? {
          getStatus: () => state.contactShadows.getStatus().depthPrecision,
          withBaseline: callback => state.contactShadows.withDepthBaseline(callback)
        } : light ? {
          getStatus: () => ({ amount: 1, light: light.name, intensity: light.intensity,
            width: light.width, height: light.height, rotation: light.rotation.toArray(), castShadow: light.castShadow }),
          withBaseline: callback => {
            const previous = { intensity: light.intensity, width: light.width, height: light.height, rotation: light.rotation.clone() }
            light.intensity = 0.8042405844485341; light.width = 1; light.height = 1.5831575393676758
            light.rotation.set(-1.1991103516537343, 0.809001661029043, 1.0766684518417773)
            try { return state.shadows ? state.shadows.withPlaqueFillBaseline(callback) : callback() } finally {
              light.intensity = previous.intensity; light.width = previous.width; light.height = previous.height; light.rotation.copy(previous.rotation)
            }
          }
        } : state.surfaceLighting
        const captureComparison = () => compareNanjingSurfaceLighting(editor, controller, () => {
          syncSurfaceEnvironment(); updateLod(); state.renderDirty = true; editor.effectComposer.effectUpdate()
        }, view)
        const capture = () => Number.isFinite(view?.a1DaylightScale)
          ? controller.withDiffuseScale(view.a1DaylightScale, captureComparison) : captureComparison()
        // Height A/B must draw the real attachment transforms in both images;
        // instance matrices are deliberately cached for the corrected scene.
        const captureRoadObjects = () => state.instancing ? state.instancing.withOriginals(capture) : capture()
        const comparison = view?.roadLevels
          ? (state.selection ? state.selection.withOriginals(captureRoadObjects) : captureRoadObjects()) : capture()
        images.replaceChildren()
        const beforeLabel = view?.shadowResolutionComparison ? '原参数 · 4096' : view?.a1DiffuseComparison ? '原参数 · 受光 .25' : view?.pedestrianTextureAudit ? '原纯色步道' : view?.contextTextureAudit ? (state.contextTextures?.getStatus().facadeScope === 'distant' && view.name !== '停车入口' ? '原远景纹理' : '原无纹理表面') : view?.facadeFrameAudit ? '原外框质感' : view?.a1ColorAudit ? '提亮前' : view?.markingRecovery ? '恢复前' : view?.groundGapAudit ? '原重叠间距' : view?.layerAudit ? '临时隔离分类阴影' : view?.contactAudit ? '临时隔离接触阴影' : view?.normalAudit ? '临时隔离法线细节' : view?.surfaceShadowAudit ? '临时隔离阴影' : Number.isFinite(view?.a1DaylightScale) ? '原玻璃受光' : view?.contactSampling ? '原接触阴影采样' : view?.a1AreaLighting ? '面光影响玻璃' : view?.roadLevels ? '原始标高' : view?.depthPrecision ? '24 位深度' : view?.groundShadows ? '原地面阴影' : view?.buildingShadows ? '原建筑阴影' : light ? '原门牌照明' : '调整前'
        const afterLabel = view?.shadowResolutionComparison ? '候选参数 · 8192' : view?.a1DiffuseComparison ? '候选参数 · 受光 .45' : view?.contextTextureAudit ? '当前贴图' : view?.facadeFrameAudit ? '当前外框质感' : view?.markingRecovery ? '恢复双黄线' : Number.isFinite(view?.a1DaylightScale) ? '分面受光调整' : view?.contactSampling ? '当前接触阴影采样' : view?.a1AreaLighting ? '面光仅照周围' : view?.roadLevels ? '当前标高' : view?.depthPrecision ? '当前深度' : view?.groundShadows ? '当前地面阴影' : view?.buildingShadows ? '当前建筑阴影' : '当前光影'
        const displayFrames = comparison.frames || [comparison]
        for (const [frameIndex, frame] of displayFrames.entries()) for (const [label, url] of [[beforeLabel, frame.before], [afterLabel, frame.after]]) {
          const figure = document.createElement('figure'); figure.style.margin = '0'
          const labelNode = document.createElement('figcaption'); labelNode.textContent = displayFrames.length > 1 ? `${frameIndex + 1} · ${label}` : label
          const img = document.createElement('img'); img.alt = label; img.src = url
          img.style.cssText = 'display:block;width:100%;max-height:74vh;object-fit:contain'
          figure.append(labelNode, img); images.append(figure)
        }
        dialog.dataset.result = JSON.stringify(comparison.result)
        caption.textContent = view?.shadowResolutionComparison ? `${view.name} · 仅比较主阴影贴图精度，拍摄后自动还原当前工程参数` : view?.a1DiffuseComparison ? `${view.name} · 仅比较两个向光面的直射漫反射，拍摄后自动还原当前工程参数` : view?.contextTextureAudit ? `${view.name} · 相同视角对照，保留原平均亮度和透明度` : view?.facadeFrameAudit ? '外框质感 · 相同视角对比反光与粗糙度' : view?.a1ColorAudit ? '仅图中高楼的玻璃基础颜色提亮20%，保持其他参数' : view?.markingRecovery ? '恢复道路双黄线，并在停止线前结束' : (view?.groundGapAudit || view?.layerAudit || view?.contactAudit || view?.normalAudit || view?.surfaceShadowAudit) ? `${view.name} · 相同视角对照，临时隔离检查后自动还原`
          : Number.isFinite(view?.a1DaylightScale) ? `${view.name} · 仅调整两个向光立面的直射漫反射，颜色、背光面、玻璃高光与透射保持一致`
          : view?.contactSampling ? '远景横纹 · 对齐深度取样与空间重建，保留相同的接触阴影强度'
          : view?.a1AreaLighting ? '只排除白色面光对建筑玻璃的影响，周围照明与环境反射保持一致'
          : view?.roadLevels ? `${view.name} · 调整原地坪标高，附属物随脚下地面移动；没有新增支撑面`
          : view?.depthPrecision ? `${view.name} · 相同相机、材质与阴影，比较深度精度`
          : (view?.buildingShadows || view?.groundShadows) ? `${view.name} · 对照阴影采样修正，保留原材质、灯光与画质`
          : light ? '门牌近景 · 对照局部补光与阴影接收，全场光照和材质保持一致'
          : `${comparison.result.view} · 光影层次 ${Math.round(comparison.result.lighting.amount * 100)}% · 相同视角与画质`
      }
      for (const view of views) {
        const button = document.createElement('button'); button.textContent = view?.name || '当前视角'
        button.onclick = () => { try { compare(view); delete dialog.dataset.error } catch (error) { caption.textContent = error.message; dialog.dataset.error = error.stack || error.message } }
        controls.append(button)
      }
      const close = document.createElement('button'); close.textContent = '关闭光影对比'
      close.onclick = () => { dialog.close(); dialog.remove() }
      controls.append(close); dialog.append(controls, images, caption); document.body.append(dialog)
      dialog.addEventListener('cancel', () => dialog.remove(), { once: true })
      try { compare(views[0]); dialog.showModal() } catch (error) { dialog.remove(); throw error }
    },
    '叠加对比': () => {
      state.profiler?.cancel(); endMotion()
      const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '阴影叠加对比')
      dialog.style.cssText = 'padding:12px;background:#18232c;color:white;border:1px solid #668094;width:90vw;max-width:1500px'
      const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap'
      const images = document.createElement('div'); images.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px'
      const caption = document.createElement('p'); caption.style.cssText = 'margin:8px 0;font:13px sans-serif'
      const views = [
        null,
        { name: '园区阴影总览', position: [14, 13, 19], target: [1, -2, 4], fov: 45 },
        { name: '建筑与树影', position: [8.805648692, -.530152857, 5.859617399], target: [6.305648692, -2.030152857, 5.859617399] },
        { name: '树下草地', position: [5.340779881161892, -1.7782564982771873, 6.5586554390135445], target: [5.8, -2.0282564982771873, 5.45], fov: 45 },
        { name: '门牌后方草坪', position: [8.8, -1.5, 3.4], target: [6.8, -1.65, 1.9], fov: 45 },
        { name: '草坪树冠投影', position: [8.8, -1.5, 3.4], target: [7.029308440375674, -2.0282564982771873, 1.9069072928039383], fov: 45 },
        { name: '树脚与灯脚', position: [7.25, -1.12, 6.45], target: [5.99, -2.01, 5.45], fov: 45 },
        { name: '树根接触', contact: true, position: [6.7, -1.45, 6.1], target: [6.0246540167, -2.0161895603, 5.5955921306], fov: 45 },
        { name: '灯脚接触', contact: true, position: [6.9, -1, 6.28], target: [5.9310255351, -1.9966869676, 5.3398087411], fov: 40 },
        { name: '建筑之间（不叠加）', position: [1, 4, 11], target: [-2.75, -2.032, 5.65] },
        { name: '树影之间（不叠加）', position: [8.128803481, -.530152857, 6.827228969], target: [5.628803481, -2.030152857, 6.827228969] },
        { name: '建筑立面（不叠加）', position: [-3.9791, -.9177, 2.1752], target: [-2.9614, -1.5177, 2.8111] }
      ]
      const compare = view => {
        const contact = view?.contact
        const controller = contact ? { getStatus: () => ({ layers: state.contactShadows.getStatus() }),
          updateLayers: patch => state.contactShadows.update(patch) } : state.shadows
        const comparison = compareNanjingShadows(editor, controller, () => {
          updateLod(); state.renderDirty = true; editor.effectComposer.effectUpdate()
        }, view)
        images.replaceChildren()
        const currentLabel = comparison.result.enabled && comparison.result.strength > 0
          ? `当前设置（已开启 ${Math.round(comparison.result.strength * 100)}%）` : '当前设置（未加深）'
        for (const [label, url] of [[contact ? '关闭接触阴影' : '关闭叠加', comparison.off], [currentLabel, comparison.on]]) {
          const figure = document.createElement('figure'); figure.style.margin = '0'
          const labelNode = document.createElement('figcaption'); labelNode.textContent = label
          const img = document.createElement('img'); img.alt = label; img.src = url
          img.style.cssText = 'display:block;width:100%;max-height:74vh;object-fit:contain'
          figure.append(labelNode, img); images.append(figure)
        }
        dialog.dataset.result = JSON.stringify(comparison.result)
        caption.textContent = `${comparison.result.view} · ${currentLabel} · ${contact
          ? '树根、灯脚的接触阴影对比；保留当前建筑和树冠投影'
          : '仅建筑与植物/路灯阴影交集加深；同类不叠加'}`
        syncShadowLayerControls()
      }
      for (const view of views) {
        const button = document.createElement('button'); button.textContent = view?.name || '当前视角'
        button.onclick = () => { try { compare(view); delete dialog.dataset.error } catch (error) { caption.textContent = error.message; dialog.dataset.error = error.stack || error.message } }
        controls.append(button)
      }
      const close = document.createElement('button'); close.textContent = '关闭对比'
      close.onclick = () => { dialog.close(); dialog.remove() }
      controls.append(close); dialog.append(controls, images, caption); document.body.append(dialog)
      dialog.addEventListener('cancel', () => dialog.remove(), { once: true })
      compare(views[0]); dialog.showModal()
    },
    '性能测试': () => {
      if (state.reflections?.getStatus().capturing) { setStatus('请等待本次反射更新完成后再测试性能'); return }
      clearTimeout(lodTimer); report.textContent = '正在测试固定相机轨迹…'; state.profiler.startBenchmark(); beginMotion(); updateLod()
    },
    '最高画质测试': () => {
      if (!state.active || state.profiler.running) return
      if (state.reflections?.getStatus().capturing) { setStatus('请等待本次反射更新完成后再测试性能'); return }
      report.textContent = '正在测试最高画质固定轨迹…目标 60 FPS，保留原生分辨率和完整细节'
      startFullQualityBenchmark()
    },
    '重新应用配置': () => start(true),
    '保存工程': save,
    '生成固定版本链接': async () => {
      if (state.snapshotSharing) return
      state.snapshotSharing = true
      try {
        const name = currentProjectName()
        const params = await save({ label: '跨浏览器固定版本 · 完整工程备份' })
        setStatus('正在另存固定版本…')
        const result = await publishNanjingProjectSnapshot({ params, name })
        if (state.destroyed) return
        const url = nanjingSnapshotEditorUrl(window.location.href, result.sceneName, name)
        const dialog = document.createElement('dialog')
        dialog.setAttribute('aria-label', '固定工程版本')
        dialog.style.cssText = 'padding:24px;background:#18232c;color:white;border:1px solid #668094;border-radius:12px;max-width:640px;width:85vw'
        const title = document.createElement('h2'); title.textContent = '固定工程版本已保存'
        const explanation = document.createElement('p')
        explanation.textContent = '在 Chrome 和 Codex 中打开下面的同一链接，即可载入这份完整工程。原有历史版本继续保留。'
        const version = document.createElement('p'); version.textContent = `版本：${result.sceneName.slice(-64, -52)}`
        const field = document.createElement('textarea'); field.readOnly = true; field.value = url
        field.setAttribute('aria-label', '固定版本链接'); field.rows = 4
        field.style.cssText = 'box-sizing:border-box;width:100%;padding:10px;color:white;background:#263744;border:1px solid #668094;resize:vertical'
        field.onclick = () => field.select()
        const note = document.createElement('p')
        note.textContent = '需要能访问当前工程服务器。实际显卡和显示质量由每个浏览器分别选择，可在“画质”中核对。'
        const open = document.createElement('a'); open.href = url; open.target = '_blank'; open.rel = 'noopener'
        open.textContent = '打开固定版本'; open.style.cssText = 'color:#8acbff;margin-right:24px'
        const close = document.createElement('button'); close.textContent = '关闭版本链接'
        close.onclick = () => { dialog.close(); dialog.remove() }
        dialog.append(title, explanation, version, field, note, open, close); document.body.append(dialog); dialog.showModal()
        dialog.addEventListener('cancel', () => dialog.remove(), { once: true })
        setStatus('固定版本已另存 · 两个浏览器可打开同一链接')
      } finally { state.snapshotSharing = false }
    },
    '导入 JSON + GLB': importProjectFiles,
    '应用 9/16 远景玻璃': () => {
      const target = NANJING_916_DISTANT_GLASS
      if (Array.isArray(state.config?.materials)) {
        let rule = state.config.materials.find(item => item.name === '远景_蓝色玻璃')
        if (!rule) { rule = { name: '远景_蓝色玻璃' }; state.config.materials.push(rule) }
        Object.assign(rule, target)
      } else if (state.config?.materials) {
        const rule = state.config.materials['远景_蓝色玻璃'] || (state.config.materials['远景_蓝色玻璃'] = { name: '远景_蓝色玻璃' })
        Object.assign(rule, target)
      }
      editor.scene.traverse(object => {
        if (!object.isMesh) return
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (material?.name !== '远景_蓝色玻璃') continue
          for (const [key, value] of Object.entries(target)) {
            if (['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor'].includes(key) && material[key]?.set) {
              material[key].set(...value)
            } else material[key] = value
          }
          material.needsUpdate = true
        }
      })
      markAppearanceEdited(); refreshEditedScene({ materialsOnly: true }); invalidateRender()
      setStatus('已应用 9/16 远景玻璃材质')
    },
    '还原天空曝光': async () => {
      if (!state.config?.environment) throw new Error('当前工程没有环境贴图配置')
      state.config.environment.colorBalance = structuredClone(NANJING_ORIGINAL_ENVIRONMENT_BALANCE)
      state.config.environment.background = true
      state.config.environment.backgroundIntensity = 1
      state.config.environment.intensity = state.config.environment.intensity ?? 0.85
      await applyEnvironment(editor, state.config, state, () => state.active && !state.destroyed)
      syncSurfaceEnvironment(); initializeReflections(); invalidateRender()
      setStatus('天空曝光已还原为原始 HDR')
    },
    '删除远景大楼贴图': () => {
      if (state.config) state.config.distantBuildingTexture = { ...(state.config.distantBuildingTexture || {}), enabled: false }
      editor.scene.traverse(object => {
        if (!object.isMesh) return
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (material?.name !== '远景_蓝色玻璃') continue
          material.map = null
          material.emissiveMap = null
          material.needsUpdate = true
        }
      })
      state.distantBuildingTexture?.dispose()
      state.distantBuildingTexture = null
      markAppearanceEdited(); refreshEditedScene({ materialsOnly: true }); invalidateRender()
      setStatus('已删除远景大楼贴图')
    },
    '删除异常漂浮物': () => {
      // GPU imports commonly store trunks and foliage under different parents.
      // A trunk-only parent is source geometry, not evidence of a floating prop.
      // Only identified, old exported road/paving utilities may be suppressed.
      state.importedUtilities = suppressNanjingImportedUtilities(editor)
      state.roadMarkingRecovery?.refresh()
      state.junctionPaving?.refresh()
      applyTreeDensity()
      state.instancing?.invalidate({ rebuild: true })
      state.contactShadows?.invalidate?.({ structure: true })
      markAppearanceEdited(); invalidateShadows(); invalidateRender()
      setStatus(state.importedUtilities.hidden ? `已处理 ${state.importedUtilities.hidden} 个旧标线和铺装副本` : '未发现可确认的旧标线或铺装副本')
    },
    '替换 HDR': () => {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = '.hdr,.exr,.png,.jpg,.jpeg'
      input.onchange = async () => {
        try {
          const file = input.files?.[0]
          if (!file) return
          if (!state.config?.environment) throw new Error('当前工程没有环境贴图配置')
          const extension = (/\.(png|jpe?g)$/i.exec(file.name) || [])[1]?.toLowerCase() || (file.name.split('.').pop() || 'hdr').toLowerCase()
          const name = `nanjing-hdr-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
          await new Promise((resolve, reject) => {
            const open = globalThis.indexedDB.open('new_threeEditor_db', 1)
            open.onupgradeneeded = () => {
              const database = open.result
              if (!database.objectStoreNames.contains('GLB')) database.createObjectStore('GLB', { keyPath: 'name' })
            }
            open.onsuccess = () => {
              const database = open.result
              const transaction = database.transaction(['GLB'], 'readwrite')
              transaction.objectStore('GLB').put({ name, blob: file })
              transaction.oncomplete = () => { database.close(); resolve() }
              transaction.onerror = () => reject(transaction.error || new Error('本地 HDR 写入失败'))
            }
            open.onerror = () => reject(open.error || new Error('本地 HDR 库打开失败'))
          })
          const list = globalThis.window?.threeEditorDB?.list || []
          if (!list.some(item => item.name === name)) list.push({ name, blob: file })
          state.config.environment.url = `blob:nanjing-hdr:${name}`
          if (['png', 'jpg', 'jpeg'].includes(extension)) {
            state.config.environment.colorBalance = { version: 1, enabled: false, scope: 'both' }
            state.config.environment.backgroundIntensity = 1
          }
          state.config.environment.background = true
          await applyEnvironment(editor, state.config, state, () => state.active && !state.destroyed)
          syncSurfaceEnvironment(); initializeReflections(); invalidateRender()
          markAppearanceEdited()
          setStatus('已替换 HDR 环境贴图')
        } catch (error) {
          setStatus(`HDR 替换失败：${error.message}`)
        }
      }
      input.click()
    },
    '导出 JSON': () => {
      const data = editor.saveSceneEdit()
      if (data?.[METADATA_KEY]) {
        delete data[METADATA_KEY].sharedAppearance
        delete data[METADATA_KEY].historySnapshot
      }
      download(JSON.stringify(data), '南京数智城A地块-Blender还原.json')
    },
    '截图': () => download(editor.getSceneEditorImage(['image/png', '1']), '南京数智城A地块-Blender还原.png'),
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') actions['检查入口'] = () => {
    state.profiler?.cancel(); endMotion()
    if (state.entranceView) {
      editor.camera.position.copy(state.entranceView.position)
      editor.controls.target.copy(state.entranceView.target)
      editor.camera.fov = state.entranceView.fov
      state.entranceView = null
    } else {
      state.entranceView = { position: editor.camera.position.clone(), target: editor.controls.target.clone(), fov: editor.camera.fov }
      editor.camera.position.set(2.067692619, -0.728625871, 2.505164379)
      editor.controls.target.set(3.372997946, -1.528625871, 0.372987556)
      editor.camera.fov = 42
    }
    editor.camera.updateProjectionMatrix(); editor.controls.update(); updateLod(); invalidateRender()
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') actions['检查幕墙'] = () => {
    state.profiler?.cancel(); endMotion()
    const facade = editor.scene.getObjectByName('a1玻璃外墙')
    if (!facade) return
    facade.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(facade)
    const center = bounds.getCenter(new THREE.Vector3())
    editor.controls.target.copy(center)
    editor.camera.position.copy(center).add(new THREE.Vector3(10.6, 0.6, -17.0))
    editor.camera.fov = 32
    editor.camera.updateProjectionMatrix(); editor.controls.update(); updateLod(); invalidateRender()
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') actions['检查地面'] = () => {
    state.profiler?.cancel(); endMotion()
    state.groundInspection = !(state.groundInspection ?? true)
    state.shadows?.update({ receiverPlaneBias: state.groundInspection })
    setStatus(`地面对比：接收面采样修正${state.groundInspection ? '开启' : '关闭'}`)
    editor.controls.target.set(7.707164, -2.036153, 7.047978)
    editor.camera.position.set(7.207164, 1.663847, 9.547978)
    editor.camera.fov = 45
    editor.camera.updateProjectionMatrix(); editor.controls.update(); updateLod(); invalidateRender()
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') actions['检查成图'] = () => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('aria-label', '渲染画面检查')
    dialog.style.cssText = 'padding:12px;background:#18232c;color:white;border:1px solid #668094;max-width:94vw'
    const close = document.createElement('button'); close.textContent = '关闭画面检查'
    close.onclick = () => { dialog.close(); dialog.remove() }
    const rendered = document.createElement('img'); rendered.alt = '当前工程渲染画面'
    rendered.src = editor.getSceneEditorImage(['image/png', '1'])
    rendered.style.cssText = 'display:block;max-width:88vw;max-height:82vh;object-fit:contain'
    dialog.append(rendered, close); document.body.append(dialog); dialog.showModal()
    dialog.addEventListener('cancel', () => dialog.remove(), { once: true })
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') actions['检查叠加'] = () => {
    state.profiler?.cancel(); endMotion()
    // A ray from this road point towards sun 03 intersects tree 037 and then a1.
    editor.controls.target.set(6.515, -2.033, 6.572)
    editor.camera.position.set(10, 2.5, 12)
    editor.camera.fov = 45
    editor.camera.updateProjectionMatrix(); editor.controls.update(); updateLod(); invalidateRender()
    setStatus('叠加检查：主楼阴影内的园区树 037；使用阴影叠加开关对比。')
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') {
    actions['检查阴影倍率'] = () => {
      state.profiler?.cancel(); endMotion()
      const renderer = editor.renderer, originalRatio = renderer.getPixelRatio(), records = []
      const draw = () => { state.renderDirty = true; editor.effectComposer.effectUpdate() }
      let error = null
      try {
        for (const ratio of [1, 1.5, 2]) {
          renderer.setPixelRatio(ratio); state.clarity?.sync()
          state.shadows.updateLayers({ invalidate: true }); draw()
          const inspection = state.shadows.inspectLayers()
          records.push({ ratio, canvas: [renderer.domElement.width, renderer.domElement.height],
            ok: inspection.ok, errors: inspection.errors,
            viewportPolicy: state.shadows.getStatus().layers.viewportPolicy,
            points: inspection.points.map(point => ({ name: point.name, high: point.highOcclusion,
              low: point.lowOcclusion, intersection: point.intersection, overlap: point.overlap })) })
        }
      } catch (cause) { error = cause.message }
      finally {
        renderer.setPixelRatio(originalRatio); state.clarity?.sync()
        state.shadows?.updateLayers({ invalidate: true }); draw()
        state.frameBudget?.resetAdaptation('shadow-ratio-inspection')
      }
      const baseline = records[0]
      const differences = records.slice(1).flatMap(record => record.points.map((point, index) =>
        Math.abs(point.overlap?.[0] - baseline.points[index].overlap?.[0])))
      const maxDifference = differences.length ? Math.max(...differences) : null
      const result = { ok: !error && records.length === 3 && records.every(record => record.ok)
        && maxDifference !== null && Number.isFinite(maxDifference) && maxDifference < 0.000001,
        records, maxDifference, restoredRatio: renderer.getPixelRatio(), originalRatio, error }
      report.textContent = `阴影倍率检查：${result.ok ? '通过' : '未通过'} · 最大遮挡差 ${maxDifference ?? '—'} · 已恢复 ${renderer.getPixelRatio()} 倍`
      report.dataset.shadowRatios = JSON.stringify(result)
    }
    const overlapViews = [
      ['检查双楼阴影', [-2.75, -2.032, 5.65], [1, 4, 11], 'A2 与 A3 均为建筑类，重叠路面不额外加黑'],
      ['检查区块阴影', [-9.75, -2.226, 19.3], [-12, 3, 24], '透明建筑区块均为建筑类，重叠地面不额外加黑'],
      ['检查立面阴影', [-2.9614, -1.5177, 2.8111], [-3.9791, -.9177, 2.1752], '连廊与 A3 均为建筑类，重叠立面不额外加黑']
    ]
    for (const [label, target, position, description] of overlapViews) actions[label] = () => {
      state.profiler?.cancel(); endMotion()
      editor.controls.target.fromArray(target); editor.camera.position.fromArray(position); editor.camera.fov = 45
      editor.camera.updateProjectionMatrix(); editor.controls.update(); updateLod(); invalidateRender()
      setStatus(`叠加检查：${description}；使用阴影叠加开关对比。`)
    }
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] || '').get('inspection') === '1') actions['检查远景'] = () => {
    state.profiler?.cancel(); endMotion()
    if (state.fogInspectionView) {
      editor.camera.position.copy(state.fogInspectionView.position)
      editor.controls.target.copy(state.fogInspectionView.target)
      editor.camera.fov = state.fogInspectionView.fov
      state.fogInspectionView = null
    } else {
      state.fogInspectionView = { position: editor.camera.position.clone(), target: editor.controls.target.clone(), fov: editor.camera.fov }
      editor.camera.position.set(-27.685867309570312, 6.72600793838501, 0.8967990279197693)
      editor.controls.target.set(-0.22183752059936523, 1.6335870623588562, -1.0511406660079956)
      editor.camera.fov = 44.09589492712077
    }
    editor.camera.updateProjectionMatrix(); editor.controls.update(); updateLod(); invalidateRender()
  }
  state.appearanceClient = createNanjingAppearanceClient({
    modelUrl: MODEL_URL, configUrl: CONFIG_URL,
    getConfig: () => editor.saveSceneEdit()[METADATA_KEY].config,
    getSync: () => state.metadata?.sharedAppearance,
    setSync: value => {
      state.metadata = { ...state.metadata, sharedAppearance: value }
      updateAppearanceStatus()
    },
    isDirty: () => !!state.appearanceDirty,
    isBusy: () => historyMode() || !state.active || state.destroyed || !state.config || !state.meshes || !state.applicationReady || state.loading
      || state.interacting || state.inputActive || state.transformDragging || state.profiler?.running || state.applyingAppearance,
    generation: () => state.generation,
    applyConfig: async (config, context) => {
      if (!context.isCurrent()) return
      state.applyingAppearance = true
      try {
        await apply(config, { view: false })
        if (context.isCurrent()) state.metadata = { ...state.metadata, config: structuredClone(state.config) }
      } finally { state.applyingAppearance = false }
    },
    onStatus: value => {
      if (['applied', 'published'].includes(value.event) && !value.localChanges && !value.conflicts?.length) state.appearanceDirty = false
      updateAppearanceStatus()
      if (value.event === 'applied') setStatus(value.conflicts.length ? '共享效果已更新 · 保留了本地单独调整的参数' : '共享效果已同步 · 本地模型、相机和设备画质保留')
      else if (value.event === 'published') setStatus('当前效果已同步到共享版本 · 其他浏览器可检测更新')
    }
  })
  const appearanceTimer = setInterval(() => {
    if (state.active && !state.destroyed && !historyMode() && document.visibilityState === 'visible') void state.appearanceClient.check()
  }, 60000)
  actions['检测并同步'] = async () => {
    const restored = state.params?.projectHistory
    if (historyMode()) {
      await save() // Keep the editable historical state before opting into latest shared effects.
      delete state.params.projectHistory
    }
    const result = await state.appearanceClient.check({ force: true })
    if (restored && result.event !== 'applied') state.params.projectHistory = restored
    updateAppearanceStatus()
    if (result.error) setStatus(result.error)
    else if (result.noShared) setStatus('尚无共享效果，请先在效果正确的浏览器点击“同步当前效果”')
    else if (result.event === 'applied') await save()
    else if (result.event === 'busy') setStatus('场景正在载入或编辑，请停止操作后再同步')
  }
  actions['同步当前效果'] = async () => {
    if (historyMode()) { setStatus('历史回档不会自动发布；“检测并同步”会先备份当前版本，再恢复共享更新'); return }
    const result = await state.appearanceClient.publish()
    if (result.event === 'published') { await save(); setStatus('当前效果已保存并同步 · 其他浏览器打开同一链接会读取此版本') }
    else if (result.error) setStatus(result.error)
    else if (result.event === 'busy') setStatus('场景正在载入或编辑，请停止操作后再同步')
  }
  if (historyMode()) actions['恢复共享更新'] = () => actions['检测并同步']()
  const instancingButton = document.createElement('button')
  function updateInstancingButton() {
    instancingButton.textContent = `GPU 实例：${state.instancing?.enabled !== false ? '开' : '关'}`
  }
  instancingButton.style.cssText = 'border:1px solid #607b8f;border-radius:4px;background:#354c5d;color:white;padding:5px 9px;cursor:pointer'
  instancingButton.onclick = () => {
    if (!state.instancing) return
    state.instancing.setEnabled(!state.instancing.enabled)
    updateInstancingButton()
    invalidateShadows()
  }
  updateInstancingButton()
  buttonRow.append(instancingButton)
  const foliageZeroAlphaButton = document.createElement('button')
  function updateFoliageZeroAlphaButton() {
    const enabled = state.foliageZeroAlpha?.getStatus().configuredEnabled ?? (state.config?.performance?.foliageZeroAlpha === true)
    foliageZeroAlphaButton.textContent = `树叶空白跳过：${enabled && !baseline ? '开' : '关'}`
    foliageZeroAlphaButton.disabled = baseline || !state.foliageZeroAlpha
    foliageZeroAlphaButton.setAttribute('aria-pressed', String(enabled && !baseline))
  }
  foliageZeroAlphaButton.title = '仅跳过完全透明树叶像素的光照计算。可切换后进行同轨迹性能测试；当前选项随工程记录保存。'
  foliageZeroAlphaButton.onclick = () => {
    if (!state.foliageZeroAlpha || !state.config) return
    state.profiler?.cancel()
    const enabled = !state.foliageZeroAlpha.getStatus().configuredEnabled
    state.config.performance = { ...state.config.performance, foliageZeroAlpha: enabled }
    state.foliageZeroAlpha.setEnabled(enabled)
    updateFoliageZeroAlphaButton()
    resetTiming('foliage-zero-alpha')
    invalidateRender()
  }
  updateFoliageZeroAlphaButton()
  buttonRow.append(foliageZeroAlphaButton)
  const treeDensityLabel = document.createElement('label')
  treeDensityLabel.style.cssText = 'display:flex;align-items:center;gap:5px'
  treeDensityLabel.textContent = '树木保留'
  const treeDensity = document.createElement('input')
  treeDensity.type = 'range'; treeDensity.min = '0'; treeDensity.max = '100'; treeDensity.step = '1'
  treeDensity.style.width = '72px'
  treeDensity.setAttribute('aria-label', '树木保留')
  treeDensity.title = '按比例随机减少树木数量；整棵树连同树干和阴影同步减少；100% 全部保留，0% 全部隐藏。'
  treeDensity.value = String(state.config?.performance?.treeDensity ?? 100)
  treeDensity.oninput = () => {
    const value = Number(treeDensity.value)
    if (state.config) state.config.performance = { ...state.config.performance, treeDensity: value }
    applyTreeDensity(value)
    markAppearanceEdited()
  }
  treeDensityLabel.append(treeDensity)
  buttonRow.append(treeDensityLabel)
  Object.entries(actions).forEach(([label, action]) => {
    const button = document.createElement('button')
    button.textContent = label
    if (label === '更新反射') button.title = '幕墙预设在载入后静止时捕获一次周边。修改场景后可手动更新；不随拖动反复捕获。'
    button.style.cssText = 'border:1px solid #607b8f;border-radius:4px;background:#354c5d;color:white;padding:5px 9px;cursor:pointer;white-space:nowrap'
    button.onclick = async () => { try { await action() } catch (error) { setStatus(error.message) } }
    buttonRow.append(button)
  })
  const workspacePanel = createNanjingWorkspacePanel({ panel, status, metrics: state.metrics, report, buttonRow,
    qualitySelect, gpuStatus, deviceStatus, appearanceStatus, instancingButton, foliageZeroAlphaButton,
    effectControls: [surfaceLabel, shadowLabel, shadowResolutionLabel, layerLabel, layerStrengthLabel, transparentShadowLabel, contactLabel], roadTextureLabel,
    glassDetails, glassControls, fogDetails, fogControls })
  editor.nanjingRestore = { apply: config => apply(config), reload: () => start(true), save, updateReflections, importProjectFiles,
    getLightingSettings: () => readNanjingLightingControls(editor),
    setLightingSettings: patch => {
      if (!state.active || state.destroyed || !state.config) throw new Error('场景光照尚未载入，请稍后调整')
      const settings = updateNanjingLightingControls(editor, patch)
      if (Object.hasOwn(patch, 'ambientIntensity')) {
        for (const material of facadeMaterials()) if (material.envMap) material.envMapIntensity = settings.ambientIntensity
        environmentStrength.value = String(settings.ambientIntensity)
      }
      state.surfaceLighting?.update({})
      markAppearanceEdited(); invalidateRender()
      editor.scene.dispatchEvent({ type: 'project-lighting-settings-changed' })
      return settings
    },
    getStatus: () => ({ active: state.active, ready: !!state.meshes && !state.destroyed, message: state.message, meshes: state.meshes, materials: state.materials, frame: state.frameStats,
      instancing: state.instancing?.getStats(), treeDensity: state.treeDensity?.getStatus(), foliageZeroAlpha: state.foliageZeroAlpha?.getStatus(), reflections: state.reflections?.getStatus() }), getConfig: () => snapshotConfig(editor, state) }
  const destroy = editor.destroySceneRender.bind(editor)
  editor.destroySceneRender = () => {
    cancelSceneRefresh()
    state.destroyed = true
    if (editor.withNanjingSourceScene === withNanjingSourceScene) {
      if (previousSourceScene) editor.withNanjingSourceScene = previousSourceScene
      else delete editor.withNanjingSourceScene
    }
    state.benchmarkQualityRestore = null
    if (editor.requestNanjingMaterialRender === materialRenderRequest) {
      if (previousMaterialRenderRequest === undefined) delete editor.requestNanjingMaterialRender
      else editor.requestNanjingMaterialRender = previousMaterialRenderRequest
    }
    if (editor.getNanjingSourceMaterial === materialSourceResolver) {
      if (previousMaterialSourceResolver === undefined) delete editor.getNanjingSourceMaterial
      else editor.getNanjingSourceMaterial = previousMaterialSourceResolver
    }
    // Native dialogs live outside Vue's editor subtree. Remove them on reload
    // so an old comparison cannot keep showing frozen frames from a disposed renderer.
    for (const label of ['玻璃幕墙对比', '表面光影对比', '阴影叠加对比', '渲染画面检查']) {
      document.querySelector(`dialog[aria-label="${label}"]`)?.remove()
    }
    if (editor.renderer.debug.onShaderError === shaderError) editor.renderer.debug.onShaderError = previousShaderError
    state.active = false
    state.generation += 1
    disposeReflections()
    state.foliageZeroAlpha?.dispose()
    state.foliageZeroAlpha = null
    state.reflectionResources?.dispose()
    state.reflectionResources = null
    state.environmentColorBalance?.dispose()
    state.environmentColorBalance = null
    state.environmentSourceTexture?.dispose()
    state.environmentSourceTexture = null
    state.environmentTexture = null
    state.environmentUrl = null
    state.shadows?.dispose()
    state.fog?.dispose()
    state.contactShadows?.dispose()
    state.surfaceLighting?.dispose()
    state.selection?.dispose()
    state.instancing?.dispose()
    state.transparentShadows?.dispose()
    state.materialTangents?.dispose()
    state.lod?.dispose()
    state.trunkLod?.dispose()
    state.junctionPaving?.dispose()
    state.junctionPaving = null
    state.roadMarkingRecovery?.dispose()
    state.roadMarkingRecovery = null
    state.waterSurface?.dispose()
    state.waterSurface = null
    state.contextTextures?.dispose()
    state.contextTextures = null
    state.facadeFrameFinish?.dispose()
    state.facadeFrameFinish = null
    state.internalRoadSurfaces?.dispose()
    state.internalRoadSurfaces = null
    state.treeDensity?.dispose()
    state.treeDensity = null
    state.treePlacements?.dispose()
    state.treePlacements = null
    state.roadLevels?.dispose()
    state.distantBuildingTexture?.dispose()
    state.profiler?.dispose()
    editor.renderer.transmissionResolutionScale = originalTransmissionScale
    state.clarity?.dispose()
    state.groundOrder?.dispose()
    state.transparency?.dispose()
    state.transparentBlocks?.dispose()
    state.guiInvalidation?.dispose()
    state.assetInvalidation?.dispose()
    state.appearanceClient?.dispose()
    clearInterval(appearanceTimer)
    clearTimeout(sceneRefreshTimer)
    clearTimeout(lodTimer)
    clearTimeout(shadowTimer)
    workspacePanel.dispose()
    panel.remove()
    editor.transformControls.removeEventListener('objectChange', invalidateShadows)
    editor.scene.removeEventListener('collection-changed', collectionChanged)
    editor.transformControls.removeEventListener('change', invalidateRender)
    editor.controls.removeEventListener('change', invalidateRender)
    editor.controls.removeEventListener('change', scheduleLod)
    editor.controls.removeEventListener('start', inputStart)
    editor.controls.removeEventListener('end', inputEnd)
    editor.transformControls.removeEventListener('dragging-changed', transformDrag)
    editor.transformControls.removeEventListener('object-changed', scheduleLod)
    editor.transformControls.removeEventListener('objectChange', scheduleLod)
    for (const event of ['input', 'change', 'click', 'keyup']) document.removeEventListener(event, editorInput)
    document.removeEventListener('visibilitychange', visibilityChanged)
    destroy()
  }
  if (state.active) start(false, !!initialParams.modelCores?.length || initialParams.modelCollections?.version === 1)
  else editor.modelCollectionEdits?.restoreAll()
}
