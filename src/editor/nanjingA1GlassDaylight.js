import { Matrix3, Vector3 } from 'three'

const OBJECT_NAME = 'a1玻璃外墙'
const MATERIAL_NAME = '建筑_蓝灰玻璃'
export const NANJING_A1_GLASS_DAYLIGHT_SHADER_VERSION = 'a1-audited-facade-direct-diffuse-base-color-v2'
// Audited from source GLB 36c1aee71981: these are the two lit vertical
// facade normals, not the world X/Z axes. The opposite and horizontal faces
// remain untouched. A .99 cosine includes the source's small edge variations.
export const NANJING_A1_DAYLIGHT_FACE_NORMALS = Object.freeze([
  Object.freeze([0.5314530, 0, -0.8470878]),
  Object.freeze([-0.8470878, 0, -0.5314530])
])
const MIN_DOT = .99
const totalDiffuse = 'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;'
const normalAnchor = '#include <beginnormal_vertex>'
const colorAnchor = '#include <color_fragment>'
const boundedScale = (value, fallback = .25) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
const baseColorScale = (value, fallback = 1) => Number.isFinite(value) && value >= 0 ? value : fallback
const supportedObject = object => object?.isMesh && object.name === OBJECT_NAME && !object.isSkinnedMesh
  && !object.isInstancedMesh && object.geometry?.attributes?.normal && !Object.keys(object.geometry.morphAttributes || {}).length
export const isNanjingA1GlassDaylightReceiver = (material, object) => supportedObject(object)
  && material?.isMeshStandardMaterial === true && material.name === MATERIAL_NAME

