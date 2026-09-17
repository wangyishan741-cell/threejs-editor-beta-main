import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareNanjingRepairProject, getNanjingRepairProjectName, NANJING_REPAIR_ENTRY,
  NANJING_REPAIR_SOURCE_NAME as sourceName, NANJING_REPAIR_SOURCE_URL as sourceUrl,
  NANJING_REPAIR_SOURCE_SNAPSHOT as sourceSnapshot, NANJING_REPAIR_PROJECT_NAME as legacyName } from '../src/editor/nanjingRepairProject.js'

const name = getNanjingRepairProjectName(sourceName)
const scene = (overrides = {}) => ({ scene: { background: 'sky' },
  modelCores: [{ modelInfo: { url: '/original.glb' }, children: [{ position: [1, 2, 3] }] }],
  projectHistory: { mode: 'restored', sourceVersionId: '1789562134009-mcozjr807ai' },
  nanjingRestore: { config: { sceneName: sourceName, treeDensity: 100, materialSnapshots: [{ path: [9, 242], color: [1, 2, 3] }],
    materials: { Material_24: { opacity: 0, transparent: true, depthWrite: false, color: [0, 0, 0] }, Material_25: { opacity: .9 },
      '建筑_通透玻璃': { type: 'MeshPhysicalMaterial', roughness: 0, metalness: .39274924993515015, transmission: 1, side: 2 } } },
    historySnapshot: { models: [{ modelIndex: 0, bindingId: 'b4b3ce01-0090-4043-b188-9c17a42d9ad3', materials: [
      { path: [9, 1129, 0], slot: 0, name: 'Material_24', values: { opacity: 0, transparent: true, depthWrite: false, roughness: 1 }, colors: { color: [0, 0, 0] }, textures: { map: { repeat: [.5, .2] } } },
      { path: [9, 1130, 0], slot: 0, name: 'Material_25', values: { opacity: .9 }, colors: { color: [.2, .4, .1] } },
      { path: [9, 14, 0], slot: 0, name: '建筑_通透玻璃', values: { opacity: 1, transmission: 1, roughness: 0, metalness: .39274924993515015, envMapIntensity: 1, ior: 1.5 }, colors: { color: [1, 1, 1] }, textures: { map: { repeat: [2.8, 7.4] } } },
    ] }] } }, ...overrides })
function environment(records = new Map(), extras = {}) {
  const writes = [], reads = [], fetches = []
  return { name, sourceName, sourceUrl, modelAssets: [], reads, writes,
    fetches, readLocal: async key => { reads.push(key); return records.get(key) || null },
    save: async (key, value, options) => { writes.push({ key, value: structuredClone(value), options }); records.set(key, structuredClone(value)) },
    fetcher: async (url, init) => { fetches.push({ url, init }); return { ok: true, json: async () => scene() } }, ...extras }
}

