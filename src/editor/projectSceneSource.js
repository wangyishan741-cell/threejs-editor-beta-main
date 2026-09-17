const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function validateScene(value, immutable) {
  if (!record(value) || !record(value.scene) || !Array.isArray(value.modelCores)) {
    throw new Error('链接返回的内容不是完整工程 JSON')
  }
  if (value.projectRecord?.storage === 'indexedDB' || value.nanjingRestore?.storage === 'indexedDB') {
    throw new Error('链接包含浏览器本地存档索引，缺少可共享的完整工程数据')
  }
  if (immutable && (value.projectHistory?.mode !== 'restored' || !record(value.nanjingRestore?.config))) {
    throw new Error('固定工程版本缺少历史标记或完整南京配置，已阻止共享外观覆盖')
  }
  return value
}

/** An explicit public scene is authoritative. Never consult or overwrite this
 * browser's local scene as a fallback, and never mutate its history metadata. */
export async function readProjectSceneSource({ sceneName, sceneUrl, immutable = false, fallback,
  readLocal, fetcher = globalThis.fetch, signal, timeoutMs = 30000 } = {}) {
  if (!sceneUrl) return readLocal(sceneName, fallback)
  const controller = new AbortController()
  let timer, onAbort
  const cancelled = new Promise((resolve, reject) => {
    onAbort = () => {
      const error = signal?.reason || Object.assign(new Error('工程版本读取已取消'), { name: 'AbortError' })
      controller.abort(error); reject(error)
    }
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      const error = new Error('工程版本读取超时，请确认链接后重试')
      controller.abort(error); reject(error)
    }, timeoutMs)
  })
  try {
    return await Promise.race([cancelled, Promise.resolve().then(async () => {
      if (controller.signal.aborted) throw controller.signal.reason
      const response = await fetcher(sceneUrl, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`工程版本读取失败（HTTP ${response.status}）`)
      let params
      try { params = await response.json() }
      catch { throw new Error('工程版本 JSON 无法解析，请检查文件是否完整') }
      return validateScene(params, immutable)
    })])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** An editable import link may resume its saved working copy after the first
 * import. Ordinary immutable preview links continue to use the remote scene.
 * The history source is the existing durable provenance shared by these files;
 * a coincidentally equal local project name alone is never enough. */
export async function resolveEditableImportedScene({ remote, sceneName, editableImport = false, readLocal } = {}) {
  if (!editableImport || remote?.projectHistory?.mode !== 'restored'
    || typeof remote.projectHistory.sourceVersionId !== 'string' || !remote.projectHistory.sourceVersionId) return remote
  const local = await readLocal(sceneName)
  if (!local || local.projectHistory?.mode !== 'restored'
    || local.projectHistory.sourceVersionId !== remote.projectHistory.sourceVersionId
    || local.nanjingRestore?.config?.sceneName && local.nanjingRestore.config.sceneName !== sceneName) return remote
  // Do not conceal a damaged working copy by silently showing an older file.
  return validateScene(local, true)
}
