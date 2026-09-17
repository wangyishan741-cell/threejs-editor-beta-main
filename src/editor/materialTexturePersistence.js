import { TextureLoader } from 'three'

const KEY = 'baseColorTextures'
export const BASE_COLOR_TEXTURE_EDITED = 'baseColorTextureEdited'
const VALUES = ['name', 'channel', 'colorSpace', 'flipY', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'anisotropy',
    'rotation', 'matrixAutoUpdate', 'generateMipmaps', 'premultiplyAlpha', 'unpackAlignment']
const VECTORS = { repeat: 2, offset: 2, center: 2, matrix: 9 }
const ignored = object => !object || object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper
const rootsOf = editor => (editor.scene?.children || []).filter(root => root.editorType === 'isModelGroup' && !ignored(root))
const slots = object => Array.isArray(object.material) ? object.material : [object.material]
const attached = (object, root) => { for (let node = object; node; node = node.parent) if (node === root) return true; return false }
const stableUrl = url => typeof url === 'string' && /^(data:image\/|https?:\/\/|\.?\.?\/)/i.test(url)
const unique = list => list.length === 1 ? list[0] : null
const signature = (object, path) => ({ path: path.slice(), name: object.name, type: object.type,
    ...(object.geometry ? { vertices: object.geometry.attributes?.position?.count ?? 0, indices: object.geometry.index?.count ?? 0 } : {}) })
const matches = (a, b) => a.name === b.name && a.type === b.type && a.vertices === b.vertices && a.indices === b.indices

export function captureBaseColorTexture(texture) {
    if (!texture) return null
    if (!texture.isTexture || !stableUrl(texture.textureUrl)) throw new Error('更换的基础色贴图缺少可保存的图片地址')
    return { url: texture.textureUrl, ...Object.fromEntries(VALUES.map(key => [key, texture[key]])),
        ...Object.fromEntries(Object.keys(VECTORS).map(key => [key, texture[key].toArray()])) }
}

function applyDescriptor(texture, descriptor) {
    for (const key of VALUES) if (descriptor[key] !== undefined) texture[key] = descriptor[key]
    for (const [key, length] of Object.entries(VECTORS)) {
        const value = descriptor[key]
        if (Array.isArray(value) && value.length === length && value.every(Number.isFinite)) texture[key].fromArray(value)
    }
    texture.textureUrl = descriptor.url; texture.textureType = 'image'; texture.needsUpdate = true
    return texture
}

// The load-state subscriber already owns a callback hub when installed. Subscribe
// to it directly so either installation order preserves both completion handlers.
const HOOKS = Symbol.for('three-editor.project-load-hooks.v1')
function afterComplete(service, listener) {
    const hub = service?.[HOOKS]?.get('complete')
    if (hub) { hub.listeners.add(listener); return () => { hub.listeners.delete(listener); hub.release() } }
    if (typeof service?.complete !== 'function') return () => {}
    const previous = service.complete
    let active = true
    function complete(...args) {
        let error
        try { return previous.apply(this, args) }
        catch (failure) { error = failure; throw failure }
        finally { if (active) listener({ args, error }) }
    }
    service.complete = complete
    return () => { active = false; if (service.complete === complete) service.complete = previous }
}

/** Persist only explicit picker edits. Native storage omits null maps and loses
 * GLB flipY/channel on replacement; old, unedited material slots stay untouched.
 * Nanjing's immutable material history remains authoritative when present. */
