import { nanjingStaticSurfaceReceiverKind } from './nanjingSurfaceReceivers.js'
import * as THREE from 'three'
import { createNanjingShadowLayers, createNanjingShadowLayerUniforms, NANJING_SHADOW_LAYER_GLSL } from './nanjingShadowLayers.js'
import { createNanjingShadowReceivers, createNanjingShadowProgramKey, inspectNanjingShadowBindings } from './nanjingShadowReceivers.js'
import { inspectNanjingShadowLayers } from './nanjingShadowInspection.js'
import { createNanjingA1AreaLighting, isNanjingA1AreaLightingReceiver } from './nanjingA1AreaLighting.js'
import { createNanjingA1GlassDaylight, isNanjingA1GlassDaylightReceiver, NANJING_A1_GLASS_DAYLIGHT_SHADER_VERSION } from './nanjingA1GlassDaylight.js'

export const NANJING_SHADOW_DEFAULTS = Object.freeze({
  enabled: true, radius: 1, biasMagnitude: 0.00005, normalBias: 0.006, strength: 0.95,
  planarGroundCasters: true, receiverPlaneBias: true, receiverPlaneMaxOffset: 0.05,
  buildingReceiverPlaneBias: true, singleShadowLight: true, fullSurfaceReceivers: false
})

const fields = ['bias', 'normalBias', 'radius', 'intensity']
const shadowLightTypes = new Set(['DirectionalLight', 'SpotLight', 'PointLight'])
const bounded = (value, fallback, low, high) => Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback
const validResolution = value => Number.isInteger(value) && value >= 256 && value <= 8192 && (value & (value - 1)) === 0

// These source surfaces have no volume. They must receive building/tree shadows,
// but their own depth is an unstable occluder at the source sun's 2.965° elevation.
// Both name and actual world-space triangles are checked: thick kerbs, slopes, roofs,
// moved objects and newly imported meshes are not classified just by a name.
const planarGroundNames = new Set([
  '支路_路面', '远景_地形底板', '远景_用地区域', '远景_白色虚线', '远景_黄色实线',
  '远景_连续道路表面', '远景_道路人行道', '远景_道路外缘路缘石', '场地区块_建筑园区块_05',
  '道路_道路地面纹理', '道路_地面', '道路_景观路', '道路_马路_01',
  ...['01', '02', '03', '04'].flatMap(index => [
    `道路_人行道路面_${index}`, `网格_停车设施_停车场入口石板路面_${index}`,
    `网格_停车设施_停车场入口石板路面_${index}_1`
  ])
])
// These two named meshes contain disconnected horizontal patches at more than
// one height, not solid steps. The thin paving also has downward winding and two
// slightly warped triangles (height 0.002528, |normal.y| >= 0.99589). Do not infer
// this from its bounding box: Draco-decoded vertices can exceed accessor bounds.
const patchGroundLimits = new Map([
  ['场地区块_主建筑园区路面_02', { height: 0.04, triangleHeight: 0.0001, normalY: 0.9999 }],
  ['场地区块_建筑群路面_01', { height: 0.004, triangleHeight: 0.003, normalY: 0.99 }]
])
const flatGroundLimits = { height: 0.0001, triangleHeight: 0.0001, normalY: 0.9999 }
const groundBounds = new THREE.Box3()
const groundA = new THREE.Vector3(), groundB = new THREE.Vector3(), groundC = new THREE.Vector3()
const groundEdge = new THREE.Vector3(), groundNormal = new THREE.Vector3()
export function isNanjingPlanarGroundCaster(object) {
  if (!object?.isMesh || (!planarGroundNames.has(object.name) && !patchGroundLimits.has(object.name)) || object.isInstancedMesh || object.isSkinnedMesh
    || object.isBatchedMesh || object.customDepthMaterial || object.customDistanceMaterial
    || object.morphTargetInfluences?.length || Object.keys(object.geometry?.morphAttributes || {}).length) return false
  const geometry = object.geometry
  if (!geometry?.isBufferGeometry || !geometry.attributes.position || !object.matrixWorld.elements.every(Number.isFinite)) return false
  const limits = patchGroundLimits.get(object.name) || flatGroundLimits
  const position = geometry.attributes.position, index = geometry.index
  const count = index?.count ?? position.count
  if (!count || count % 3 !== 0) return false
  groundBounds.makeEmpty()
  let hasFace = false
  for (let offset = 0; offset < count; offset += 3) {
    groundA.fromBufferAttribute(position, index ? index.getX(offset) : offset).applyMatrix4(object.matrixWorld)
    groundB.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1).applyMatrix4(object.matrixWorld)
    groundC.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2).applyMatrix4(object.matrixWorld)
    for (const point of [groundA, groundB, groundC]) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return false
      groundBounds.expandByPoint(point)
    }
    if (groundBounds.min.y < -2.35 || groundBounds.max.y > -1.9
      || groundBounds.max.y - groundBounds.min.y > limits.height) return false
    groundNormal.subVectors(groundB, groundA).cross(groundEdge.subVectors(groundC, groundA))
    const areaSquared = groundNormal.lengthSq()
    if (areaSquared <= 1e-20) continue
    hasFace = true
    // Both windings are valid for thin patches; even small genuine sidewalls
    // fail this check. In particular, 建筑群路面_02 must remain a caster.
    if (Math.abs(groundNormal.y) < limits.normalY * Math.sqrt(areaSquared)
      || Math.max(groundA.y, groundB.y, groundC.y) - Math.min(groundA.y, groundB.y, groundC.y) > limits.triangleHeight) return false
  }
  return hasFace && groundBounds.max.x - groundBounds.min.x > 0.01 && groundBounds.max.z - groundBounds.min.z > 0.01
}

// Three r184 PCF adds bias to the comparison coordinate for both depth modes.
// Its reversed-depth texture uses GreaterEqualCompare, so the acne-reducing
// sign is positive. Basic/VSM already flip the bias inside their shader paths.
export function nanjingShadowBias(magnitude, { reversedDepth = false, type = THREE.PCFShadowMap } = {}) {
  const pcf = type === THREE.PCFShadowMap || type === THREE.PCFSoftShadowMap
  return (pcf && reversedDepth ? 1 : -1) * Math.abs(magnitude)
}

