import * as THREE from 'three'

const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
export const isNanjingBenchmarkBaseline = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('perf') === 'baseline'
const referencePosition = new THREE.Vector3(-27.685867309570312, 6.72600793838501, 0.8967990279197693)
const referenceTarget = new THREE.Vector3(-0.22183752059936523, 1.6335870623588562, -1.0511406660079956)

// Measures real frame intervals separately from CPU submission and GPU execution.
export function createNanjingProfiler(editor, { invalidate, onResult } = {}) {
  const gl = editor.renderer.getContext()
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  const capabilities = { timerQuery: !!timer, multiDraw: !!gl.getExtension('WEBGL_multi_draw'),
    clipControl: !!gl.getExtension('EXT_clip_control'), parallelShaderCompile: !!gl.getExtension('KHR_parallel_shader_compile') }
  const pending = []
  let activeQuery = null
  let run = null
  let lastResult = null
  let nextId = 0
  const recentGpu = []
  const benchmarkDevice = new URLSearchParams(window.location.hash.split('?')[1] || '').get('benchmark')
  const acceptance = benchmarkDevice === '5080' || benchmarkDevice === 'mac'
  const targetDevice = benchmarkDevice === '5080' ? 'rtx5080' : benchmarkDevice === 'mac' ? 'mac' : 'unspecified'
  let timingGeneration = 0
  let gpuSampleId = 0
  let gpuRecordedAt = null
  let previousFrameTime = null
  let currentFrameTime = null
  let currentFrameInterval = null
  let lastFrameTiming = null
  let frameId = 0
  function resetFrameTiming() {
    previousFrameTime = null
    currentFrameTime = null
    currentFrameInterval = null
    lastFrameTiming = null
    recentGpu.length = 0
    gpuRecordedAt = null
    timingGeneration++
  }
  function getGpuFrameMs() {
    return gpuRecordedAt !== null && performance.now() - gpuRecordedAt <= 1000 ? percentile(recentGpu, 0.5) : null
  }
  let acceptanceTimer = null
  let acceptanceStarted = false
  function cancelReady() {
    if (acceptanceTimer !== null) clearTimeout(acceptanceTimer)
    acceptanceTimer = null
  }
  function ready({ start, canStart } = {}) {
    if (!acceptance || acceptanceStarted || acceptanceTimer) return
    // An explicit acceptance URL runs after import, shader warmup and initial shadows.
    acceptanceTimer = setTimeout(() => {
      acceptanceTimer = null
      if (document.visibilityState !== 'visible' || (canStart && !canStart())) {
        ready({ start, canStart })
        return
      }
      acceptanceStarted = true
      start?.()
    }, 5000)
  }
  function poll() {
    if (!timer) return
    const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT)
    if (disjoint) {
      pending.forEach(item => gl.deleteQuery(item.query))
      pending.length = 0
      recentGpu.length = 0
      gpuRecordedAt = null
      timingGeneration++
      return
    }
    while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
      const item = pending.shift()
      const ms = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6
      gl.deleteQuery(item.query)
      if (item.generation === timingGeneration && Number.isFinite(ms) && ms > 0) {
        recentGpu.push(ms)
        if (recentGpu.length > 5) recentGpu.shift()
        gpuSampleId++
        gpuRecordedAt = performance.now()
      }
      if (run && run.id === item.id && Number.isFinite(ms) && ms > 0) (item.sample ? run.gpu : run.warmup.gpu).push(ms)
    }
  }
  function startBenchmark({ extended = false } = {}) {
    if (run) return
    run = { id: ++nextId, extended, frame: 0, totalFrames: acceptance || extended ? 600 : 112, warmupFrames: acceptance || extended ? 120 : 16, started: performance.now(), previous: null, intervals: [], cpu: [], calls: [], triangles: [], gpu: [], buffers: new Set(),
      warmup: { intervals: [], cpu: [], calls: [], triangles: [], gpu: [], buffers: new Set() },
      position: editor.camera.position.clone(), target: editor.controls.target.clone(), enabled: editor.controls.enabled,
      damping: editor.controls.enableDamping, autoRotate: editor.controls.autoRotate, visible: document.visibilityState === 'visible',
      fov: editor.camera.fov, near: editor.camera.near, far: editor.camera.far, zoom: editor.camera.zoom }
    editor.controls.enabled = false
    editor.controls.enableDamping = false
    editor.controls.autoRotate = false
    Object.assign(editor.camera, { fov: 44.09589492712077, near: 0.05, far: 1000, zoom: 1 })
    editor.camera.updateProjectionMatrix()
    editor.controls.target.copy(referenceTarget)
    editor.camera.position.copy(referencePosition)
    editor.camera.lookAt(referenceTarget)
    editor.camera.updateMatrixWorld()
    invalidate?.()
  }
  function consumeAcceptanceParameter() {
    if (!acceptance || !acceptanceStarted) return
    const hash = window.location.hash
    const queryIndex = hash.indexOf('?')
    if (queryIndex === -1) return
    const params = new URLSearchParams(hash.slice(queryIndex + 1))
    if (params.get('benchmark') !== benchmarkDevice) return
    params.delete('benchmark')
    const query = params.toString()
    // A fragment-only replacement preserves the page URL and browser history.
    // Do not let unavailable history access discard a measured report.
    try {
      window.history.replaceState(window.history.state, '', hash.slice(0, queryIndex) + (query ? `?${query}` : ''))
    } catch { /* The benchmark result remains valid if URL cleanup is unavailable. */ }
  }
  function finish(reason = 'cancelled') {
    if (!run) return
    poll()
    const complete = run
    // The render gate skips begin() while hidden. Capture visibility here too,
    // including cancellation from the visibilitychange handler before another frame.
    complete.visible &&= document.visibilityState === 'visible'
    const sampleData = complete.intervals.length ? complete : complete.warmup
    const completed = complete.frame >= complete.totalFrames
    const status = completed ? 'completed' : reason === 'timeout' ? 'timeout' : 'cancelled'
    run = null
    editor.camera.position.copy(complete.position)
    editor.controls.target.copy(complete.target)
    editor.controls.enabled = complete.enabled
    editor.controls.enableDamping = complete.damping
    editor.controls.autoRotate = complete.autoRotate
    for (const key of ['fov', 'near', 'far', 'zoom']) editor.camera[key] = complete[key]
    editor.camera.updateProjectionMatrix()
    editor.controls.update()
    lastResult = { gpu, targetDevice, capabilities, samples: sampleData.intervals.length, fps: sampleData.intervals.length ? 1000 / mean(sampleData.intervals) : null,
      frameMedianMs: percentile(sampleData.intervals, 0.5), frameP95Ms: percentile(sampleData.intervals, 0.95),
      frameP99Ms: percentile(sampleData.intervals, 0.99), longestFramesMs: [...sampleData.intervals].sort((a, b) => b - a).slice(0, 5),
      framesOver33Ms: sampleData.intervals.filter(ms => ms > 33.4).length,
      cpuMedianMs: percentile(sampleData.cpu, 0.5), gpuMedianMs: percentile(sampleData.gpu, 0.5),
      cpuP95Ms: percentile(sampleData.cpu, 0.95), gpuP95Ms: percentile(sampleData.gpu, 0.95),
      drawCalls: Math.round(mean(sampleData.calls) || 0), triangles: Math.round(mean(sampleData.triangles) || 0),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], pixelRatio: editor.renderer.getPixelRatio(),
      sampledDrawingBuffers: [...sampleData.buffers],
      logarithmicDepthBuffer: editor.renderer.capabilities.logarithmicDepthBuffer, reversedDepthBuffer: editor.renderer.capabilities.reversedDepthBuffer,
      baseline: isNanjingBenchmarkBaseline(), benchmark: acceptance || complete.extended ? 'nanjing-reference-orbit-v3-480-samples' : 'nanjing-reference-orbit-v2', completed, status,
      samplePhase: sampleData === complete ? 'measured' : 'warmup', visible: complete.visible,
      nativePixelRatio: window.devicePixelRatio, viewportCss: [editor.renderer.domElement.clientWidth, editor.renderer.domElement.clientHeight], recordedAt: new Date().toISOString() }
    consumeAcceptanceParameter()
    onResult?.(lastResult)
    if ((acceptance || complete.extended) && Number.isFinite(lastResult.fps)) {
      if (import.meta.env.DEV) {
        fetch('/__nanjing-benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastResult) })
          .catch(error => console.warn('性能报告未写入本机验收记录', error))
      } else {
      const data = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `nanjing-${targetDevice}-benchmark-${Date.now()}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    }
    invalidate?.()
  }
  function begin() {
    poll()
    currentFrameTime = performance.now()
    currentFrameInterval = previousFrameTime === null ? null : currentFrameTime - previousFrameTime
    previousFrameTime = currentFrameTime
    if (run) {
      if (run.frame >= run.totalFrames) { finish('completed'); return }
      if (performance.now() - run.started > 60000) { finish('timeout'); return }
      run.visible &&= document.visibilityState === 'visible'
      const now = performance.now()
      if (run.previous !== null) (run.frame >= run.warmupFrames ? run.intervals : run.warmup.intervals).push(now - run.previous)
      run.previous = now
      const angle = (run.frame / (run.totalFrames - 1) - 0.5) * 0.2
      editor.camera.position.copy(referencePosition).sub(referenceTarget).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(referenceTarget)
      editor.camera.lookAt(referenceTarget)
      editor.camera.updateMatrixWorld()
    }
    if (timer && pending.length < 6) {
      const query = gl.createQuery()
      if (query) {
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
        activeQuery = { query, id: run?.id, generation: timingGeneration, sample: !!run && run.frame >= run.warmupFrames }
      }
    }
  }
  function end(stats) {
    if (activeQuery) {
      gl.endQuery(timer.TIME_ELAPSED_EXT)
      pending.push(activeQuery)
      activeQuery = null
    }
    lastFrameTiming = { frameId: ++frameId, recordedAt: currentFrameTime, frameMs: currentFrameInterval,
      cpuMs: stats.cpuSubmitMs, gpuMs: getGpuFrameMs(), gpuSampleId, gpuRecordedAt,
      gpuTimerSupported: !!timer }
    if (!run) return
    const sampleData = run.frame >= run.warmupFrames ? run : run.warmup
    sampleData.buffers.add(`${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`)
    sampleData.cpu.push(stats.cpuSubmitMs)
    sampleData.calls.push(stats.calls)
    sampleData.triangles.push(stats.triangles)
    run.frame += 1
    invalidate?.()
  }
  function dispose() {
    cancelReady()
    if (activeQuery) { gl.endQuery(timer.TIME_ELAPSED_EXT); gl.deleteQuery(activeQuery.query) }
    pending.forEach(item => gl.deleteQuery(item.query))
    pending.length = 0
    activeQuery = null
    run = null
    resetFrameTiming()
  }
  return { begin, end, startBenchmark, ready, cancelReady, cancel: finish, dispose, resetFrameTiming,
    getFrameTiming: () => lastFrameTiming ? { ...lastFrameTiming } : null,
    get running() { return !!run }, get result() { return lastResult }, get gpuFrameMs() { return getGpuFrameMs() }, gpu, targetDevice, capabilities }
}
