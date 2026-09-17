import { normalizeNanjingWaterSurface } from './nanjingWaterSurface.js'
import { readProjectSceneSource } from './projectSceneSource.js'

export const NANJING_REPAIR_ENTRY = 'water-trees-20260917-verified-source'
// Retained only so old entry points can be rejected instead of taking over the
// earlier auto-selected copy. New destinations include the chosen source name.
export const NANJING_REPAIR_PROJECT_NAME = '南京数智城A地块 · 水面树干修复版 0917'
export const NANJING_REPAIR_SOURCE_NAME = '南京数智城A地块 · 最新效果版1'
export const NANJING_REPAIR_SOURCE_SNAPSHOT = '3b84bde3db6f7962a953e5db801d56f2fd9ebc0fb5a26028b28bceded570e7d3'
export const NANJING_REPAIR_SOURCE_URL = `/editorJson/nanjing-snapshot-${NANJING_REPAIR_SOURCE_SNAPSHOT}.json`
const SOURCE_VERSION_ID = '1789562134009-mcozjr807ai'
const REPAIR_SUFFIX = ' · 水面树干修复版 0917'

export function getNanjingRepairProjectName(sourceName) {
  if (typeof sourceName !== 'string' || !sourceName.startsWith('南京数智城A地块') || sourceName !== sourceName.trim()
    || sourceName.includes('水面树干修复版') || /[\u0000-\u001f\u007f]/.test(sourceName)
    || sourceName.length + REPAIR_SUFFIX.length > 512) throw new Error('请明确选择一个有效的南京原工程作为修复来源')
  return sourceName + REPAIR_SUFFIX
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const copy = value => structuredClone(value)

function validateScene(params, modelAssets) {
  if (!record(params) || !record(params.scene) || !Array.isArray(params.modelCores) || !params.modelCores.length
    || !record(params.nanjingRestore?.config) || params.projectRecord?.storage === 'indexedDB'
    || params.nanjingRestore?.storage === 'indexedDB') throw new Error('修复来源不是完整的南京工程，原存档未改变')
  for (const model of params.modelCores) {
    const info = model?.modelInfo
    if (!record(info) || typeof info.url !== 'string' || !info.url) throw new Error('修复来源缺少模型地址，原存档未改变')
    if (info.threeEditorDBNameUrl) {
      const separator = String(info.threeEditorDBNameUrl).indexOf(':')
      const name = separator < 0 ? '' : String(info.threeEditorDBNameUrl).slice(separator + 1)
      const asset = modelAssets?.find(item => item?.name === name)
      if (!name || !asset?.blob || typeof asset.blob.arrayBuffer !== 'function' || !(asset.blob.size > 0)) {
        throw new Error(`缺少工程本地模型文件：${name || info.threeEditorDBNameUrl}，请在保存该工程的浏览器打开；原存档未改变`)
      }
    } else if (info.url.startsWith('blob:')) {
      throw new Error('修复来源只有过期的临时模型地址，缺少持久模型文件；原存档未改变')
    }
  }
  return params
}

const STAGES = ['before', 'trunks', 'water', 'glass']
const STAGE_LABELS = { trunks: '树干材质恢复', water: '自然水面材质', glass: '建筑通透玻璃减蓝' }

function savedMaterial(params, name, path) {
  const model = params.nanjingRestore.historySnapshot?.models?.find(model => model.modelIndex === 0
    && model.bindingId === 'b4b3ce01-0090-4043-b188-9c17a42d9ad3')
  const matches = model?.materials?.filter(material => material.name === name && material.slot === 0
    && Array.isArray(material.path) && material.path.length === path.length
    && material.path.every((value, index) => value === path[index])) || []
  if (matches.length !== 1) throw new Error(`指定版本的${name}材质绑定与核验记录不一致，已停止修改并保留原存档`)
  return matches[0]
}

function repairStage(params, stage) {
  const result = copy(params), config = result.nanjingRestore.config
  // This exact source snapshot saved the tree-trunk material as transparent
  // black in both material layers. History is applied after config.materials,
  // so restore the audited source value in both, keeping texture/tree data.
  if (stage === 'trunks') {
    const trunkRule = config.materials?.Material_24
    const trunk = savedMaterial(result, 'Material_24', [9, 1129, 0])
    const black = color => Array.isArray(color) && color.length === 3 && color.every(value => value === 0)
    const corrupted = value => value?.opacity === 0 && value.transparent === true && value.depthWrite === false
    if (!corrupted(trunkRule) || !corrupted(trunk?.values) || !black(trunkRule.color) || !black(trunk?.colors?.color)) {
      throw new Error('指定版本的树干材质绑定与核验记录不一致，已停止修改并保留原存档')
    }
    const trunkColor = [1, 0.8962693810462952, 0.637596845626831]
    Object.assign(trunkRule, { opacity: 1, transparent: false, depthWrite: true, color: trunkColor.slice() })
    Object.assign(trunk.values, { opacity: 1, transparent: false, depthWrite: true })
    trunk.colors.color = trunkColor.slice()
  } else if (stage === 'water') {
    config.waterSurface = normalizeNanjingWaterSurface({ ...config.waterSurface, version: 1, enabled: true, style: 'natural-v2' })
  } else if (stage === 'glass') {
    const glassRule = config.materials?.['建筑_通透玻璃']
    const glass = savedMaterial(result, '建筑_通透玻璃', [9, 14, 0])
    if (!record(glassRule) || !record(glass.values) || !record(glass.colors)) throw new Error('通透玻璃的保存材质缺失，已停止修改并保留原存档')
    const finish = { metalness: .06, roughness: .14, envMapIntensity: .6 }
    Object.assign(glassRule, finish, { color: [1, .88, .78] })
    Object.assign(glass.values, finish)
    glass.colors.color = [1, .88, .78]
  } else {
    throw new Error('修复阶段无效')
  }
  Object.assign(config.repairEntry, { stage, stageVersion: 1, pending: stage !== 'glass' })
  return result
}

function plannedStages(params) {
  const entry = params.nanjingRestore.config.repairEntry
  const stage = entry.stage ?? (entry.pending === true ? 'before' : 'water')
  const index = STAGES.indexOf(stage)
  if (index < 0) throw new Error('已保存的修复阶段无法识别，原存档未改变')
  const steps = []
  let current = params
  for (const next of STAGES.slice(index + 1)) {
    current = repairStage(current, next)
    steps.push(current)
  }
  return steps
}

/** Creates a separate recoverable working copy. It never writes the source
 * project, substitutes a different GLB for a missing local import, or changes
 * mesh paths/tree density. Runtime trunk recovery uses the preserved geometry. */
export async function prepareNanjingRepairProject({ name, sourceName, sourceUrl, readLocal, save, fetcher, modelAssets = [], isCurrent = () => true } = {}) {
  if (sourceName !== NANJING_REPAIR_SOURCE_NAME || sourceUrl !== NANJING_REPAIR_SOURCE_URL) throw new Error('修复来源必须是已指定的最新效果版1固定版本，未使用其他工程代替')
  if (name !== getNanjingRepairProjectName(sourceName)) throw new Error('修复入口的工程名称与所选来源不一致')
  const current = () => {
    if (!isCurrent()) throw Object.assign(new Error('修复工程打开已取消'), { name: 'AbortError' })
  }
  const resume = async value => {
    validateScene(value, modelAssets)
    const entry = value.nanjingRestore.config.repairEntry
    if (entry?.version !== NANJING_REPAIR_ENTRY || entry.sourceName !== sourceName
      || entry.sourceSnapshot !== NANJING_REPAIR_SOURCE_SNAPSHOT || value.nanjingRestore.config.sceneName !== name) {
      throw new Error('修复工程名称已被其他工程占用，已保留现有工程')
    }
    if (entry.stage === 'glass' && entry.pending !== true) return value
    // Restoring the retained before-version deliberately changes the history
    // source ID. Do not treat that user rollback as an interrupted creation.
    if (!entry.pendingSourceVersionId || entry.pendingSourceVersionId !== value.projectHistory?.sourceVersionId) return value
    const stages = plannedStages(value)
    // Copies completed by the earlier two-save protocol already have trunks
    // and water repaired. Retain their current appearance before the new glass
    // adjustment; never rerun the earlier material fixes over later edits.
    if (entry.stage === undefined && entry.pending !== true && stages.length) {
      const glassBefore = copy(value)
      Object.assign(glassBefore.nanjingRestore.config.repairEntry, { stage: 'water', stageVersion: 1, pending: true })
      current()
      await save(name, glassBefore, { label: '通透玻璃减蓝前（可回退）', kind: 'repair' })
      current()
    }
    let completed = value
    for (const stage of stages) {
      current()
      await save(name, stage, { label: STAGE_LABELS[stage.nanjingRestore.config.repairEntry.stage], kind: 'repair' })
      current()
      completed = stage
    }
    return completed
  }

  current()
  const existing = await readLocal(name)
  current()
  if (existing) return resume(existing)

  const source = await readProjectSceneSource({ sceneName: sourceName, sceneUrl: sourceUrl, immutable: true, fetcher })
  current()
  validateScene(source, modelAssets)
  if (source.projectHistory?.sourceVersionId !== SOURCE_VERSION_ID || source.nanjingRestore.config.sceneName !== sourceName) {
    throw new Error('固定版本的工程来源不匹配，原存档未改变')
  }
  const before = copy(source), config = before.nanjingRestore.config
  const originalProjectHistory = copy(before.projectHistory)
  config.sceneName = name
  config.repairEntry = { version: NANJING_REPAIR_ENTRY, sourceName, sourceSnapshot: NANJING_REPAIR_SOURCE_SNAPSHOT,
    stage: 'before', stageVersion: 1, pending: true,
    sourceVersionId: before.projectHistory?.sourceVersionId || null,
    ...(originalProjectHistory ? { originalProjectHistory } : {}) }
  if (before.projectHistory?.mode !== 'restored' || typeof before.projectHistory.sourceVersionId !== 'string' || !before.projectHistory.sourceVersionId) {
    before.projectHistory = { ...before.projectHistory, mode: 'restored',
      sourceVersionId: typeof before.projectHistory?.sourceVersionId === 'string' && before.projectHistory.sourceVersionId
        || `${NANJING_REPAIR_ENTRY}:${sourceName}` }
  }
  config.repairEntry.pendingSourceVersionId = before.projectHistory.sourceVersionId
  // Normalize before the first write so invalid saved water parameters cannot
  // leave a newly created project that is impossible to finish opening.
  plannedStages(before)
  current()
  try {
    await save(name, before, { createOnly: true, kind: 'import', label: '树干、水面与玻璃调整前（独立副本，可回退）' })
  } catch (error) {
    if (error?.code !== 'PROJECT_ALREADY_EXISTS') throw error
    current()
    const winner = await readLocal(name)
    current()
    return resume(winner)
  }
  current()
  return resume(before)
}