test('copies only the fixed version and saves one separate record per repaired issue', async () => {
  const original = scene(), unchanged = structuredClone(original), options = environment(new Map(), {
    fetcher: async (url, init) => { assert.equal(url, sourceUrl); assert.equal(init.cache, 'no-store'); return { ok: true, json: async () => original } },
  })
  const result = await prepareNanjingRepairProject(options)
  assert.deepEqual(original, unchanged)
  assert.deepEqual(options.reads, [name])
  assert.equal(options.writes.length, 4)
  assert.deepEqual(options.writes.map(write => write.value.nanjingRestore.config.repairEntry.stage), ['before', 'trunks', 'water', 'glass'])
  assert.equal(options.writes[0].options.createOnly, true)
  assert.equal(options.writes[0].value.nanjingRestore.config.waterSurface, undefined)
  assert.equal(options.writes[0].value.nanjingRestore.config.repairEntry.pending, true)
  assert.equal(result.nanjingRestore.config.waterSurface.enabled, true)
  assert.equal(result.nanjingRestore.config.waterSurface.style, 'natural-v2')
  assert.equal(result.nanjingRestore.config.repairEntry.pending, false)
  assert.equal(result.nanjingRestore.config.repairEntry.sourceSnapshot, sourceSnapshot)
  assert.equal(result.nanjingRestore.config.treeDensity, 100)
  assert.equal(options.writes[0].value.nanjingRestore.config.materials.Material_24.opacity, 0)
  assert.equal(options.writes[0].value.nanjingRestore.historySnapshot.models[0].materials[0].values.opacity, 0)
  assert.deepEqual(result.nanjingRestore.config.materials.Material_24, { opacity: 1, transparent: false, depthWrite: true, color: [1, 0.8962693810462952, 0.637596845626831] })
  assert.deepEqual(result.nanjingRestore.config.materials.Material_25, original.nanjingRestore.config.materials.Material_25)
  assert.deepEqual(result.nanjingRestore.historySnapshot.models[0].materials[1], original.nanjingRestore.historySnapshot.models[0].materials[1])
  assert.deepEqual(result.nanjingRestore.historySnapshot.models[0].materials[0].textures, original.nanjingRestore.historySnapshot.models[0].materials[0].textures)
  assert.equal(options.writes[1].value.nanjingRestore.config.waterSurface, undefined)
  assert.equal(options.writes[1].value.nanjingRestore.config.materials.Material_24.opacity, 1)
  assert.equal(options.writes[2].value.nanjingRestore.config.waterSurface.enabled, true)
  assert.deepEqual(options.writes[2].value.nanjingRestore.config.materials['建筑_通透玻璃'], original.nanjingRestore.config.materials['建筑_通透玻璃'])
  assert.equal(result.nanjingRestore.config.materials['建筑_通透玻璃'].transmission, 1)
  assert.equal(result.nanjingRestore.historySnapshot.models[0].materials[2].values.opacity, 1)
  assert.deepEqual(result.nanjingRestore.historySnapshot.models[0].materials[2].textures, original.nanjingRestore.historySnapshot.models[0].materials[2].textures)
  assert.deepEqual(result.modelCores, original.modelCores)
  assert.deepEqual(result.nanjingRestore.config.materialSnapshots, original.nanjingRestore.config.materialSnapshots)
  assert.deepEqual(result.projectHistory, original.projectHistory)
  assert.ok(options.writes.every(write => write.key === name))
})

test('same-name local source, differently named newer save and old incorrect repair are never substituted', async () => {
  const local = scene(); local.scene.background = 'wrong'
  const options = environment(new Map([[sourceName, local], ['南京数智城A地块 · 最新效果版9/16', local], [legacyName, local]]))
  const result = await prepareNanjingRepairProject(options)
  assert.equal(result.scene.background, 'sky')
  assert.equal(options.fetches.length, 1)
  assert.deepEqual(options.reads, [name])
  assert.notEqual(name, legacyName)
})

test('missing explicit source, other snapshot URLs and mismatched destinations fail before reads or writes', async () => {
  for (const overrides of [{ sourceName: undefined }, { sourceUrl: undefined }, { sourceName: '南京数智城A地块 · 最新效果版9/16' },
    { sourceUrl: '/editorJson/older.json' }, { name: legacyName }]) {
    const options = environment(new Map(), overrides)
    await assert.rejects(prepareNanjingRepairProject(options))
    assert.equal(options.writes.length, 0); assert.equal(options.reads.length, 0); assert.equal(options.fetches.length, 0)
  }
  for (const invalid of ['', '无关工程', name, '南京数智城A地块\n测试', '南京数智城A地块' + 'x'.repeat(512)]) {
    assert.throws(() => getNanjingRepairProjectName(invalid))
  }
})

test('failed remote read, wrong provenance and malformed content never fall back to a local project', async () => {
  const wrongId = scene(); wrongId.projectHistory.sourceVersionId = 'older'
  const wrongName = scene(); wrongName.nanjingRestore.config.sceneName = '南京数智城A地块 · 其他版本'
  const candidates = [wrongId, wrongName, { modelCores: [] }]
  for (const data of candidates) {
    const options = environment(new Map([[sourceName, scene()]]), { fetcher: async () => ({ ok: true, json: async () => data }) })
    await assert.rejects(prepareNanjingRepairProject(options))
    assert.equal(options.writes.length, 0); assert.deepEqual(options.reads, [name])
  }
  const unavailable = environment(new Map([[sourceName, scene()]]), { fetcher: async () => ({ ok: false, status: 404 }) })
  await assert.rejects(prepareNanjingRepairProject(unavailable), /404/)
  assert.equal(unavailable.writes.length, 0)
  const brokenStore = environment(new Map(), { readLocal: async () => { throw new Error('storage failed') } })
  await assert.rejects(prepareNanjingRepairProject(brokenStore), /storage failed/)
  assert.equal(brokenStore.fetches.length, 0)
})

