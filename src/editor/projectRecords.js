// Scene payloads and their small listing records commit together. This module
// deliberately has no editor/renderer imports and performs no periodic saves.
export const PROJECT_RECORDS_CHANGED_EVENT = 'three-editor-project-records-changed'
const DATABASE = 'threeEditorProjectRecords'
const LEGACY_DATABASE = 'nanjingRestoreProjects'
const SUFFIX = '-newEditor'
const VERSION_STORES = ['records', 'scenes', 'versions', 'versionRecords']
const validParams = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const newMarker = value => value?.projectRecord?.storage === 'indexedDB'
const oldMarker = value => value?.nanjingRestore?.storage === 'indexedDB'
const actualParams = value => validParams(value) && !newMarker(value) && !oldMarker(value)
const validTime = value => Number.isFinite(value) && value >= 0

function checkedName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 512 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new TypeError('工程名称无效')
  }
  return name
}
function storage() { try { return globalThis.localStorage ?? null } catch { return null } }
function parse(value) { try { return value === null ? null : JSON.parse(value) } catch { return null } }
function metadata(value) {
  return { name: value.name, updatedAt: validTime(value.updatedAt) ? value.updatedAt : 0,
    versionCount: value.versionCount || 1, latestVersionId: value.latestVersionId || null,
    ...(validTime(value.lastOpenedAt) ? { lastOpenedAt: value.lastOpenedAt } : {}) }
}
function notify(type, record) {
  // Persistence must remain successful even if an embedding app replaces its
  // event transport or localStorage is unavailable/private/quota limited.
  try {
    const host = globalThis.window
    if (host?.dispatchEvent && typeof globalThis.CustomEvent === 'function') {
      host.dispatchEvent(new CustomEvent(PROJECT_RECORDS_CHANGED_EVENT, { detail: { type, ...record } }))
    }
  } catch { /* The committed IndexedDB record is authoritative. */ }
}

function openDatabase(name, create = false) {
  return new Promise((resolve, reject) => {
    let request, missing = false, settled = false
    const finish = (error, database = null) => {
      if (settled) { database?.close(); return }
      settled = true; clearTimeout(timer)
      if (error) reject(error); else resolve(database)
    }
    const timer = setTimeout(() => finish(new Error('工程数据库打开超时，请关闭阻止升级的旧页面后重试')), 8000)
    try {
      if (!globalThis.indexedDB) throw new Error('当前环境无法使用 IndexedDB 保存工程')
      request = create ? indexedDB.open(name, 2) : indexedDB.open(name)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!create || settled) { missing = !create; request.transaction.abort(); database.close(); return }
        if (!database.objectStoreNames.contains('records')) database.createObjectStore('records', { keyPath: 'name' })
        if (!database.objectStoreNames.contains('scenes')) database.createObjectStore('scenes', { keyPath: 'name' })
        if (!database.objectStoreNames.contains('versions')) database.createObjectStore('versions', { keyPath: 'id' })
        if (!database.objectStoreNames.contains('versionRecords')) {
          database.createObjectStore('versionRecords', { keyPath: 'id' }).createIndex('name', 'name')
          // Preserve the sole old save before the first versioned overwrite.
          const tx = request.transaction
          tx.objectStore('scenes').openCursor().onsuccess = event => {
            const cursor = event.target.result
            if (!cursor) return
            const { name, params } = cursor.value
            if (actualParams(params)) tx.objectStore('records').get(name).onsuccess = item => {
              const record = item.target.result || { name, updatedAt: 0 }
              const id = `legacy:${name}`
              const version = { id, name, number: 1, createdAt: record.updatedAt || 0, kind: 'legacy', label: '升级前存档' }
              tx.objectStore('versions').add({ id, name, params })
              tx.objectStore('versionRecords').add(version)
              tx.objectStore('records').put({ ...record, versionCount: 1, latestVersionId: id })
            }
            cursor.continue()
          }
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        finish(null, database)
      }
      request.onerror = () => finish(missing ? null : request.error || new Error('无法打开工程数据库'))
      request.onblocked = () => finish(new Error('工程数据库被其他页面占用，请关闭旧页面后重试'))
    } catch (error) { finish(error) }
  })
}

