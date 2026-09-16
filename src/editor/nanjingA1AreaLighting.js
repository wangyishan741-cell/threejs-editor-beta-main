import { ShaderChunk, Vector2, Vector3 } from 'three'

// Retain the saved a1AreaLighting key and public API. The policy now covers
// both existing white rectangle lamps and all five hero glass shells.
export const NANJING_FACADE_AREA_LIGHT_NAMES = Object.freeze(['面光', '面光.001'])
export const NANJING_FACADE_AREA_LIGHT_RECEIVERS = Object.freeze([
  Object.freeze({ objectName: 'a1玻璃外墙', materialNames: Object.freeze(['建筑_蓝灰玻璃']) }),
  Object.freeze({ objectName: 'a2玻璃层', materialNames: Object.freeze(['建筑_a2外层介电玻璃', '建筑_镜面玻璃']) }),
  Object.freeze({ objectName: 'a3玻璃外层', materialNames: Object.freeze(['建筑_a3外层介电玻璃', '建筑_低粗糙玻璃']) }),
  Object.freeze({ objectName: 'a4玻璃外层', materialNames: Object.freeze(['建筑_a4外层介电玻璃', '建筑_低粗糙玻璃']) }),
  Object.freeze({ objectName: 'a3&a4连廊玻璃外层', materialNames: Object.freeze(['建筑_a4外层介电玻璃', '建筑_低粗糙玻璃']) })
])
const receiverNames = new Map(NANJING_FACADE_AREA_LIGHT_RECEIVERS.map(target => [target.objectName, target.materialNames]))
export const isNanjingA1AreaLightingReceiver = (material, object) => material?.isMeshStandardMaterial === true
  && receiverNames.get(object?.name)?.includes(material.name) === true
const areaCall = 'RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'

function isVisibleInScene(object, scene) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false
    if (node === scene) return true
  }
  return false
}