// These are the source project's ground materials, not building glass/cladding.
// A second, per-fragment height/normal guard protects walls and roofs sharing one
// of these materials. No material, geometry or serialized shader is replaced.
const groundReceiverMaterials = new Set([
  '场地_混凝土面', '场地_绿化铺地', '场地_浅色铺装', '场地_浅色石材', '场地_深灰立面',
  '道路_景观石材', '道路_浅色铺装', '道路_人行道混凝土_A', '道路_人行道混凝土_B',
  '道路_人行道混凝土_C', '道路_深灰路面', '道路_棕色路面', '停车_石板包边', '停车_石板路面',
  '远景_混凝土铺地', '远景_沥青路面', '远景_绿化底板', '周边_步道_暖灰石材',
  '周边_草坪_灰橄榄绿', '周边_草坪_深绿', '周边_草坪_鼠尾草绿', '周边_路缘_浅暖灰',
  // Actual hardscape omissions: circular seating pads, context-block paths,
  // parking-entry paving and low planter rims. Their genuine sidewalls still
  // cast shadows; only horizontal fragments within the ground height band opt in.
  '周边_广场_灰褐石材', '建筑_黑色哑光', '道路_支路路面', '地库入口_石材贴图', '停车_减速带棕',
  '景观_花坛黑色金属', '景观_花坛棕色', '景观_花坛红褐色', '景观_花坛深蓝', '景观_花坛暖棕'
])

// Only these materials on the existing named-building draw path need the roof
// and block correction. Material_24/Material_25 are included so tree trunks and
// canopies sample the same corrected building shadow, instead of staying
// visually identical in lit and shadowed areas.
const buildingReceiverMaterials = new Set([
  '建筑_屋面混凝土', '建筑_楼层混凝土', '建筑_深灰金属', '建筑_屋顶设备涂层', '场地_蓝灰玻璃', '远景_蓝色玻璃',
  'Material_24', 'Material_25'
])
export const isNanjingBuildingShadowMaterial = material => buildingReceiverMaterials.has(material?.name)
export const isNanjingA1GlassShadowReceiver = (material, object) => object?.name === 'a1玻璃外墙'
  && material?.name === '建筑_蓝灰玻璃' && material.isMeshStandardMaterial === true

const receiverFunctions = /* glsl */`
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
uniform float nanjingReceiverPlaneMaxOffset;
uniform float nanjingReceiverPlaneEnabled;
uniform float nanjingBuildingReceiverPlaneEnabled;

vec2 nanjingReceiverGradient( vec4 coordinate, vec2 shadowMapSize ) {
  // Derivatives are evaluated before frustum tests or per-pixel branches.
  vec3 position = coordinate.xyz / coordinate.w;
  vec3 dx = dFdx( position ), dy = dFdy( position );
  float determinant = dx.x * dy.y - dx.y * dy.x;
  float scale = max( length( dx.xy ) * length( dy.xy ), 1e-20 );
  if ( abs( determinant ) > scale * 1e-5 ) {
    vec2 gradient = vec2( dx.z * dy.y - dy.z * dx.y, dx.x * dy.z - dy.x * dx.z ) / determinant;
    // This comparison also rejects NaN/Inf. Edge-on or degenerate derivatives
    // fall back to the original PCF comparison rather than amplifying noise.
    // Current ground needs at most 0.00491 normalized depth per texel. Reject
    // extreme edge derivatives before the tap-centre correction as well; the
    // separate world-space cap only bounds the hardware footprint allowance.
    if ( all( lessThan( abs( gradient ), vec2( 1e4 ) ) )
      && dot( abs( gradient ), vec2( 1.0 ) / shadowMapSize ) <= 0.01 ) return gradient;
  }
  return vec2( 0.0 );
}

float nanjingReceiverTap( sampler2DShadow shadowMap, vec3 coordinate, vec2 offset, vec2 gradient, float footprint ) {
  float comparison = coordinate.z + dot( gradient, offset );
  #ifdef USE_REVERSED_DEPTH_BUFFER
    comparison += footprint;
  #else
    comparison -= footprint;
  #endif
  return texture( shadowMap, vec3( coordinate.xy + offset, comparison ) );
}

float nanjingGroundShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity,
  float shadowBias, float shadowRadius, vec4 shadowCoord, vec2 gradient, float maxBias ) {
  float shadow = 1.0;
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
  if ( inFrustum && shadowCoord.z <= 1.0 ) {
    vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
    float radius = shadowRadius * texelSize.x;
    float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
    // Hardware linear PCF compares four texel corners, even at radius zero.
    // Their worst-case plane depth difference is one texel's L1 gradient.
    // Bound this extra allowance in world units: a grazing sun must not move
    // contacts by an entire projected shadow texel (about 1.2 units here).
    float footprint = min( dot( abs( gradient ), texelSize ), maxBias );
    shadow = (
      nanjingReceiverTap( shadowMap, shadowCoord.xyz, vogelDiskSample( 0, 5, phi ) * radius, gradient, footprint ) +
      nanjingReceiverTap( shadowMap, shadowCoord.xyz, vogelDiskSample( 1, 5, phi ) * radius, gradient, footprint ) +
      nanjingReceiverTap( shadowMap, shadowCoord.xyz, vogelDiskSample( 2, 5, phi ) * radius, gradient, footprint ) +
      nanjingReceiverTap( shadowMap, shadowCoord.xyz, vogelDiskSample( 3, 5, phi ) * radius, gradient, footprint ) +
      nanjingReceiverTap( shadowMap, shadowCoord.xyz, vogelDiskSample( 4, 5, phi ) * radius, gradient, footprint )
    ) * 0.2;
  }
  return mix( 1.0, shadow, shadowIntensity );
}

float nanjingBuildingShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity,
  float shadowBias, float shadowRadius, vec4 shadowCoord, vec2 gradient, float maxBias ) {
  // Shared by the verified building faces and guarded horizontal hardscape.
  // Preserve deliberately wider user kernels. The default one-texel kernel can
  // correct each physical texel separately with four comparison fetches, rather
  // than moving the receiver to cover uncorrected hardware-PCF sub-samples.
  if ( shadowRadius > 1.0 ) return nanjingGroundShadow( shadowMap, shadowMapSize,
    shadowIntensity, shadowBias, shadowRadius, shadowCoord, gradient, maxBias );
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
  if ( !inFrustum || shadowCoord.z > 1.0 ) return 1.0;
  vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
  vec2 pixel = shadowCoord.xy * shadowMapSize - 0.5;
  vec2 low = ( floor( pixel ) + 0.5 ) * texelSize;
  vec2 weight = fract( pixel );
  // At exact texel centres LinearFilter compares one stored depth. Correct the
  // comparison at that centre, then blend the four binary results explicitly.
  // This also works with GreaterEqualCompare in the reversed-depth path.
  float a = nanjingReceiverTap( shadowMap, shadowCoord.xyz, low - shadowCoord.xy, gradient, 0.0 );
  float b = nanjingReceiverTap( shadowMap, shadowCoord.xyz, low + vec2( texelSize.x, 0.0 ) - shadowCoord.xy, gradient, 0.0 );
  float c = nanjingReceiverTap( shadowMap, shadowCoord.xyz, low + vec2( 0.0, texelSize.y ) - shadowCoord.xy, gradient, 0.0 );
  float d = nanjingReceiverTap( shadowMap, shadowCoord.xyz, low + texelSize - shadowCoord.xy, gradient, 0.0 );
  float shadow = mix( mix( a, b, weight.x ), mix( c, d, weight.x ), weight.y );
  return mix( 1.0, shadow, shadowIntensity );
}
#endif
`