function transaction(database, stores, mode, operation) {
  return new Promise((resolve, reject) => {
    let tx, result, failure = null
    const abort = error => {
      failure ||= error
      try { tx.abort() } catch { reject(failure) }
    }
    try {
      tx = database.transaction(stores, mode)
      tx.oncomplete = () => failure ? reject(failure) : resolve(result)
      tx.onabort = () => reject(failure || tx.error || new Error('工程保存事务已取消'))
      // Wait for abort/complete rather than treating a successful put request
      // as a successful transaction. Quota/commit errors can occur afterwards.
      tx.onerror = event => { failure ||= event.target?.error || tx.error || new Error('工程数据库操作失败') }
      operation(tx, value => { result = value }, abort)
    } catch (error) { if (tx) abort(error); else reject(error) }
  })
}

async function readCurrent(name) {
  const database = await openDatabase(DATABASE)
  if (!database) return { record: null, params: null }
  try {
    return await transaction(database, ['records', 'scenes'], 'readonly', (tx, done) => {
      const result = { record: null, params: null }; done(result)
      tx.objectStore('records').get(name).onsuccess = event => { result.record = event.target.result ?? null }
      tx.objectStore('scenes').get(name).onsuccess = event => { result.params = event.target.result?.params ?? null }
    })
  } finally { database.close() }
}

async function readLegacyDatabase(name) {
  const database = await openDatabase(LEGACY_DATABASE)
  if (!database) return null
  try {
    if (!database.objectStoreNames.contains('scenes')) throw new Error('旧南京工程数据库缺少场景表')
    return await transaction(database, 'scenes', 'readonly', (tx, done) => {
      tx.objectStore('scenes').get(name).onsuccess = event => done(event.target.result ?? null)
    })
  } finally { database.close() }
}

/** Returns saved params, never an IndexedDB marker. An unreadable known save
 * throws so callers cannot accidentally replace it with an empty template. */
export async function readProjectScene(name, fallback = null) {
  name = checkedName(name)
  let current, currentError
  try { current = await readCurrent(name) } catch (error) { currentError = error }
  if (current?.record?.deleted) return fallback
  if (actualParams(current?.params)) return current.params
  if (current?.record) throw new Error(`工程“${name}”的场景数据缺失，已保留原记录`)
  const local = storage(), raw = local?.getItem(name + SUFFIX) ?? null, legacy = parse(raw)
  if (actualParams(legacy)) return legacy
  if (newMarker(legacy)) throw currentError || new Error(`找不到已保存的工程“${name}”`)
  if (oldMarker(legacy)) {
    const params = await readLegacyDatabase(name)
    if (actualParams(params)) return params
    throw new Error(`找不到已保存的旧南京工程“${name}”`)
  }
  if (raw !== null) throw new Error(`工程“${name}”的旧保存 JSON 已损坏，已保留原数据`)
  if (currentError) throw currentError
  // Older quota fallback saves can exist without their localStorage marker.
  const orphan = await readLegacyDatabase(name)
  if (actualParams(orphan)) return orphan
  return fallback
}

