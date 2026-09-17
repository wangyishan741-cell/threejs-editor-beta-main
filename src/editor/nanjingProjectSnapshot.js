import { Texture, TextureLoader } from 'three'

export const isProjectHistoryRestore = params => params?.projectHistory?.mode === 'restored'
const MAPS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap',
  'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'anisotropyMap']
const VALUES = ['roughness', 'metalness', 'transmission', 'ior', 'opacity', 'alphaTest', 'emissiveIntensity', 'envMapIntensity',
  'clearcoat', 'clearcoatRoughness', 'thickness', 'specularIntensity', 'sheen', 'sheenRoughness', 'iridescence', 'iridescenceIOR',
  'bumpScale', 'aoMapIntensity', 'lightMapIntensity', 'side', 'shadowSide', 'polygonOffsetFactor', 'polygonOffsetUnits',
  'anisotropy', 'anisotropyRotation', 'attenuationDistance', 'displacementScale', 'displacementBias', 'normalMapType',
  'transparent', 'depthWrite', 'depthTest', 'wireframe', 'toneMapped', 'vertexColors', 'alphaToCoverage', 'polygonOffset']
const COLORS = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor']
const TEXTURE_VALUES = ['channel', 'colorSpace', 'flipY', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'anisotropy', 'rotation', 'matrixAutoUpdate']
const rootsOf = editor => editor.scene.children.filter(root => root.editorType === 'isModelGroup' && !root.userData?.nanjingUtility)
const slotsOf = object => Array.isArray(object.material) ? object.material : [object.material]
const ignored = object => object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper || object.type?.endsWith('Helper')

function textureDescriptor(texture) {
  if (!texture?.isTexture) return null
  return { name: texture.name, ...(texture.textureUrl ? { url: texture.textureUrl } : {}),
    ...Object.fromEntries(TEXTURE_VALUES.map(key => [key, texture[key]])),
    repeat: texture.repeat.toArray(), offset: texture.offset.toArray(), center: texture.center.toArray(), matrix: texture.matrix.toArray() }
}

/** Called inside the existing source-object/material wrappers. Source GLB
 * identities and immutable URLs remain references; no GPU draw clones are saved. */
export function captureNanjingProjectSnapshot(editor, roadLevels) {
  const models = rootsOf(editor).map((root, modelIndex) => {
    const seen = new Set(), materials = []
    function visit(object, path) {
      if (ignored(object)) return
      if (object.isMesh) slotsOf(object).forEach((material, slot) => {
        if (!material || seen.has(material)) return
        seen.add(material)
        materials.push({ path, slot, name: material.name,
          values: Object.fromEntries(VALUES.filter(key => Number.isFinite(material[key]) || typeof material[key] === 'boolean').map(key => [key, material[key]])),
          colors: Object.fromEntries(COLORS.filter(key => material[key]?.isColor).map(key => [key, material[key].toArray()])),
          infiniteValues: VALUES.filter(key => material[key] === Infinity),
          normalScale: material.normalScale?.toArray(), clearcoatNormalScale: material.clearcoatNormalScale?.toArray(),
          iridescenceThicknessRange: material.iridescenceThicknessRange?.slice(),
          textures: Object.fromEntries(MAPS.filter(key => key in material).map(key => [key, textureDescriptor(material[key])])) })
      })
      object.children.forEach((child, index) => visit(child, [...path, index]))
    }
    visit(root, [])
    return { modelIndex, name: root.name, bindingId: root.uuid,
      url: root.modelInfo?.url || null, materials }
  })
  return { version: 1, roadLevels: roadLevels?.getSnapshot?.() || null, models }
}

const loaded = new Map()
function loadTexture(url) {
  if (!loaded.has(url)) loaded.set(url, new TextureLoader().loadAsync(url).catch(error => { loaded.delete(url); throw error }))
  return loaded.get(url)
}

/** Restore exact saved slots after ordinary material rules. In particular the
 * saved far facade URL is used, never today's derived-image replacement. */