// Private draw materials exclude only the matching lamp's direct contribution.
// Lamp properties, environment lighting, glass optics and reflection textures
// remain unchanged. Names resolve lamps on CPU; world position and size identify
// their entries in Three's view-space light list without relying on array order.
export function createNanjingA1AreaLighting(editor, config = {}) {
  let settings = { version: 1, enabled: config.a1AreaLighting !== false && config.a1AreaLighting?.enabled !== false }
  config.a1AreaLighting = settings
  let disposed = false, baselineDepth = 0, areaLights = []
  let compiledShaders = 0, errors = 0, lastError = null
  const markerPosition = new Vector3(), uniforms = {}
  const records = NANJING_FACADE_AREA_LIGHT_NAMES.map((name, index) => {
    const suffix = index ? 'Secondary' : ''
    const record = { name, light: null, unsupported: null,
      enabled: { value: 0 }, position: { value: new Vector3() }, halfSize: { value: new Vector2() } }
    uniforms[`nanjingA1AreaLightExclude${suffix}`] = record.enabled
    uniforms[`nanjingA1AreaLightPosition${suffix}`] = record.position
    uniforms[`nanjingA1AreaLightHalfSize${suffix}`] = record.halfSize
    return record
  })

  function sync() {
    for (const record of records) {
      record.enabled.value = 0
      const light = record.light
      if (disposed || !light || light.name !== record.name || !light.isRectAreaLight || !isVisibleInScene(light, editor.scene)) continue
      record.position.value.setFromMatrixPosition(light.matrixWorld)
      record.halfSize.value.set(light.width * .5, light.height * .5)
      const values = [...record.position.value.toArray(), light.width, light.height]
      if (!values.every(Number.isFinite) || light.width <= 0 || light.height <= 0) {
        record.unsupported = `${record.name}位置或尺寸无效`; continue
      }
      // A coincident unrelated lamp must never be suppressed accidentally.
      const coincident = areaLights.some(other => other !== light && isVisibleInScene(other, editor.scene)
        && Math.abs(other.width - light.width) <= .00002 && Math.abs(other.height - light.height) <= .00002
        && markerPosition.setFromMatrixPosition(other.matrixWorld).distanceToSquared(record.position.value) <= 1e-8)
      if (coincident) { record.unsupported = `${record.name}存在同位置同尺寸面光，保留原照明`; continue }
      record.unsupported = null
      record.enabled.value = settings.enabled && baselineDepth === 0 ? 1 : 0
    }
  }

  function update(patch = {}) {
    if (disposed) return getStatus()
    settings = { version: 1, enabled: typeof patch.enabled === 'boolean' ? patch.enabled : settings.enabled }
    config.a1AreaLighting = settings
    areaLights = []
    editor.scene.traverse(object => { if (object.isRectAreaLight && !object.userData?.nanjingUtility) areaLights.push(object) })
    for (const record of records) {
      const matches = areaLights.filter(object => object.name === record.name)
      record.light = matches.length === 1 ? matches[0] : null
      record.unsupported = !matches.length ? `未找到独立${record.name}` : matches.length > 1 ? `${record.name}名称不唯一，保留原照明` : null
    }
    sync()
    return getStatus()
  }

  function patchShader(shader, material, object) {
    if (!isNanjingA1AreaLightingReceiver(material, object)) return true
    if (shader.uniforms.nanjingA1AreaLightExclude) return true
    let fragment = shader.fragmentShader
    if (fragment.includes('#include <lights_fragment_begin>')) fragment = fragment.replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin)
    if (!fragment.includes('#include <common>') || !fragment.includes(areaCall)) {
      errors++; lastError = '幕墙面光着色器不兼容，保留原照明'; return false
    }
    const declarations = records.map((_, index) => {
      const suffix = index ? 'Secondary' : ''
      return `uniform float nanjingA1AreaLightExclude${suffix};
        uniform vec3 nanjingA1AreaLightPosition${suffix};
        uniform vec2 nanjingA1AreaLightHalfSize${suffix};`
    }).join('\n')
    const matches = records.map((_, index) => {
      const suffix = index ? 'Secondary' : ''
      return `vec3 nanjingAreaLightDelta${index} = rectAreaLight.position - ( viewMatrix * vec4( nanjingA1AreaLightPosition${suffix}, 1.0 ) ).xyz;
        vec2 nanjingAreaLightSizeDelta${index} = abs( vec2( length( rectAreaLight.halfWidth ), length( rectAreaLight.halfHeight ) ) - nanjingA1AreaLightHalfSize${suffix} );
        nanjingExcludeAreaLight = nanjingExcludeAreaLight || ( nanjingA1AreaLightExclude${suffix} > 0.5
          && dot( nanjingAreaLightDelta${index}, nanjingAreaLightDelta${index} ) <= 1e-8
          && all( lessThanEqual( nanjingAreaLightSizeDelta${index}, vec2( 1e-5 ) ) ) );`
    }).join('\n')
    // Three unrolls the enclosing area-light loop. Keep a nested scope so each
    // copied iteration owns its local variables after the loop braces vanish.
    fragment = fragment.replace('#include <common>', `#include <common>\n${declarations}`)
      .replace(areaCall, `{
        bool nanjingExcludeAreaLight = false;
        ${matches}
        if ( !nanjingExcludeAreaLight ) { ${areaCall} }
      }`)
    shader.fragmentShader = fragment
    Object.assign(shader.uniforms, uniforms)
    compiledShaders++; lastError = null
    return true
  }

  function getStatus() {
    const lights = records.map(record => ({ name: record.name, found: !!record.light,
      active: record.enabled.value > .5, intensity: record.light?.intensity ?? null,
      visible: record.light ? isVisibleInScene(record.light, editor.scene) : null,
      position: record.position.value.toArray(), halfSize: record.halfSize.value.toArray(), unsupported: record.unsupported }))
    const primary = lights[0]
    return { enabled: !disposed && settings.enabled, active: lights.some(light => light.active), lights,
      lightName: primary.name, lightFound: primary.found, intensity: primary.intensity, visible: primary.visible,
      position: primary.position, halfSize: primary.halfSize,
      receiver: 'a1玻璃外墙', material: '建筑_蓝灰玻璃',
      receivers: NANJING_FACADE_AREA_LIGHT_RECEIVERS.map(target => target.objectName),
      baselineDepth, compiledShaders, errors, error: lastError, unsupported: lights.map(light => light.unsupported).filter(Boolean).join('；') || null,
      excludedContribution: 'direct-rectangle-light-only', environmentReflectionUnchanged: true, extraRenderPasses: 0 }
  }

  update()
  return { update, sync, patchShader, getStatus, uniforms,
    get enabled() { return !disposed && settings.enabled && records.some(record => record.light) },
    withBaseline(callback) {
      baselineDepth++; sync()
      const restore = () => { baselineDepth--; sync() }
      try {
        const result = callback()
        if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore)
        restore(); return result
      } catch (error) { restore(); throw error }
    },
    dispose() { if (disposed) return; disposed = true; for (const record of records) { record.enabled.value = 0; record.light = null }; areaLights = [] }
  }
}