/** Only actual saved payloads are listed; a name in new_sceneList is not a save. */
export async function listProjectRecords() {
  const records = new Map(), excluded = new Set()
  let database
  try {
    database = await openDatabase(DATABASE)
    if (database) {
      const saved = await transaction(database, ['records', 'scenes'], 'readonly', (tx, done) => {
        const value = { records: [], names: [] }; done(value)
        tx.objectStore('records').getAll().onsuccess = event => { value.records = event.target.result }
        tx.objectStore('scenes').getAllKeys().onsuccess = event => { value.names = event.target.result }
      })
      const names = new Set(saved.names)
      for (const record of saved.records) {
        try { checkedName(record.name) } catch { continue }
        if (record.deleted) excluded.add(record.name)
        else if (names.has(record.name)) records.set(record.name, metadata(record))
      }
    }
  } catch { /* Still display independently readable legacy records. */ }
  finally { database?.close() }
  const local = storage(), candidates = new Set()
  try {
    for (let index = 0; index < (local?.length ?? 0); index++) {
      const key = local.key(index); if (key?.endsWith(SUFFIX)) candidates.add(key.slice(0, -SUFFIX.length))
    }
    const oldList = parse(local?.getItem('new_sceneList') ?? null)
    if (Array.isArray(oldList)) for (const item of oldList) if (typeof item?.name === 'string') candidates.add(item.name)
  } catch { /* Restricted localStorage must not hide new IndexedDB records. */ }
  for (const name of candidates) {
    if (records.has(name) || excluded.has(name)) continue
    try {
      checkedName(name)
      const value = parse(local?.getItem(name + SUFFIX) ?? null)
      if (actualParams(value)) records.set(name, { name, updatedAt: 0 })
    } catch { /* One corrupt entry does not break the list. */ }
  }
  let legacyDatabase
  try {
    legacyDatabase = await openDatabase(LEGACY_DATABASE)
    if (legacyDatabase?.objectStoreNames.contains('scenes')) {
      await transaction(legacyDatabase, 'scenes', 'readonly', (tx, done) => {
        const store = tx.objectStore('scenes')
        store.getAllKeys().onsuccess = event => {
          for (const name of event.target.result) {
            if (records.has(name) || excluded.has(name)) continue
            try { checkedName(name) } catch { continue }
            store.get(name).onsuccess = item => { if (actualParams(item.target.result)) records.set(name, { name, updatedAt: 0 }) }
          }
          done()
        }
      })
    }
  } catch { /* An unavailable old database does not erase valid new records. */ }
  finally { legacyDatabase?.close() }
  return [...records.values()].sort((a, b) => Math.max(b.lastOpenedAt || 0, b.updatedAt) - Math.max(a.lastOpenedAt || 0, a.updatedAt) || a.name.localeCompare(b.name))
}

function compatibilitySave(name) {
  const local = storage()
  if (!local) return
  try { local.setItem(name + SUFFIX, JSON.stringify({ projectRecord: { version: 1, storage: 'indexedDB', database: DATABASE, name } })) } catch { /* Durable scene already committed. */ }
  try {
    const list = parse(local.getItem('new_sceneList'))
    const entries = Array.isArray(list) ? list.filter(item => typeof item?.name === 'string') : []
    if (!entries.some(item => item.name === name)) entries.push({ name })
    local.setItem('new_sceneList', JSON.stringify(entries))
  } catch { /* IndexedDB listing remains complete. */ }
}

function payloadOf(params) {
  const payload = JSON.parse(JSON.stringify(params))
  if (!actualParams(payload)) throw new TypeError('工程场景数据无效，不能保存存储标记')
  return payload
}

function appendVersion(tx, previous, name, params, kind, extra = {}) {
  const createdAt = Math.max(Date.now(), (validTime(previous?.updatedAt) ? previous.updatedAt : 0) + 1)
  const id = globalThis.crypto?.randomUUID?.() || `${createdAt}-${Math.random().toString(36).slice(2)}`
  const version = { id, name, number: (previous?.versionCount || 0) + 1, createdAt, kind,
    parentId: previous?.latestVersionId || null, ...extra }
  const record = { ...previous, name, deleted: false, updatedAt: createdAt, versionCount: version.number, latestVersionId: id }
  tx.objectStore('versions').add({ id, name, params })
  tx.objectStore('versionRecords').add(version)
  tx.objectStore('scenes').put({ name, params })
  tx.objectStore('records').put(record)
  return record
}

