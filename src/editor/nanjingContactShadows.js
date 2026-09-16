import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { createNanjingContactLampDepth } from './nanjingContactLampDepth.js'

export const NANJING_CONTACT_SHADOW_DEFAULTS = Object.freeze({ enabled: true, strength: 0.22, radius: 0.3 })
const clamp = (value, fallback, low, high) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, low, high) : fallback
const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const depthFunctions = `
uniform sampler2D sceneDepth;
uniform mat4 inverseProjection;
uniform bool reversedDepth;
vec3 viewPosition(vec2 uv, float depth) {
  vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, reversedDepth ? depth : depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
bool backgroundDepth(float depth) { return reversedDepth ? depth <= 0.0000001 : depth >= 0.9999999; }
`
const aoShader = `varying vec2 vUv;
${depthFunctions}
uniform vec2 depthTexel;
uniform vec2 projectionScale;
uniform bool orthographicCamera;
uniform float radius;
uniform sampler2D lampDepth;
uniform bool lampDepthEnabled;
uniform bool texelCentreSampling;
vec2 depthSampleUv(vec2 uv) {
  if (!texelCentreSampling) return uv;
  // Nearest depth belongs to a pixel centre, not to the arbitrary sub-pixel
  // position of a horizon tap. Reconstruct both from the same coordinates.
  return clamp((floor(uv / depthTexel) + 0.5) * depthTexel,
    depthTexel * 0.5, vec2(1.0) - depthTexel * 0.5);
}
vec3 scenePosition(vec2 uv) {
  uv = depthSampleUv(uv);
  return viewPosition(uv, texture2D(sceneDepth, uv).r);
}
float occluderDepth(vec2 uv) {
  float depth = texture2D(sceneDepth, uv).r;
  if (!lampDepthEnabled) return depth;
  float lamp = texture2D(lampDepth, uv).r;
  if (backgroundDepth(lamp)) return depth;
  if (backgroundDepth(depth)) return lamp;
  return reversedDepth ? max(depth, lamp) : min(depth, lamp);
}
void main() {
  vec2 centerUv = depthSampleUv(vUv);
  float depth = texture2D(sceneDepth, centerUv).r;
  if (backgroundDepth(depth)) { gl_FragColor = vec4(0.0); return; }
  vec3 p = viewPosition(centerUv, depth);
  vec2 x = vec2(depthTexel.x, 0.0), y = vec2(0.0, depthTexel.y);
  vec3 l = scenePosition(centerUv-x);
  vec3 r = scenePosition(centerUv+x);
  vec3 b = scenePosition(centerUv-y);
  vec3 t = scenePosition(centerUv+y);
  vec3 dx = abs(p.z-l.z) < abs(r.z-p.z) ? p-l : r-p;
  vec3 dy = abs(p.z-b.z) < abs(t.z-p.z) ? p-b : t-p;
  float dxLengthSquared = dot(dx, dx), dyLengthSquared = dot(dy, dy);
  if (!(dxLengthSquared > 0.0 && dyLengthSquared > 0.0)) { gl_FragColor = vec4(0.0, -p.z, 0.0, 1.0); return; }
  // Judge the angle between neighbors, not the world area of one pixel.
  // Near cameras and dense drawing buffers have valid but very small edges.
  vec3 crossNormal = cross(dx * inversesqrt(dxLengthSquared), dy * inversesqrt(dyLengthSquared));
  if (!(dot(crossNormal,crossNormal) > 0.00000001)) { gl_FragColor = vec4(0.0, -p.z, 0.0, 1.0); return; }
  vec3 normal = normalize(crossNormal);
  if (normal.z < 0.0) normal = -normal;
  vec2 screenRadius = min(radius * projectionScale / (orthographicCamera ? 1.0 : max(-p.z, 0.001)), 40.0 * depthTexel);
  float occlusion = 0.0;
  // Fixed directions have no stochastic pattern or frame-to-frame jitter.
  for (int i=0; i<8; i++) {
    float angle = float(i) * 0.78539816339;
    vec2 direction = vec2(cos(angle), sin(angle));
    float horizon = 0.0;
    for (int j=0; j<3; j++) {
      float sampleRadius = j == 0 ? 0.08 : j == 1 ? 0.28 : 0.75;
      vec2 uv = centerUv + direction * screenRadius * sampleRadius;
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
      uv = depthSampleUv(uv);
      float d = occluderDepth(uv);
      if (backgroundDepth(d)) continue;
      vec3 offset = viewPosition(uv, d) - p;
      float distanceToSample = length(offset);
      float angular = max(dot(normal, offset / max(distanceToSample, 0.0001)) - 0.1, 0.0);
      float attenuation = 1.0 - smoothstep(radius * 0.2, radius, distanceToSample);
      horizon = max(horizon, angular * attenuation);
    }
    occlusion += horizon;
  }
  // Normalize by directions, so additional near samples do not dilute a
  // narrow contact. The existing strength and world radius remain unchanged.
  gl_FragColor = vec4(clamp(occlusion * (3.0 / 8.0), 0.0, 1.0), min(-p.z, 60000.0), 0.0, 1.0);
}`
const compositeShader = `varying vec2 vUv;
${depthFunctions}
uniform sampler2D sceneColor;
uniform sampler2D contactTexture;
uniform vec2 contactTexel;
uniform float strength;
uniform float radius;
void main() {
  vec4 color = texture2D(sceneColor, vUv);
  float depth = texture2D(sceneDepth, vUv).r;
  if (backgroundDepth(depth)) { gl_FragColor = color; return; }
  float viewDepth = -viewPosition(vUv, depth).z;
  float sum = 0.0, weights = 0.0;
  for (int i=0; i<5; i++) {
    vec2 delta = i == 0 ? vec2(0.0) : i == 1 ? vec2(1.0,0.0) : i == 2 ? vec2(-1.0,0.0) : i == 3 ? vec2(0.0,1.0) : vec2(0.0,-1.0);
    vec4 sampleAO = texture2D(contactTexture, vUv + delta * contactTexel);
    float w = sampleAO.a * max(0.0, 1.0 - abs(sampleAO.g - viewDepth) / max(radius * 0.2, 0.015));
    sum += sampleAO.r * w; weights += w;
  }
  float ao = weights > 0.0 ? sum / weights : 0.0;
  gl_FragColor = vec4(color.rgb * (1.0 - strength * ao), color.a);
}`

