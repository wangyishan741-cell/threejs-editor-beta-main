// The requested repair is limited to the two audited working copies. A verified
// receipt prevents a later deliberate history restore or disable from changing.
// v1 receipts are not proof of success: they could be written for inactive water.
export const REQUESTED_WATER_UPDATE = 'natural-water-20260917-v2'
const SOURCES = new Map([['最新效果版', '1789475850323-pw1ar8h49x'], ['最新效果版1', '1789548475941-rfgiun6qq7']])
export async function applyRequestedWaterUpdate({ projectName, config, sourceVersionId, storage, save, water,
  getWater = () => water, isCurrent }) {
  const name = /(?:^|·\s*)(最新效果版1?)$/.exec(projectName)?.[1]
  if (!name || SOURCES.get(name) !== sourceVersionId || !config || !getWater() || !isCurrent()) return false
  const key = REQUESTED_WATER_UPDATE + ':' + projectName
  let receipt
  try { receipt = JSON.parse(storage.getItem(key) || 'null') } catch { /* Unverified receipts do not suppress this repair. */ }
  if (receipt?.version === 2 && receipt.sourceVersionId === sourceVersionId && receipt.active === true) return false
  const confirm = () => {
    if (!isCurrent() || !getWater()?.getStatus?.().active) return false
    storage.setItem(key, JSON.stringify({ version: 2, sourceVersionId, active: true }))
    return true
  }
  if (config.waterSurface?.version === 1 && config.waterSurface.enabled === true
    && getWater().getStatus?.().active) { confirm(); return false }
  const hadSettings = Object.hasOwn(config, 'waterSurface'), previous = structuredClone(config.waterSurface)
  const previousSettings = getWater().getStatus?.().settings
  await save({ label: '自然水面调整前（可回退）' })
  if (!isCurrent()) return false
  try {
    // Model restoration may replace the controller while the backup is saving.
    const currentWater = getWater()
    if (!currentWater) throw new Error('水面控制器仍在恢复，请等待模型完成后重试')
    currentWater.update({ enabled: true })
    if (!getWater()?.getStatus?.().active) throw new Error('未找到可启用的水面对象，未记录水面更新完成')
    await save({ label: '自然细波纹水面 · 树木及导入副本修复' })
    if (!isCurrent()) return false
    if (!confirm()) throw new Error('保存后水面未保持启用，未记录水面更新完成')
    return true
  } catch (error) {
    if (isCurrent()) {
      getWater()?.update(previousSettings || { enabled: false })
      if (hadSettings) config.waterSurface = previous
      else delete config.waterSurface
    }
    throw error
  }
}