export async function saveProjectScene(name, params, { kind = 'save', label, createOnly = false } = {}) {
  name = checkedName(name)
  // Match the editor's previous JSON serialization semantics: functions and
  // undefined fields are omitted; a cyclic/invalid scene cannot replace a save.
  const payload = payloadOf(params)
  // LocalStorage/old-Nanjing saves also become a retained first version.
  const legacy = await readProjectScene(name)
  const database = await openDatabase(DATABASE, true)
  let record
  try {
    record = await transaction(database, VERSION_STORES, 'readwrite', (tx, done, abort) => {
      const records = tx.objectStore('records')
      records.get(name).onsuccess = event => {
        try {
          let previous = event.target.result
          // The collision guard shares the write transaction with creation.
          // Concurrent tabs cannot overwrite or append to an existing project.
          if (createOnly && (previous || actualParams(legacy))) {
            throw Object.assign(new Error('工程名称已存在，请使用其他名称'), { code: 'PROJECT_ALREADY_EXISTS' })
          }
          if (!previous?.latestVersionId && actualParams(legacy)) {
            previous = appendVersion(tx, previous, name, legacy, 'legacy', { label: '原有存档' })
            if (kind === 'legacy') { done(previous); return }
          }
          done(appendVersion(tx, previous, name, payload, kind, label ? { label: String(label).slice(0, 160) } : {}))
        } catch (error) { abort(error) }
      }
    })
  } finally { database.close() }
  compatibilitySave(name)
  notify('saved', record)
  return record
}

export async function listProjectVersions(name) {
  name = checkedName(name)
  let database = await openDatabase(DATABASE, true)
  try {
    const versions = await transaction(database, 'versionRecords', 'readonly', (tx, done) => {
      tx.objectStore('versionRecords').index('name').getAll(name).onsuccess = event => done(event.target.result)
    })
    if (versions.length) return versions.sort((a, b) => b.number - a.number)
  } finally { database.close() }
  const legacy = await readProjectScene(name)
  if (!legacy) return []
  await saveProjectScene(name, legacy, { kind: 'legacy', label: '原有存档' })
  return listProjectVersions(name)
}

export async function deleteProjectVersion(name, id) {
  name = checkedName(name)
  if (typeof id !== 'string' || !id) throw new Error('历史版本标识无效')
  const database = await openDatabase(DATABASE, true)
  try {
    return await transaction(database, VERSION_STORES, 'readwrite', (tx, done, abort) => {
      tx.objectStore('records').get(name).onsuccess = event => {
        const previous = event.target.result
        const request = tx.objectStore('versionRecords').index('name').getAll(name)
        request.onsuccess = () => {
          const versions = request.result || []
          if (!versions.some(version => version.id === id)) { abort(new Error('找不到该历史版本')); return }
          if (versions.length <= 1) { abort(new Error('至少保留一个版本，不能删除最后一个版本')); return }
          const remaining = versions.filter(version => version.id !== id).sort((a, b) => b.number - a.number)
          tx.objectStore('versions').delete(id)
          tx.objectStore('versionRecords').delete(id)
          tx.objectStore('records').put({ ...previous, versionCount: remaining.length, latestVersionId: remaining[0].id })
          done({ deleted: id, versionCount: remaining.length, latestVersionId: remaining[0].id })
        }
        request.onerror = () => abort(request.error || new Error('历史版本读取失败'))
      }
    })
  } finally { database.close() }
}

export async function readProjectVersion(name, id) {
  name = checkedName(name)
  const database = await openDatabase(DATABASE, true)
  try {
    return await transaction(database, 'versions', 'readonly', (tx, done, abort) => {
      tx.objectStore('versions').get(id).onsuccess = event => {
        const value = event.target.result
        if (value?.name !== name || !actualParams(value.params)) { abort(new Error('找不到该工程版本，当前工程未改变')); return }
        done(value.params)
      }
    })
  } finally { database.close() }
}

/** Backup unsaved live edits and activate a historical copy in ONE transaction.
 * Existing immutable versions are never edited, even when restoring themselves. */
