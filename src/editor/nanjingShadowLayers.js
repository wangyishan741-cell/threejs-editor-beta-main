import * as THREE from 'three'
import { createNanjingCanopyShade, createNanjingCanopyUniforms, NANJING_CANOPY_SHADE_GLSL } from './nanjingCanopyShade.js'

export const NANJING_SHADOW_LAYER_DEFAULTS = Object.freeze({ version: 4, mode: 'height-groups', enabled: true, strength: 0.65 })
// The bounded near scene includes 5.82M source triangles after surrounding
// trees are included. They are batched and captured once per invalidation;
// this budget does not increase the two maps or the beauty-pass sample count.
const mapSize = 1024, maxTriangles = 7_000_000, classes = ['high', 'low']
const materialsOf = object => (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)
const now = () => globalThis.performance?.now() ?? Date.now()
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible || node.userData?.nanjingUtility) return false; return true }

export function nanjingLayerCasterKind(object) {
  if (!object?.isMesh || object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh
    || object.morphTargetInfluences?.length || object.userData?.nanjingUtility) return null
  const names = []
  for (let node = object; node; node = node.parent) { if (node.userData?.nanjingUtility) return null; names.push(node.name) }
  if (names.some(name => /^a[1-4]/.test(name))) return 'building'
  if (names.some(name => /^场地区块_近景建筑群_\d+$/.test(name))) return 'context-building'
  if (names.some(name => /^地下停车设施_地下停车场入口/.test(name))) return 'building'
  if (names.some(name => /^植被_乔木\d+(?:_林区)?_\d+(?:_\d+)*$/.test(name)
    || /^周边乔木_\d+$/.test(name) || /^外扩_街区\d+_乔木_?\d+$/.test(name)
    || /^西侧补充_远景面片树_\d+$/.test(name))
    && materialsOf(object).every(material => ['Material_24', 'Material_25'].includes(material.name))) return 'park-tree'
  if (names.some(name => /^植被_(?:灌木[AB]|红线路沿绿篱|绿篱|地被|花卉|观赏草)_\d+(?:_\d+)*$/.test(name)
    || /^景观绿篱_\d+$/.test(name) || /^外扩_街区\d+_低绿篱_\d+$/.test(name)
    || /^西侧街区_低矮绿篱_\d+$/.test(name))) return 'park-vegetation'
  if (names.some(name => /^道路灯具_(?:道路灯|交通信号灯)_\d+$/.test(name))) return 'lamp'
  return null
}

export function getCasterClass(object) {
  const kind = nanjingLayerCasterKind(object)
  if (kind === 'building' || kind === 'context-building') return 'high'
  return kind ? 'low' : null
}
// Compatibility for draw-only receiver clones. Categories need no object IDs.
export const nanjingLayerReceiverOwner = () => 0

export function nanjingLayerProjection(camera, reversed) {
  camera._reversedDepth = reversed
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return new THREE.Matrix4().set(
    .5, 0, 0, .5, 0, .5, 0, .5,
    0, 0, reversed ? 1 : .5, reversed ? 0 : .5, 0, 0, 0, 1
  ).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse)
}

export function createNanjingShadowLayerUniforms() {
  return { nanjingLayerHighDepth: { value: null }, nanjingLayerLowDepth: { value: null },
    nanjingLayerMatrix: { value: new THREE.Matrix4() }, nanjingLayerReady: { value: 0 },
    nanjingLayerStrength: { value: .65 }, nanjingLayerExposure: { value: 1 },
    nanjingLayerTexel: { value: new THREE.Vector2(1 / mapSize, 1 / mapSize) },
    nanjingLayerReversed: { value: false }, nanjingLayerBias: { value: 0 }, ...createNanjingCanopyUniforms() }
}

