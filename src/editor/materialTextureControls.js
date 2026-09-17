import { collectProjectTextures, textureImageSize, drawTexturePreview, createBaseColorTexture,
    baseColorFlipY, loadLocalBaseColorTexture, loadProjectBaseColorTexture, assignBaseColorTexture, LOCAL_TEXTURE_ACCEPT } from './materialTextures.js'

const button = (label, action) => {
    const element = document.createElement('button')
    element.type = 'button'; element.textContent = label
    element.addEventListener('click', action)
    return element
}

function preview(texture, size = 160) {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', texture?.name || '贴图预览')
    if (texture && drawTexturePreview(texture, canvas, size)) return canvas
    const empty = document.createElement('span')
    empty.className = 'material-texture-empty'; empty.textContent = texture ? '预览不可用' : '无贴图'
    return empty
}

function openDialog(owner, title) {
    owner.querySelector('dialog')?.remove()
    const dialog = document.createElement('dialog')
    dialog.className = 'material-texture-dialog'; dialog.setAttribute('aria-label', title)
    const header = document.createElement('header'), heading = document.createElement('strong')
    heading.textContent = title
    header.append(heading, button('关闭', () => dialog.close()))
    dialog.append(header)
    dialog.addEventListener('close', () => dialog.remove())
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close() })
    // Searching/previewing is read-only; do not trigger the scene's material-edit handler.
    for (const name of ['input', 'change', 'keyup']) dialog.addEventListener(name, event => event.stopPropagation())
    owner.append(dialog); dialog.showModal()
    return dialog
}

export function appendBaseColorTextureControls(parent, { editor, record, markDirty, onApplied }) {
    const container = document.createElement('section')
    container.className = 'material-texture-controls'; container.setAttribute('aria-label', '基础色贴图')
    const row = document.createElement('div'); row.className = 'material-texture-current'
    const thumbnail = button('', () => {
        const texture = record.material.map
        if (!texture) return
        const dialog = openDialog(container, '基础色贴图预览')
        const size = textureImageSize(texture), name = document.createElement('p')
        name.textContent = `${texture.name || '基础色贴图'} · ${size.width} × ${size.height}`
        const image = preview(texture, 1400); image.classList.add('material-texture-large')
        dialog.append(name, image)
    })
    thumbnail.className = 'material-texture-thumb'; thumbnail.setAttribute('aria-label', '查看基础色贴图')
    const caption = document.createElement('div'); caption.className = 'material-texture-caption'
    row.append(thumbnail, caption)
    const actions = document.createElement('div'); actions.className = 'material-texture-actions'
    const status = document.createElement('p'); status.className = 'material-texture-status'; status.setAttribute('role', 'status')
    const file = document.createElement('input'); file.type = 'file'; file.accept = LOCAL_TEXTURE_ACCEPT
    file.hidden = true; file.setAttribute('aria-label', '选择本地基础色贴图')
    const renderCurrent = () => {
        const texture = record.material.map, size = textureImageSize(texture)
        thumbnail.replaceChildren(preview(texture)); thumbnail.disabled = !texture
        caption.textContent = texture ? `${texture.name || '基础色贴图'}\n${size.width} × ${size.height} · 点击缩略图查看` : '基础色贴图\n尚未设置'
    }
    let generation = 0, busy = false
    const setBusy = value => { busy = value; for (const element of actions.querySelectorAll('button')) element.disabled = value }
    const apply = texture => {
        const source = assignBaseColorTexture(editor, record, texture)
        markDirty(editor, source)
        renderCurrent()
        status.textContent = '贴图已更换，保存工程后可保留。'
        // Render-only materials can be released after the edit. Re-resolve the
        // live material from its mesh slots instead of keeping a detached copy.
        onApplied?.(source, record)
    }
    const choose = async (load, disposeCandidate = false) => {
        if (busy) return
        const request = ++generation
        setBusy(true); status.textContent = '正在载入贴图…'
        let candidate, replacement, applied = false
        try {
            candidate = await load()
            if (!container.isConnected || request !== generation) return
            replacement = createBaseColorTexture(candidate, record.material.map, { flipY: baseColorFlipY(record) })
            if (!container.isConnected || request !== generation) return
            apply(replacement); applied = true
        } catch (error) {
            if (container.isConnected && request === generation) status.textContent = error?.message || '贴图载入失败，原贴图已保留'
        } finally {
            if (!applied) replacement?.dispose()
            if (disposeCandidate) candidate?.dispose()
            if (request === generation) setBusy(false)
        }
    }
    actions.append(button('工程内选择', () => {
        const entries = collectProjectTextures(editor), dialog = openDialog(container, '选择工程内贴图')
        const search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索贴图或材质名称'
        search.setAttribute('aria-label', '搜索工程贴图')
        const list = document.createElement('div'); list.className = 'material-texture-library'
        const draw = () => {
            const query = search.value.trim().toLocaleLowerCase()
            list.replaceChildren()
            const filtered = entries.filter(item => `${item.name} ${item.usages.join(' ')}`.toLocaleLowerCase().includes(query))
            if (!filtered.length) { const empty = document.createElement('p'); empty.textContent = query ? '没有匹配的贴图' : '工程中暂无可用的图片贴图，可从本地导入。'; list.append(empty) }
            for (const item of filtered) {
                const tile = button('', () => { dialog.close(); choose(() => loadProjectBaseColorTexture(item.texture), true) })
                tile.className = 'material-texture-option'; tile.setAttribute('aria-label', `使用贴图：${item.name}`)
                tile.title = item.usages.join('\n')
                const label = document.createElement('span'); label.textContent = item.name
                tile.append(preview(item.texture, 128), label); list.append(tile)
            }
        }
        search.addEventListener('input', draw)
        dialog.append(search, list); draw(); search.focus()
    }), button('本地图片…', () => { file.value = ''; file.click() }))
    file.addEventListener('change', event => {
        event.stopPropagation()
        const selected = file.files?.[0]
        if (selected) choose(() => loadLocalBaseColorTexture(selected), true)
    })
    container.append(row, actions, file, status); parent.append(container); renderCurrent()
    return { refresh: renderCurrent }
}