const receiverScope = /* glsl */`
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
  vec3 nanjingReceiverWorldPosition = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
  vec3 nanjingReceiverWorldNormal = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
  float nanjingReceiverIsGround = float( nanjingReceiverWorldPosition.y >= -2.35 && nanjingReceiverWorldPosition.y <= -1.9
    && abs( nanjingReceiverWorldNormal.y ) >= 0.99 );
  float nanjingPrimaryOcclusion = 0.0;
#endif
`

const plaqueFillMaterials = new Set(['门牌_浅色石材', '门牌_铜色标志', '门牌_橙黄发光字'])
export const isNanjingPlaqueFillMaterial = material => plaqueFillMaterials.has(material?.name)

// These opaque plaque materials need their nearby area lamp even inside the
// artistic building/tree overlap. Glass and coated variants keep their existing
// energy composition; no additional light evaluation or render pass is needed.
const plaqueFillGuard = '!defined( USE_TRANSMISSION ) && !defined( USE_CLEARCOAT ) && !defined( USE_SHEEN )'

// Expand only this material's two stock chunks. Global ShaderChunk and renderer
// caches remain untouched; custom source hooks run before this compatible patch.
export function patchNanjingGroundShadowShader(shader, maxOffsetUniform, receiverEnabledUniform = { value: 1 }, layerUniforms = createNanjingShadowLayerUniforms(), localFillUniform = null, buildingReceiverUniform = null) {
  // A facade can share a material with an already patched ground receiver.
  // Its private draw clone inherits that hook. Do not inject it twice.
  if (shader.uniforms?.nanjingLayerStrength && shader.fragmentShader?.includes('vec2 nanjingOverlaps = nanjingOverlapOcclusion')) {
    if (buildingReceiverUniform && shader.uniforms.nanjingBuildingReceiverPlaneEnabled) shader.uniforms.nanjingBuildingReceiverPlaneEnabled = buildingReceiverUniform
    return true
  }
  const pars = '#include <shadowmap_pars_fragment>', lighting = '#include <lights_fragment_begin>'
  const stockCall = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;'
  const position = 'vec3 geometryPosition = - vViewPosition;'
  const areaStart = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )'
  const areaEnd = '#if defined( RE_IndirectDiffuse )'
  if (!shader.fragmentShader?.includes(pars) || !shader.fragmentShader.includes(lighting)
    || !shader.fragmentShader.includes('#include <opaque_fragment>')
    || !THREE.ShaderChunk.lights_fragment_begin.includes(stockCall) || !THREE.ShaderChunk.lights_fragment_begin.includes(position)) return false
  if (localFillUniform && (!THREE.ShaderChunk.lights_fragment_begin.includes(areaStart)
    || !THREE.ShaderChunk.lights_fragment_begin.includes(areaEnd))) return false
  const replacement = /* glsl */`
    #if defined( SHADOWMAP_TYPE_PCF )
    {
      vec2 nanjingGradient = nanjingReceiverGradient( vDirectionalShadowCoord[ i ], directionalLightShadow.shadowMapSize )
        * max( nanjingReceiverIsGround * nanjingReceiverPlaneEnabled, nanjingBuildingReceiverPlaneEnabled );
      // The depth row of an orthographic world-to-shadow matrix has length
      // 1 / (far - near), for standard and reversed depth alike.
      float nanjingDepthScale = length( vec3( directionalShadowMatrix[ i ][ 0 ].z, directionalShadowMatrix[ i ][ 1 ].z, directionalShadowMatrix[ i ][ 2 ].z ) );
      float nanjingMaxBias = nanjingReceiverPlaneMaxOffset * nanjingDepthScale
        * abs( dot( nonPerturbedNormal, directLight.direction ) );
      float nanjingPrimaryVisibility = 1.0;
      // Roof/device/block materials opt in only through their private building
      // draw clone. All other facades retain the native main-shadow sampling.
      if ( directLight.visible && receiveShadow ) {
        if ( nanjingBuildingReceiverPlaneEnabled > 0.5 ) {
          nanjingPrimaryVisibility = nanjingBuildingShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize,
            directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius,
            vDirectionalShadowCoord[ i ], nanjingGradient, nanjingMaxBias );
        } else {
          nanjingPrimaryVisibility = ( nanjingReceiverIsGround > 0.5 && nanjingReceiverPlaneEnabled > 0.5 )
            ? nanjingBuildingShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize,
            directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius,
            vDirectionalShadowCoord[ i ], nanjingGradient, nanjingMaxBias )
            : getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize,
            directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
        }
      }
      directLight.color *= nanjingPrimaryVisibility;
      #if UNROLLED_LOOP_INDEX == 0
        nanjingPrimaryOcclusion = clamp( ( 1.0 - nanjingPrimaryVisibility ) / max( directionalLightShadow.shadowIntensity, 0.00001 ), 0.0, 1.0 );
      #endif
    }
    #else
      ${stockCall}
    #endif
  `
  let lightingChunk = THREE.ShaderChunk.lights_fragment_begin.replace(position, `${position}\n${receiverScope}`).replace(stockCall, replacement)
  if (localFillUniform) {
    lightingChunk = lightingChunk.replace(areaStart, `
      vec3 nanjingPlaqueAreaLight = vec3( 0.0 );
      #if ${plaqueFillGuard}
        vec3 nanjingBeforeAreaLight = reflectedLight.directDiffuse + reflectedLight.directSpecular;
      #endif
      ${areaStart}
    `).replace(areaEnd, `
      #if ${plaqueFillGuard}
        nanjingPlaqueAreaLight = max( reflectedLight.directDiffuse + reflectedLight.directSpecular - nanjingBeforeAreaLight, vec3( 0.0 ) ) * nanjingPlaqueFillEnabled;
      #endif
      ${areaEnd}
    `)
  }
  shader.fragmentShader = shader.fragmentShader.replace(pars, `${pars}\n${receiverFunctions}\n${NANJING_SHADOW_LAYER_GLSL}${localFillUniform ? '\nuniform float nanjingPlaqueFillEnabled;' : ''}`)
    .replace(lighting, lightingChunk)
    .replace('#include <opaque_fragment>', `
      #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
        if ( receiveShadow && nanjingLayerReady > 0.5 ) {
          vec2 nanjingOverlaps = nanjingOverlapOcclusion( nanjingReceiverWorldPosition, nanjingReceiverWorldNormal );
          // Deliberate overlap darkening also reaches reflective facades. Apply
          // after transmission/clearcoat, before tone mapping; keep emission and
          // opacity intact. Same-category shadows never get extra darkening.
          outgoingLight = nanjingOverlapLight( outgoingLight - totalEmissiveRadiance${localFillUniform ? ' - nanjingPlaqueAreaLight' : ''}, nanjingOverlaps ) + totalEmissiveRadiance${localFillUniform ? ' + nanjingPlaqueAreaLight' : ''};
        }
      #endif
      #include <opaque_fragment>
    `)
  shader.uniforms.nanjingReceiverPlaneMaxOffset = maxOffsetUniform
  shader.uniforms.nanjingReceiverPlaneEnabled = receiverEnabledUniform
  shader.uniforms.nanjingBuildingReceiverPlaneEnabled = buildingReceiverUniform || { value: 0 }
  Object.assign(shader.uniforms, layerUniforms)
  if (localFillUniform) shader.uniforms.nanjingPlaqueFillEnabled = localFillUniform
  return true
}