export async function restoreNanjingProjectSnapshot(editor, snapshot, { isCurrent = () => true, loader = loadTexture } = {}) {
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.models)) return { restored: false, legacy: true, materials: 0 }
  const roots = rootsOf(editor), entries = [], urls = new Set(), used = new Set()
  const skipped = []
  for (const model of snapshot.models) {
    const available = roots.filter(root => !used.has(root))
    const unique = candidates => candidates.length === 1 ? candidates[0] : null
    const root = unique(available.filter(root => model.bindingId && (root.modelInfo?.nanjingMaterialBindingId === model.bindingId || root.uuid === model.bindingId)))
      || unique(available.filter(root => model.url && root.modelInfo?.url === model.url && root.name === model.name))
      || unique(available.filter(root => root.name === model.name))
    if (!root) continue // Saved GLBs can finish loading after initial setup.
    used.add(root)
    if (root.name !== model.name) return { restored: false, legacy: true, materials: 0, skipped }
    for (const entry of model.materials) {
      let object = root
      for (const index of entry.path) object = object?.children?.[index]
      let material = object && slotsOf(object)[entry.slot]
      if (!material || material.name !== entry.name) {
        // The saved path binding may have been remapped by a later material
        // table. Restore by the exact source material name when available, and
        // assign that material back to the saved object slot.
        const fallback = root.RootMaterials?.find(candidate => candidate?.name === entry.name)
        if (!fallback) {
          skipped.push({ name: entry.name, path: entry.path, slot: entry.slot, reason: 'binding-changed' })
          continue
        }
        if (object && slotsOf(object)[entry.slot] !== undefined) {
          if (Array.isArray(object.material)) object.material[entry.slot] = fallback
          else if (entry.slot === 0) object.material = fallback
        }
        material = fallback
      }
      entries.push({ entry, material })
      for (const descriptor of Object.values(entry.textures)) if (descriptor?.url) urls.add(descriptor.url)
    }
  }
  const images = new Map(await Promise.all([...urls].map(async url => [url, await loader(url)])))
  if (!isCurrent()) return { restored: false, cancelled: true, materials: 0 }
  const plans = entries.map(({ entry, material }) => ({ entry, material, textures: Object.fromEntries(MAPS.filter(key => Object.hasOwn(entry.textures, key)).map(key => {
    const descriptor = entry.textures[key]
    if (!descriptor) return [key, null]
    const source = material[key]
    if (!descriptor.url && !source?.isTexture) throw new Error(`历史材质“${entry.name}”缺少原始 ${key} 贴图`)
    const texture = source?.isTexture ? source.clone() : new Texture()
    if (descriptor.url) {
      texture.source = images.get(descriptor.url).source
      texture.textureUrl = descriptor.url; texture.textureType = 'image'
    }
    if (typeof descriptor.name === 'string') texture.name = descriptor.name
    for (const property of TEXTURE_VALUES) if (descriptor[property] !== undefined) texture[property] = descriptor[property]
    for (const property of ['repeat', 'offset', 'center', 'matrix']) if (descriptor[property]) texture[property].fromArray(descriptor[property])
    texture.needsUpdate = true
    return [key, texture]
  })) }))
  for (const { entry, material, textures } of plans) {
    for (const [key, value] of Object.entries(entry.values)) if (key in material) material[key] = value
    for (const key of entry.infiniteValues || []) if (VALUES.includes(key) && key in material) material[key] = Infinity
    for (const [key, value] of Object.entries(entry.colors)) material[key]?.fromArray(value)
    if (entry.normalScale) material.normalScale?.fromArray(entry.normalScale)
    if (entry.clearcoatNormalScale) material.clearcoatNormalScale?.fromArray(entry.clearcoatNormalScale)
    if (entry.iridescenceThicknessRange) material.iridescenceThicknessRange = entry.iridescenceThicknessRange.slice()
    Object.assign(material, textures); material.needsUpdate = true
  }
  return { restored: plans.length > 0, materials: plans.length, images: images.size, legacy: false, skipped }
}
