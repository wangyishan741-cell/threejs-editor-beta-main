const VERSION = 1
const OLD_REPEAT = [0.5, 0.20000000298023224]
const OLD_OFFSET = [0, -1.4901161193847656e-8]
const almost = (value, expected) => Number.isFinite(value) && Math.abs(value - expected) <= 1e-12
const pair = (value, expected) => value && almost(value.x, expected[0]) && almost(value.y, expected[1])
const owned = object => {
  for (let node = object; node; node = node.parent) if (node.userData?.nanjingUtility) return false
  return true
}

/**
 * Repair the precise pre-identity-save bug: the Material_24 map transform was
 * restored by array index onto the original Material_25 / Image_12 texture.
 * Run after saved model loading. An empty scene does not consume migration.
 * A saved completion marker protects subsequent intentional texture edits.
 */
export function repairNanjingFoliageTexture(editor, config) {
  if (!editor?.scene?.traverse || !config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('A scene and project configuration are required')
  }
  const result = { version: VERSION, changed: false, completed: false, repairedMaterials: 0, repairedTextures: 0, skipped: [] }
  if (config.foliageTextureFix?.version >= VERSION) return { ...result, completed: true, previouslyCompleted: true }
  const candidates = new Set(), textureUsers = new Map()
  editor.scene.traverse(object => {
    if (!object.isMesh || !owned(object)) return
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue
      if (material.map) {
        let users = textureUsers.get(material.map)
        if (!users) { users = new Set(); textureUsers.set(material.map, users) }
        users.add(material)
      }
      if (material.name === 'Material_25') candidates.add(material)
    }
  })
  if (!candidates.size) return result
  const repaired = new Set()
  let pendingImage = false
  for (const material of candidates) {
    const texture = material.map
    const skip = reason => result.skipped.push({ material: material.name, texture: texture?.name || '', reason })
    if (!material.isMeshStandardMaterial || !texture?.isTexture || texture.name !== 'Image_12') {
      skip('Not the original PBR foliage texture'); continue
    }
    if (texture.textureUrl || texture.textureType || texture.isVideoTexture || texture.channel !== 0
      || texture.flipY !== false || texture.matrixAutoUpdate === false) {
      skip('Custom texture source or coordinate policy'); continue
    }
    const image = texture.image
    const width = image?.width ?? image?.naturalWidth, height = image?.height ?? image?.naturalHeight
    if (!width || !height) { pendingImage = true; skip('Texture image is not ready'); continue }
    if (width !== 1024 || height !== 1024) { skip('Texture dimensions do not match the source image'); continue }
    if ([...textureUsers.get(texture)].some(user => user.name !== 'Material_25')) {
      skip('Texture also belongs to another editable material'); continue
    }
    if (repaired.has(texture)) { result.repairedMaterials++; continue }
    if (!pair(texture.repeat, OLD_REPEAT) || !pair(texture.offset, OLD_OFFSET)
      || !pair(texture.center, [0, 0]) || !almost(texture.rotation, 0)) {
      skip('Transform does not match the historical trunk fingerprint'); continue
    }
    // These are uniform transforms, so neither a shader recompile nor a GPU
    // texture upload is necessary. Keep image, alpha, wrapping and identity.
    texture.repeat.set(1, 1)
    texture.offset.set(0, 0)
    texture.updateMatrix()
    repaired.add(texture)
    result.repairedMaterials++
  }
  result.repairedTextures = repaired.size
  result.changed = repaired.size > 0
  result.completed = !pendingImage
  if (result.completed) config.foliageTextureFix = { version: VERSION }
  return result
}