export async function restoreProjectVersion(name, id, { currentProject } = {}) {
  name = checkedName(name)
  if (!currentProject) throw new Error('恢复前需要当前工程快照，已停止回档')
  const currentName = checkedName(currentProject.name), currentParams = payloadOf(currentProject.params)
  await listProjectVersions(currentName)
  const database = await openDatabase(DATABASE, true)
  let result
  try {
    result = await transaction(database, VERSION_STORES, 'readwrite', (tx, done, abort) => {
      const values = new Map(), names = [...new Set([name, currentName])]
      let pending = names.length + 1, target
      const finish = () => {
        if (--pending) return
        try {
          if (target?.name !== name || !actualParams(target.params)) throw new Error('找不到该工程版本，当前工程未改变')
          const backup = appendVersion(tx, values.get(currentName), currentName, currentParams, 'before-restore', { label: '回档前自动备份' })
          values.set(currentName, backup)
          const restored = payloadOf(target.params)
          restored.projectHistory = { mode: 'restored', sourceVersionId: id, restoredAt: Date.now() }
          const record = appendVersion(tx, values.get(name), name, restored, 'restore', { restoredFrom: id, label: '恢复历史版本' })
          done({ record, backup, params: restored })
        } catch (error) { abort(error) }
      }
      tx.objectStore('versions').get(id).onsuccess = event => { target = event.target.result; finish() }
      for (const key of names) tx.objectStore('records').get(key).onsuccess = event => { values.set(key, event.target.result); finish() }
    })
  } finally { database.close() }
  compatibilitySave(currentName); compatibilitySave(name)
  notify('restored', result.record)
  return result
}

export async function touchProjectRecord(name) {
  name = checkedName(name)
  const database = await openDatabase(DATABASE)
  if (!database) return null
  let record
  try {
    record = await transaction(database, ['records', 'scenes'], 'readwrite', (tx, done, abort) => {
      done(null)
      tx.objectStore('records').get(name).onsuccess = event => {
        const previous = event.target.result
        if (!previous || previous.deleted) return
        tx.objectStore('scenes').getKey(name).onsuccess = item => {
          if (item.target.result === undefined) return
          try {
            const next = { ...metadata(previous), lastOpenedAt: Math.max(Date.now(), (validTime(previous.lastOpenedAt) ? previous.lastOpenedAt : 0) + 1) }
            tx.objectStore('records').put(next); done(next)
          } catch (error) { abort(error) }
        }
      }
    })
  } finally { database.close() }
  if (record) notify('opened', record)
  return record
}

export async function removeProjectRecord(name) {
  name = checkedName(name)
  const database = await openDatabase(DATABASE, true)
  try {
    await transaction(database, ['records', 'scenes'], 'readwrite', (tx, done) => {
      tx.objectStore('scenes').delete(name)
      // Keep a tiny deletion marker if old storage cannot be cleaned up. It
      // prevents a legacy save from reappearing at the next reload.
      tx.objectStore('records').get(name).onsuccess = event => {
        tx.objectStore('records').put({ ...event.target.result, name, deleted: true, updatedAt: Date.now() })
      }
      done()
    })
  } finally { database.close() }
  const local = storage()
  try { local?.removeItem(name + SUFFIX) } catch { /* Tombstone is authoritative. */ }
  try {
    const list = parse(local?.getItem('new_sceneList') ?? null)
    if (Array.isArray(list)) local.setItem('new_sceneList', JSON.stringify(list.filter(item => item?.name !== name)))
  } catch { /* Tombstone is authoritative. */ }
  let legacyDatabase
  try {
    legacyDatabase = await openDatabase(LEGACY_DATABASE)
    if (legacyDatabase?.objectStoreNames.contains('scenes')) await transaction(legacyDatabase, 'scenes', 'readwrite', (tx, done) => { tx.objectStore('scenes').delete(name); done() })
  } catch { /* A legacy cleanup failure cannot resurrect the deleted record. */ }
  finally { legacyDatabase?.close() }
  notify('removed', { name })
}