// The two classes share the exact same projection and texel lattice. Compare
// depths and intersect masks per texel BEFORE filtering: two adjacent disjoint
// penumbras must not turn into overlap merely because both filter to 0.5.
export const NANJING_SHADOW_LAYER_GLSL = /* glsl */`
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
${NANJING_CANOPY_SHADE_GLSL}
uniform sampler2D nanjingLayerHighDepth, nanjingLayerLowDepth;
uniform mat4 nanjingLayerMatrix;
uniform float nanjingLayerReady, nanjingLayerStrength, nanjingLayerBias, nanjingLayerExposure;
uniform vec2 nanjingLayerTexel;
uniform bool nanjingLayerReversed;
float nanjingLayerCompare( float depth, float z ) {
  return nanjingLayerReversed ? 1.0 - step( depth, z + nanjingLayerBias ) : 1.0 - step( z - nanjingLayerBias, depth );
}
vec2 nanjingLayerIntersectionTap( vec2 uv, float z ) {
  float high = nanjingLayerCompare( texture2D( nanjingLayerHighDepth, uv ).r, z );
  float low = nanjingLayerCompare( texture2D( nanjingLayerLowDepth, uv ).r, z );
  return vec2( high * low, high );
}
vec2 nanjingOverlapOcclusion( vec3 worldPosition, vec3 worldNormal, float ignoredOwner ) {
  vec4 projected = nanjingLayerMatrix * vec4( worldPosition + worldNormal * 0.01, 1.0 );
  if ( projected.w <= 0.0 ) return vec2( 0.0 );
  vec3 p = projected.xyz / projected.w;
  if ( any( lessThan( p, vec3( 0.0 ) ) ) || any( greaterThan( p, vec3( 1.0 ) ) ) ) return vec2( 0.0 );
  vec2 pixel = p.xy / nanjingLayerTexel - 0.5;
  vec2 base = ( floor( pixel ) + 0.5 ) * nanjingLayerTexel;
  vec2 weight = fract( pixel );
  vec2 a = nanjingLayerIntersectionTap( base, p.z );
  vec2 b = nanjingLayerIntersectionTap( base + vec2( nanjingLayerTexel.x, 0.0 ), p.z );
  vec2 c = nanjingLayerIntersectionTap( base + vec2( 0.0, nanjingLayerTexel.y ), p.z );
  vec2 d = nanjingLayerIntersectionTap( base + nanjingLayerTexel, p.z );
  vec2 coverage = mix( mix( a, b, weight.x ), mix( c, d, weight.x ), weight.y );
  // The canopy's overhead environment occlusion belongs to the same low
  // category as its directional shadow. Union those masks before combining
  // with the building mask, so overlapping trees never accumulate darkness.
  float canopy = nanjingCanopyOcclusion( worldPosition, worldNormal );
  return vec2( max( coverage.x, coverage.y * canopy ), 0.0 );
}
vec2 nanjingOverlapOcclusion( vec3 p, vec3 n ) { return nanjingOverlapOcclusion( p, n, 0.0 ); }
float nanjingLocalOcclusion( vec3 p ) { return nanjingOverlapOcclusion( p, vec3( 0.0, 1.0, 0.0 ) ).x; }
vec3 nanjingOverlapLight( vec3 light, vec2 overlap ) {
  float strength = clamp( nanjingLayerStrength, 0.0, 0.9 );
  if ( strength <= 0.0 ) return light;
  // Keep the user-approved darkening visible after the scene's HDR OutputPass.
  // Only the high/low intersection changes; same-class overlap remains intact.
  float keep = 1.0 - strength;
  float luminance = dot( max( light, vec3( 0.0 ) ), vec3( 0.2126, 0.7152, 0.0722 ) );
  float ceiling = keep * keep * keep / max( strength * nanjingLayerExposure, 0.000001 );
  vec3 darkened = light * min( keep, ceiling / max( luminance, 0.000001 ) );
  return mix( light, darkened, clamp( overlap.x, 0.0, 1.0 ) );
}
#endif
`

