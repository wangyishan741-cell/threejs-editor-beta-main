import * as THREE from 'three'
import { NANJING_SHADOW_LAYER_GLSL } from './nanjingShadowLayers.js'

const width = 20
const points = [
  { name: '门牌草坪树092叶冠', position: [6.6158403017153695, -2.0282564982771873, 1.9028786931151283], normal: [0, 1, 0] },
  { name: '门牌草坪树095叶冠', position: [7.029308440375674, -2.0282564982771873, 1.9069072928039383], normal: [0, 1, 0] },
  { name: '树037下方园区草地', position: [5.8, -2.0282564982771873, 5.45], normal: [0, 1, 0] },
  { name: '树037旁园区草地', position: [5.7, -2.0282564982771873, 5.7], normal: [0, 1, 0] },
  { name: '树037叶冠与主楼（不含枝干）', position: [6.52528267983, -2.032152857, 6.80022882095], normal: [0, 1, 0] },
  { name: '树037树干与主楼（异类叠加）', position: [6.305648692, -2.030152857, 5.859617399], normal: [0, 1, 0] },
  { name: '树085与树031（同类不叠加）', position: [5.628803481, -2.030152857, 6.827228969], normal: [0, 1, 0] },
  { name: '树037与主楼', position: [6.515, -2.033, 6.572], normal: [0, 1, 0] },
  { name: 'A2与A3', position: [-2.75, -2.032, 5.65], normal: [0, 1, 0] },
  { name: '双近景区块', position: [-9.75, -2.226, 19.3], normal: [0, 1, 0] },
  { name: 'A2外框', position: [-2.9614, -1.5177, 2.8111], normal: [-.847, 0, -.53] }
]

// RGB stores a normalized number with 24-bit resolution. This diagnostic does
// not require EXT_color_buffer_float and never reads a comparison texture as a
// non-comparison sampler. Marker pixel 0 also detects a failed GPU draw/link.
const fragment = /* glsl */`
  uniform vec3 inspectionPoint, inspectionNormal;
  uniform float inspectionMainBias, inspectionMainNormalBias;
  uniform mat4 inspectionMainMatrix;
  #ifdef INSPECTION_MAIN_SHADOW
    uniform sampler2DShadow inspectionMainDepth;
  #endif
  ${NANJING_SHADOW_LAYER_GLSL.replaceAll('NUM_DIR_LIGHT_SHADOWS', '1')}
  vec3 inspectionClassTap( vec2 uv, float z ) {
    float high = nanjingLayerCompare( texture2D( nanjingLayerHighDepth, uv ).r, z );
    float low = nanjingLayerCompare( texture2D( nanjingLayerLowDepth, uv ).r, z );
    return vec3( high, low, high * low );
  }
  vec3 inspectionClassOcclusion( vec3 p ) {
    vec2 pixel = p.xy / nanjingLayerTexel - 0.5;
    vec2 base = ( floor( pixel ) + 0.5 ) * nanjingLayerTexel;
    vec2 weight = fract( pixel );
    vec3 a = inspectionClassTap( base, p.z );
    vec3 b = inspectionClassTap( base + vec2( nanjingLayerTexel.x, 0.0 ), p.z );
    vec3 c = inspectionClassTap( base + vec2( 0.0, nanjingLayerTexel.y ), p.z );
    vec3 d = inspectionClassTap( base + nanjingLayerTexel, p.z );
    return mix( mix( a, b, weight.x ), mix( c, d, weight.x ), weight.y );
  }
  vec4 inspectionPack( float v ) {
    // No +0.5: float32 rounds 16777215.0 + 0.5 up to 16777216,
    // which would corrupt the important clear-depth value exactly equal to 1.
    float n = floor( clamp( v, 0.0, 1.0 ) * 16777215.0 );
    return vec4( mod( n, 256.0 ), mod( floor( n / 256.0 ), 256.0 ), floor( n / 65536.0 ), 255.0 ) / 255.0;
  }
  void main() {
    int column = int( floor( gl_FragCoord.x ) );
    if ( column == 0 ) { gl_FragColor = vec4( 17.0, 93.0, 201.0, 255.0 ) / 255.0; return; }
    vec4 projected = nanjingLayerMatrix * vec4( inspectionPoint + inspectionNormal * 0.01, 1.0 );
    vec3 p = projected.xyz / projected.w;
    bool inLayer = projected.w > 0.0 && all( greaterThanEqual( p, vec3( 0.0 ) ) ) && all( lessThanEqual( p, vec3( 1.0 ) ) );
    vec4 mainProjected = inspectionMainMatrix * vec4( inspectionPoint + inspectionNormal * inspectionMainNormalBias, 1.0 );
    vec3 m = mainProjected.xyz / mainProjected.w;
    float value = 0.0;
    if ( column == 1 ) value = texture2D( nanjingLayerHighDepth, p.xy ).r;
    if ( column == 2 ) value = texture2D( nanjingLayerLowDepth, p.xy ).r;
    if ( column >= 3 && column <= 5 && inLayer ) {
      // Intersect the two classes at each texel BEFORE filtering. Multiplying
      // filtered coverage would invent overlap along adjacent shadow edges.
      vec3 coverage = inspectionClassOcclusion( p );
      value = column == 3 ? coverage.x : ( column == 4 ? coverage.y : coverage.z );
    }
    if ( column == 6 ) value = p.x;
    if ( column == 7 ) value = p.y;
    if ( column == 8 ) value = p.z;
    if ( column == 9 || column == 10 ) {
      vec2 overlap = nanjingOverlapOcclusion( inspectionPoint, inspectionNormal, 0.0 );
      value = column == 9 ? overlap.x : overlap.y;
    }
    if ( column == 11 ) {
      #ifdef INSPECTION_MAIN_SHADOW
        value = texture( inspectionMainDepth, vec3( m.xy, m.z + inspectionMainBias ) );
      #endif
    }
    if ( column == 12 ) value = m.x;
    if ( column == 13 ) value = m.y;
    if ( column == 14 ) value = m.z;
    if ( column == 15 ) value = nanjingLayerReady;
    if ( column == 16 ) value = float( inLayer );
    if ( column == 17 ) value = m.z + inspectionMainBias;
    if ( column == 18 ) value = float( mainProjected.w > 0.0 && all( greaterThanEqual( m.xy, vec2( 0.0 ) ) ) && all( lessThanEqual( m.xy, vec2( 1.0 ) ) ) && m.z + inspectionMainBias <= 1.0 );
    if ( column == 19 ) value = nanjingLayerReversed ? 1.0 : 0.0;
    gl_FragColor = inspectionPack( value );
  }
`