// Ground caster flags are changed only inside an actual shadow-map draw and
// restored before the visible pass or serialization. No work runs on cached maps.
export function createNanjingShadows(editor, config = {}, options = {}) {
  // Source ground materials survive "reapply". Three caches both programs and
  // their onBeforeCompile uniforms per material key, so a new controller must
  // never reuse the key of a disposed controller whose ready uniform is now 0.
  const receiverProgramScope = createNanjingShadowProgramKey(receiverFunctions + receiverScope
    + NANJING_SHADOW_LAYER_GLSL + patchNanjingGroundShadowShader.toString())
  const records = new Map()
  const suppressedLights = new Map()
  const receiverRecords = new Map()
  const maxOffsetUniform = { value: NANJING_SHADOW_DEFAULTS.receiverPlaneMaxOffset }
  const receiverEnabledUniform = { value: 1 }
  const buildingReceiverUniform = { value: 1 }
  const buildingReceiverRecords = new Map()
  let buildingBaselineDepth = 0
  let groundBaselineDepth = 0
  const plaqueFillUniform = { value: 1 }
  const renderer = editor.renderer
  const originalType = renderer.shadowMap.type
  let settings = { ...NANJING_SHADOW_DEFAULTS, ...config.shadows?.sampling }
  if (Array.isArray(config.lights) && Array.isArray(settings.suppressedShadowLightNames)) {
    settings.suppressedShadowLightNames = settings.suppressedShadowLightNames.filter(name => {
      const matches = config.lights.filter(light => shadowLightTypes.has(light.type) && light.name === name)
      return matches.length === 1 && matches[0].castShadow === false
    })
  }
  // Loaded provenance is consumed once. Runtime removals/renames must not turn
  // back into pending names and accidentally claim a new user-created light.
  const pendingSuppressedLights = new Set(Array.isArray(settings.suppressedShadowLightNames)
    ? settings.suppressedShadowLightNames.filter(name => typeof name === 'string' && name) : [])
  let disposed = false, appliedType = originalType
  const originalShadowRender = renderer.shadowMap.render
  let groundPasses = 0, excludedGround = [], inShadowPass = false
  let groundInitialization = typeof originalShadowRender === 'function'
  let primaryLight = null, selectionReason = null, selectionCandidates = [], directionalLights = [], shadowLights = [], ambiguousLightNames = []
  const layers = createNanjingShadowLayers(editor, config, {
    getOriginalGeometry: options.getOriginalGeometry,
    getPrimaryLight: () => settings.enabled && settings.singleShadowLight ? primaryLight : null
  })
  const a1AreaLighting = createNanjingA1AreaLighting(editor, config)
  const a1GlassDaylight = createNanjingA1GlassDaylight(editor, config, { onChange: options.onChange })
  const buildingReceivers = createNanjingShadowReceivers(editor, {
    isEnabled: () => !disposed && ((settings.enabled && (settings.buildingReceiverPlaneBias || (settings.fullSurfaceReceivers && settings.receiverPlaneBias) || layers.uniforms.nanjingLayerReady.value > 0.5)) || a1AreaLighting.enabled || a1GlassDaylight.enabled),
    isAdditionalReceiver: (material, object) => (a1AreaLighting.enabled && isNanjingA1AreaLightingReceiver(material, object))
      || (a1GlassDaylight.enabled && isNanjingA1GlassDaylightReceiver(material, object))
      || (object.receiveShadow && ['Material_24', 'Material_25'].includes(material.name))
      || (settings.fullSurfaceReceivers && object.receiveShadow && !!nanjingStaticSurfaceReceiverKind(material, object)),
    beforeDraw(material, object) { if (isNanjingA1AreaLightingReceiver(material, object)) a1AreaLighting.sync() },
    patchShader(shader, material, object) {
      const surfaceKind = settings.fullSurfaceReceivers ? nanjingStaticSurfaceReceiverKind(material, object) : null
      const building = isNanjingBuildingShadowMaterial(material) || isNanjingA1GlassShadowReceiver(material, object) || surfaceKind === 'building'
      const patched = patchNanjingGroundShadowShader(shader, maxOffsetUniform, receiverEnabledUniform, layers.uniforms,
        isNanjingPlaqueFillMaterial(material) ? plaqueFillUniform : null,
        building ? buildingReceiverUniform : surfaceKind === 'ground' ? receiverEnabledUniform : null)
      if (building) {
        const record = buildingReceiverRecords.get(material) || { compiled: 0, error: null, objectNames: new Set() }
        if (object?.name) record.objectNames.add(object.name)
        if (patched) { record.compiled++; record.error = null }
        else record.error = '建筑接收面着色器不兼容；保留原阴影采样'
        buildingReceiverRecords.set(material, record)
      }
      return a1AreaLighting.patchShader(shader, material, object) && a1GlassDaylight.patchShader(shader, material, object) && patched
    },
    getPatchKey: (material, object) => [
      settings.fullSurfaceReceivers ? nanjingStaticSurfaceReceiverKind(material, object) || 'outside-static-surface-scope' : 'legacy-surface-scope',isNanjingPlaqueFillMaterial(material) ? 'plaque-area-fill-v1' : 'standard',
      isNanjingBuildingShadowMaterial(material) || isNanjingA1GlassShadowReceiver(material, object)
        ? 'building-texel-plane-v2' : 'native-facade',
      isNanjingA1AreaLightingReceiver(material, object) ? 'hero-glass-two-area-exclusion-v2' : 'all-area-lights',
      isNanjingA1GlassDaylightReceiver(material, object) ? NANJING_A1_GLASS_DAYLIGHT_SHADER_VERSION : 'original-direct-diffuse'].join('|')
  })
  function renderShadows(lights, scene, camera) {
    if (disposed || inShadowPass || !settings.enabled || !settings.planarGroundCasters || scene !== editor.scene
      || !renderer.shadowMap.enabled || (!renderer.shadowMap.autoUpdate && !renderer.shadowMap.needsUpdate)) {
      return originalShadowRender.apply(this, arguments)
    }
    const suppressed = []
    scene.traverse(object => {
      // A saved project serializes every object's castShadow, including the
      // default true. Only sampling.planarGroundCasters is the policy opt-out.
      if (!object.castShadow || !isNanjingPlanarGroundCaster(object)) return
      suppressed.push(object)
      object.castShadow = false
    })
    excludedGround = suppressed.map(object => object.name)
    groundPasses += 1
    inShadowPass = true
    try { return originalShadowRender.apply(this, arguments) }
    finally {
      for (const object of suppressed) object.castShadow = true
      inShadowPass = false
    }
  }
  if (typeof originalShadowRender === 'function') renderer.shadowMap.render = renderShadows

  function normalized(next) {
    const value = { ...settings, ...next }
    return {
      enabled: value.enabled !== false,
      radius: bounded(value.radius, 1, 0, 3),
      biasMagnitude: bounded(value.biasMagnitude, 0.00005, 0, 0.0001),
      normalBias: bounded(value.normalBias, 0.006, 0, 0.02),
      strength: bounded(value.strength, NANJING_SHADOW_DEFAULTS.strength, 0, 1),
      planarGroundCasters: value.planarGroundCasters !== false,
      receiverPlaneBias: value.receiverPlaneBias !== false,
      receiverPlaneMaxOffset: bounded(value.receiverPlaneMaxOffset, NANJING_SHADOW_DEFAULTS.receiverPlaneMaxOffset, 0, 0.05),
      buildingReceiverPlaneBias: value.buildingReceiverPlaneBias !== false,
      // Absent in historical saves: retain their old receiver coverage. Only a
      // newly published/saved revision explicitly enables the expanded scope.
      fullSurfaceReceivers: value.fullSurfaceReceivers === true,
      ...(validResolution(value.resolution) ? { resolution: value.resolution } : {}),
      singleShadowLight: value.singleShadowLight !== false,
      primaryShadowLightName: typeof value.primaryShadowLightName === 'string' && value.primaryShadowLightName ? value.primaryShadowLightName : null,
      suppressedShadowLightNames: [...new Set(Array.isArray(value.suppressedShadowLightNames)
        ? value.suppressedShadowLightNames.filter(name => typeof name === 'string' && name) : [])]
    }
  }
  function reversedDepth() {
    return renderer.state?.buffers?.depth?.getReversed?.() ?? !!renderer.capabilities?.reversedDepthBuffer
  }
  function restore(record) {
    let changed = false
    for (const field of fields) {
      // Preserve edits made directly to a light after this controller applied.
      if (record.applied && record.light.shadow[field] === record.applied[field]) {
        record.light.shadow[field] = record.original[field]
        changed = true
      }
    }
    record.applied = null
    return changed
  }
  function invalidate(depthChanged = false) {
    // PCF bias, normalBias, radius and intensity are receiver-side uniforms.
    // Texture type or caster changes require rebuilding; uniform edits do not.
    if (depthChanged) {
      renderer.shadowMap.needsUpdate = true
      for (const { light } of records.values()) light.shadow.needsUpdate = true
    }
    options.onChange?.(getStatus())
  }
  function restoreReceiver(material, record) {
    if (material.onBeforeCompile === record.compile) material.onBeforeCompile = record.originalCompile
    if (material.customProgramCacheKey === record.cacheKey) material.customProgramCacheKey = record.originalCacheKey
    material.needsUpdate = true
  }
  function updateReceivers() {
    const current = new Set()
    const buildingValue = !disposed && settings.enabled && settings.buildingReceiverPlaneBias && buildingBaselineDepth === 0 ? 1 : 0
    const groundValue = !disposed && settings.enabled && settings.receiverPlaneBias && groundBaselineDepth === 0 ? 1 : 0
    let changed = maxOffsetUniform.value !== settings.receiverPlaneMaxOffset || receiverEnabledUniform.value !== groundValue
      || buildingReceiverUniform.value !== buildingValue
    maxOffsetUniform.value = settings.receiverPlaneMaxOffset
    receiverEnabledUniform.value = groundValue
    buildingReceiverUniform.value = buildingValue
    if (settings.enabled && (settings.receiverPlaneBias || layers.getStatus().enabled)) editor.scene.traverse(object => {
      if (!object.isMesh || object.userData?.nanjingUtility) return
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        // The source grass base uses real alpha blending. It still receives
        // overlap darkening; retain alpha/depth/sorting and its editable slot.
        const blendedGrassBase = object.name === '远景_地形底板' && material?.name === '远景_绿化底板'
        if (material?.isMeshStandardMaterial && groundReceiverMaterials.has(material.name)
          && (!material.transparent || blendedGrassBase) && !material.transmission) current.add(material)
      }
    })
    for (const [material, record] of receiverRecords) if (!current.has(material)) {
      restoreReceiver(material, record)
      receiverRecords.delete(material)
      changed = true
    }
    for (const material of current) {
      if (receiverRecords.has(material)) continue
      const originalCompile = material.onBeforeCompile, originalCacheKey = material.customProgramCacheKey
      const record = { originalCompile, originalCacheKey, compiled: 0, error: null }
      function compile(shader, compileRenderer) {
        originalCompile.call(this, shader, compileRenderer)
        if (patchNanjingGroundShadowShader(shader, maxOffsetUniform, receiverEnabledUniform, layers.uniforms)) { record.compiled++; record.error = null }
        else record.error = '当前材质着色器不兼容地面斜率补偿；保留原阴影采样'
      }
      function cacheKey() { return originalCacheKey.call(this) + '|' + originalCompile.toString() + '|' + receiverProgramScope }
      Object.assign(record, { compile, cacheKey })
      receiverRecords.set(material, record)
      material.onBeforeCompile = compile
      material.customProgramCacheKey = cacheKey
      material.needsUpdate = true
      changed = true
    }
    return changed
  }
  function effectivelyVisible(light) {
    for (let object = light; object; object = object.parent) if (!object.visible) return false
    return true
  }
  function restoreSuppressedLights() {
    let changed = false
    for (const light of suppressedLights.keys()) if (light.castShadow === false) {
      light.castShadow = true
      light.shadow.needsUpdate = true
      changed = true
    }
    suppressedLights.clear()
    return changed
  }
  function updateShadowLightSelection(wasEnabled) {
    // The restore project's light inventory serializes top-level lights only.
    // Do not take ownership of utility or nested lights that inventory cannot
    // round-trip. All three source suns are top-level DirectionalLights.
    shadowLights = editor.scene.children.filter(light => shadowLightTypes.has(light.type) && light.shadow && !light.userData?.nanjingUtility)
    directionalLights = shadowLights.filter(light => light.isDirectionalLight)
    const current = new Set(shadowLights), names = new Map()
    for (const light of shadowLights) names.set(light.name, [...(names.get(light.name) || []), light])
    ambiguousLightNames = [...names].filter(([name, lights]) => !name || lights.length !== 1).map(([name]) => name)
    let changed = false
    for (const [light, ownedName] of suppressedLights) {
      if (current.has(light) && light.name === ownedName && light.name && names.get(light.name)?.length === 1) continue
      if (light.castShadow === false) { light.castShadow = true; light.shadow.needsUpdate = true; changed = true }
      suppressedLights.delete(light)
    }
    // Only our own saved provenance can restore a false flag. A source light
    // that was already off is never enrolled. Ambiguous names are not inferred.
    for (const name of pendingSuppressedLights) {
      const matches = names.get(name)
      if (!matches) continue
      pendingSuppressedLights.delete(name)
      if (matches.length === 1 && matches[0].castShadow === false) suppressedLights.set(matches[0], name)
    }
    const enabled = settings.enabled && settings.singleShadowLight
    if (!enabled) {
      changed = restoreSuppressedLights() || changed
      primaryLight = null
      selectionReason = 'disabled'
    } else {
      // A removed primary releases its owned weak lights before selecting a
      // replacement. User-disabled lamps remain ineligible. Re-enabling the
      // option deliberately chooses the strongest currently enabled lamp anew.
      const removedPrimary = primaryLight && !current.has(primaryLight)
      if (removedPrimary || !wasEnabled) {
        changed = restoreSuppressedLights() || changed
        primaryLight = null
        settings.primaryShadowLightName = null
      }
      if (!primaryLight) {
        const saved = names.get(settings.primaryShadowLightName)
        if (saved?.length === 1 && saved[0].isDirectionalLight) {
          primaryLight = saved[0]
          selectionReason = 'saved-primary'
          changed = true
        } else {
          // This also handles a saved primary deleted before reloading: its
          // former weak lamps are false in the snapshot but owned by us.
          changed = restoreSuppressedLights() || changed
          const candidates = directionalLights.filter(light => light.castShadow && effectivelyVisible(light) && Number.isFinite(light.intensity)
            && light.name && names.get(light.name)?.length === 1)
            .sort((a, b) => b.intensity - a.intensity)
          selectionCandidates = candidates.map(light => ({ name: light.name, intensity: light.intensity }))
          primaryLight = candidates[0] || null
          selectionReason = primaryLight ? 'highest-enabled-visible-intensity' : 'no-eligible-light'
          if (primaryLight) { settings.primaryShadowLightName = primaryLight.name || null; changed = true }
        }
      }
      // Keep illumination/position/color untouched. The chosen light is not
      // forcibly switched on if the user subsequently turns its shadow off.
      if (primaryLight) for (const light of shadowLights) {
        if (light === primaryLight || !light.castShadow || !effectivelyVisible(light) || !light.name || names.get(light.name)?.length !== 1) continue
        suppressedLights.set(light, light.name)
        light.castShadow = false
        changed = true
      }
    }
    settings.suppressedShadowLightNames = [...new Set([...pendingSuppressedLights, ...[...suppressedLights.keys()]
      .filter(light => light.castShadow === false && light.name && names.get(light.name)?.length === 1).map(light => light.name)])]
    return changed
  }
  function update(next = {}) {
    if (disposed) return false
    a1AreaLighting.update()
    a1GlassDaylight.update()
    const wasGroundEnabled = settings.enabled && settings.planarGroundCasters
    const wasSingleEnabled = settings.enabled !== false && settings.singleShadowLight !== false
    const previousSurfaceCoverage = settings.fullSurfaceReceivers
    settings = normalized(next)
    const surfaceCoverageChanged = previousSurfaceCoverage !== settings.fullSurfaceReceivers
    const groundChanged = groundInitialization || wasGroundEnabled !== (settings.enabled && settings.planarGroundCasters)
    groundInitialization = false
    const shadowLightsChanged = updateShadowLightSelection(wasSingleEnabled)
    let changed = updateReceivers() || groundChanged || shadowLightsChanged || surfaceCoverageChanged, typeChanged = false
    const current = new Set()
    editor.scene.traverse(light => {
      if (!light.isDirectionalLight || !light.castShadow || !light.shadow) return
      current.add(light)
      if (!records.has(light)) records.set(light, {
        light, original: Object.fromEntries(fields.map(field => [field, light.shadow[field]])), applied: null
      })
    })
    for (const [light, record] of records) if (!current.has(light)) {
      changed = restore(record) || changed
      records.delete(light)
    }
    if (settings.enabled && renderer.shadowMap.type === THREE.PCFSoftShadowMap) {
      renderer.shadowMap.type = THREE.PCFShadowMap
      appliedType = THREE.PCFShadowMap
      changed = true
      typeChanged = true
    }
    for (const record of records.values()) {
      if (!settings.enabled) { changed = restore(record) || changed; continue }
      const values = {
        bias: nanjingShadowBias(settings.biasMagnitude, { reversedDepth: reversedDepth(), type: renderer.shadowMap.type }),
        normalBias: settings.normalBias, radius: settings.radius, intensity: settings.strength
      }
      for (const field of fields) if (record.light.shadow[field] !== values[field]) {
        record.light.shadow[field] = values[field]
        changed = true
      }
      record.applied = values
    }
    if (validResolution(settings.resolution)) changed = updateResolution(settings.resolution).changed || changed
    if (changed) invalidate(typeChanged || groundChanged || shadowLightsChanged)
    return changed
  }
  function getStatus() {
    return {
      enabled: !disposed && settings.enabled, reversedDepth: reversedDepth(), type: renderer.shadowMap.type,
      plaqueLocalFill: { enabled: plaqueFillUniform.value > 0, materials: [...plaqueFillMaterials], extraPasses: 0 },
      a1AreaLighting: a1AreaLighting.getStatus(),
      a1GlassDaylight: a1GlassDaylight.getStatus(),
      layers: { ...layers.getStatus(), receivers: buildingReceivers.getStatus() },
      groundCasters: { enabled: !disposed && settings.enabled && settings.planarGroundCasters,
        excluded: excludedGround.length, objects: [...excludedGround], passes: groundPasses },
      receiverPlane: { enabled: !disposed && settings.enabled && settings.receiverPlaneBias,
        active: !disposed && settings.enabled && receiverEnabledUniform.value > 0,
        sampling: 'texel-centre-bilinear-pcf', defaultTextureSamples: 4, addedNormalBias: 0,
        widerRadiusFallback: 'existing bounded five-tap plane correction', baselineDepth: groundBaselineDepth,
        maxOffset: settings.receiverPlaneMaxOffset, materials: receiverRecords.size,
        compiledShaders: [...receiverRecords.values()].reduce((sum, record) => sum + record.compiled, 0),
        errors: [...receiverRecords].filter(([, record]) => record.error).map(([material, record]) => ({ name: material.name, error: record.error })),
        materialNames: [...receiverRecords.keys()].map(material => material.name) },
      fullSurfaceReceivers: { enabled: settings.fullSurfaceReceivers, active: !disposed && settings.enabled && settings.fullSurfaceReceivers },
      buildingReceiverPlane: { enabled: !disposed && settings.enabled && settings.buildingReceiverPlaneBias,
        active: !disposed && settings.enabled && buildingReceiverUniform.value > 0,
        sampling: 'texel-centre-bilinear-pcf', defaultTextureSamples: 4, addedNormalBias: 0,
        widerRadiusFallback: 'existing bounded five-tap plane correction', baselineDepth: buildingBaselineDepth,
        materials: buildingReceiverRecords.size, materialNames: [...buildingReceiverRecords.keys()].map(material => material.name),
        receivers: [...buildingReceiverRecords].map(([material, record]) => ({ material: material.name, objects: [...record.objectNames] })),
        exactGlassReceiver: { object: 'a1玻璃外墙', material: '建筑_蓝灰玻璃' },
        allowedMaterialNames: [...buildingReceiverMaterials],
        compiledShaders: [...buildingReceiverRecords.values()].reduce((sum, record) => sum + record.compiled, 0),
        errors: [...buildingReceiverRecords].filter(([, record]) => record.error).map(([material, record]) => ({ name: material.name, error: record.error })) },
      shadowLightSelection: { enabled: !disposed && settings.enabled && settings.singleShadowLight,
        primary: primaryLight ? { name: primaryLight.name, intensity: primaryLight.intensity, castShadow: primaryLight.castShadow,
          visible: effectivelyVisible(primaryLight) } : null,
        reason: selectionReason, candidatesAtSelection: selectionCandidates.map(candidate => ({ ...candidate })),
        activeDirectionalShadows: directionalLights.filter(light => light.castShadow && effectivelyVisible(light)).length,
        activeShadows: shadowLights.filter(light => light.castShadow && effectivelyVisible(light)).length,
        pendingSavedLights: pendingSuppressedLights.size, ambiguousLightNames: [...ambiguousLightNames],
        suppressed: [...suppressedLights.keys()].map(light => light.name),
        lights: shadowLights.map(light => ({ name: light.name, type: light.type, intensity: light.intensity, castShadow: light.castShadow,
          visible: effectivelyVisible(light) })) },
      settings: { ...settings, suppressedShadowLightNames: [...settings.suppressedShadowLightNames] }, lights: [...records.values()].map(({ light }) => {
        const camera = light.shadow.camera
        return { name: light.name, bias: light.shadow.bias, normalBias: light.shadow.normalBias,
          radius: light.shadow.radius, strength: light.shadow.intensity, mapSize: light.shadow.mapSize.toArray(),
          allocatedMapSize: light.shadow.map ? [light.shadow.map.width, light.shadow.map.height] : null,
          mapSizeMatchesAllocation: light.shadow.map ? (light.shadow.map.width === light.shadow.mapSize.x && light.shadow.map.height === light.shadow.mapSize.y) : null,
          worldTexel: camera.isOrthographicCamera ? (camera.right - camera.left) / light.shadow.mapSize.x : null,
          biasAlongLight: camera.isOrthographicCamera ? Math.abs(light.shadow.bias) * (camera.far - camera.near) : null }
      })
    }
  }
  function updateResolution(size) {
    // An explicit editor operation, not a device-wide default. Keep the saved
    // camera extent and every caster: the finer grid must not crop shadows.
    if (disposed) return { changed: false, reason: 'disposed' }
    if (!validResolution(size)) {
      return { changed: false, reason: 'resolution-must-be-power-of-two-256-to-8192' }
    }
    const requestedChanged = settings.resolution !== size || config.shadows?.sampling?.resolution !== size
    settings.resolution = size
    config.shadows ??= {}
    config.shadows.sampling ??= {}
    config.shadows.sampling.resolution = size
    const light = primaryLight
    if (!light?.isDirectionalLight || !light.castShadow || !effectivelyVisible(light)) {
      if (requestedChanged) options.onChange?.(getStatus())
      return { changed: requestedChanged, requested: size, pending: true, reason: 'no-active-primary-shadow-light' }
    }
    const entries = (Array.isArray(config.lights) ? config.lights : []).filter(item => item.name === light.name && item.type === 'DirectionalLight')
    if (entries.length !== 1) {
      if (requestedChanged) options.onChange?.(getStatus())
      return { changed: requestedChanged, requested: size, pending: true, reason: 'primary-light-not-uniquely-saved' }
    }
    const maximum = renderer.capabilities?.maxTextureSize
    const applied = Number.isFinite(maximum) && maximum >= 256 ? Math.min(size, 2 ** Math.floor(Math.log2(maximum))) : size
    const shadow = light.shadow, previous = shadow.mapSize.toArray()
    const allocationMismatch = shadow.map && (shadow.map.width !== applied || shadow.map.height !== applied)
    const changed = previous[0] !== applied || previous[1] !== applied || !!allocationMismatch
    entries[0].shadow = { ...entries[0].shadow, mapSize: [applied, applied] }
    if (changed) {
      // r184 only creates a target when shadow.map is null or the filter type
      // changes. Setting mapSize alone otherwise leaves an old physical target.
      shadow.map?.dispose()
      shadow.map = null
      shadow.mapPass?.dispose()
      shadow.mapPass = null
      shadow.mapSize.set(applied, applied)
      shadow.needsUpdate = true
      renderer.shadowMap.needsUpdate = true
    }
    if (changed || requestedChanged) options.onChange?.(getStatus())
    return { changed: changed || requestedChanged, requested: size, applied, previous, name: light.name, cappedByDevice: applied !== size,
      worldTexel: (shadow.camera.right - shadow.camera.left) / applied }
  }
  function dispose() {
    if (disposed) return
    buildingReceivers.dispose()
    a1AreaLighting.dispose()
    a1GlassDaylight.dispose()
    layers.dispose()
    let changed = false, typeChanged = false
    const restoredLights = restoreSuppressedLights()
    changed = restoredLights || changed
    typeChanged = restoredLights || typeChanged
    for (const [material, record] of receiverRecords) restoreReceiver(material, record)
    receiverRecords.clear()
    for (const record of records.values()) changed = restore(record) || changed
    if (renderer.shadowMap.render === renderShadows) {
      renderer.shadowMap.render = originalShadowRender
      changed = true
      typeChanged = true
    }
    if (renderer.shadowMap.type === appliedType && appliedType !== originalType) {
      renderer.shadowMap.type = originalType
      changed = true
      typeChanged = true
    }
    disposed = true
    receiverEnabledUniform.value = 0
    buildingReceiverUniform.value = 0
    buildingReceiverRecords.clear()
    if (changed) invalidate(typeChanged)
    records.clear()
  }
  update()
  return { update, updateResolution, a1AreaLighting, a1GlassDaylight, setEnabled: value => update({ enabled: value }), getStatus, dispose,
    withGroundReceiverBaseline(callback) {
      groundBaselineDepth++
      receiverEnabledUniform.value = 0
      const restore = () => {
        groundBaselineDepth--
        receiverEnabledUniform.value = !disposed && settings.enabled && settings.receiverPlaneBias && groundBaselineDepth === 0 ? 1 : 0
      }
      try {
        const result = callback()
        if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore)
        restore()
        return result
      } catch (error) { restore(); throw error }
    },
    withBuildingReceiverBaseline(callback) {
      buildingBaselineDepth++
      buildingReceiverUniform.value = 0
      const restore = () => {
        buildingBaselineDepth--
        buildingReceiverUniform.value = !disposed && settings.enabled && settings.buildingReceiverPlaneBias && buildingBaselineDepth === 0 ? 1 : 0
      }
      try {
        const result = callback()
        if (result && typeof result.then === 'function') return Promise.resolve(result).finally(restore)
        restore()
        return result
      } catch (error) { restore(); throw error }
    },
    withLayerBaseline(callback) {
      const previous = layers.uniforms.nanjingLayerStrength.value
      layers.uniforms.nanjingLayerStrength.value = 0
      try { return callback() } finally { layers.uniforms.nanjingLayerStrength.value = previous }
    },
    withPlaqueFillBaseline(callback) {
      const previous = plaqueFillUniform.value
      plaqueFillUniform.value = 0
      try { return callback() } finally { plaqueFillUniform.value = previous }
    },
    inspectReceiverBindings: () => ({ ground: inspectNanjingShadowBindings(renderer, receiverRecords.keys()),
      buildings: buildingReceivers.inspectBindings(), programScope: receiverProgramScope }),
    inspectLayers: () => inspectNanjingShadowLayers(editor, layers, primaryLight),
    updateLayers(patch) { if (disposed) return; layers.update(patch); updateReceivers(); options.onChange?.(getStatus()) } }
}