export const MATERIAL_TEXTURE_STYLES = `
    #realistic-material-panel .material-texture-controls { margin: 5px 0 10px; padding: 8px; background: #19232d; border-radius: 5px; }
    #realistic-material-panel .material-texture-current { display: flex; align-items: center; gap: 9px; }
    #realistic-material-panel .material-texture-thumb { width: 60px; height: 60px; flex: 0 0 60px; padding: 2px; border: 1px solid #526273; background: #313e48; cursor: pointer; }
    #realistic-material-panel .material-texture-thumb canvas { width: 100%; height: 100%; object-fit: contain; }
    #realistic-material-panel .material-texture-caption { color: #c6d3e1; font-size: 11px; white-space: pre-line; overflow-wrap: anywhere; }
    #realistic-material-panel .material-texture-actions { display: flex; gap: 6px; margin-top: 8px; }
    #realistic-material-panel .material-texture-actions button, .material-texture-dialog header button { border: 1px solid #465b70; background: #304459; color: #e9f4ff; border-radius: 4px; padding: 5px 8px; cursor: pointer; }
    #realistic-material-panel .material-texture-actions button { flex: 1; }
    #realistic-material-panel .material-texture-controls button:disabled { opacity: .5; cursor: default; }
    #realistic-material-panel .material-texture-status { font-size: 11px; color: #b6d6ee; margin: 6px 0 0; }
    #realistic-material-panel .material-texture-status:empty { display: none; }
    .material-texture-dialog { color: #e5edf5; background: #202d39; border: 1px solid #53667a; border-radius: 8px; padding: 16px; width: min(700px,90vw); max-height: 85vh; overflow: auto; font: 13px/1.5 system-ui,sans-serif; }
    .material-texture-dialog::backdrop { background: #0009; }
    .material-texture-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
    .material-texture-dialog input[type=search] { width: 100%; padding: 8px; background: #152330; color: #fff; border: 1px solid #53667a; border-radius: 4px; margin-bottom: 12px; }
    .material-texture-library { display: grid; grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); gap: 9px; }
    .material-texture-option { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px; background: #172430; color: #dbe9f5; border: 1px solid #445b70; border-radius: 4px; cursor: pointer; min-width: 0; }
    .material-texture-option:hover { border-color: #83bded; background: #30475b; }
    .material-texture-option canvas { width: 100%; height: 90px; object-fit: contain; }
    .material-texture-option span { width: 100%; overflow-wrap: anywhere; font-size: 11px; }
    .material-texture-empty { color: #a9b7c5; font-size: 11px; }
    .material-texture-large { display: block; max-width: 100%; max-height: 65vh; margin: 0 auto; object-fit: contain; }
`
