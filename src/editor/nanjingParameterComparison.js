// Explicit inspection only. Neither adapter calls a persistent update method.
// Both images pass through the ordinary editor renderer and its GPU audit.
const isResolution = size => Number.isInteger(size) && size >= 256 && size <= 8192 && (size & (size - 1)) === 0
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true }

function primaryShadow(editor, controller) {
  const status = controller?.getStatus?.()
  const selection = status?.shadowLightSelection
  const primaryName = selection?.primary?.name
  const matches = []
  editor.scene.traverse(object => {
    if (object.isDirectionalLight && object.name === primaryName && object.castShadow && visible(object)) matches.push(object)
  })
  if (!editor.renderer.shadowMap.enabled || !selection?.enabled || selection.activeDirectionalShadows !== 1 || matches.length !== 1) throw new Error('无法唯一定位当前主阴影光，未执行分辨率对比')
  return matches[0]
}

function shadowState(light) {
  const shadow = light.shadow, camera = shadow.camera
  return { name: light.name, mapSize: shadow.mapSize.toArray(),
    allocatedMapSize: shadow.map ? [shadow.map.width, shadow.map.height] : null,
    depthTextureType: shadow.map?.depthTexture?.type ?? null,
    worldTexel: (camera.right - camera.left) / shadow.mapSize.x,
    bias: shadow.bias, normalBias: shadow.normalBias, radius: shadow.radius,
    shadowIntensity: shadow.intensity, lightIntensity: light.intensity,
    camera: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, near: camera.near, far: camera.far } }
}

// Only synchronous captures are supported. Three allocates the temporary target
// on the next real shadow draw. Keep the original target alive for exact reuse;
// never resize or dispose a target owned by the editor or another nested capture.
export function withNanjingShadowResolution(editor, controller, size, callback) {
  if (!isResolution(size)) throw new RangeError('阴影对比尺寸须为 256–8192 的二次幂')
  const { renderer } = editor
  const maximum = renderer.capabilities?.maxTextureSize
  if (Number.isFinite(maximum) && maximum < size) throw new Error(`当前设备纹理上限 ${maximum}，不能真实对比 ${size} 阴影`)
  const light = primaryShadow(editor, controller), shadow = light.shadow
  const previous = { map: shadow.map, mapPass: shadow.mapPass, mapSize: shadow.mapSize.clone() }
  const replace = shadow.mapSize.x !== size || shadow.mapSize.y !== size
    || !shadow.map || shadow.map.width !== size || shadow.map.height !== size
  if (replace) { shadow.map = null; shadow.mapPass = null }
  shadow.mapSize.set(size, size)
  shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true
  try {
    const result = callback(light)
    if (result && typeof result.then === 'function') throw new TypeError('阴影图片对比必须同步完成')
    return result
  } finally {
    const temporary = new Set([shadow.map, shadow.mapPass])
    shadow.map = previous.map; shadow.mapPass = previous.mapPass; shadow.mapSize.copy(previous.mapSize)
    // A comparison can change camera-dependent caster LOD. The normal recovery
    // frame rebuilds the restored target at the restored camera, then re-caches it.
    shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true
    for (const target of temporary) if (target && target !== previous.map && target !== previous.mapPass) target.dispose()
  }
}

export function createNanjingParameterComparison(editor, shadows, view) {
  const resolution = view?.shadowResolutionComparison, diffuse = view?.a1DiffuseComparison
  if (resolution && diffuse) throw new Error('单次对比只能改变一个参数')
  const pair = resolution || diffuse
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)) throw new Error('缺少两组明确的对比参数')
  const results = { before: null, after: null }
  let capture
  if (resolution) {
    if (!pair.every(isResolution)) throw new RangeError('阴影对比尺寸无效')
    capture = (index, callback) => withNanjingShadowResolution(editor, shadows, pair[index], light => {
      const result = callback()
      const status = shadowState(light)
      if (!status.allocatedMapSize?.every(value => value === pair[index])) throw new Error(`阴影 ${pair[index]} 未实际分配，不能使用本次对照`)
      results[index ? 'after' : 'before'] = status
      return result
    })
  } else {
    if (!pair.every(value => value >= 0 && value <= 1) || !shadows?.a1GlassDaylight?.withDiffuseScale) throw new Error('最高楼分面受光对比不可用')
    capture = (index, callback) => shadows.a1GlassDaylight.withDiffuseScale(pair[index], () => {
      const result = callback()
      const status = shadows.a1GlassDaylight.getStatus()
      if (!status.found || !status.daylightActive || status.effectiveScale !== pair[index]) throw new Error('最高楼分面受光参数未实际启用')
      results[index ? 'after' : 'before'] = status
      return result
    })
  }
  return {
    pipeline: 'ordinary editor; explicit single-parameter pair; source configuration unchanged',
    withBaseline: callback => capture(0, callback),
    withCurrent: callback => capture(1, callback),
    getStatus: () => ({ parameter: resolution ? 'primary-shadow-resolution' : 'a1-direct-diffuse-scale',
      compared: pair.slice(), captures: results,
      current: resolution ? shadowState(primaryShadow(editor, shadows)) : shadows.a1GlassDaylight.getStatus(),
      sourceConfigChanged: false }),
  }
}

export const NANJING_PARAMETER_COMPARISON_VIEWS = [
  { name: 'A2 框架阴影 4096 / 8192', shadowResolutionComparison: [4096, 8192],
    position: [-10.5, 3.4, 15.5], target: [-.6, 1.2, 4.65], fov: 40 },
  { name: 'A3 A4 框架阴影 4096 / 8192', shadowResolutionComparison: [4096, 8192],
    position: [-14, 4, -10.5], target: [-3.8, 1, -2.7], fov: 40 },
  { name: '向光玻璃 .25 / .45', a1DiffuseComparison: [.25, .45],
    position: [.610, 5.174, -17.900], target: [4.4051602, 2.1735841, -1.3581647], fov: 50 },
  { name: '背光玻璃保持 .25 / .45', a1DiffuseComparison: [.25, .45],
    position: [8.200, 5.174, 15.183], target: [4.4051602, 2.1735841, -1.3581647], fov: 50 },
]
