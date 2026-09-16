// Bounded, explicit comparison diagnostics. Read the program immediately after
// the real draw (including private receiver materials), never after the frame.
const TARGETS = new Set(['建筑_深灰金属框', '建筑_格栅涂层', '远景_浅蓝水面', '建筑_屋面混凝土', '建筑_楼层混凝土', '建筑_屋顶设备涂层', '建筑_蓝灰玻璃', '远景_蓝色玻璃', '场地_浅色石材', '场地_蓝灰玻璃', '场地_混凝土面', '场地_绿化铺地', '远景_混凝土铺地'])
const UNIFORMS = ['nanjingContextTextureMeanRGB', 'diffuse', 'opacity', 'roughness', 'metalness', 'emissive', 'transmission', 'ior', 'specularIntensity',
  'envMapIntensity', 'toneMappingExposure', 'ambientLightColor', 'normalScale', 'mapTransform', 'normalMapTransform',
  'roughnessMapTransform', 'metalnessMapTransform', 'aoMapIntensity', 'lightMapIntensity',
  'directionalLights[0].color', 'directionalLights[1].color', 'directionalLights[2].color',
  'nanjingA1DaylightEnabled', 'nanjingA1DirectDiffuseScale', 'nanjingA1DaylightFaceA', 'nanjingA1DaylightFaceB', 'nanjingA1BaseColorScale', 'nanjingInternalRoadTextureStrength', 'nanjingInternalRoadWorldScale', 'nanjingContextTextureStrength', 'nanjingContextTextureWorldScale', 'nanjingContextTextureMean',
  'receiveShadow', 'directionalShadowMatrix[0]', 'directionalLightShadows[0].shadowMapSize', 'directionalLightShadows[0].shadowBias', 'directionalLightShadows[0].shadowNormalBias', 'directionalLightShadows[0].shadowIntensity', 'directionalLightShadows[0].shadowRadius',
  'nanjingReceiverPlaneEnabled', 'nanjingBuildingReceiverPlaneEnabled', 'nanjingReceiverPlaneMaxOffset', 'nanjingLayerExposure', 'nanjingLayerStrength', 'nanjingLayerReady']
const array = value => value?.toArray?.() ?? null

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'lightMap', 'envMap']
const textureInfo = texture => texture ? {
  id: texture.id, uuid: texture.uuid, name: texture.name, colorSpace: texture.colorSpace,
  channel: texture.channel, flipY: texture.flipY, type: texture.type, format: texture.format,
  imageSize: [texture.image?.width ?? null, texture.image?.height ?? null],
  repeat: array(texture.repeat), offset: array(texture.offset), matrix: array(texture.matrix)
} : null
const materialMaps = material => Object.fromEntries(MAP_SLOTS.map(name => [name, textureInfo(material[name])]))

const DEPTH_ENUM_NAMES = ['NONE', 'TEXTURE', 'RENDERBUFFER', 'FLOAT', 'UNSIGNED_INT',
  'UNSIGNED_NORMALIZED', 'SIGNED_NORMALIZED', 'DEPTH_COMPONENT16', 'DEPTH_COMPONENT24',
  'DEPTH_COMPONENT32F', 'DEPTH24_STENCIL8', 'DEPTH32F_STENCIL8']
const depthEnumName = (gl, value) => value == null ? null
  : DEPTH_ENUM_NAMES.find(name => gl[name] !== undefined && gl[name] === value) || `0x${value.toString(16)}`

