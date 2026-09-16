import { RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, NearestFilter, SRGBColorSpace, NoColorSpace, Vector2, Vector3, Vector4, DataTexture, RedFormat, RGBAFormat, UnsignedByteType } from 'three'

export const NANJING_INTERNAL_ROAD_SURFACE_VERSION = 'internal-road-source-asphalt-xz-v1'
export const NANJING_INTERNAL_ROAD_TARGETS = Object.freeze([
  Object.freeze({ name: '支路_路面', material: '道路_支路路面', vertices: 4835, indices: 14256 }),
  Object.freeze({ name: '场地区块_建筑群路面_02', material: '建筑_黑色哑光', vertices: 284, indices: 834 })
])
export const NANJING_VISIBLE_ROAD_DECK_TARGETS = Object.freeze([
  Object.freeze({ name: '支路_路缘', material: '场地_浅色铺装', vertices: 10894, indices: 41988, deck: true })
])
// Measured linear RGB mean of the unchanged GLB asphalt_08 base-colour image.
// Normalization preserves each internal road's base colour/average brightness;
// strength controls only the existing photographic grain around that mean.
const ASPHALT_MEAN = [0.028149293812046408, 0.02795892387476228, 0.025842541538375945]
const DONOR = '道路_马路_01', DONOR_MATERIAL = '远景_沥青路面'
const defaults = { version: 1, enabled: false, textureStrength: .22, worldScale: 1.25, normalStrength: .06 }
// Track editable values on both sides: generated texture copies must never be
// saved as source maps, but edits made through a panel bound to a copy are real.
const EDIT_FIELDS = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor', 'normalScale', 'clearcoatNormalScale',
  'roughness', 'metalness', 'opacity', 'transparent', 'depthWrite', 'depthTest', 'alphaTest', 'side', 'shadowSide',
  'transmission', 'ior', 'thickness', 'attenuationDistance', 'envMapIntensity', 'emissiveIntensity', 'specularIntensity',
  'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange',
  'anisotropy', 'anisotropyRotation', 'bumpScale', 'aoMapIntensity', 'lightMapIntensity', 'normalMapType',
  'displacementScale', 'displacementBias', 'wireframe', 'toneMapped', 'vertexColors', 'alphaToCoverage', 'visible',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'premultipliedAlpha', 'forceSinglePass',
  'map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap',
  'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'anisotropyMap', 'envMap']
const editValue = value => value?.toArray ? value.toArray() : Array.isArray(value) ? value.slice() : value
const sameEdit = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b)
const editSnapshot = material => Object.fromEntries(EDIT_FIELDS.filter(key => key in material).map(key => [key, editValue(material[key])]))
function copyEdit(target, source, key) {
  if (!(key in target)) return
  if (target[key]?.copy && source[key]?.toArray) target[key].copy(source[key])
  else target[key] = Array.isArray(source[key]) ? source[key].slice() : source[key]
}