export function createNanjingShadowLayers(editor, config = {}, options = {}) {
  const renderer = editor.renderer, uniforms = createNanjingShadowLayerUniforms()
  const canopy = createNanjingCanopyShade(renderer)
  Object.assign(uniforms, canopy.uniforms)
  const camera = new THREE.OrthographicCamera()
  const proxyScenes = Object.fromEntries(classes.map(kind => {
    const scene = new THREE.Scene()
    scene.name = kind === 'high' ? '高大建筑投影缓存' : '低矮物体投影缓存'
    scene.matrixWorldAutoUpdate = false
    return [kind, scene]
  }))
  const targets = Object.fromEntries(classes.map(kind => {
    const target = new THREE.WebGLRenderTarget(mapSize, mapSize, { depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, samples: 0 })
    target.texture.name = kind + ' 投影占位颜色'; target.texture.colorSpace = THREE.NoColorSpace
    target.depthTexture = new THREE.DepthTexture(mapSize, mapSize, THREE.UnsignedIntType)
    target.depthTexture.name = kind + ' 独立类别投影深度'
    target.depthTexture.minFilter = THREE.NearestFilter; target.depthTexture.magFilter = THREE.NearestFilter
    target.depthTexture.compareFunction = null
    return [kind, target]
  }))
  uniforms.nanjingLayerHighDepth.value = targets.high.depthTexture
  uniforms.nanjingLayerLowDepth.value = targets.low.depthTexture
  const saved = config.shadowLayers || {}
  const savedVersion = Number.isFinite(saved.version) ? saved.version : 0
  // The user requested this project's current effect on by default. Apply that
  // instruction once to legacy browser saves, whose off/zero/weak values hid it.
  // After v4, explicit off, zero, and custom strengths survive reloads/updates.
  let settings = { ...NANJING_SHADOW_LAYER_DEFAULTS, ...saved,
    version: Math.max(NANJING_SHADOW_LAYER_DEFAULTS.version, savedVersion), mode: 'height-groups',
    ...(savedVersion < 4 ? { enabled: true, strength: .65 } : {}) }
  let disposed = false, capturing = false, dirty = true, signature = null, captures = 0, draws = 0, triangles = 0, casters = 0, lastCaptureMs = 0
  let primaryName = null, unsupported = null, extent = null
  const proxies = [], ownedMaterials = new Set(), materialCache = new Map()
  const classStats = Object.fromEntries(classes.map(kind => [kind, { casters: 0, triangles: 0, proxyBatches: 0, draws: 0 }]))
  const originalBeforeRender = editor.scene.onBeforeRender
  const staticUnsupported = typeof renderer.render !== 'function' || typeof renderer.setRenderTarget !== 'function' ? '当前渲染器不支持分类投影缓存' : null
  function clearProxies() {
    for (const proxy of proxies) { proxy.parent?.remove(proxy); proxy.dispose?.() }
    proxies.length = 0
    for (const material of ownedMaterials) material.dispose()
    ownedMaterials.clear(); materialCache.clear()
  }
  function depthMaterial(source, kind) {
    const key = source.uuid + '|' + kind
    if (materialCache.has(key)) return materialCache.get(key)
    const leaf = (kind === 'park-tree' && source.name === 'Material_25')
      || (kind === 'park-vegetation' && /(?:叶片|三叶草|花叶|灌木叶|观赏草)/.test(source.name))
    // The tree atlas averages to alpha .252 in its coarsest mip. At this
    // project's cached shadow scale many full leaf cards are subpixel; .3
    // removed their entire canopy. Keep the beauty material and explicit
    // cutoffs intact, lowering only this known tree's fallback depth cutoff.
    const leafCutoff = kind === 'park-tree' && source.name === 'Material_25' ? .2 : .3
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: source.side,
      map: leaf || source.alphaTest > 0 ? source.map : null, alphaMap: leaf || source.alphaTest > 0 ? source.alphaMap : null,
      alphaTest: source.alphaTest > 0 ? source.alphaTest : leaf ? leafCutoff : 0,
      opacity: leaf ? source.opacity : 1, alphaHash: false, blending: THREE.NoBlending,
      depthTest: true, depthWrite: true, colorWrite: false })
    depth.name = '分类投影深度 · ' + source.name
    depth.visible = source.visible; depth.toneMapped = false; depth.dithering = false
    depth.displacementMap = source.displacementMap
    depth.displacementScale = source.displacementScale; depth.displacementBias = source.displacementBias
    depth.clippingPlanes = source.clippingPlanes; depth.clipIntersection = source.clipIntersection
    materialCache.set(key, depth); ownedMaterials.add(depth)
    return depth
  }
  function inventory(primary) {
    const entries = [], stamp = [], lightPosition = new THREE.Vector3(), lightTarget = new THREE.Vector3()
    primary.updateWorldMatrix(true, false); primary.target.updateWorldMatrix(true, false)
    lightPosition.setFromMatrixPosition(primary.matrixWorld); lightTarget.setFromMatrixPosition(primary.target.matrixWorld)
    const direction = lightPosition.sub(lightTarget).normalize()
    const reversed = renderer.state?.buffers?.depth?.getReversed?.() ?? !!renderer.capabilities?.reversedDepthBuffer
    stamp.push(primary.uuid, ...direction.toArray(), reversed)
    editor.scene.traverse(object => {
      const kind = nanjingLayerCasterKind(object), casterClass = getCasterClass(object)
      if (!casterClass || !visible(object) || !object.castShadow || !materialsOf(object).some(material => material.visible)) return
      const geometry = options.getOriginalGeometry?.(object.geometry) || object.geometry
      if (!geometry?.isBufferGeometry || !geometry.attributes.position || Object.keys(geometry.morphAttributes || {}).length) return
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      const box = geometry.boundingBox.clone().applyMatrix4(object.matrixWorld), size = box.getSize(new THREE.Vector3())
      if (casterClass === 'low' && (box.min.x < -30 || box.max.x > 30 || box.min.z < -35 || box.max.z > 30
        || box.min.y < -3 || box.max.y > 3 || size.y < .01)) return
      if (kind === 'building' && (box.min.x < -30 || box.max.x > 30 || box.min.z < -35 || box.max.z > 30
        || box.min.y < -3 || box.max.y > 15)) return
      const materials = materialsOf(object)
      const textureStamp = texture => texture ? [texture.uuid, texture.version, texture.channel,
        texture.offset.x, texture.offset.y, texture.repeat.x, texture.repeat.y, texture.rotation, texture.center.x, texture.center.y] : []
      stamp.push(object.uuid, casterClass, geometry.uuid, geometry.attributes.position.version, geometry.index?.version || 0,
        geometry.drawRange.start, geometry.drawRange.count, ...geometry.groups.flatMap(group => [group.start, group.count, group.materialIndex]),
        ...object.matrixWorld.elements, ...materials.flatMap(material => [material.uuid, material.version, material.visible,
          material.opacity, material.alphaTest, material.side, ...textureStamp(material.map), ...textureStamp(material.alphaMap)]))
      entries.push({ object, geometry, materials, kind, casterClass, box })
    })
    return { entries, direction, reversed, signature: stamp.join('|') }
  }
  function rebuild(data) {
    clearProxies()
    const groups = new Map(), bounds = new THREE.Box3(), allBounds = new THREE.Box3()
    const footprintBounds = new THREE.Box3(new THREE.Vector3(-25, -3, -30), new THREE.Vector3(25, 15, 30))
    casters = data.entries.length; triangles = 0
    for (const kind of classes) Object.assign(classStats[kind], { casters: 0, triangles: 0, proxyBatches: 0, draws: 0 })
    for (const entry of data.entries) {
      const count = (entry.geometry.index?.count ?? entry.geometry.attributes.position.count) / 3
      triangles += count
      if (triangles > maxTriangles) throw new Error('分类投影物体超过 700 万三角形缓存上限')
      classStats[entry.casterClass].casters++; classStats[entry.casterClass].triangles += count
      allBounds.union(entry.box)
      bounds.union(entry.kind === 'context-building' ? entry.box.clone().intersect(footprintBounds) : entry.box)
      const depth = entry.materials.map(material => depthMaterial(material, entry.kind))
      const key = entry.casterClass + '|' + entry.geometry.uuid + '|' + depth.map(material => material.uuid).join(',')
      if (!groups.has(key)) groups.set(key, { geometry: entry.geometry, depth, entries: [], casterClass: entry.casterClass })
      groups.get(key).entries.push(entry)
    }
    if (!casters) throw new Error('未找到开启投影的建筑、植物或低矮物体')
    for (const group of groups.values()) {
      const proxy = new THREE.InstancedMesh(group.geometry, group.depth.length === 1 ? group.depth[0] : group.depth, group.entries.length)
      proxy.name = group.casterClass + ' 分类投影代理'; proxy.frustumCulled = false; proxy.matrixAutoUpdate = false
      group.entries.forEach((entry, index) => proxy.setMatrixAt(index, entry.object.matrixWorld))
      proxy.instanceMatrix.needsUpdate = true
      proxy.updateMatrixWorld(true); proxyScenes[group.casterClass].add(proxy); proxies.push(proxy)
      classStats[group.casterClass].proxyBatches++
    }
    // One projection for both classes, including footprints down to the ground.
    const receiverY = -2.35
    for (const entry of data.entries) for (const x of [entry.box.min.x, entry.box.max.x]) for (const z of [entry.box.min.z, entry.box.max.z]) {
      if (entry.kind === 'context-building') continue
      const height = Math.max(0, entry.box.max.y - receiverY)
      if (data.direction.y > .1) bounds.expandByPoint(new THREE.Vector3(x, entry.box.max.y, z).addScaledVector(data.direction, -height / data.direction.y))
    }
    const center = bounds.getCenter(new THREE.Vector3()), distance = allBounds.clone().union(bounds).getSize(new THREE.Vector3()).length() + 5
    camera.position.copy(center).addScaledVector(data.direction, distance); camera.up.set(0, 1, 0); camera.lookAt(center); camera.updateMatrixWorld(true)
    const projected = bounds.clone().applyMatrix4(camera.matrixWorldInverse), projectedDepth = allBounds.clone().union(bounds).applyMatrix4(camera.matrixWorldInverse), margin = .15
    camera.left = projected.min.x - margin; camera.right = projected.max.x + margin
    camera.bottom = projected.min.y - margin; camera.top = projected.max.y + margin
    camera.near = Math.max(.01, -projectedDepth.max.z - margin); camera.far = Math.max(camera.near + .1, -projectedDepth.min.z + margin)
    const matrix = nanjingLayerProjection(camera, data.reversed)
    extent = [camera.right - camera.left, camera.top - camera.bottom]
    return matrix
  }
  function refresh(force = false) {
    if (disposed || capturing || !settings.enabled || settings.strength <= 0 || staticUnsupported) return false
    const primary = options.getPrimaryLight?.()
    if (!primary?.isDirectionalLight || !primary.castShadow || !primary.visible || !renderer.shadowMap.enabled) { uniforms.nanjingLayerReady.value = 0; return false }
    primaryName = primary.name
    if (captures > 0 && !unsupported) uniforms.nanjingLayerReady.value = 1
    if (!force && !dirty && !renderer.shadowMap.needsUpdate && !primary.shadow.needsUpdate) return false
    const data = inventory(primary)
    if (!force && !dirty && data.signature === signature) return false
    const started = now()
    const previous = { target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace?.() || 0, mip: renderer.getActiveMipmapLevel?.() || 0,
      autoClear: renderer.autoClear, xr: renderer.xr?.enabled,
      shadowEnabled: renderer.shadowMap.enabled, shadowAuto: renderer.shadowMap.autoUpdate, shadowDirty: renderer.shadowMap.needsUpdate }
    capturing = true; uniforms.nanjingLayerReady.value = 0
    try {
      const matrix = rebuild(data)
      if ((force || dirty) && canopy.getStatus().unsupported) canopy.invalidate()
      canopy.refresh(data.entries)
      renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false
      if (renderer.xr) renderer.xr.enabled = false
      renderer.autoClear = false; draws = 0
      for (const kind of classes) {
        // Render-target viewport/scissor are physical pixels. The renderer's
        // setViewport/setScissor APIs instead multiply by its canvas pixel ratio.
        renderer.setRenderTarget(targets[kind])
        renderer.clear(false, true, false)
        const before = renderer.info?.render?.calls ?? 0
        renderer.render(proxyScenes[kind], camera)
        const after = renderer.info?.render?.calls
        classStats[kind].draws = after === undefined ? classStats[kind].proxyBatches : renderer.info.autoReset === false ? after - before : after
        draws += classStats[kind].draws
      }
      uniforms.nanjingLayerMatrix.value.copy(matrix); uniforms.nanjingLayerReversed.value = data.reversed
      uniforms.nanjingLayerBias.value = .008 / (camera.far - camera.near)
      uniforms.nanjingLayerReady.value = 1
      captures++
      unsupported = null; signature = data.signature; dirty = false
      return true
    } catch (error) {
      unsupported = error.message || String(error)
      signature = data.signature; dirty = false
      return false
    } finally {
      renderer.autoClear = previous.autoClear
      if (renderer.xr) renderer.xr.enabled = previous.xr
      renderer.shadowMap.enabled = previous.shadowEnabled; renderer.shadowMap.autoUpdate = previous.shadowAuto; renderer.shadowMap.needsUpdate = previous.shadowDirty
      renderer.setRenderTarget(previous.target, previous.face, previous.mip)
      capturing = false; lastCaptureMs = now() - started
    }
  }
  function beforeRender(...args) {
    originalBeforeRender.apply(this, args)
    if (args[2] === editor.camera) {
      uniforms.nanjingLayerExposure.value = Math.max(.000001, Number.isFinite(renderer.toneMappingExposure) ? renderer.toneMappingExposure : 1)
      refresh()
    }
  }
  function update(patch = {}) {
    const wasEnabled = settings.enabled
    const { invalidate, ...values } = patch
    settings = { ...settings, ...values, version: settings.version, mode: 'height-groups' }
    settings.enabled = settings.enabled !== false
    settings.strength = Number.isFinite(settings.strength) ? THREE.MathUtils.clamp(settings.strength, 0, .9) : .65
    config.shadowLayers = { ...settings }
    uniforms.nanjingLayerStrength.value = settings.strength
    uniforms.nanjingLayerReady.value = !disposed && settings.enabled && settings.strength > 0 && !unsupported && captures > 0 ? 1 : 0
    if (invalidate || (settings.enabled && (!wasEnabled || captures === 0))) dirty = true
    options.onChange?.()
  }
  function getStatus() { return { version: settings.version, mode: 'height-groups', enabled: settings.enabled, strength: settings.strength, active: uniforms.nanjingLayerReady.value === 1,
    unsupported: staticUnsupported || unsupported, captures, casters, draws, triangles, lastCaptureMs, primaryLight: primaryName,
    mapSize, extent, worldTexel: extent?.map(size => size / mapSize), proxyBatches: proxies.length, triangleBudget: maxTriangles,
    classes: Object.fromEntries(classes.map(kind => [kind, { ...classStats[kind] }])),
    sampling: 'cached-same-sun-height-groups', composition: 'high-low-intersection', viewportPolicy: 'render-target-physical', displayExposure: uniforms.nanjingLayerExposure.value,
    extraLights: 0, cachePasses: 2, cachedTriangles: triangles,
    canopyShade: { ...canopy.getStatus(), active: uniforms.nanjingLayerReady.value === 1 && canopy.getStatus().active },
    totalCachePasses: 2 + (canopy.getStatus().active ? 1 : 0) } }
  function dispose() {
    if (disposed) return
    disposed = true; uniforms.nanjingLayerReady.value = 0
    canopy.dispose()
    if (editor.scene.onBeforeRender === beforeRender) editor.scene.onBeforeRender = originalBeforeRender
    clearProxies(); Object.values(targets).forEach(target => target.dispose())
  }
  editor.scene.onBeforeRender = beforeRender
  update()
  return { update, getStatus, dispose, refresh, uniforms, getCasterClass, getOwnerId: () => 0 }
}

