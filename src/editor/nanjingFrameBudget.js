const percentile = (values, p) => values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null
const positive = value => Number.isFinite(value) && value > 0
const clock = () => globalThis.performance?.now() ?? Date.now()
const sameRatio = (a, b) => Math.abs(a - b) < 0.0001

// Platform-independent measurements only. The caller applies ratios at gesture
// boundaries and bypasses this controller for full quality / native captures.
export function createNanjingFrameBudget(options = {}) {
  const targetFrameMs = options.targetFrameMs ?? 1000 / 60
  const cpuCeilingMs = options.cpuCeilingMs ?? 14
  const sampleCount = Math.max(45, Math.round(options.sampleCount ?? 45))
  const ratioStep = options.ratioStep ?? 0.125
  const responseWindows = Math.max(2, Math.round(options.responseWindows ?? 2))
  const historyMaxAgeMs = Math.max(1000, options.historyMaxAgeMs ?? 30_000)
  const readClock = typeof options.now === 'function' ? options.now : clock
  let minRatio = options.minRatio ?? 0.5
  let maxRatio = Math.max(minRatio, options.maxRatio ?? 1.25)
  const clamp = value => Math.max(minRatio, Math.min(maxRatio, value))
  let ratio = clamp(options.initialRatio ?? 1), nextRatio = ratio
  let active = false, previousTime = null, lastGpuSampleId = null
  let samples = [], slowWindows = 0, fastWindows = 0, planned = false
  let lastWindow = null, lastReset = 'initial', trial = null, pixelInsensitive = false, lastResponse = null
  let historyStartedAt = null, lastSampleAt = null
  const counts = { observations: 0, validSamples: 0, windows: 0, decreases: 0, increases: 0, restoredDecreases: 0, expiredHistories: 0 }

  function resetSamples(reason = 'reset') {
    samples = []; previousTime = null; historyStartedAt = null
    slowWindows = 0; fastWindows = 0
    if (trial) trial.windows = []
    lastReset = reason
  }

  // Explicit scene/viewport/workload changes can make an earlier pixel response
  // irrelevant. Ordinary gesture/idle timing pauses use resetTiming instead.
  function resetAdaptation(reason = 'workload-change') {
    trial = null; pixelInsensitive = false; lastResponse = null
    nextRatio = ratio; planned = false
    resetSamples(reason)
    lastWindow = null
  }

  function expireHistory(now) {
    const dates = [historyStartedAt, trial?.createdAt].filter(Number.isFinite)
    if (dates.some(start => now < start || now - start > historyMaxAgeMs)) {
      // An ongoing unchanged workload must not repeatedly retry an ineffective
      // blur every time its raw timing window ages out. A genuinely stale pause
      // or an explicit workload invalidation does unlock that response history.
      const keepResponse = pixelInsensitive && lastSampleAt !== null && now >= lastSampleAt && now - lastSampleAt <= historyMaxAgeMs
      const response = lastResponse
      resetAdaptation('expired')
      if (keepResponse) { pixelInsensitive = true; lastResponse = response }
      counts.expiredHistories++
    }
  }

  // Idle frames and gesture boundaries break frame-time continuity, not the
  // evidence collected at this DPR. The caller invalidates real workload changes
  // with resetSamples/resetAdaptation instead. Do not recount a stale GPU query.
  function resetTiming(reason = 'pause') {
    expireHistory(readClock())
    previousTime = null
    lastReset = reason
  }

  function beginGesture(bounds = {}) {
    expireHistory(readClock())
    const previousMin = minRatio, previousMax = maxRatio
    if (Number.isFinite(bounds.minRatio)) minRatio = Math.max(0.1, bounds.minRatio)
    if (Number.isFinite(bounds.maxRatio)) maxRatio = Math.max(minRatio, bounds.maxRatio)
    else maxRatio = Math.max(minRatio, maxRatio)
    const boundsChanged = !sameRatio(minRatio, previousMin) || !sameRatio(maxRatio, previousMax)
    if (boundsChanged) {
      trial = null; pixelInsensitive = false; lastResponse = null
      nextRatio = clamp(nextRatio)
    }
    const newRatio = clamp(positive(bounds.ratio) ? bounds.ratio : nextRatio)
    if (boundsChanged || !sameRatio(ratio, newRatio)) resetSamples(boundsChanged ? 'bounds-change' : 'ratio-change')
    ratio = newRatio
    if (trial && !sameRatio(ratio, trial.toRatio)) trial = null
    if (trial) trial.applied = true
    nextRatio = ratio; active = true; planned = false
    resetTiming('gesture-start')
    return ratio
  }

  function endGesture() { active = false; resetTiming('gesture-end'); return nextRatio }

  function compareResponse(window) {
    if (!trial?.applied) return null
    trial.windows.push(window)
    if (trial.windows.length < responseWindows) return 'measuring'
    const useGpu = positive(trial.baseline.gpuP75Ms) && trial.windows.every(item => positive(item.gpuP75Ms))
    const key = useGpu ? 'gpuP75Ms' : 'frameP75Ms'
    const before = trial.baseline[key]
    const after = trial.windows.reduce((sum, item) => sum + item[key], 0) / trial.windows.length
    const expectedPixelReduction = 1 - (trial.toRatio / trial.fromRatio) ** 2
    const requiredImprovement = Math.max(0.05, Math.min(0.10, expectedPixelReduction * 0.25))
    const improvement = (before - after) / before
    lastResponse = { source: useGpu ? 'gpu' : 'frame', beforeMs: before, afterMs: after,
      fromRatio: trial.fromRatio, toRatio: trial.toRatio, improvement, requiredImprovement,
      useful: improvement >= requiredImprovement }
    if (!lastResponse.useful) {
      // A lower DPR did not help this measured workload. Recover its detail on
      // the next gesture instead of degrading indefinitely on geometry/CPU work.
      nextRatio = clamp(trial.fromRatio)
      pixelInsensitive = true; planned = true; counts.restoredDecreases++
      trial = null
      return 'restore'
    }
    trial = null
    return 'useful'
  }

  function observe(input = {}) {
    counts.observations++
    const now = Number.isFinite(input.now) ? input.now : readClock()
    expireHistory(now)
    const invalid = input.quality && input.quality !== 'balanced' ? 'quality-bypass'
      : input.visible === false ? 'hidden'
        : input.resized ? 'resize'
          : input.rebuildingShadows ? 'shadows' : input.reset ? 'explicit' : null
    if (invalid) { resetAdaptation(invalid); return null }
    if (!active || input.interacting === false || input.rendered === false) {
      previousTime = null; lastReset = active ? 'idle' : 'inactive'; return null
    }
    const frameMs = input.frameMs ?? (previousTime === null ? null : now - previousTime)
    previousTime = now
    // Profiler.resetFrameTiming deliberately emits a null first interval after
    // every pause/resize. Skip that warmup frame without erasing earlier drags.
    if (frameMs === null) return null
    if (!positive(frameMs) || frameMs > 1000 || !Number.isFinite(input.cpuMs) || input.cpuMs < 0) {
      resetSamples('discontinuous'); previousTime = now; return null
    }
    const age = input.gpuRecordedAt === undefined ? 0 : now - input.gpuRecordedAt
    const freshGpu = positive(input.gpuMs) && age >= -1 && age <= 1000
      && (input.gpuSampleId === undefined || input.gpuSampleId !== lastGpuSampleId)
    if (freshGpu && input.gpuSampleId !== undefined) lastGpuSampleId = input.gpuSampleId
    historyStartedAt ??= now
    lastSampleAt = now
    samples.push({ frameMs, cpuMs: input.cpuMs, gpuMs: freshGpu ? input.gpuMs : null })
    counts.validSamples++
    if (samples.length < sampleCount) return null
    const frames = samples.map(sample => sample.frameMs), cpus = samples.map(sample => sample.cpuMs)
    const gpus = samples.map(sample => sample.gpuMs).filter(positive)
    const gpuAvailable = gpus.length >= Math.ceil(sampleCount / 2)
    const frameP75Ms = percentile(frames, 0.75), frameP90Ms = percentile(frames, 0.9)
    const cpuP75Ms = percentile(cpus, 0.75), gpuP75Ms = gpuAvailable ? percentile(gpus, 0.75) : null
    const slow = frameP75Ms > targetFrameMs * 1.3 || frameP90Ms > targetFrameMs * 1.8
      || gpuAvailable && gpuP75Ms > targetFrameMs * 0.95 && frameP90Ms > targetFrameMs * 1.15
    const cpuBound = gpuAvailable && cpuP75Ms > cpuCeilingMs && cpuP75Ms > gpuP75Ms * 1.25
    const gpuPressure = gpuAvailable && gpuP75Ms > targetFrameMs * 0.8
    const bottleneck = cpuBound ? 'cpu'
      : gpuPressure ? cpuP75Ms > cpuCeilingMs ? 'mixed' : 'gpu'
        : gpuAvailable ? slow ? 'frame-or-scheduler' : 'within-budget'
          : cpuP75Ms > cpuCeilingMs ? 'cpu-or-driver-unmeasured' : 'unmeasured'
    // Missing GPU timers still permit one measured trial for Safari/Mac, but
    // known low GPU time + high CPU time is not treated as a pixel bottleneck.
    const canDecrease = slow && !cpuBound && (!gpuAvailable || gpuPressure)
    const fast = frameP90Ms <= targetFrameMs * 1.08 && cpuP75Ms <= cpuCeilingMs
      && (gpuAvailable ? gpuP75Ms <= targetFrameMs * 0.65 : cpuP75Ms <= Math.min(cpuCeilingMs, targetFrameMs * 0.66))
    slowWindows = canDecrease ? slowWindows + 1 : 0
    fastWindows = !slow && fast ? fastWindows + 1 : 0
    const window = { source: gpuAvailable ? 'gpu-frame-cpu' : 'frame-cpu', samples: samples.length,
      gpuSamples: gpus.length, frameP75Ms, frameP90Ms, cpuP75Ms, gpuP75Ms, bottleneck }
    const response = !planned ? compareResponse(window) : null
    let decision = response === 'restore' ? 'restore' : cpuBound ? 'hold-cpu'
      : pixelInsensitive ? 'hold-pixel-insensitive' : response === 'measuring' ? 'measure-pixel-response' : 'hold'
    if (!planned && !trial && !pixelInsensitive && slowWindows >= 2) {
      nextRatio = clamp(Math.round((ratio - ratioStep) * 1000) / 1000)
      if (nextRatio < ratio) {
        trial = { fromRatio: ratio, toRatio: nextRatio, baseline: window, applied: false, windows: [], createdAt: now }
        planned = true; decision = 'decrease'; counts.decreases++
      }
    } else if (!planned && !trial && fastWindows >= 3 && cpuP75Ms <= cpuCeilingMs) {
      nextRatio = clamp(Math.round((ratio + ratioStep) * 1000) / 1000)
      if (nextRatio > ratio) { planned = true; decision = 'increase'; counts.increases++ }
    }
    lastWindow = { ...window, decision }
    samples = []; counts.windows++
    return { ...lastWindow, ratio, nextRatio }
  }

  return { beginGesture, endGesture, observe, resetTiming, resetSamples, resetAdaptation,
    get ratio() { return ratio }, get nextRatio() { return nextRatio },
    getStats: () => ({ ...counts, active, ratio, nextRatio, minRatio, maxRatio, targetFrameMs,
      bufferedSamples: samples.length, slowWindows, fastWindows, planned, lastReset, lastWindow, historyMaxAgeMs,
      pixelInsensitive, lastResponse, pendingPixelTrial: trial ? { fromRatio: trial.fromRatio, toRatio: trial.toRatio,
        applied: trial.applied, measuredWindows: trial.windows.length } : null }) }
}