// Reuses beauty depth for receiving surfaces and normals. Two screen passes;
// only the named translucent lamps need a separate, instanced depth draw.
export function createNanjingContactShadows(editor, config = {}, options = {}) {
  const composer = editor.effectComposer, renderer = editor.renderer
  const scenePass = composer?.passes?.find(pass => pass.isRenderPass && pass.scene === editor.scene)
  let settings = { ...NANJING_CONTACT_SHADOW_DEFAULTS, ...config.contactShadows }
  const depthRecords = new Map()
  let disposed = false, renders = 0, lastBuffer = null
  let depthBaseline = 0, contactBaseline = 0, samplingBaseline = 0, floatDepthSupport = null, floatDepthReason = 'not-tested'
  const unsupported = !scenePass ? '未找到场景深度通道' : renderer.capabilities?.logarithmicDepthBuffer ? '对数深度模式不启用接触阴影' : null
  const lampDepth = createNanjingContactLampDepth(editor)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  target.texture.name = '南京接触阴影（半分辨率）'
  const shared = () => ({ sceneDepth: { value: null }, inverseProjection: { value: new THREE.Matrix4() }, reversedDepth: { value: false }, radius: { value: settings.radius } })
  const aoMaterial = new THREE.ShaderMaterial({ name: '南京接触阴影采样', vertexShader, fragmentShader: aoShader,
    uniforms: { ...shared(), depthTexel: { value: new THREE.Vector2() }, projectionScale: { value: new THREE.Vector2() }, orthographicCamera: { value: false },
      lampDepth: { value: null }, lampDepthEnabled: { value: false }, texelCentreSampling: { value: true } }, depthTest: false, depthWrite: false, toneMapped: false })
  const compositeMaterial = new THREE.ShaderMaterial({ name: '南京接触阴影合成', vertexShader, fragmentShader: compositeShader,
    uniforms: { ...shared(), sceneColor: { value: null }, contactTexture: { value: target.texture }, contactTexel: { value: new THREE.Vector2() }, strength: { value: settings.strength } }, depthTest: false, depthWrite: false, toneMapped: false })
  const quad = new FullScreenQuad(aoMaterial)
  const copyMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: 'varying vec2 vUv; uniform sampler2D sceneColor; void main() { gl_FragColor = texture2D(sceneColor, vUv); }',
    uniforms: { sceneColor: { value: null } }, depthTest: false, depthWrite: false, toneMapped: false })
  const pass = new Pass()
  pass.name = '南京接触阴影'
  pass.needsSwap = true
  const originalRender = scenePass?.render
  const isReversedDepth = () => renderer.state?.buffers?.depth?.getReversed?.() ?? !!renderer.capabilities?.reversedDepthBuffer
  function resetDepthSupport() { floatDepthSupport = null; floatDepthReason = 'not-tested' }
  function supportsFloatDepth(buffer) {
    if (floatDepthSupport !== null) return floatDepthSupport
    if (renderer.capabilities?.isWebGL2 !== true || typeof renderer.getContext !== 'function'
      || typeof renderer.getRenderTarget !== 'function' || typeof renderer.setRenderTarget !== 'function') {
      floatDepthReason = 'webgl2-depth-check-unavailable'
      return false
    }
    const gl = renderer.getContext()
    if (!gl || typeof gl.checkFramebufferStatus !== 'function' || gl.DEPTH_COMPONENT32F === undefined
      || gl.isContextLost?.()) {
      floatDepthReason = 'depth32f-check-unavailable'
      return false
    }
    // A tiny, zero-draw framebuffer check avoids committing an unsupported
    // depth format. It uses the beauty buffer's color type and no scene assets.
    const probe = new THREE.WebGLRenderTarget(1, 1, { type: buffer.texture.type,
      format: buffer.texture.format, depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType) })
    const previousTarget = renderer.getRenderTarget()
    const previousFace = renderer.getActiveCubeFace?.() ?? 0
    const previousMip = renderer.getActiveMipmapLevel?.() ?? 0
    try {
      renderer.setRenderTarget(probe)
      floatDepthSupport = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      floatDepthReason = floatDepthSupport ? null : 'depth32f-framebuffer-incomplete'
    } catch (error) {
      floatDepthSupport = false
      floatDepthReason = error.message || String(error)
    } finally {
      try { renderer.setRenderTarget(previousTarget, previousFace, previousMip) }
      finally { probe.dispose(); probe.depthTexture.dispose() }
    }
    return floatDepthSupport
  }
  function desiredDepthType(buffer) {
    // Reversing a fixed 24-bit depth buffer does not improve distant precision.
    // Float depth plus reverse Z preserves the source's thin ground layers.
    // Standard/log depth and stencil targets retain the existing format.
    return !depthBaseline && isReversedDepth() && !buffer.stencilBuffer && supportsFloatDepth(buffer)
      ? THREE.FloatType : THREE.UnsignedIntType
  }
  function syncOwnedDepth(buffer, record) {
    if (buffer.depthTexture !== record.texture || record.texture.type !== record.type) return
    const type = desiredDepthType(buffer)
    if (type === record.type) return
    record.texture.type = type; record.type = type
    buffer.dispose()
  }
  function ensureDepth(buffer) {
    if (!buffer || !pass.enabled) return
    if (!buffer.depthTexture) {
      const previousRecord = depthRecords.get(buffer)
      previousRecord?.texture.dispose()
      const texture = new THREE.DepthTexture(buffer.width, buffer.height, desiredDepthType(buffer))
      texture.name = '南京接触阴影场景深度'
      depthRecords.set(buffer, { texture, type: texture.type, depthBuffer: previousRecord?.depthBuffer ?? buffer.depthBuffer })
      buffer.depthBuffer = true
      buffer.depthTexture = texture
      buffer.dispose()
    } else if (depthRecords.has(buffer)) syncOwnedDepth(buffer, depthRecords.get(buffer))
  }
  function sceneRender(renderer, writeBuffer, readBuffer, ...args) {
    if (!disposed) ensureDepth(readBuffer)
    return originalRender.call(this, renderer, writeBuffer, readBuffer, ...args)
  }
  pass.render = (renderer, writeBuffer, readBuffer) => {
    const depth = readBuffer.depthTexture
    if (!depth || contactBaseline > 0) {
      const previousTarget = renderer.getRenderTarget()
      const previousFace = renderer.getActiveCubeFace?.() ?? 0
      const previousMip = renderer.getActiveMipmapLevel?.() ?? 0
      try {
        copyMaterial.uniforms.sceneColor.value = readBuffer.texture; quad.material = copyMaterial
        renderer.setRenderTarget(pass.renderToScreen ? null : writeBuffer); quad.render(renderer)
      } finally { renderer.setRenderTarget(previousTarget, previousFace, previousMip) }
      return
    }
    const camera = editor.camera
    const width = Math.max(1, Math.floor(readBuffer.width)), height = Math.max(1, Math.floor(readBuffer.height))
    const scale = Math.min(0.5, Math.sqrt(1_000_000 / (width * height)))
    target.setSize(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)))
    const lampTexture = lampDepth.render(camera, width, height)
    aoMaterial.uniforms.lampDepth.value = lampTexture || depth
    aoMaterial.uniforms.lampDepthEnabled.value = !!lampTexture
    const reversed = renderer.state?.buffers?.depth?.getReversed?.() ?? !!renderer.capabilities?.reversedDepthBuffer
    for (const material of [aoMaterial, compositeMaterial]) {
      material.uniforms.sceneDepth.value = depth
      material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse)
      material.uniforms.reversedDepth.value = reversed
      material.uniforms.radius.value = settings.radius
    }
    aoMaterial.uniforms.depthTexel.value.set(1 / width, 1 / height)
    aoMaterial.uniforms.projectionScale.value.set(camera.projectionMatrix.elements[0] * 0.5, camera.projectionMatrix.elements[5] * 0.5)
    aoMaterial.uniforms.orthographicCamera.value = !!camera.isOrthographicCamera
    compositeMaterial.uniforms.sceneColor.value = readBuffer.texture
    compositeMaterial.uniforms.contactTexel.value.set(1 / target.width, 1 / target.height)
    compositeMaterial.uniforms.strength.value = settings.strength
    const previousTarget = renderer.getRenderTarget()
    try {
      quad.material = aoMaterial; renderer.setRenderTarget(target); quad.render(renderer)
      quad.material = compositeMaterial; renderer.setRenderTarget(pass.renderToScreen ? null : writeBuffer); quad.render(renderer)
      renders++; lastBuffer = [target.width, target.height]
    } finally { renderer.setRenderTarget(previousTarget) }
  }
  function update(values = {}) {
    settings = { ...settings, ...values }
    settings = { enabled: settings.enabled !== false, strength: clamp(settings.strength, 0.22, 0, 0.5), radius: clamp(settings.radius, 0.3, 0.05, 1) }
    config.contactShadows = { ...settings }
    pass.enabled = !disposed && !unsupported && settings.enabled && settings.strength > 0
    options.onChange?.()
  }
  function getStatus() {
    const lamps = lampDepth.getStatus()
    return { ...settings, active: pass.enabled, unsupported, renders, drawingBuffer: lastBuffer,
      extraSceneDraws: pass.enabled && !contactBaseline ? lamps.extraSceneDraws : 0, screenPasses: contactBaseline ? 1 : 2,
      sampling: 'deterministic-horizon-contact', directions: 8, sampleRadii: [.08, .28, .75], contactBaseline: contactBaseline > 0,
      samplingBaseline: samplingBaseline > 0, depthReconstruction: samplingBaseline ? 'legacy-subpixel' : 'nearest-texel-centres',
      normalReconstruction: 'scale-invariant', screenRadiusCap: 40, lampDepth: lamps,
      depthPrecision: { reversed: isReversedDepth(), floatSupported: floatDepthSupport, fallback: floatDepthReason,
        baseline: depthBaseline > 0, buffers: [...depthRecords].filter(([buffer, record]) => buffer.depthTexture === record.texture)
          .map(([buffer, record]) => ({ width: buffer.width, height: buffer.height, type: record.texture.type,
            format: record.texture.type === THREE.FloatType ? 'DEPTH_COMPONENT32F' : 'DEPTH_COMPONENT24' })) } }
  }
  // Only our owned beauty depth attachments change during this comparison.
  // Source geometry, camera clips, fog and shadow settings remain untouched.
  function withDepthBaseline(callback) {
    if (typeof callback !== 'function') throw new TypeError('A depth comparison callback is required')
    if (disposed) return callback()
    depthBaseline++
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; depthBaseline--
      if (!disposed) for (const [buffer, record] of depthRecords) syncOwnedDepth(buffer, record)
    }
    try {
      for (const [buffer, record] of depthRecords) syncOwnedDepth(buffer, record)
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  // Keep the same scene render and owned Float32 depth while copying beauty
  // unchanged. This isolates contact AO from depth precision in a camera A/B.
  function withContactBaseline(callback) {
    if (typeof callback !== 'function') throw new TypeError('A contact comparison callback is required')
    if (disposed) return callback()
    contactBaseline++
    let finished = false
    const finish = () => { if (!finished) { finished = true; contactBaseline-- } }
    try {
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  // Compare only the reconstruction coordinates. AO strength, radius, depth
  // attachments, lamp depth draw and the number of render passes stay the same.
  function withSamplingBaseline(callback) {
    if (typeof callback !== 'function') throw new TypeError('A sampling comparison callback is required')
    if (disposed) return callback()
    samplingBaseline++
    aoMaterial.uniforms.texelCentreSampling.value = false
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; samplingBaseline--
      if (!disposed) aoMaterial.uniforms.texelCentreSampling.value = samplingBaseline === 0
    }
    try {
      const result = callback()
      if (result?.then) return Promise.resolve(result).finally(finish)
      finish(); return result
    } catch (error) { finish(); throw error }
  }
  function dispose() {
    if (disposed) return
    disposed = true; pass.enabled = false
    renderer.domElement?.removeEventListener?.('webglcontextrestored', resetDepthSupport)
    if (scenePass?.render === sceneRender) scenePass.render = originalRender
    const index = composer?.passes?.indexOf(pass) ?? -1
    if (index >= 0) composer.passes.splice(index, 1)
    for (const [buffer, record] of depthRecords) {
      if (buffer.depthTexture === record.texture) {
        buffer.depthTexture = null; buffer.depthBuffer = record.depthBuffer; buffer.dispose()
      }
      record.texture.dispose()
    }
    depthRecords.clear(); lampDepth.dispose(); target.dispose(); aoMaterial.dispose(); compositeMaterial.dispose(); copyMaterial.dispose(); quad.dispose()
  }
  if (scenePass && !unsupported) {
    scenePass.render = sceneRender
    composer.insertPass(pass, composer.passes.indexOf(scenePass) + 1)
    renderer.domElement?.addEventListener?.('webglcontextrestored', resetDepthSupport)
  }
  update()
  return { update, invalidate: () => lampDepth.invalidate(), withDepthBaseline, withContactBaseline, withSamplingBaseline, getStatus, dispose }
}