// Read the DRAW framebuffer that just received the draw, including Three's
// private MSAA transmission target. A target's declared depthTexture alone does
// not establish the format of the actual attached renderbuffer. No framebuffer
// is rebound. Only the queried renderbuffer is temporarily selected, then the
// exact binding is restored; never consume GL errors or mutate texture storage.
function actualDepthAttachment(gl, id, framebuffer) {
  const result = { id, framebuffer: framebuffer ? 'offscreen' : 'default', depthBits: null, stencilBits: null }
  const get = name => gl[name] === undefined ? null : gl.getParameter(gl[name])
  try {
    result.depthBits = get('DEPTH_BITS')
    result.stencilBits = get('STENCIL_BITS')
    result.samples = get('SAMPLES')
    // Default framebuffer uses a different attachment namespace; the current
    // depth/stencil bit queries above suffice without driver-specific probing.
    if (!framebuffer || !gl.getFramebufferAttachmentParameter) return result
    const target = gl.DRAW_FRAMEBUFFER ?? gl.FRAMEBUFFER
    const attachment = gl.DEPTH_ATTACHMENT
    const query = name => gl[name] === undefined ? null
      : gl.getFramebufferAttachmentParameter(target, attachment, gl[name])
    const type = query('FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE')
    result.attachmentType = depthEnumName(gl, type)
    if (type == null || type === gl.NONE) return result
    const object = query('FRAMEBUFFER_ATTACHMENT_OBJECT_NAME')
    const componentType = query('FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE')
    result.componentType = depthEnumName(gl, componentType)
    result.attachmentDepthBits = query('FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE')
    result.attachmentStencilBits = query('FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE')
    if (type === gl.TEXTURE) {
      // WebGL has no texture-level internal-format getter. Component type and
      // attached bit sizes are direct evidence; do not label an inferred format
      // as if it had been queried from the texture.
      result.internalFormat = null
      result.internalFormatEvidence = 'texture-component-type-and-bit-sizes'
      result.textureLevel = query('FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL')
    } else if (type === gl.RENDERBUFFER && object && gl.bindRenderbuffer && gl.getRenderbufferParameter) {
      const previous = gl.getParameter(gl.RENDERBUFFER_BINDING)
      try {
        if (previous !== object) gl.bindRenderbuffer(gl.RENDERBUFFER, object)
        const bufferQuery = name => gl[name] === undefined ? null
          : gl.getRenderbufferParameter(gl.RENDERBUFFER, gl[name])
        const format = bufferQuery('RENDERBUFFER_INTERNAL_FORMAT')
        result.internalFormat = depthEnumName(gl, format)
        result.internalFormatValue = format
        result.internalFormatEvidence = 'renderbuffer-internal-format-query'
        result.renderbuffer = { width: bufferQuery('RENDERBUFFER_WIDTH'), height: bufferQuery('RENDERBUFFER_HEIGHT'),
          samples: bufferQuery('RENDERBUFFER_SAMPLES'), depthBits: bufferQuery('RENDERBUFFER_DEPTH_SIZE'),
          stencilBits: bufferQuery('RENDERBUFFER_STENCIL_SIZE') }
      } finally {
        if (previous !== object) gl.bindRenderbuffer(gl.RENDERBUFFER, previous)
      }
    }
  } catch (error) { result.error = String(error.message || error) }
  return result
}

