const SNAPSHOT_ENDPOINT = '/__nanjing-project-snapshots'
const snapshotStem = /^nanjing-snapshot-[a-f0-9]{64}$/

export function prepareNanjingSharedSnapshot(params) {
  if (!params?.scene || !Array.isArray(params.modelCores) || !params.nanjingRestore?.config) {
    throw new Error('工程快照不完整，请等待模型载入后重试')
  }
  const scene = structuredClone(params)
  // A fixed version must never acquire later shared appearance updates.
  scene.projectHistory = { ...scene.projectHistory, mode: 'restored' }
  return scene
}

export function nanjingSnapshotEditorUrl(location, sceneName, project) {
  if (!snapshotStem.test(sceneName)) throw new Error('服务器返回的版本标识无效')
  const url = new URL(location)
  url.search = ''
  url.hash = '/editor?' + new URLSearchParams({ restore: 'nanjing', project, sceneName, snapshot: '1', import: '1', edit: '1' })
  return url.href
}

export async function publishNanjingProjectSnapshot({ params, name, fetcher = globalThis.fetch, timeoutMs = 60000 }) {
  const scene = prepareNanjingSharedSnapshot(params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(SNAPSHOT_ENDPOINT, { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ name, scene }) })
    let result
    try { result = await response.json() } catch { throw new Error(`版本保存返回无效数据（HTTP ${response.status}）`) }
    if (!response.ok) throw new Error(result.error || `固定版本保存失败（HTTP ${response.status}）`)
    if (!snapshotStem.test(result.sceneName)) throw new Error('服务器返回的版本标识无效')
    return result
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('固定版本保存超时；本地工程记录仍然保留，可重试')
    throw error
  } finally { clearTimeout(timer) }
}
