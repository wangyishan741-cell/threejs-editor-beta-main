import * as THREE from 'three'

const MAP_SIZE = 1024
const treeGroupName = /^植被_乔木01_\d+(?:_\d+)*$/
const now = () => globalThis.performance?.now() ?? Date.now()

export function createNanjingCanopyUniforms() {
  return {
    nanjingCanopyShadeMap: { value: null },
    nanjingCanopyShadeBounds: { value: new THREE.Vector4(-1, -1, 1, 1) },
    nanjingCanopyShadeReady: { value: 0 },
  }
}

// A soft overhead canopy mask for the already shaded park ground. It has no
// sun direction and is deliberately separate from the directional shadow map.
export const NANJING_CANOPY_SHADE_GLSL = /* glsl */`
uniform sampler2D nanjingCanopyShadeMap;
uniform vec4 nanjingCanopyShadeBounds;
uniform float nanjingCanopyShadeReady;
float nanjingCanopyOcclusion( vec3 worldPosition, vec3 worldNormal ) {
  if ( nanjingCanopyShadeReady < 0.5 || worldPosition.y < -2.35 || worldPosition.y > -1.9 ) return 0.0;
  float horizontal = smoothstep( 0.8, 0.98, worldNormal.y );
  if ( horizontal <= 0.0 ) return 0.0;
  vec2 uv = ( worldPosition.xz - nanjingCanopyShadeBounds.xy ) / ( nanjingCanopyShadeBounds.zw - nanjingCanopyShadeBounds.xy );
  if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 0.0;
  return texture2D( nanjingCanopyShadeMap, uv ).r * horizontal;
}
`