export function installMaterialTexturePersistence(editor, initialParams = {}, {
    load = url => new TextureLoader().loadAsync(url), onError = error => console.warn('[material-texture]', error),
} = {}) {
    if (editor.materialTexturePersistence) return editor.materialTexturePersistence
    let params = initialParams, generation = 0, disposed = false, records = new Map(), releases = [], pending = new Set(), errors = []
    const originalSave = editor.saveSceneEdit, originalReset = editor.resetEditorStorage, previousAdd = editor.scene.ADDCALL
    const historyOwnsMaps = () => params?.projectHistory?.mode === 'restored' && params?.nanjingRestore?.historySnapshot?.version === 1
    const sourceOf = material => editor.getNanjingSourceMaterial?.(material) || material
    function findEntry(root, entries = params?.modelCores || []) {
        const id = root.modelInfo?.collectionId
        return unique(entries.filter(entry => entry.modelInfo === root.modelInfo))
            || unique(entries.filter(entry => id && entry.modelInfo?.collectionId === id))
            || unique(entries.filter(entry => entry.group?.uuid === root.uuid))
            || unique(entries.filter(entry => entry.modelInfo?.url === root.modelInfo?.url && entry.group?.name === root.name))
    }
    function register(root) {
        if (ignored(root) || root.editorType !== 'isModelGroup') return null
        if (records.has(root)) return records.get(root)
        const entry = findEntry(root)
        root.modelInfo = { ...root.modelInfo, collectionId: root.modelInfo?.collectionId || root.uuid }
        const record = { root, entry, nodes: new Map(), applied: false, restoring: null }
        // Register while ADDCALL still sees the original child indices. Later
        // collection deletions must not shift a sibling's saved material path.
        function visit(object, path) {
            if (ignored(object)) return
            record.nodes.set(path.join('/'), { object, identity: signature(object, path) })
            object.children.forEach((child, index) => visit(child, [...path, index]))
        }
        visit(root, []); records.set(root, record); return record
    }
    function track(promise) {
        const queue = pending, currentGeneration = generation
        queue.add(promise)
        promise.catch(error => {
            if (!disposed && generation === currentGeneration) { errors.push(error); onError?.(error) }
        }).finally(() => queue.delete(promise))
        return promise
    }
    async function applyRoot(record) {
        const descriptor = record.entry?.group?.[KEY], currentGeneration = generation
        if (historyOwnsMaps() || descriptor?.version !== 1 || !Array.isArray(descriptor.entries)) return { restored: 0, skipped: [] }
        const plans = [], skipped = []
        try { for (const entry of descriptor.entries) {
            const node = Array.isArray(entry.path) && record.nodes.get(entry.path.join('/'))
            const object = node?.object, material = object && slots(object)[entry.slot]
            if (!node || !matches(node.identity, entry) || !attached(object, record.root) || !material || material.name !== entry.materialName) {
                skipped.push(entry.path); continue
            }
            const source = sourceOf(material)
            if (!('map' in source)) { skipped.push(entry.path); continue }
            const previousMap = source.map
            let texture = null
            if (entry.map !== null) {
                if (!entry.map || !stableUrl(entry.map.url)) throw new Error('保存的基础色贴图地址无效')
                // Core may already have loaded this image. Clone its sampler
                // before restoring missing fields; do not mutate another slot.
                if (previousMap?.isTexture && previousMap.textureUrl === entry.map.url) texture = previousMap.clone()
                else texture = await load(entry.map.url)
                if (!texture?.isTexture) throw new Error('基础色贴图读取失败')
                applyDescriptor(texture, entry.map)
            }
            plans.push({ source, material, previousMap, texture })
        } } catch (error) {
            for (const plan of plans) plan.texture?.dispose()
            throw error
        }
        if (disposed || generation !== currentGeneration || !attached(record.root, editor.scene)) {
            for (const plan of plans) plan.texture?.dispose()
            return { restored: 0, skipped, cancelled: true }
        }
        let restored = 0
        for (const { source, material, previousMap, texture } of plans) {
            // A user's edit while an image was loading takes precedence.
            if (source.map !== previousMap) { texture?.dispose(); continue }
            source.map = texture; source.userData[BASE_COLOR_TEXTURE_EDITED] = true; source.needsUpdate = true
            material.map = texture; material.userData[BASE_COLOR_TEXTURE_EDITED] = true; material.needsUpdate = true
            restored++
        }
        if (restored) {
            if (editor.requestNanjingMaterialRender?.() !== true) editor.renderScene?.()
            if (editor.renderer?.shadowMap) editor.renderer.shadowMap.needsUpdate = true
        }
        return { restored, skipped }
    }
    function restoreRoot(root) {
        const record = register(root)
        if (!record || record.applied || disposed) return Promise.resolve({ restored: 0, skipped: [] })
        if (record.restoring) return record.restoring
        if (historyOwnsMaps() || record.entry?.group?.[KEY]?.version !== 1) {
            record.applied = true
            return Promise.resolve({ restored: 0, skipped: [] })
        }
        record.restoring = track(applyRoot(record).then(result => { if (!result.cancelled) record.applied = true; return result }))
        return record.restoring
    }
    function restoreAll() { return Promise.all(rootsOf(editor).map(restoreRoot)) }
    function watchLoads() {
        for (const release of releases.splice(0)) release()
        const currentGeneration = generation
        for (const progress of editor.modelCores?.progressList || []) {
            releases.push(afterComplete(progress.loaderService, ({ error }) => {
                if (disposed || error || currentGeneration !== generation || params.nanjingRestore) return
                // The core's completion callback runs after native child and
                // material restoration. Nanjing calls restoreAll explicitly
                // after its own material rules, before display-only effects.
                void restoreAll().catch(() => {})
            }))
        }
    }
    function setParams(next = {}) {
        generation++; params = next; records = new Map(); errors = []; pending = new Set()
        for (const release of releases.splice(0)) release()
    }
    function annotateSave(data) {
        if (historyOwnsMaps()) return data
        for (const root of rootsOf(editor)) {
            const record = records.get(root) || register(root), entry = findEntry(root, data.modelCores || [])
            if (!entry?.group) continue
            const entries = [], seen = new Set()
            for (const { object, identity } of record.nodes.values()) {
                if (!object.isMesh || !attached(object, root)) continue
                slots(object).forEach((material, slot) => {
                    if (!material) return
                    const source = sourceOf(material)
                    if (source.userData?.[BASE_COLOR_TEXTURE_EDITED] !== true || seen.has(source)) return
                    seen.add(source)
                    entries.push({ ...identity, slot, materialName: source.name, map: captureBaseColorTexture(source.map) })
                })
            }
            if (entries.length) entry.group[KEY] = { version: 1, entries }
            else delete entry.group[KEY]
        }
        return data
    }
    function save(...args) {
        if (pending.size) throw new Error('基础色贴图尚未恢复完成，请稍后保存')
        if (errors.length) throw new Error('基础色贴图恢复失败，已保留原存档：' + errors[0].message)
        const data = originalSave.apply(editor, args)
        return data?.then ? data.then(annotateSave) : annotateSave(data)
    }
    function reset(next, ...args) {
        setParams(next)
        const result = originalReset.call(editor, next, ...args)
        for (const root of rootsOf(editor)) register(root)
        watchLoads(); return result
    }
    function add(object) {
        register(object)
        return previousAdd?.call(this, object)
    }
    function dispose() {
        if (disposed) return
        disposed = true; generation++
        for (const release of releases.splice(0)) release()
        records.clear()
        if (editor.saveSceneEdit === save) editor.saveSceneEdit = originalSave
        if (editor.resetEditorStorage === reset) editor.resetEditorStorage = originalReset
        if (editor.scene.ADDCALL === add) editor.scene.ADDCALL = previousAdd
        if (editor.materialTexturePersistence === controller) delete editor.materialTexturePersistence
    }
    const controller = { setParams, restoreRoot, restoreAll, annotateSave,
        whenReady: () => Promise.all([...pending]), getStatus: () => ({ pending: pending.size, errors: errors.map(error => error.message) }), dispose }
    editor.materialTexturePersistence = controller
    if (typeof originalSave === 'function') editor.saveSceneEdit = save
    if (typeof originalReset === 'function') editor.resetEditorStorage = reset
    editor.scene.ADDCALL = add
    for (const root of rootsOf(editor)) register(root)
    watchLoads()
    // Existing roots have completed synchronous core restoration already.
    if (!params.nanjingRestore && rootsOf(editor).length) void restoreAll().catch(() => {})
    return controller
}