function programFeatures(gl, program) {
  if (!gl.getAttachedShaders || !gl.getShaderSource || !gl.getShaderParameter) return null
  const result = []
  for (const shader of gl.getAttachedShaders(program) || []) {
    const source = gl.getShaderSource(shader) || ''
    const defines = source.split('\n').filter(line => /^\s*#define\s+(?:USE_(?:MAP|NORMALMAP(?:_TANGENTSPACE|_OBJECTSPACE)?|ROUGHNESSMAP|METALNESSMAP|EMISSIVEMAP|AOMAP|LIGHTMAP|ENVMAP|TRANSMISSION|COLOR(?:_ALPHA)?|TANGENT)|(?:MAP|NORMALMAP|ROUGHNESSMAP|METALNESSMAP|EMISSIVEMAP|AOMAP|LIGHTMAP)_UV|TONE_MAPPING|(?:NUM_DIR_LIGHTS|NUM_RECT_AREA_LIGHTS)|ENVMAP_TYPE_CUBE_UV)(?:\s|$)/.test(line)).slice(0,32)
    result.push({ stage: gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER ? 'fragment' : 'vertex', defines,
      outputConvertsToSRGB: /vec4 linearToOutputTexel\s*\([^)]*\)\s*\{\s*return sRGBTransferOETF/.test(source) })
  }
  return result
}

// Inspect each sampler immediately after its actual draw. Temporarily selecting
// a texture unit does not bind or upload textures. Restore the exact GL active
// unit so Three's cached active-unit state remains valid for the next draw.
function samplerBindings(gl, program, material, renderer) {
  if (!gl.activeTexture || gl.ACTIVE_TEXTURE === undefined || gl.TEXTURE0 === undefined || gl.TEXTURE_BINDING_2D === undefined) return null
  const previous = gl.getParameter(gl.ACTIVE_TEXTURE), result = {}
  if (!Number.isInteger(previous)) return null
  try {
    for (const name of MAP_SLOTS) {
      const location = gl.getUniformLocation(program, name)
      if (location === null) { result[name] = { active: false }; continue }
      const unit = gl.getUniform(program, location)
      if (!Number.isInteger(unit) || unit < 0 || unit >= 64) { result[name] = { active: true, error: 'invalid sampler unit' }; continue }
      gl.activeTexture(gl.TEXTURE0 + unit)
      const bound = gl.getParameter(gl.TEXTURE_BINDING_2D)
      const sourceTexture = material[name]
      const expected = sourceTexture ? renderer.properties?.get(sourceTexture)?.__webglTexture : null
      result[name] = { active: true, unit, bound2D: !!bound,
        matchesMaterialTexture: expected ? bound === expected : null,
        // PMREM is derived from the original environment resource; its GPU
        // binding need not equal sourceTexture.__webglTexture.
        derivedEnvironment: name === 'envMap' }
    }
  } finally { gl.activeTexture(previous) }
  return result
}

export function auditNanjingDrawColors(editor, draw) {
  const { renderer, scene } = editor
  const report = { sourceMaterials: [], lights: [], renderer: {
    exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping,
    environmentIntensity: scene?.environmentIntensity, outputColorSpace: renderer.outputColorSpace,
    enabledPasses: editor.effectComposer?.passes?.filter(pass => pass.enabled).map(pass => ({ name: pass.name || pass.constructor?.name, outputPass: !!pass.isOutputPass, renderToScreen: !!pass.renderToScreen })) }, depthAttachments: [], samples: [], errors: [] }
  const materials = new Set()
  scene?.traverse?.(object => {
    if (object.isLight) report.lights.push({ name: object.name, type: object.type,
      intensity: object.intensity, rgb: array(object.color)?.map(value => value * object.intensity) })
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || !TARGETS.has(material.name) || materials.has(material)) continue
      materials.add(material)
      report.sourceMaterials.push({ name: material.name, id: material.id, color: array(material.color), maps: materialMaps(material) })
    }
  })
  const original = renderer.renderBufferDirect
  const descriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect')
  let gl
  try { gl = renderer.getContext?.() } catch (error) { report.errors.push(String(error.message || error)) }
  if (typeof original !== 'function' || !gl?.getUniform || !gl?.getParameter || !gl?.getUniformLocation) {
    report.unsupported = '当前渲染器不可读取实际绘制 uniform'
    draw()
    return report
  }
  let active = true
  const seen = new Set(), targets = new Map(), featureCache = new Map(), depthFrames = new Map()
  function wrapped(camera, drawScene, geometry, material, object, group) {
    const callsBefore = renderer.info?.render?.calls
    const result = original.apply(this, arguments)
    if (!active || drawScene !== scene || !TARGETS.has(material?.name) || report.samples.length >= 96
      || (Number.isFinite(callsBefore) && renderer.info.render.calls === callsBefore)) return result
    try {
      const target = renderer.getRenderTarget?.() ?? null
      if (!targets.has(target)) targets.set(target, targets.size)
      const framebufferBinding = gl.DRAW_FRAMEBUFFER_BINDING ?? gl.FRAMEBUFFER_BINDING
      const framebuffer = framebufferBinding === undefined ? null : gl.getParameter(framebufferBinding)
      if (!depthFrames.has(framebuffer)) {
        const depth = actualDepthAttachment(gl, depthFrames.size, framebuffer)
        depthFrames.set(framebuffer, depth)
        report.depthAttachments.push(depth)
      }
      const depth = depthFrames.get(framebuffer)
      const program = gl.getParameter(gl.CURRENT_PROGRAM)
      if (!program) return result
      const knownProgram = renderer.info?.programs?.find(entry => entry.program === program)
      const key = `${material.id}/${object?.name}/${targets.get(target)}/${depth.id}/${material.side}/${knownProgram?.id}`
      if (seen.has(key)) return result
      seen.add(key)
      const values = {}
      for (const name of UNIFORMS) {
        const location = gl.getUniformLocation(program, name)
        if (location === null) continue
        const value = gl.getUniform(program, location)
        values[name] = ArrayBuffer.isView(value) ? Array.from(value) : value
      }
      if (!featureCache.has(program)) featureCache.set(program, programFeatures(gl, program))
      const maps = materialMaps(material), samplers = samplerBindings(gl, program, material, renderer)
      report.samples.push({ material: material.name, sourceId: material.id, sourceColor: array(material.color),
        object: object?.name, side: material.side, programId: knownProgram?.id ?? null,
        target: target ? { id: targets.get(target), name: target.texture?.name || '', width: target.width, height: target.height, colorSpace: target.texture?.colorSpace, type: target.texture?.type,
          declaredDepth: { depthBuffer: target.depthBuffer, stencilBuffer: target.stencilBuffer, samples: target.samples,
            textureType: target.depthTexture?.type ?? null, textureFormat: target.depthTexture?.format ?? null } }
          : { id: targets.get(target), name: 'canvas', width: renderer.domElement?.width, height: renderer.domElement?.height },
        actualDepth: depth,
        camera: array(camera?.position), cameraAspect: camera?.aspect, exposure: renderer.toneMappingExposure,
        toneMapping: renderer.toneMapping, uniforms: values, maps, samplers, programFeatures: featureCache.get(program) })
    } catch (error) {
      if (report.errors.length < 4) report.errors.push(String(error.message || error))
    }
    return result
  }
  renderer.renderBufferDirect = wrapped
  try { draw() } finally {
    active = false
    // Preserve a later external hook; this wrapper becomes a transparent link.
    if (renderer.renderBufferDirect === wrapped) {
      if (descriptor) Object.defineProperty(renderer, 'renderBufferDirect', descriptor)
      else delete renderer.renderBufferDirect
    }
  }
  return report
}
