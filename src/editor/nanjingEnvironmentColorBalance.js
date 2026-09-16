import { DataTexture, DataUtils, FloatType, HalfFloatType, LinearSRGBColorSpace, RGBAFormat } from 'three'

// V16 records corrected lighting and sky together. Only an explicit new scope
// keeps the visual sky original; never reinterpret the appearance of a record.
export function environmentColorBalanceScope(settings) {
  if (!settings || settings.version !== 1) return 'both'
  const scope = settings.scope ?? 'both'
  if (!['both', 'lighting-only'].includes(scope)) throw new RangeError('Environment color balance scope must be both or lighting-only')
  return scope
}

// A saved project without this field uses the exact original HDR. No migration
// or guessed correction is applied to an old/future-version project.
export function environmentColorBalanceKey(settings) {
  if (settings == null || settings === false || settings.enabled === false || settings.version !== 1) return 'source'
  if (settings.enabled !== true || !Array.isArray(settings.gains) || settings.gains.length !== 3
    || !settings.gains.every(value => Number.isFinite(value) && value > 0 && value <= 8)) {
    throw new TypeError('Environment color balance v1 requires enabled and three finite gains in (0, 8]')
  }
  return settings.gains.every(value => value === 1) ? 'source' : `v1:${settings.gains.join(',')}`
}

/** Owns only a derived texture. The source HDR and its source/data/version are
 * never mutated or disposed here. Correction precedes IBL PMREM. Restore uses
 * scope to choose the original sky or the legacy corrected sky independently.
 */
export function createNanjingEnvironmentColorBalance() {
  let sourceTexture = null, sourceVersion = -1, key = '', derived = null, disposed = false, scope = 'both'
  function update(source, settings) {
    if (disposed) throw new Error('Environment color balance is disposed')
    const nextScope = environmentColorBalanceScope(settings)
    const nextKey = environmentColorBalanceKey(settings)
    const nextVersion = `${source?.version ?? -1}:${source?.source?.version ?? -1}`
    // Scope selects consumers, not pixels. Toggling it does not allocate a new HDR.
    if (source === sourceTexture && nextVersion === sourceVersion && nextKey === key) { scope = nextScope; return derived || source }
    let nextDerived = null
    if (nextKey !== 'source') {
      const { data, width, height } = source?.image || {}
      if (!source?.isDataTexture || source.format !== RGBAFormat || source.colorSpace !== LinearSRGBColorSpace
        || ![HalfFloatType, FloatType].includes(source.type) || !data || data.length !== width * height * 4
        || (source.type === HalfFloatType ? !(data instanceof Uint16Array) : !(data instanceof Float32Array))) {
        throw new TypeError('Environment correction requires a decoded linear RGB(A) float HDR texture')
      }
      const output = new data.constructor(data.length)
      const half = source.type === HalfFloatType
      for (let index = 0; index < data.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          const value = (half ? DataUtils.fromHalfFloat(data[index + channel]) : data[index + channel]) * settings.gains[channel]
          if (!Number.isFinite(value) || Math.abs(value) > (half ? 65504 : 3.4028234663852886e38)) {
            throw new RangeError('Environment correction exceeds the HDR storage range')
          }
          output[index + channel] = half ? DataUtils.toHalfFloat(value) : value
        }
        output[index + 3] = data[index + 3]
      }
      // Texture.clone() shares Source and increments its version. Constructing
      // a fresh DataTexture avoids writing even that metadata on the original.
      nextDerived = new DataTexture(output, width, height, source.format, source.type)
      for (const property of ['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy',
        'internalFormat', 'normalized', 'rotation', 'matrixAutoUpdate', 'generateMipmaps', 'premultiplyAlpha',
        'flipY', 'unpackAlignment', 'colorSpace']) nextDerived[property] = source[property]
      for (const property of ['offset', 'repeat', 'center', 'matrix']) nextDerived[property].copy(source[property])
      nextDerived.name = `${source.name || 'Nanjing HDR'} · color balance v1`
      nextDerived.userData = { nanjingDerivedEnvironment: true }
      nextDerived.needsUpdate = true
    }
    const previous = derived
    sourceTexture = source
    sourceVersion = nextVersion
    key = nextKey
    scope = nextScope
    derived = nextDerived
    previous?.dispose()
    return derived || source
  }
  function getStatus() { return { disposed, active: !!derived, key, scope, sourceUuid: sourceTexture?.uuid, textureUuid: (derived || sourceTexture)?.uuid } }
  function dispose() {
    if (disposed) return
    disposed = true
    derived?.dispose()
    derived = null
    sourceTexture = null
  }
  return { update, getStatus, dispose }
}