test('the specified imported GLB must exist in local assets and is never replaced with public geometry', async () => {
  const original = scene({ modelCores: [{ modelInfo: { url: 'blob:old', threeEditorDBNameUrl: 'blob:local-glb' } }] })
  const fetcher = async () => ({ ok: true, json: async () => original })
  for (const modelAssets of [[], [{ name: 'wrong', blob: new Blob(['glb']) }], [{ name: 'local-glb', blob: new Blob() }]]) {
    const options = environment(new Map(), { modelAssets, fetcher })
    await assert.rejects(prepareNanjingRepairProject(options), /缺少工程本地模型/)
    assert.equal(options.writes.length, 0)
  }
  const options = environment(new Map(), { modelAssets: [{ name: 'local-glb', blob: new Blob(['glb']) }], fetcher })
  assert.deepEqual((await prepareNanjingRepairProject(options)).modelCores, original.modelCores)
  const orphan = environment(new Map(), { fetcher: async () => ({ ok: true, json: async () => scene({ modelCores: [{ modelInfo: { url: 'blob:orphan' } }] }) }) })
  await assert.rejects(prepareNanjingRepairProject(orphan), /临时模型地址/)
  assert.equal(orphan.writes.length, 0)
})

test('reopening the same completed repair preserves later edits without fetching or writing', async () => {
  const records = new Map(), first = environment(records)
  await prepareNanjingRepairProject(first)
  const saved = records.get(name)
  saved.nanjingRestore.config.waterSurface.enabled = false
  saved.nanjingRestore.config.treeDensity = 20
  const repeat = environment(records), result = await prepareNanjingRepairProject(repeat)
  assert.equal(result, saved)
  assert.equal(result.nanjingRestore.config.waterSurface.enabled, false)
  assert.equal(result.nanjingRestore.config.treeDensity, 20)
  assert.equal(repeat.writes.length, 0); assert.equal(repeat.fetches.length, 0)
  assert.deepEqual(repeat.reads, [name])
})

test('an interrupted second save resumes from its retained original without another source read', async () => {
  const records = new Map(), first = environment(records), save = first.save
  first.save = async (...args) => { if (first.writes.length) throw new Error('quota'); return save(...args) }
  await assert.rejects(prepareNanjingRepairProject(first), /quota/)
  assert.equal(records.get(name).nanjingRestore.config.repairEntry.pending, true)
  const retry = environment(records), result = await prepareNanjingRepairProject(retry)
  assert.equal(retry.writes.length, 3); assert.equal(retry.fetches.length, 0)
  assert.equal(result.nanjingRestore.config.waterSurface.enabled, true)
  assert.equal(result.nanjingRestore.config.repairEntry.pending, false)
})

test('deliberate restoration of the before-version remains restored when the repair URL reopens', async () => {
  const records = new Map(), first = environment(records)
  await prepareNanjingRepairProject(first)
  const restored = structuredClone(first.writes[0].value)
  assert.equal(restored.nanjingRestore.config.repairEntry.pending, true)
  restored.projectHistory = { mode: 'restored', sourceVersionId: 'before-repair-version-id', restoredAt: 1234 }
  records.set(name, restored)
  const reopen = environment(records), result = await prepareNanjingRepairProject(reopen)
  assert.equal(result, restored)
  assert.equal(result.nanjingRestore.config.waterSurface, undefined)
  assert.equal(reopen.writes.length, 0); assert.equal(reopen.fetches.length, 0)
})

test('same destination with another snapshot, source, legacy marker or no repair metadata is rejected', async () => {
  for (const alteration of [entry => { entry.sourceSnapshot = 'older-snapshot' }, entry => { entry.sourceName += '9/16' },
    entry => { entry.version = 'water-trees-20260917' }, entry => { delete entry.version }]) {
    const records = new Map(), first = environment(records)
    await prepareNanjingRepairProject(first)
    alteration(records.get(name).nanjingRestore.config.repairEntry)
    const repeat = environment(records)
    await assert.rejects(prepareNanjingRepairProject(repeat), /已被其他工程占用/)
    assert.equal(repeat.writes.length, 0); assert.equal(repeat.fetches.length, 0)
  }
})

