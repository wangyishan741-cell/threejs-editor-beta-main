import { TextureLoader } from 'three'

export const NANJING_DISTANT_BUILDING_TEXTURE_URL = '/nanjing-restore/distant-glass-image5-dark30-7b570b17a0eb.png'
export const NANJING_DISTANT_BUILDING_TEXTURE_MATERIAL = '远景_蓝色玻璃'
const MARKER = 'nanjingDistantBuildingTexture'
let assetPromise
const loadAsset = () => assetPromise ||= new TextureLoader().loadAsync(NANJING_DISTANT_BUILDING_TEXTURE_URL)
  .catch(error => { assetPromise = null; throw error })

function protectedObject(object) {
  for (let node = object; node; node = node.parent) {
    if (node.userData?.nanjingUtility || node.userData?.skipEditorTree || node.isHelper
      || node.isTransformControlsRoot || node.type?.endsWith('Helper')) return true
    if (/^a[1-4](?:\D|$)/.test(node.name || '') || /^场地区块_近景建筑群_0[12]$/.test(node.name || '')) return true
  }
  return false
}
const slotsOf = object => Array.isArray(object.material) ? object.material : [object.material]

// Ordinary editable texture resources, not a rendering-time tint. The PNG is a
// Deterministic grayscale derivative of the dark30 glass texture. The original
// source image is also used by hero glazing, so never mutate the imported
// Texture or Source.
// Install after material rules/context reassignment and before reflections;
// await ready for first capture, refresh after a late-loaded model arrives.
export function createNanjingDistantBuildingTexture(editor, { onChange, loadTexture = loadAsset } = {}) {
  if (!editor?.scene?.traverse) throw new TypeError('A scene is required')
  let disposed = false, enabled = options.enabled !== false, asset = null, loadError = null, replacements = 0
  const cache = new WeakMap()
  let state = { active: false, matchedMeshes: 0, matchedMaterials: 0, updatedMaterials: 0,
    existingTextures: 0, objects: [], skipped: [], errors: [] }
  function getStatus() {
    return { ...state, active: !disposed && state.active, ready: !!asset, disposed,
      url: NANJING_DISTANT_BUILDING_TEXTURE_URL, material: NANJING_DISTANT_BUILDING_TEXTURE_MATERIAL,
      brightnessFactor: .7, application: 'baked-source-pixels', slots: ['map', 'emissiveMap'],
      imageSize: asset ? [asset.image?.width ?? null, asset.image?.height ?? null] : null,
      textureReplacements: replacements, loadError, extraRenderPasses: 0 }
  }
  function cloneTexture(source, restoredFlipY) {
    if (source.userData?.[MARKER] === NANJING_DISTANT_BUILDING_TEXTURE_URL
      && source.textureUrl === NANJING_DISTANT_BUILDING_TEXTURE_URL) return source
    if (cache.has(source)) return cache.get(source)
    const texture = source.clone()
    // Texture.clone shares .source with its input. Assign a separate loaded
    // Source, rather than .image=..., which would alter all original users.
    texture.source = asset.source
    texture.name = '远景楼房原贴图 · 亮度70%'
    texture.userData = { ...source.userData, [MARKER]: NANJING_DISTANT_BUILDING_TEXTURE_URL }
    texture.textureUrl = NANJING_DISTANT_BUILDING_TEXTURE_URL
    texture.textureType = 'image'
    if (typeof restoredFlipY === 'boolean') texture.flipY = restoredFlipY
    if (source.animation !== undefined) texture.animation = structuredClone(source.animation)
    // copy() preserves channels, transforms, color space, filters, anisotropy,
    // orientation and alpha conventions; only the image resource changes.
    texture.needsUpdate = true
    cache.set(source, texture)
    replacements++
    return texture
  }
  function refresh() {
    if (disposed || !asset || !enabled) return getStatus()
    const groups = new Map(), protectedMaterials = new Set()
    editor.scene.traverse(object => {
      if (!object.isMesh) return
      const materials = slotsOf(object).filter(material => material?.isMeshStandardMaterial
        && material.name === NANJING_DISTANT_BUILDING_TEXTURE_MATERIAL)
      for (const material of materials) {
        if (protectedObject(object)) { protectedMaterials.add(material); continue }
        if (!groups.has(material)) groups.set(material, new Set())
        groups.get(material).add(object)
      }
    })
    state = { active: false, matchedMeshes: new Set([...groups.values()].flatMap(objects => [...objects])).size,
      matchedMaterials: groups.size, updatedMaterials: 0, existingTextures: 0, objects: [], skipped: [], errors: [] }
    for (const [material, objects] of groups) {
      // An unexpected shared material must not change a protected hero/nearby
      // building. The actual GLB uses distinct identities for these objects.
      if (protectedMaterials.has(material)) { state.errors.push('远景材质与受保护主楼/近景楼共用，保留该材质'); continue }
      if (!material.map?.isTexture || !material.emissiveMap?.isTexture) {
        state.skipped.push({ material: material.name, reason: '缺少原始颜色或发光贴图，保留用户材质' }); continue
      }
      // Core project storage restores map through TextureLoader, but omits
      // flipY and our marker. Recover only our own reloaded resource from the
      // corresponding GLB emissive map; leave custom/marked textures alone.
      const coreReload = material.map.textureUrl === NANJING_DISTANT_BUILDING_TEXTURE_URL
        && material.map.userData?.[MARKER] === undefined
      const nextMap = cloneTexture(material.map, coreReload ? material.emissiveMap.flipY : undefined)
      const nextEmissive = cloneTexture(material.emissiveMap)
      const changed = nextMap !== material.map || nextEmissive !== material.emissiveMap
      material.map = nextMap; material.emissiveMap = nextEmissive
      if (changed) { material.needsUpdate = true; state.updatedMaterials++ }
      else state.existingTextures += 2
      state.active = true
      for (const object of objects) if (state.objects.length < 20) state.objects.push(object.name)
    }
    if (state.updatedMaterials > 0) onChange?.(getStatus())
    return getStatus()
  }
  const ready = enabled ? Promise.resolve().then(loadTexture).then(texture => {
    if (disposed) return getStatus()
    if (!texture?.isTexture || !texture.image || texture.image.width !== 2508 || texture.image.height !== 2508) {
      throw new Error('远景贴图尺寸或资源无效，保留原贴图')
    }
    asset = texture
    return refresh()
  }).catch(error => {
    if (!disposed) { loadError = error.message || String(error); onChange?.(getStatus()) }
    return getStatus()
  }) : Promise.resolve(getStatus())
  return { ready, refresh, getStatus, setEnabled(value) { enabled = !!value; if (enabled) ready.then(() => refresh()); },
    // Bound textures are saved project resources. Keep them alive after this
    // controller stops; never dispose imported/shared source maps or images.
    dispose() { disposed = true } }
}