export function createNanjingCanopyShade(renderer) {
  const target = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false, samples: 0,
  })
  target.texture.name = '园区树冠环境遮蔽缓存'
  target.texture.colorSpace = THREE.NoColorSpace
  const uniforms = createNanjingCanopyUniforms()
  uniforms.nanjingCanopyShadeMap.value = target.texture
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  scene.name = '园区树冠环境遮蔽缓存'
  const material = new THREE.ShaderMaterial({
    uniforms: { canopyBounds: uniforms.nanjingCanopyShadeBounds },
    vertexShader: /* glsl */`
      attribute vec4 canopyEllipse;
      attribute float canopyPeak;
      uniform vec4 canopyBounds;
      varying vec2 canopyDisk;
      varying float canopyDensity;
      void main() {
        canopyDisk = position.xy;
        canopyDensity = canopyPeak;
        vec2 worldXZ = canopyEllipse.xy + position.xy * canopyEllipse.zw;
        vec2 uv = ( worldXZ - canopyBounds.xy ) / ( canopyBounds.zw - canopyBounds.xy );
        gl_Position = vec4( uv * 2.0 - 1.0, 0.0, 1.0 );
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 canopyDisk;
      varying float canopyDensity;
      void main() {
        float mask = ( 1.0 - smoothstep( 0.25, 1.0, length( canopyDisk ) ) ) * canopyDensity;
        gl_FragColor = vec4( mask );
      }
    `,
    depthWrite: false, depthTest: false, toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    transparent: true,
  })
  material.name = '树冠柔椭圆遮蔽 · 取最大值'
  let proxy = null, enabled = true, disposed = false, dirty = true, lastEntries = [], signature = null
  let captures = 0, trees = 0, draws = 0, lastCaptureMs = 0, unsupported = null, extent = null

  function collect(entries) {
    const groups = new Map(), stamp = []
    for (const entry of entries || []) {
      if (entry.kind !== 'park-tree' || !entry.object || !entry.box?.isBox3
        || !entry.materials?.some(source => source?.name === 'Material_25')) continue
      let group = entry.object
      while (group && !treeGroupName.test(group.name)) group = group.parent
      if (!group || entry.box.isEmpty()) continue
      const values = [...entry.box.min.toArray(), ...entry.box.max.toArray()]
      if (!values.every(Number.isFinite)) continue
      const geometry = entry.geometry
      stamp.push(group.uuid, entry.object.uuid, geometry?.uuid, geometry?.attributes?.position?.version || 0,
        geometry?.index?.version || 0, ...values)
      if (groups.has(group)) groups.get(group).union(entry.box)
      else groups.set(group, entry.box.clone())
    }
    return { groups, signature: stamp.join('|') }
  }

  function clearProxy() {
    if (!proxy) return
    scene.remove(proxy)
    proxy.geometry.dispose()
    proxy.dispose()
    proxy = null
  }

  function rebuild(groups) {
    clearProxy()
    trees = groups.size
    if (!trees) { extent = null; return }
    const ellipses = new Float32Array(trees * 4), peaks = new Float32Array(trees)
    const bounds = new THREE.Box2(), size = new THREE.Vector3(), center = new THREE.Vector3()
    let index = 0
    for (const box of groups.values()) {
      box.getSize(size); box.getCenter(center)
      const rx = Math.max(.03, size.x * .5), rz = Math.max(.03, size.z * .5)
      // Greater crown clearance weakens the overhead occlusion. The ground
      // band is project-specific; no geometry, leaf alpha, or light is changed.
      const height = Math.max(0, center.y + 2.1)
      peaks[index] = THREE.MathUtils.clamp(1 / (1 + height * .2), .55, .85)
      ellipses.set([center.x, center.z, rx, rz], index * 4)
      bounds.expandByPoint(new THREE.Vector2(center.x - rx, center.z - rz))
      bounds.expandByPoint(new THREE.Vector2(center.x + rx, center.z + rz))
      index++
    }
    // Black padding ensures linear edge taps cannot clamp a tree silhouette
    // beyond the cached park footprint.
    bounds.expandByScalar(.05)
    uniforms.nanjingCanopyShadeBounds.value.set(bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y)
    extent = bounds.getSize(new THREE.Vector2()).toArray()
    const geometry = new THREE.PlaneGeometry(2, 2)
    geometry.setAttribute('canopyEllipse', new THREE.InstancedBufferAttribute(ellipses, 4))
    geometry.setAttribute('canopyPeak', new THREE.InstancedBufferAttribute(peaks, 1))
    proxy = new THREE.InstancedMesh(geometry, material, trees)
    proxy.name = '园区树冠柔椭圆 · 单次实例绘制'
    proxy.frustumCulled = false
    scene.add(proxy)
  }

  function refresh(entries = lastEntries) {
    if (disposed) return false
    lastEntries = entries || []
    if (!enabled) { uniforms.nanjingCanopyShadeReady.value = 0; return false }
    const data = collect(lastEntries)
    if (!dirty && data.signature === signature) return false
    uniforms.nanjingCanopyShadeReady.value = 0
    if (!data.groups.size) {
      clearProxy(); trees = 0; draws = 0; extent = null; signature = data.signature; dirty = false
      return false
    }
    const started = now()
    const previous = {
      target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace?.() || 0, mip: renderer.getActiveMipmapLevel?.() || 0,
      autoClear: renderer.autoClear, xr: renderer.xr?.enabled,
      clear: renderer.getClearColor(new THREE.Color()).clone(), alpha: renderer.getClearAlpha(),
      shadowEnabled: renderer.shadowMap.enabled, shadowAuto: renderer.shadowMap.autoUpdate, shadowDirty: renderer.shadowMap.needsUpdate,
    }
    try {
      rebuild(data.groups)
      renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false
      if (renderer.xr) renderer.xr.enabled = false
      renderer.autoClear = false
      // setRenderTarget uses physical target pixels. Do not call setViewport
      // or setScissor here: their public inputs are scaled by the canvas DPR.
      renderer.setRenderTarget(target)
      renderer.setClearColor(0, 0)
      renderer.clear(true, false, false)
      const before = renderer.info?.render?.calls ?? 0
      renderer.render(scene, camera)
      const after = renderer.info?.render?.calls
      draws = after === undefined ? 1 : renderer.info.autoReset === false ? after - before : after
      captures++; signature = data.signature; dirty = false; unsupported = null
      uniforms.nanjingCanopyShadeReady.value = 1
      return true
    } catch (error) {
      unsupported = error.message || String(error)
      dirty = false; signature = data.signature
      return false
    } finally {
      renderer.setClearColor(previous.clear, previous.alpha)
      renderer.autoClear = previous.autoClear
      if (renderer.xr) renderer.xr.enabled = previous.xr
      renderer.shadowMap.enabled = previous.shadowEnabled; renderer.shadowMap.autoUpdate = previous.shadowAuto; renderer.shadowMap.needsUpdate = previous.shadowDirty
      renderer.setRenderTarget(previous.target, previous.face, previous.mip)
      lastCaptureMs = now() - started
    }
  }

  function invalidate() { if (!disposed) dirty = true }
  function update(patch = {}) {
    if (disposed) return
    const wasEnabled = enabled
    if (typeof patch.enabled === 'boolean') enabled = patch.enabled
    if (enabled && !wasEnabled) dirty = true
    if (patch.invalidate) invalidate()
    uniforms.nanjingCanopyShadeReady.value = enabled && !dirty && trees > 0 && captures > 0 && !unsupported ? 1 : 0
  }
  function getStatus() {
    return { enabled, active: uniforms.nanjingCanopyShadeReady.value === 1, trees, draws, captures, mapSize: MAP_SIZE,
      cachePasses: 1, cachedTriangles: trees * 2, lastCaptureMs, extent, worldTexel: extent?.map(size => size / MAP_SIZE),
      unsupported, composition: 'max-overhead-canopy', viewportPolicy: 'render-target-physical', extraLights: 0 }
  }
  function dispose() {
    if (disposed) return
    disposed = true; uniforms.nanjingCanopyShadeReady.value = 0
    clearProxy(); material.dispose(); target.dispose(); lastEntries = []
  }
  return { uniforms, refresh, invalidate, update, getStatus, dispose }
}