test('cancellation and invalid water values cannot create a pending project', async () => {
  let active = true
  const options = environment(new Map(), { isCurrent: () => active,
    fetcher: async () => { active = false; return { ok: true, json: async () => scene() } } })
  await assert.rejects(prepareNanjingRepairProject(options), { name: 'AbortError' })
  assert.equal(options.writes.length, 0)
  const invalid = scene(); invalid.nanjingRestore.config.waterSurface = { version: 1, roughness: -1 }
  const bad = environment(new Map(), { fetcher: async () => ({ ok: true, json: async () => invalid }) })
  await assert.rejects(prepareNanjingRepairProject(bad), /roughness/)
  assert.equal(bad.writes.length, 0)
})

test('concurrent creation resumes a matching winner without overwriting its finished copy', async () => {
  const records = new Map(), options = environment(records)
  let winner
  options.save = async (key, value, args) => {
    assert.equal(args.createOnly, true)
    winner = structuredClone(value)
    winner.nanjingRestore.config.repairEntry.pending = false
    winner.nanjingRestore.config.repairEntry.stage = 'glass'
    winner.nanjingRestore.config.waterSurface = { version: 1, enabled: false, roughness: .7 }
    records.set(key, winner)
    throw Object.assign(new Error('exists'), { code: 'PROJECT_ALREADY_EXISTS' })
  }
  const result = await prepareNanjingRepairProject(options)
  assert.equal(result, winner)
  assert.equal(result.nanjingRestore.config.waterSurface.enabled, false)
  assert.equal(result.nanjingRestore.config.repairEntry.version, NANJING_REPAIR_ENTRY)
})

test('tree repair rejects different material bindings or values before the first write', async () => {
  for (const mutate of [value => { value.nanjingRestore.historySnapshot.models[0].materials[0].path = [9, 1128, 0] },
    value => { value.nanjingRestore.config.materials.Material_24.opacity = .5 }]) {
    const original = scene(); mutate(original)
    const options = environment(new Map(), { fetcher: async () => ({ ok: true, json: async () => original }) })
    await assert.rejects(prepareNanjingRepairProject(options), /材质绑定/)
    assert.equal(options.writes.length, 0)
  }
})

test('actual snapshot changes only audited trunk/glass fields, preserving source and shared texture descriptors', async () => {
  const original = JSON.parse(await readFile(new URL(`../public${sourceUrl}`, import.meta.url), 'utf8'))
  const before = structuredClone(original)
  const options = environment(new Map(), { fetcher: async () => ({ ok: true, json: async () => original }),
    modelAssets: [{ name: 'nanjing-import-1789547558107-ci9dzg8euet', blob: new Blob(['asset-validation-fixture']) }] })
  const result = await prepareNanjingRepairProject(options)
  const expected = structuredClone(original.nanjingRestore.historySnapshot)
  const trunk = expected.models[0].materials.find(material => material.name === 'Material_24')
  Object.assign(trunk.values, { opacity: 1, transparent: false, depthWrite: true })
  trunk.colors.color = [1, 0.8962693810462952, 0.637596845626831]
  const glass = expected.models[0].materials.find(material => material.name === '建筑_通透玻璃')
  assert.deepEqual(glass.path, [9, 14, 0]); assert.equal(glass.slot, 0)
  Object.assign(glass.values, { metalness: .06, roughness: .14, envMapIntensity: .6 })
  glass.colors.color = [1, .88, .78]
  assert.deepEqual(result.nanjingRestore.historySnapshot, expected)
  assert.deepEqual(original, before)
  assert.deepEqual(options.writes[0].value.nanjingRestore.historySnapshot, original.nanjingRestore.historySnapshot)
  assert.deepEqual(result.nanjingRestore.config.materials.Material_25, original.nanjingRestore.config.materials.Material_25)
  assert.deepEqual(result.nanjingRestore.config.materials['建筑_通透玻璃'], { ...original.nanjingRestore.config.materials['建筑_通透玻璃'],
    color: [1, .88, .78], metalness: .06, roughness: .14, envMapIntensity: .6 })
  assert.deepEqual(result.nanjingRestore.config.waterSurface, { version: 1, enabled: true, style: 'natural-v2',
    rippleScale: .75, rippleStrength: .12, metalness: 0, roughness: .34, envMapIntensity: .45, ior: 1.333, specularIntensity: .75 })
})

