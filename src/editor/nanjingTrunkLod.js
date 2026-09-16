import * as THREE from 'three'

export const NANJING_TRUNK_LOD_DEFAULTS = Object.freeze({
  enabled: false,
  materialNames: ['Material_24'],
  ratios: [0.7, 0.4],
  pixelDiameters: [160, 60],
  maxPixelError: 1.25,
  hysteresis: 0.2,
  updateIntervalMs: 180
})

// Position/normal/UV and numeric index hashes identify the source independently
// of runtime UUIDs and the decoder's choice of Uint16 versus Uint32 indices.
export function getNanjingTrunkFingerprint(geometry) {
  if (!geometry?.isBufferGeometry || !geometry.index) return null
  const result = { vertices: geometry.attributes.position?.count ?? 0, indices: geometry.index.count, attributes: {} }
  const bits = new DataView(new ArrayBuffer(4))
  const hash = (length, read) => {
    let value = 2166136261
    for (let i = 0; i < length; i++) {
      bits.setFloat32(0, read(i), true)
      value ^= bits.getUint32(0, true)
      value = Math.imul(value, 16777619)
    }
    return (value >>> 0).toString(16).padStart(8, '0')
  }
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = geometry.attributes[name]
    if (!attribute || attribute.isInterleavedBufferAttribute) return null
    result.attributes[name] = { itemSize: attribute.itemSize, count: attribute.count,
      hash: hash(attribute.array.length, i => attribute.array[i]) }
  }
  result.indexHash = hash(geometry.index.count, i => geometry.index.getX(i))
  return result
}

/** Create the synchronous builder accepted by createNanjingLod's
 * options.buildGeometryLods(source) injection. Cache data is fetched once,
 * before the controller is created. Mismatched source geometry fails closed.
 */
export function createNanjingTrunkLodBuilder(data) {
  if (![1, 2].includes(data?.version) || data?.materialName !== 'Material_24') throw new Error('树干 LOD 缓存格式不正确')
  const sources = data.version === 1 ? [data] : data.sources
  if (!Array.isArray(sources) || !sources.length) throw new Error('树干 LOD 缓存缺少源几何')
  const matchingSources = new Map()
  for (const item of sources) {
    if (!item?.source?.fingerprint || !Number.isFinite(item.source.triangles) || item.source.triangles <= 0
      || !Array.isArray(item.levels) || item.levels.length !== 2) throw new Error('树干 LOD 缓存格式不正确')
    const expected = JSON.stringify(item.source.fingerprint)
    if (matchingSources.has(expected)) throw new Error('树干 LOD 缓存包含重复源指纹')
    matchingSources.set(expected, item)
  }
  const entries = new WeakMap()
  const loader = new THREE.BufferGeometryLoader()
  return function buildGeometryLods(source) {
    if (entries.has(source)) return entries.get(source)
    const matching = matchingSources.get(JSON.stringify(getNanjingTrunkFingerprint(source)))
    if (!matching) { entries.set(source, null); return null }
    const levels = []
    try { for (const [index, level] of matching.levels.entries()) {
      const geometry = loader.parse(level.geometry)
      levels.push({ geometry })
      geometry.name = `树干 · LOD ${index + 1}`
      const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0
      if (!geometry.attributes.normal || !geometry.attributes.uv || count / 3 !== level.triangles
        || count <= 0 || count / 3 >= matching.source.triangles
        || !Number.isFinite(level.coverageError) || level.coverageError < 0
        || level.fingerprint && JSON.stringify(getNanjingTrunkFingerprint(geometry)) !== JSON.stringify(level.fingerprint)) throw new Error('树干 LOD 几何或误差数据不正确')
      // Retain source bounds as conservative culling metadata. Actual reduced
      // surface bounds and measured deviations remain exposed in level.stats.
      if (!source.boundingBox) source.computeBoundingBox()
      if (!source.boundingSphere) source.computeBoundingSphere()
      geometry.boundingBox = source.boundingBox.clone()
      geometry.boundingSphere = source.boundingSphere.clone()
      geometry.userData.nanjingLod = { sourceUuid: source.uuid, kind: 'trunk', ratio: level.ratio, coverageError: level.coverageError }
      Object.assign(levels[index], { ratio: level.ratio, requestedRatio: level.requestedRatio, triangles: level.triangles,
        coverageError: level.coverageError, stats: level.stats })
    } } catch (error) { for (const level of levels) level.geometry.dispose(); throw error }
    const entry = { source, triangles: matching.source.triangles, cards: null, envelopeCards: null, levels }
    entries.set(source, entry)
    return entry
  }
}

export async function loadNanjingTrunkLodBuilder(url = '/nanjing-restore/trunk-lod-v2-64ac55116113.json', fetchOptions = {}) {
  const response = await fetch(url, fetchOptions)
  if (!response.ok) throw new Error(`树干 LOD 缓存读取失败 (${response.status})`)
  return createNanjingTrunkLodBuilder(await response.json())
}
