// A client-side starting budget, not a GPU/chipset benchmark. Nothing in this
// module reads globals, edits materials, or writes project/local-storage data.
export const NANJING_MAC_RENDER_BUDGET = Object.freeze({
  maxPixels: 2_500_000, maxPixelRatio: 1.25, transmissionScale: 0.65,
})
export const NANJING_GPU_RENDER_BUDGETS = Object.freeze({
  discrete: Object.freeze({ maxPixels: 2_500_000, maxPixelRatio: 1.25, transmissionScale: 0.8 }),
  integrated: Object.freeze({ maxPixels: 1_500_000, maxPixelRatio: 1, transmissionScale: 0.65 }),
  apple: NANJING_MAC_RENDER_BUDGET,
  software: Object.freeze({ maxPixels: 650_000, maxPixelRatio: 0.75, transmissionScale: 0.5 }),
  unknown: Object.freeze({ maxPixels: 1_500_000, maxPixelRatio: 1, transmissionScale: 0.65 }),
})

/** Detect desktop macOS, including UA-CH where available, without guessing M4. */
export function isNanjingMacPlatform({ platform = '', userAgent = '', userAgentDataPlatform = '', maxTouchPoints = 0 } = {}) {
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints > 1)) return false
  const declaredPlatform = userAgentDataPlatform || platform
  return declaredPlatform ? /^mac/i.test(declaredPlatform) : /Macintosh|Mac OS X/i.test(userAgent)
}

/** Classify the active WebGL adapter, not other GPUs installed in the computer. */
export function classifyNanjingGpu(gpu = '', platformInfo = {}) {
  const renderer = typeof gpu === 'string' ? gpu.trim() : ''
  const isMac = isNanjingMacPlatform(platformInfo)
  const result = (gpuTier, gpuLabel, chipModel = null) => ({ gpuTier, gpuLabel, chipModel,
    adapterSource: renderer ? 'webgl-renderer' : isMac ? 'macos-platform-only' : 'unavailable' })
  if (/swiftshader|llvmpipe|softpipe|lavapipe|software\s*(?:rasterizer|renderer)|basic render driver|\bWARP\b/i.test(renderer)) {
    return result('software', '软件渲染器')
  }
  const apple = renderer.match(/\bApple\s+M(\d+)(?:\s+(Pro|Max|Ultra))?\b/i)
  if (apple) {
    const chip = `Apple M${apple[1]}${apple[2] ? ` ${apple[2][0].toUpperCase()}${apple[2].slice(1).toLowerCase()}` : ''}`
    return result('apple', chip, chip)
  }
  if (/\bApple\b/i.test(renderer)) return result('apple', 'Apple GPU（型号未公开）')
  const high = renderer.match(/\bRTX\s*(50[789]0)(?:\s*(Ti|SUPER))?\b/i)
  if (/\bNVIDIA\b|\bGeForce\b/i.test(renderer) && high) {
    return result('high-discrete', `NVIDIA GeForce RTX ${high[1]}${high[2] ? ` ${high[2]}` : ''}`)
  }
  // Arc 140V/130V and the anonymous "Intel Arc Graphics" can be integrated.
  // Only an explicit A/B-series dedicated model is classified as discrete.
  const arc = renderer.match(/\bArc\b(?:\s|\([^)]*\))*([AB]\d{3}M?)\b/i)
  if (/\bIntel\b/i.test(renderer) && arc) return result('discrete', `Intel Arc ${arc[1].toUpperCase()}`)
  if (/\bIntel\b|\bIris\b|\bUHD Graphics\b/i.test(renderer)) return result('integrated', 'Intel 集成显卡')
  if (/\bNVIDIA\b|\bGeForce\b|\bQuadro\b/i.test(renderer)) return result('discrete', 'NVIDIA 独立显卡')
  if (/\bRadeon\b.*\b(?:RX|Pro|WX)\b/i.test(renderer)) return result('discrete', 'AMD Radeon 独立显卡')
  if (/\bRadeon\b.*\b(?:[6789]\d{2}M|Vega\s+\d+)\b/i.test(renderer)) return result('integrated', 'AMD 集成显卡')
  return result('unknown', isMac ? 'macOS GPU（型号未公开）' : 'GPU 型号未公开')
}

const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback

/**
 * Return display settings only. `width`/`height` are CSS viewport dimensions;
 * `nativePixelRatio` includes the user's pixel-ratio scale. Balanced selects an
 * automatic starting budget. A supplied adaptivePixelRatio is a measured ratio
 * from the caller's frame-budget controller, clamped below the static ceiling.
 * Apply feedback at gesture boundaries, never resize repeatedly while orbiting.
 *
 * RTX 50 high-tier retains the proven native-still/adaptive-motion policy.
 * Other adapters use a stable moving/still ceiling. Unmasked Apple M1/M2/M3/M4
 * strings identify the chip; anonymous Apple GPU or macOS cannot identify it.
 * These are starting budgets: browser, core count, thermals and scene view still
 * require measured frame/CPU feedback, including where GPU timers are absent.
 *
 * Full, capture and baseline bypass every automatic budget. maxPixelError is
 * passed through unchanged; optical alpha/transmission materials are untouched.
 */