export function createNanjingA1GlassDaylight(editor, config = {}, { onChange } = {}) {
  let settings = { version: 2, enabled: config.a1GlassDaylight?.enabled === true,
    directDiffuseScale: boundedScale(config.a1GlassDaylight?.directDiffuseScale),
    baseColorScale: baseColorScale(config.a1GlassDaylight?.baseColorScale) }
  let disposed = false, target = null, unsupported = null, compiledShaders = 0, errors = 0, lastError = null
  const temporary = []
  const faceNormals = NANJING_A1_DAYLIGHT_FACE_NORMALS.map(normal => new Vector3().fromArray(normal).normalize())
  const uniforms = {
    nanjingA1DaylightEnabled: { value: 0 }, nanjingA1DirectDiffuseScale: { value: settings.directDiffuseScale },
    nanjingA1BaseColorScale: { value: 1 },
    nanjingA1DaylightFaceA: { value: faceNormals[0] }, nanjingA1DaylightFaceB: { value: faceNormals[1] }
  }
  function effective() { return Object.assign({}, settings, ...temporary) }
  function sync() {
    const current = effective()
    uniforms.nanjingA1DaylightEnabled.value = !disposed && !!target && current.enabled ? 1 : 0
    uniforms.nanjingA1DirectDiffuseScale.value = current.directDiffuseScale ?? settings.directDiffuseScale
    uniforms.nanjingA1BaseColorScale.value = !disposed && !!target ? current.baseColorScale : 1
  }
  function update(patch = {}) {
    if (disposed) return getStatus()
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('A1 daylight settings must be an object')
    if (Object.hasOwn(patch, 'directDiffuseScale') && !Number.isFinite(patch.directDiffuseScale)) throw new RangeError('A1 direct diffuse scale must be finite')
    if (Object.hasOwn(patch, 'baseColorScale') && (!Number.isFinite(patch.baseColorScale) || patch.baseColorScale < 0)) throw new RangeError('A1 base color scale must be finite and nonnegative')
    const before = settings
    settings = { version: 2, enabled: typeof patch.enabled === 'boolean' ? patch.enabled : settings.enabled,
      directDiffuseScale: boundedScale(patch.directDiffuseScale, settings.directDiffuseScale),
      baseColorScale: baseColorScale(patch.baseColorScale, settings.baseColorScale) }
    const matches = []
    editor.scene?.traverse(object => {
      if (!supportedObject(object)) return
      for (let node = object; node; node = node.parent) if (node.userData?.nanjingUtility || node.isHelper || node.isTransformControlsRoot || node.type?.endsWith('Helper')) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (materials.some(material => isNanjingA1GlassDaylightReceiver(material, object))) matches.push(object)
    })
    target = matches.length === 1 ? matches[0] : null
    unsupported = target ? null : matches.length ? '最高楼玻璃对象名称重复，保留原照明' : '未找到支持的最高楼玻璃对象，保留原照明'
    config.a1GlassDaylight = { ...settings }; sync()
    if (before.enabled !== settings.enabled || before.directDiffuseScale !== settings.directDiffuseScale
      || before.baseColorScale !== settings.baseColorScale) onChange?.(getStatus())
    return getStatus()
  }
  function patchShader(shader, material, object) {
    if (disposed || object !== target || !isNanjingA1GlassDaylightReceiver(material, object)) return true
    if (shader.uniforms.nanjingA1DaylightEnabled) { Object.assign(shader.uniforms, uniforms); return true }
    const vertex = shader.vertexShader, fragment = shader.fragmentShader
    if (!vertex.includes('#include <common>') || !vertex.includes(normalAnchor)
      || !fragment.includes('#include <common>') || fragment.split(totalDiffuse).length !== 2 || fragment.split(colorAnchor).length !== 2) {
      errors++; lastError = '最高楼直射漫反射着色器不兼容，保留原照明'; return false
    }
    // The original local normal identifies a physical facade on both front and
    // transmission-backside draws; gl_FrontFacing / normal-map perturbations
    // must not switch this policy onto the opposite facade.
    shader.vertexShader = vertex.replace('#include <common>', '#include <common>\nvarying vec3 vNanjingA1DaylightNormal;')
      .replace(normalAnchor, normalAnchor + '\nvNanjingA1DaylightNormal = objectNormal;')
    shader.fragmentShader = fragment.replace('#include <common>', `#include <common>
      varying vec3 vNanjingA1DaylightNormal;
      uniform float nanjingA1DaylightEnabled;
      uniform float nanjingA1DirectDiffuseScale;
      uniform float nanjingA1BaseColorScale;
      uniform vec3 nanjingA1DaylightFaceA;
      uniform vec3 nanjingA1DaylightFaceB;`)
      // Same albedo multiplication as material.color, before physical lighting
      // and transmission evaluate it. Only this A1 private draw receives the
      // uniform; the shared source material and A2 remain untouched.
      .replace(colorAnchor, `${colorAnchor}\n      diffuseColor.rgb *= nanjingA1BaseColorScale;`)
      .replace(totalDiffuse, `if ( nanjingA1DaylightEnabled > 0.5 ) {
        float nanjingA1NormalLengthSquared = dot( vNanjingA1DaylightNormal, vNanjingA1DaylightNormal );
        if ( nanjingA1NormalLengthSquared > 1e-12 ) {
          vec3 nanjingA1FaceNormal = vNanjingA1DaylightNormal * inversesqrt( nanjingA1NormalLengthSquared );
          float nanjingA1FaceMatch = max( dot( nanjingA1FaceNormal, nanjingA1DaylightFaceA ), dot( nanjingA1FaceNormal, nanjingA1DaylightFaceB ) );
          if ( nanjingA1FaceMatch >= ${MIN_DOT.toFixed(2)} ) reflectedLight.directDiffuse *= nanjingA1DirectDiffuseScale;
        }
      }
      ${totalDiffuse}`)
    Object.assign(shader.uniforms, uniforms); compiledShaders++; lastError = null; return true
  }
  function withTemporary(values, callback) {
    if (typeof callback !== 'function') throw new TypeError('A comparison callback is required')
    if (disposed) return callback()
    const entry = { ...values }; temporary.push(entry); sync()
    const restore = () => { const index = temporary.indexOf(entry); if (index !== -1) temporary.splice(index, 1); sync() }
    try {
      const result = callback()
      if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore)
      restore(); return result
    } catch (error) { restore(); throw error }
  }
  function getStatus() {
    const worldNormals = target ? faceNormals.map(normal => normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(target.matrixWorld)).normalize().toArray()) : []
    return { version: 2, enabled: !disposed && settings.enabled, active: uniforms.nanjingA1DaylightEnabled.value > .5 || uniforms.nanjingA1BaseColorScale.value !== 1,
      directDiffuseScale: settings.directDiffuseScale, effectiveScale: uniforms.nanjingA1DirectDiffuseScale.value,
      baseColorScale: settings.baseColorScale, effectiveBaseColorScale: uniforms.nanjingA1BaseColorScale.value,
      daylightActive: uniforms.nanjingA1DaylightEnabled.value > .5, baseColorActive: uniforms.nanjingA1BaseColorScale.value !== 1,
      receiver: OBJECT_NAME, material: MATERIAL_NAME, found: !!target, temporaryDepth: temporary.length,
      shaderVersion: NANJING_A1_GLASS_DAYLIGHT_SHADER_VERSION, objectMatrixWorld: target?.matrixWorld.toArray() || null,
      localFaceNormals: faceNormals.map(normal => normal.toArray()), worldFaceNormals: worldNormals, faceCosineThreshold: MIN_DOT,
      facePolicy: 'audited-source-facades', colorPolicy: 'A1 base color multiplied before physical BRDF',
      preservedTerms: ['sourceMaterialColor', 'roughness', 'metalness', 'ior', 'transmissionParameter', 'opacity', 'localReflectionSettings', 'otherObjects'],
      extraRenderPasses: 0, compiledShaders, errors, error: lastError, unsupported, disposed }
  }
  update()
  return { update, sync, patchShader, getStatus, uniforms,
    get enabled() { const current = effective(); return !disposed && !!target && (current.enabled === true || current.baseColorScale !== 1) },
    withBaseline: callback => withTemporary({ enabled: false, directDiffuseScale: settings.directDiffuseScale }, callback),
    withDiffuseScale(scale, callback) {
      if (!Number.isFinite(scale)) throw new RangeError('A1 direct diffuse scale must be finite')
      return withTemporary({ enabled: true, directDiffuseScale: boundedScale(scale) }, callback)
    },
    withColorBaseline: callback => withTemporary({ baseColorScale: 1 }, callback),
    withColorScale(scale, callback) {
      if (!Number.isFinite(scale) || scale < 0) throw new RangeError('A1 base color scale must be finite and nonnegative')
      return withTemporary({ baseColorScale: scale }, callback)
    },
    dispose() { if (disposed) return; disposed = true; target = null; temporary.length = 0; sync() }
  }
}