export function inspectNanjingShadowLayers(editor, layers, primaryLight) {
  const renderer = editor?.renderer, uniforms = layers?.uniforms
  const report = { ok: false, source: 'GPU RGBA8 readback, 24-bit scalar encoding', points: [], errors: [] }
  if (!renderer?.readRenderTargetPixels || !renderer.render || !uniforms?.nanjingLayerHighDepth?.value || !uniforms?.nanjingLayerLowDepth?.value) {
    report.errors.push('当前渲染器或高低分类阴影缓存不支持 GPU 回读')
    return report
  }
  let saved, target, geometry, material, errorHook
  try {
    saved = {
      target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace?.() || 0, mip: renderer.getActiveMipmapLevel?.() || 0,
      clearColor: renderer.getClearColor(new THREE.Color()).clone(), clearAlpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear, xr: renderer.xr?.enabled,
      shadowEnabled: renderer.shadowMap.enabled, shadowAuto: renderer.shadowMap.autoUpdate, shadowDirty: renderer.shadowMap.needsUpdate,
      shaderError: renderer.debug?.onShaderError
    }
    const mainTexture = primaryLight?.shadow?.map?.depthTexture
    const mainSupported = !!mainTexture && mainTexture.compareFunction !== null && mainTexture.compareFunction !== undefined
    report.primaryLight = primaryLight?.name ?? null
    report.mainShadow = { supported: mainSupported, compareFunction: mainTexture?.compareFunction ?? null,
      bias: primaryLight?.shadow?.bias ?? 0, normalBias: primaryLight?.shadow?.normalBias ?? 0,
      note: '主图值为真实硬件单次 PCF 比较，未乘 shadow.intensity，也未使用屏幕 Vogel 采样与地面斜率补偿' }
    report.layers = { ready: uniforms.nanjingLayerReady.value, reversed: uniforms.nanjingLayerReversed.value,
      strength: uniforms.nanjingLayerStrength.value, bias: uniforms.nanjingLayerBias.value,
      exposure: uniforms.nanjingLayerExposure?.value ?? null,
      note: '高、低图使用相同投影和 0.01 法线偏移；各类遮挡与交集均先逐纹素比较再双线性过滤。零值或部分覆盖是有效结果，GPU 成功仅按标记和编译错误判断。' }
    target = new THREE.WebGLRenderTarget(width, 1, { depthBuffer: false, stencilBuffer: false, samples: 0,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat })
    target.texture.colorSpace = THREE.NoColorSpace
    target.texture.name = '独立阴影 GPU 检查数值'
    geometry = new THREE.PlaneGeometry(2, 2)
    const inspectionUniforms = { ...uniforms,
      inspectionPoint: { value: new THREE.Vector3() }, inspectionNormal: { value: new THREE.Vector3() },
      inspectionMainDepth: { value: mainTexture ?? null }, inspectionMainMatrix: { value: primaryLight?.shadow?.matrix?.clone() ?? new THREE.Matrix4() },
      inspectionMainBias: { value: primaryLight?.shadow?.bias ?? 0 }, inspectionMainNormalBias: { value: primaryLight?.shadow?.normalBias ?? 0 }
    }
    material = new THREE.ShaderMaterial({
      uniforms: inspectionUniforms, defines: { USE_SHADOWMAP: '', SHADOWMAP_TYPE_PCF: '', ...(mainSupported ? { INSPECTION_MAIN_SHADOW: '' } : {}) },
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }', fragmentShader: fragment,
      depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending, toneMapped: false
    })
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10), quad = new THREE.Mesh(geometry, material)
    scene.name = '独立阴影 GPU 检查'; quad.frustumCulled = false; scene.add(quad)
    if (renderer.debug) {
      errorHook = (gl, program, vertex, frag) => {
        report.errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(frag)].filter(Boolean).join('\n').slice(0, 3000))
        saved.shaderError?.call(renderer.debug, gl, program, vertex, frag)
      }
      renderer.debug.onShaderError = errorHook
    }
    renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false
    if (renderer.xr) renderer.xr.enabled = false
    renderer.autoClear = false; renderer.setClearColor(0x000000, 0)
    const pixels = new Uint8Array(width * 4)
    const integer = column => pixels[column * 4] + pixels[column * 4 + 1] * 256 + pixels[column * 4 + 2] * 65536
    const scalar = column => integer(column) / 16777215
    for (const point of points) {
      inspectionUniforms.inspectionPoint.value.fromArray(point.position)
      inspectionUniforms.inspectionNormal.value.fromArray(point.normal).normalize()
      // The target owns a physical 20 x 1 viewport/scissor. Canvas APIs here
      // would multiply those dimensions by the renderer's pixel ratio.
      renderer.setRenderTarget(target)
      renderer.clear(true, false, false); renderer.render(scene, camera)
      pixels.fill(0); renderer.readRenderTargetPixels(target, 0, 0, width, 1, pixels)
      const marker = [...pixels.slice(0, 4)], drawn = marker.join(',') === '17,93,201,255'
      const projected = inspectionUniforms.inspectionPoint.value.clone().addScaledVector(inspectionUniforms.inspectionNormal.value, .01).applyMatrix4(uniforms.nanjingLayerMatrix.value)
      const mainProjected = inspectionUniforms.inspectionPoint.value.clone().addScaledVector(inspectionUniforms.inspectionNormal.value, inspectionUniforms.inspectionMainNormalBias.value).applyMatrix4(inspectionUniforms.inspectionMainMatrix.value)
      report.points.push({ name: point.name, position: point.position, normal: inspectionUniforms.inspectionNormal.value.toArray(),
        drawn, marker, highDepth: scalar(1), lowDepth: scalar(2),
        highOcclusion: scalar(3), lowOcclusion: scalar(4), intersection: scalar(5),
        gpuProjected: [scalar(6), scalar(7), scalar(8)], cpuProjected: projected.toArray(),
        overlap: [scalar(9), scalar(10)], mainRawVisibility: mainSupported ? scalar(11) : null,
        mainGpuProjected: mainSupported ? [scalar(12), scalar(13), scalar(14)] : null,
        mainCpuProjected: mainSupported ? mainProjected.toArray() : null,
        layerReady: scalar(15), layerInFrustum: scalar(16) > .5, mainComparisonZ: mainSupported ? scalar(17) : null,
        mainInFrustum: mainSupported ? scalar(18) > .5 : null, gpuReversed: scalar(19) > .5 })
      if (!drawn) report.errors.push(`${point.name}：GPU 成功标记不匹配，结果不可作为阴影证据`)
    }
    report.ok = report.errors.length === 0 && report.points.every(point => point.drawn)
  } catch (error) {
    report.errors.push(error?.message || String(error))
  } finally {
    if (saved) {
      // A restoration failure must not leave later independent state (notably
      // the shader-error callback or render target) in inspection mode.
      const restore = action => {
        try { action() }
        catch (error) { report.ok = false; report.errors.push('恢复检查前渲染状态失败：' + (error?.message || error)) }
      }
      restore(() => {
        renderer.autoClear = saved.autoClear
        if (renderer.xr) renderer.xr.enabled = saved.xr
        renderer.shadowMap.enabled = saved.shadowEnabled; renderer.shadowMap.autoUpdate = saved.shadowAuto; renderer.shadowMap.needsUpdate = saved.shadowDirty
      })
      restore(() => renderer.setClearColor(saved.clearColor, saved.clearAlpha))
      restore(() => renderer.setRenderTarget(saved.target, saved.face, saved.mip))
      restore(() => {
        if (renderer.debug && renderer.debug.onShaderError === errorHook) renderer.debug.onShaderError = saved.shaderError
      })
    }
    geometry?.dispose(); material?.dispose(); target?.dispose()
  }
  return report
}