export function getNanjingDeviceProfile({
  platform = '', userAgent = '', userAgentDataPlatform = '', maxTouchPoints = 0,
  gpu = '', quality = 'balanced', nativePixelRatio = 1, width = 0, height = 0,
  interacting = false, motionPixelRatio, adaptivePixelRatio,
  capture = false, baseline = false, maxPixelError = 1.25,
} = {}) {
  const platformInfo = { platform, userAgent, userAgentDataPlatform, maxTouchPoints }
  const isMac = isNanjingMacPlatform(platformInfo)
  const adapter = classifyNanjingGpu(gpu, platformInfo)
  const selectedQuality = ['full', 'balanced', 'fast'].includes(quality) ? quality : 'balanced'
  const effectiveQuality = capture || baseline ? 'full' : selectedQuality
  const nativeRatio = positive(nativePixelRatio, 1)
  const cssWidth = positive(width, 0), cssHeight = positive(height, 0)
  const macFallback = adapter.gpuTier === 'unknown' && isMac
  const highTier = adapter.gpuTier === 'high-discrete'
  const budget = NANJING_GPU_RENDER_BUDGETS[macFallback ? 'apple' : adapter.gpuTier]
  let pixelRatio = nativeRatio, transmissionScale = 1, singlePass = false, pixelBudget = null
  let adaptationReason = '完整画质：保留原生分辨率与透射背景质量'

  if (effectiveQuality !== 'full') {
    if (highTier) {
      const limit = effectiveQuality === 'fast' ? 0.75 : interacting ? positive(motionPixelRatio, 1.25) : nativeRatio
      pixelRatio = Math.min(nativeRatio, limit)
      singlePass = effectiveQuality === 'fast' || !!interacting
      adaptationReason = 'RTX 50 高档：沿用已测的静止原生、交互自适应策略'
    } else {
      // The measured integrated GPU was already below .8 DPR in balanced mode.
      // A .75 cap barely changed its workload; fast must provide a distinct
      // interaction budget while full/capture and other GPU policies stay intact.
      const integratedFast = effectiveQuality === 'fast' && adapter.gpuTier === 'integrated'
      pixelBudget = integratedFast ? Math.min(budget.maxPixels, 750_000) : budget.maxPixels
      const viewportPixels = cssWidth * cssHeight
      const budgetRatio = viewportPixels > 0 ? Math.sqrt(pixelBudget / viewportPixels) : Infinity
      const fastRatio = integratedFast ? 0.55 : 0.75
      pixelRatio = Math.min(nativeRatio, budget.maxPixelRatio, effectiveQuality === 'fast' ? fastRatio : Infinity, budgetRatio)
      transmissionScale = budget.transmissionScale
      singlePass = true
      adaptationReason = adapter.gpuTier === 'apple' || macFallback
        ? `${adapter.chipModel || 'Mac/Apple 型号未公开'}：采用稳定像素预算，按实测帧时间继续调整`
        : adapter.gpuTier === 'unknown' ? 'GPU 信息受限：采用保守预算，等待实测反馈'
          : `${adapter.gpuLabel}：限制像素与透射背景负载，保持动静画质稳定`
    }
    if (effectiveQuality === 'fast') adaptationReason = `流畅画质：${adaptationReason}`
  }
  const maxPixelRatio = highTier && effectiveQuality === 'balanced' ? nativeRatio : pixelRatio
  if (effectiveQuality === 'balanced' && (!highTier || interacting) && Number.isFinite(adaptivePixelRatio) && adaptivePixelRatio > 0) {
    pixelRatio = Math.min(maxPixelRatio, adaptivePixelRatio)
    if (pixelRatio < maxPixelRatio) adaptationReason += '；已采用帧时间反馈调整分辨率'
  }

  // r184 transmissionResolutionScale scales BOTH dimensions of the opaque
  // background target; .65 gives .4225 of its pixels. It does not change glass
  // transmission/opacity, or reduce geometry. Fine transmitted detail may soften.
  // Leaf forceSinglePass retains alpha/depth/DoubleSide flags but can change the
  // blending of overlapping front/back cards. The caller applies it to foliage.
  return {
    profile: highTier ? 'default' : adapter.gpuTier === 'apple' || macFallback ? 'mac-conservative' : `${adapter.gpuTier}-conservative`,
    ...adapter, adaptationReason, quality: effectiveQuality, pixelRatio, maxPixelRatio, budgetPixelRatio: maxPixelRatio,
    minPixelRatio: Math.min(adapter.gpuTier === 'software' ? 0.35 : 0.5, maxPixelRatio),
    adaptive: effectiveQuality === 'balanced', transmissionScale, singlePass, maxPixelError, pixelBudget,
    drawingBuffer: [Math.floor(cssWidth * pixelRatio), Math.floor(cssHeight * pixelRatio)],
  }
}