const slots = object => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)
const excluded = object => object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper
function normalize(value) {
  const result = { ...defaults, ...(value && typeof value === 'object' ? value : {}), version: 1,
    enabled: value?.version === 1 && value.enabled === true }
  for (const key of ['textureStrength', 'normalStrength']) if (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 1) throw new Error(`内部道路 ${key} 须在 0–1 之间`)
  if (result.visibleRoadDecks !== undefined && typeof result.visibleRoadDecks !== 'boolean') throw new TypeError('可见道路承托面开关须为布尔值')
  if (!Number.isFinite(result.worldScale) || result.worldScale <= 0) throw new Error('内部道路纹理尺度须大于 0')
  if (result.materialOverrides !== undefined) {
    const input = result.materialOverrides, overrides = {}
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('内部道路材质覆盖须为对象')
    for (const [name, values] of Object.entries(input)) {
      if (![...NANJING_INTERNAL_ROAD_TARGETS, ...NANJING_VISIBLE_ROAD_DECK_TARGETS].some(target => target.name === name) || !values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('内部道路材质覆盖目标无效')
      const entry = {}
      for (const [field, value] of Object.entries(values)) {
        if (['metalness', 'roughness', 'specularIntensity'].includes(field)) {
          if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError('内部道路材质覆盖须为 0–1')
          entry[field] = value
        } else if (field === 'normalScale') {
          if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new TypeError('内部道路法线强度覆盖须为两个有限数值')
          entry[field] = value.slice()
        } else if (field === 'map' || field === 'normalMap') {
          if (typeof value !== 'boolean') throw new TypeError('内部道路源贴图覆盖须为布尔值')
          if (value) entry[field] = true
        } else throw new TypeError('内部道路材质覆盖字段无效')
      }
      if (Object.keys(entry).length) overrides[name] = entry
    }
    if (Object.keys(overrides).length) result.materialOverrides = overrides
    else delete result.materialOverrides
  }
  return result
}
function visit(object, callback) {
  if (!object || excluded(object)) return
  callback(object)
  for (const child of object.children || []) visit(child, callback)
}
function textureCopy(source, normal = false) {
  const texture = source.clone()
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter
  texture.colorSpace = normal ? NoColorSpace : SRGBColorSpace
  texture.repeat.set(1, 1); texture.offset.set(0, 0); texture.rotation = 0; texture.updateMatrix()
  texture.needsUpdate = true
  return texture
}
/** Sparse world tiles keep a road-footprint mask small. One-pixel erosion and
 * nearest sampling keep photographic grain off the untextured curb outside it.
 * No source vertex, index, UV, material map or image pixel is modified. */
export function createNanjingRoadDeckMask(road) {
  const pixels = 64, density = 32, tileWorld = pixels / density
  const position = road.geometry.attributes.position, index = road.geometry.index, vertices = []
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (let i = 0; i < position.count; i++) {
    const v = new Vector3().fromBufferAttribute(position, i).applyMatrix4(road.matrixWorld)
    vertices.push(v); minX = Math.min(minX, v.x); minZ = Math.min(minZ, v.z); maxX = Math.max(maxX, v.x); maxZ = Math.max(maxZ, v.z)
  }
  const originX = Math.floor(minX / tileWorld) * tileWorld, originZ = Math.floor(minZ / tileWorld) * tileWorld
  const columns = Math.floor((maxX - originX) / tileWorld) + 1, rows = Math.floor((maxZ - originZ) / tileWorld) + 1
  const tiles = new Map(), getTile = (x, y) => tiles.get(y * columns + x)
  const point = v => [(v.x - originX) * density, (v.z - originZ) * density]
  for (let i = 0; i < (index?.count || position.count); i += 3) {
    const v = [0, 1, 2].map(j => vertices[index ? index.getX(i + j) : i + j]), n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]))
    if (Math.abs(n.y) < .9 * n.length() || n.lengthSq() < 1e-18) continue
    const p = v.map(point), lo = Math.ceil(Math.min(...p.map(a => a[1])) - .5), hi = Math.floor(Math.max(...p.map(a => a[1])) - .5)
    for (let y = lo; y <= hi; y++) {
      const z = y + .5, cuts = []
      for (let e = 0; e < 3; e++) { const a = p[e], b = p[(e + 1) % 3]; if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) cuts.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) }
      if (cuts.length < 2) continue
      const end = Math.floor(Math.max(...cuts) - .5), ty = Math.floor(y / pixels), localY = y - ty * pixels
      for (let x = Math.ceil(Math.min(...cuts) - .5); x <= end;) {
        const tx = Math.floor(x / pixels), key = ty * columns + tx, right = Math.min(end + 1, (tx + 1) * pixels)
        let tile = tiles.get(key); if (!tile) { tile = new Uint8Array(pixels * pixels); tiles.set(key, tile) }
        tile.fill(255, localY * pixels + x - tx * pixels, localY * pixels + right - tx * pixels); x = right
      }
    }
  }
  const atlasColumns = Math.min(64, Math.max(1, tiles.size)), atlasRows = Math.ceil(tiles.size / atlasColumns)
  const width = atlasColumns * pixels, height = Math.max(pixels, atlasRows * pixels)
  if (width > 4096 || height > 4096) throw new Error('道路投影遮罩超过 4096 纹理预算')
  const atlas = new Uint8Array(width * height), lookup = new Uint8Array(columns * rows * 4)
  let tileIndex = 0, filled = 0
  const occupied = (x, y) => {
    if (x < 0 || y < 0 || x >= columns * pixels || y >= rows * pixels) return 0
    const tx = Math.floor(x / pixels), ty = Math.floor(y / pixels)
    return getTile(tx, ty)?.[(y - ty * pixels) * pixels + x - tx * pixels] || 0
  }
  for (const [key, tile] of tiles) {
    const tx = key % columns, ty = Math.floor(key / columns), ax = tileIndex % atlasColumns * pixels, ay = Math.floor(tileIndex / atlasColumns) * pixels
    const encoded = tileIndex + 1; lookup[key * 4] = encoded % 256; lookup[key * 4 + 1] = Math.floor(encoded / 256); lookup[key * 4 + 3] = 255
    for (let y = 0; y < pixels; y++) for (let x = 0; x < pixels; x++) {
      if (!tile[y * pixels + x]) continue
      const wx = tx * pixels + x, wy = ty * pixels + y
      if ([-1, 0, 1].every(dy => [-1, 0, 1].every(dx => occupied(wx + dx, wy + dy)))) { atlas[(ay + y) * width + ax + x] = 255; filled++ }
    }
    tileIndex++
  }
  const texture = new DataTexture(atlas, width, height, RedFormat, UnsignedByteType), indirection = new DataTexture(lookup, columns, rows, RGBAFormat, UnsignedByteType)
  for (const map of [texture, indirection]) { map.minFilter = map.magFilter = NearestFilter; map.generateMipmaps = false; map.colorSpace = NoColorSpace; map.needsUpdate = true }
  const sample = (x, z) => {
    const px = Math.floor((x - originX) * density), py = Math.floor((z - originZ) * density), tx = Math.floor(px / pixels), ty = Math.floor(py / pixels)
    if (tx < 0 || ty < 0 || tx >= columns || ty >= rows) return 0
    const key = (ty * columns + tx) * 4, id = lookup[key] + lookup[key + 1] * 256 - 1
    return id < 0 ? 0 : atlas[(Math.floor(id / atlasColumns) * pixels + py % pixels) * width + id % atlasColumns * pixels + px % pixels] / 255
  }
  return { texture, indirection, sample, uniforms: {
    nanjingRoadDeckMask: { value: texture }, nanjingRoadDeckTiles: { value: indirection },
    nanjingRoadDeckWorld: { value: new Vector4(originX, originZ, tileWorld, pixels) },
    nanjingRoadDeckGrid: { value: new Vector2(columns, rows) }, nanjingRoadDeckAtlas: { value: new Vector3(width, height, atlasColumns) }
  }, status: { tiles: tiles.size, width, height, bytes: atlas.byteLength + lookup.byteLength, worldPixel: 1 / density, maskedArea: filled / density ** 2 },
    dispose() { texture.dispose(); indirection.dispose() } }
}
function patchShader(shader, uniforms, deck = false) {
  if (shader.uniforms.nanjingInternalRoadTextureStrength) return true
  for (const [source, token] of [[shader.vertexShader, '#include <common>'], [shader.vertexShader, '#include <uv_vertex>'], [shader.vertexShader, '#include <project_vertex>'],
    [shader.fragmentShader, '#include <common>'], [shader.fragmentShader, '#include <map_fragment>']]) if (!source.includes(token)) return false
  const vertex = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float nanjingInternalRoadWorldScale;\nuniform float nanjingInternalRoadGeneratedMap;\nuniform float nanjingInternalRoadGeneratedNormal;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      // These two audited roads are static, unskinned source meshes. A single
      // world XZ mapping keeps grain size and direction equal across UV islands.
      vec4 nanjingInternalRoadPosition = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        nanjingInternalRoadPosition = batchingMatrix * nanjingInternalRoadPosition;
      #endif
      #ifdef USE_INSTANCING
        nanjingInternalRoadPosition = instanceMatrix * nanjingInternalRoadPosition;
      #endif
      vec2 nanjingInternalRoadUv = ( modelMatrix * nanjingInternalRoadPosition ).xz * nanjingInternalRoadWorldScale;
      #ifdef USE_MAP
        if ( nanjingInternalRoadGeneratedMap > 0.5 ) vMapUv = nanjingInternalRoadUv;
      #endif
      #ifdef USE_NORMALMAP
        if ( nanjingInternalRoadGeneratedNormal > 0.5 ) vNormalMapUv = nanjingInternalRoadUv;
      #endif`)
  const fragment = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float nanjingInternalRoadTextureStrength;\nuniform vec3 nanjingInternalRoadTextureMean;\nuniform float nanjingInternalRoadGeneratedMap;')
    .replace('#include <map_fragment>', `#ifdef USE_MAP
      if ( nanjingInternalRoadGeneratedMap > 0.5 ) {
      vec4 nanjingInternalRoadSample = texture2D( map, vMapUv );
      vec3 nanjingInternalRoadGrain = nanjingInternalRoadSample.rgb / nanjingInternalRoadTextureMean;
      diffuseColor.rgb *= mix( vec3( 1.0 ), nanjingInternalRoadGrain, nanjingInternalRoadTextureStrength );
      diffuseColor.a *= nanjingInternalRoadSample.a;
      } else {
        #include <map_fragment>
      }
    #endif`)
  shader.vertexShader = vertex; shader.fragmentShader = fragment
  if (deck) {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNanjingRoadDeckWorld;')
      .replace('vec2 nanjingInternalRoadUv =', 'vNanjingRoadDeckWorld = ( modelMatrix * nanjingInternalRoadPosition ).xyz;\nvec2 nanjingInternalRoadUv =')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vNanjingRoadDeckWorld;
      uniform sampler2D nanjingRoadDeckMask;
      uniform sampler2D nanjingRoadDeckTiles;
      uniform vec4 nanjingRoadDeckWorld;
      uniform vec2 nanjingRoadDeckGrid;
      uniform vec3 nanjingRoadDeckAtlas;
      float nanjingRoadDeckCoverage() {
        vec3 plane = cross( dFdx( vNanjingRoadDeckWorld ), dFdy( vNanjingRoadDeckWorld ) );
        if ( abs( plane.y ) < .9 * length( plane ) ) return 0.0;
        vec2 coordinate = ( vNanjingRoadDeckWorld.xz - nanjingRoadDeckWorld.xy ) / nanjingRoadDeckWorld.z;
        vec2 cell = floor( coordinate );
        if ( any( lessThan( cell, vec2( 0.0 ) ) ) || any( greaterThanEqual( cell, nanjingRoadDeckGrid ) ) ) return 0.0;
        vec4 address = texture2D( nanjingRoadDeckTiles, ( cell + .5 ) / nanjingRoadDeckGrid );
        float index = floor( address.r * 255.0 + .5 ) + floor( address.g * 255.0 + .5 ) * 256.0 - 1.0;
        if ( index < 0.0 ) return 0.0;
        vec2 tile = vec2( mod( index, nanjingRoadDeckAtlas.z ), floor( index / nanjingRoadDeckAtlas.z ) );
        vec2 pixel = tile * nanjingRoadDeckWorld.w + floor( fract( coordinate ) * nanjingRoadDeckWorld.w ) + .5;
        return texture2D( nanjingRoadDeckMask, pixel / nanjingRoadDeckAtlas.xy ).r;
      }`)
      .replace('nanjingInternalRoadTextureStrength );', 'nanjingInternalRoadTextureStrength * nanjingRoadDeckCoverage() );')
  }
  Object.assign(shader.uniforms, uniforms)
  return true
}

/** Runtime-only material copies. Save withOriginals so project geometry,
 * editable source materials and image bindings remain the original resources.
 * The saved versioned configuration rebuilds the same appearance on reopen. */
export function createNanjingInternalRoadSurfaces(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene
  let settings = normalize(config.internalRoadSurfaces), records = [], disposed = false, suspended = 0, pending = false, skipped = [], shaderErrors = 0
  const ownedSources = new WeakMap(), sources = new Set(), generatedTextures = new WeakSet()
  let materialEdits = 0, activeRestore = null, deckMask = null, deckMaskGeometry = null, deckMaskSignature = null
  const uniforms = { nanjingInternalRoadTextureStrength: { value: settings.textureStrength },
    nanjingInternalRoadWorldScale: { value: settings.worldScale }, nanjingInternalRoadTextureMean: { value: new Vector3(...ASPHALT_MEAN) } }
  const finishFields = ['metalness', 'roughness', 'specularIntensity', 'normalScale', 'map', 'normalMap']
  function saveOverride(row, field, value) {
    settings.materialOverrides ??= {}
    settings.materialOverrides[row.object.name] ??= {}
    settings.materialOverrides[row.object.name][field] = field === 'map' || field === 'normalMap' ? true : editValue(value)
    config.internalRoadSurfaces = structuredClone(settings)
  }
  function applyValues(row) {
    const before = editSnapshot(row.material), overrides = settings.materialOverrides?.[row.object.name] || {}
    for (const field of EDIT_FIELDS) if (field in row.source) copyEdit(row.material, row.source, field)
    row.material.map = overrides.map ? row.source.map : row.ownedMap
    row.material.normalMap = row.deck || overrides.normalMap ? row.source.normalMap : row.ownedNormalMap
    if (overrides.normalScale) row.material.normalScale.fromArray(overrides.normalScale)
    else if (row.material.normalMap === row.ownedNormalMap && row.ownedNormalMap) row.material.normalScale.copy(row.donor.normalScale).multiplyScalar(settings.normalStrength)
    row.material.metalness = overrides.metalness ?? (row.deck ? row.source.metalness : 0); row.material.roughness = overrides.roughness ?? (row.deck ? row.source.roughness : .96)
    if ('specularIntensity' in row.material) row.material.specularIntensity = overrides.specularIntensity ?? (row.deck ? row.source.specularIntensity : .04)
    row.uniforms.nanjingInternalRoadGeneratedMap.value = row.material.map && row.material.map === row.ownedMap ? 1 : 0
    row.uniforms.nanjingInternalRoadGeneratedNormal.value = row.material.normalMap && row.material.normalMap === row.ownedNormalMap ? 1 : 0
    if (EDIT_FIELDS.some(field => !sameEdit(before[field], editValue(row.material[field])))) row.material.needsUpdate = true
    row.sourceValues = editSnapshot(row.source); row.copyValues = editSnapshot(row.material)
  }
  function syncMaterialEdits() {
    if (disposed) return getStatus()
    for (const row of records) {
      const sourceNow = editSnapshot(row.source), copyNow = editSnapshot(row.material)
      for (const field of EDIT_FIELDS) {
        if (!(field in row.source)) continue
        const sourceChanged = !sameEdit(sourceNow[field], row.sourceValues[field])
        const copyChanged = !sameEdit(copyNow[field], row.copyValues[field])
        const generated = (field === 'map' || field === 'normalMap') && generatedTextures.has(row.material[field])
        if (copyChanged && !sourceChanged && !generated) { copyEdit(row.source, row.material, field); row.source.needsUpdate = true; materialEdits++ }
        if ((sourceChanged || (copyChanged && !generated)) && finishFields.includes(field)) saveOverride(row, field, row.source[field])
      }
      applyValues(row)
    }
    return getStatus()
  }
  function restoreMaterials() { for (const row of records) if (row.object.material === row.material) row.object.material = row.source }
  function attachMaterials() { for (const row of records) if (row.object.material === row.source) row.object.material = row.material }
  function release() {
    restoreMaterials()
    sourceMaterialLists()
    for (const row of records) { row.ownedMap?.dispose(); row.ownedNormalMap?.dispose(); row.material.dispose() }
    records = []
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pending = true; return getStatus() }
    const hadRecords = records.length > 0
    syncMaterialEdits()
    restoreMaterials(); sourceMaterialLists()
    const previous = records
    records = []; skipped = []
    if (settings.enabled && scene) {
      const names = new Map()
      visit(scene, object => { const list = names.get(object.name) || []; list.push(object); names.set(object.name, list) })
      const donors = names.get(DONOR) || [], donor = donors.length === 1 ? donors[0].material : null
      if (settings.visibleRoadDecks === true) {
        const references = names.get('支路_路面') || [], reference = references.length === 1 ? references[0] : null
        const expected = NANJING_INTERNAL_ROAD_TARGETS[0]
        if (reference?.geometry?.attributes.position?.count === expected.vertices && reference.geometry.index?.count === expected.indices) {
          const signature = reference.matrixWorld.elements.join(',') + '|' + reference.geometry.attributes.position.version + '|' + reference.geometry.index.version
          if (deckMaskGeometry !== reference.geometry || deckMaskSignature !== signature) {
            deckMask?.dispose(); deckMask = createNanjingRoadDeckMask(reference); deckMaskGeometry = reference.geometry; deckMaskSignature = signature
          }
        } else { deckMask?.dispose(); deckMask = null; deckMaskGeometry = null; deckMaskSignature = null }
      } else if (deckMask) { deckMask.dispose(); deckMask = null; deckMaskGeometry = null; deckMaskSignature = null }
      const targets = settings.visibleRoadDecks === true ? [...NANJING_INTERNAL_ROAD_TARGETS, ...NANJING_VISIBLE_ROAD_DECK_TARGETS] : NANJING_INTERNAL_ROAD_TARGETS
      if (!donor?.isMeshStandardMaterial || donor.name !== DONOR_MATERIAL || !donor.map?.isTexture) {
        skipped.push({ name: DONOR, reason: '原沥青贴图尚未载入或源对象不唯一' })
      } else for (const target of targets) {
        const objects = names.get(target.name) || [], object = objects.length === 1 ? objects[0] : null, source = object?.material, geometry = object?.geometry
        if (!object?.isMesh || !source?.isMeshStandardMaterial || source.name !== target.material || object.isInstancedMesh || object.isSkinnedMesh
          || object.morphTargetInfluences?.length || geometry?.attributes.position?.count !== target.vertices || (geometry?.index?.count || 0) !== target.indices) {
          skipped.push({ name: target.name, reason: '车行道对象或源几何版本不匹配' }); continue
        }
        if (target.deck && !deckMask) { skipped.push({ name: target.name, reason: '精确道路投影遮罩未就绪' }); continue }
        let row = previous.find(item => item.object === object && item.source === source)
        if (!row) {
          const material = source.clone()
          row = { object, source, material, donor, deck: target.deck === true, ownedMap: null, ownedNormalMap: null, donorMap: null, donorNormalMap: null,
            uniforms: { ...uniforms, nanjingInternalRoadGeneratedMap: { value: 1 }, nanjingInternalRoadGeneratedNormal: { value: 0 } } }
          material.onBeforeCompile = (shader, renderer) => {
            source.onBeforeCompile.call(source, shader, renderer)
            if (!patchShader(shader, row.uniforms, row.deck)) shaderErrors++
          }
          material.customProgramCacheKey = () => source.customProgramCacheKey.call(source) + '|' + NANJING_INTERNAL_ROAD_SURFACE_VERSION + '|editable-source-maps-v2' + (row.deck ? '|road-footprint-mask-v1' : '')
          ownedSources.set(material, source); sources.add(source)
        }
        row.donor = donor
        if (row.deck) Object.assign(row.uniforms, deckMask.uniforms)
        const normal = !row.deck && donor.normalMap?.isTexture && !geometry.attributes.tangent ? donor.normalMap : null
        if (row.donorMap !== donor.map) {
          const old = row.ownedMap; row.ownedMap = textureCopy(donor.map); generatedTextures.add(row.ownedMap); row.donorMap = donor.map; old?.dispose()
        }
        if (row.donorNormalMap !== normal) {
          const old = row.ownedNormalMap; row.ownedNormalMap = normal ? textureCopy(normal, true) : null
          if (row.ownedNormalMap) generatedTextures.add(row.ownedNormalMap)
          row.donorNormalMap = normal; old?.dispose()
        }
        applyValues(row)
        records.push(row)
      }
      attachMaterials(); sourceMaterialLists()
    }
    for (const row of previous) if (!records.includes(row)) { row.ownedMap?.dispose(); row.ownedNormalMap?.dispose(); row.material.dispose() }
    if (!settings.enabled && deckMask) { deckMask.dispose(); deckMask = null; deckMaskGeometry = null; deckMaskSignature = null }
    if (hadRecords || records.length) onChange?.(getStatus())
    return getStatus()
  }
  function update(patch = {}) {
    if (disposed) return getStatus()
    syncMaterialEdits()
    const next = normalize({ ...settings, ...patch, version: 1 })
    settings = next; config.internalRoadSurfaces = structuredClone(next)
    uniforms.nanjingInternalRoadTextureStrength.value = next.textureStrength; uniforms.nanjingInternalRoadWorldScale.value = next.worldScale
    return refresh()
  }
  function sourceMaterialLists() {
    const plans = []
    scene?.traverse(root => {
      const previous = root.RootMaterials
      if (!Array.isArray(previous)) return
      const live = new Set()
      root.traverse(object => { if (object.isMesh) for (const material of slots(object)) live.add(material) })
      const relevant = previous.some(material => ownedSources.has(material) || sources.has(material)) || [...live].some(material => ownedSources.has(material) || sources.has(material))
      if (!relevant) return
      const originalDuplicates = new Set(previous).size !== previous.length, seen = new Set(), next = []
      for (const material of previous) {
        let mapped = material
        const source = ownedSources.get(material)
        if (source && !live.has(material)) mapped = live.has(source) ? source : null
        else if (sources.has(material) && !live.has(material)) mapped = null
        if (!mapped) continue
        // Preserve existing malformed duplicates/unrelated orphan rows so the
        // strict material-binding validator still catches those errors.
        if (!originalDuplicates && seen.has(mapped) && (source || sources.has(mapped))) continue
        next.push(mapped); seen.add(mapped)
      }
      for (const material of live) if ((ownedSources.has(material) || sources.has(material)) && !seen.has(material)) { next.push(material); seen.add(material) }
      if (next.length !== previous.length || next.some((material, index) => material !== previous[index])) plans.push({ root, previous, next })
    })
    const applied = []
    try { for (const plan of plans) { plan.root.RootMaterials = plan.next; applied.push(plan) } }
    catch (error) { for (const plan of applied.reverse()) if (plan.root.RootMaterials === plan.next) plan.root.RootMaterials = plan.previous; throw error }
    return () => { for (const { root, previous, next } of plans) if (root.RootMaterials === next) root.RootMaterials = previous }
  }

  function withOriginals(callback) {
    if (disposed) return callback()
    const outer = suspended === 0
    if (outer) syncMaterialEdits()
    suspended++
    let restoreLists = () => {}, finished = false
    if (outer) {
      restoreMaterials()
      try { restoreLists = sourceMaterialLists(); activeRestore = restoreLists }
      catch (error) { suspended--; attachMaterials(); throw error }
    }
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      if (suspended || disposed) return
      const restore = activeRestore; activeRestore = null
      restore?.()
      if (pending) { pending = false; refresh() }
      else { syncMaterialEdits(); attachMaterials(); sourceMaterialLists() }
    }
    try {
      const value = callback()
      if (value?.then) return Promise.resolve(value).finally(finish)
      finish(); return value
    } catch (error) { finish(); throw error }
  }
  function getStatus() { return { version: 1, active: !disposed && !suspended && records.length > 0, settings: structuredClone(settings), materialEdits,
    objects: records.map(row => row.object.name), materials: records.length, skipped: skipped.slice(), shaderErrors,
    textureSource: 'existing GLB asphalt_08_color / asphalt_08_normal', mapping: 'world-XZ',
    geometryChanged: false, imagesEdited: false, sourceMaterialsChanged: false, ...(deckMask ? { visibleRoadDeckMask: { ...deckMask.status } } : {}) } }
  function dispose() { if (disposed) return; syncMaterialEdits(); disposed = true; release(); sources.clear(); deckMask?.dispose(); deckMask = null }
  refresh()
  return { refresh, update, syncMaterialEdits, withOriginals, getStatus, dispose, getOriginalMaterial: material => ownedSources.get(material) || material }
}