test('explicit saved water parameters are retained while absent fields use the natural-v2 defaults', async () => {
  const original = scene()
  original.nanjingRestore.config.waterSurface = { version: 1, enabled: false, roughness: .42, rippleStrength: .18 }
  const result = await prepareNanjingRepairProject(environment(new Map(), { fetcher: async () => ({ ok: true, json: async () => original }) }))
  assert.equal(result.nanjingRestore.config.waterSurface.roughness, .42)
  assert.equal(result.nanjingRestore.config.waterSurface.rippleStrength, .18)
  assert.equal(result.nanjingRestore.config.waterSurface.envMapIntensity, .45)
  assert.equal(result.nanjingRestore.config.waterSurface.rippleScale, .75)
  assert.equal(result.nanjingRestore.config.waterSurface.style, 'natural-v2')
})

test('each interrupted stage resumes only its remaining records', async () => {
  for (const committed of [1, 2, 3]) {
    const records = new Map(), first = environment(records), save = first.save
    first.save = async (...args) => { if (first.writes.length === committed) throw new Error('quota'); return save(...args) }
    await assert.rejects(prepareNanjingRepairProject(first), /quota/)
    const retry = environment(records)
    await prepareNanjingRepairProject(retry)
    assert.deepEqual(retry.writes.map(write => write.value.nanjingRestore.config.repairEntry.stage), ['before', 'trunks', 'water', 'glass'].slice(committed))
    assert.equal(retry.fetches.length, 0)
  }
})

test('restoring any intermediate version prevents automatic advancement', async () => {
  const records = new Map(), first = environment(records)
  await prepareNanjingRepairProject(first)
  for (const index of [0, 1, 2]) {
    const restored = structuredClone(first.writes[index].value)
    restored.projectHistory = { mode: 'restored', sourceVersionId: `restored-stage-${index}`, restoredAt: 1 }
    records.set(name, restored)
    const retry = environment(records), result = await prepareNanjingRepairProject(retry)
    assert.equal(result, restored); assert.equal(retry.writes.length, 0); assert.equal(retry.fetches.length, 0)
  }
})

test('older completed protocol backs up current edits and applies only the newly requested glass adjustment', async () => {
  const records = new Map(), first = environment(records)
  await prepareNanjingRepairProject(first)
  const legacy = records.get(name)
  delete legacy.nanjingRestore.config.repairEntry.stage
  delete legacy.nanjingRestore.config.repairEntry.stageVersion
  legacy.nanjingRestore.config.waterSurface.enabled = false
  legacy.nanjingRestore.config.waterSurface.roughness = .7
  legacy.nanjingRestore.config.materials.Material_24.opacity = .8
  legacy.nanjingRestore.config.materials['建筑_通透玻璃'].metalness = .8
  const previous = structuredClone(legacy), upgrade = environment(records)
  const result = await prepareNanjingRepairProject(upgrade)
  assert.equal(upgrade.writes.length, 2)
  assert.match(upgrade.writes[0].options.label, /减蓝前/)
  assert.equal(upgrade.writes[0].value.nanjingRestore.config.materials['建筑_通透玻璃'].metalness, .8)
  assert.deepEqual(result.nanjingRestore.config.waterSurface, previous.nanjingRestore.config.waterSurface)
  assert.equal(result.nanjingRestore.config.materials.Material_24.opacity, .8)
  assert.equal(result.nanjingRestore.config.materials['建筑_通透玻璃'].metalness, .06)
  assert.equal(upgrade.fetches.length, 0)
  assert.deepEqual(legacy, previous)
})

test('wrong glass slot stops the full plan before creating a partial repair', async () => {
  const original = scene(); original.nanjingRestore.historySnapshot.models[0].materials[2].path = [9, 15, 0]
  const options = environment(new Map(), { fetcher: async () => ({ ok: true, json: async () => original }) })
  await assert.rejects(prepareNanjingRepairProject(options), /通透玻璃材质绑定/)
  assert.equal(options.writes.length, 0)
})
