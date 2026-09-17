import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { collectMaterialGroups, replaceMaterialGroup } from './materialGroups.js'
import { sortMaterialDisplay } from './materialDisplayOrder.js'
import { appendBaseColorTextureControls, MATERIAL_TEXTURE_STYLES } from './materialTextureControls.js'

const INSTALL_KEY = '__realisticMaterialPanelInstalled'
const BUTTON_KEY = '__realisticMaterialPanelButton'
const PANEL_ID = 'realistic-material-panel'
const STYLE_ID = 'realistic-material-panel-style'
const ENV_MAP_KEY = '__realisticMaterialPanelEnvironment'

function getNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback
}

function getColorValue(color, fallback = '#ffffff') {
    return color?.getHexString ? `#${color.getHexString()}` : fallback
}

function markDirty(editor, material) {
    if (material) material.needsUpdate = true
    if (editor?.requestNanjingMaterialRender?.(material) === true) return
    if (editor?.renderer?.shadowMap) editor.renderer.shadowMap.needsUpdate = true
    editor?.renderScene?.()
}

function ensureMaterialEnvironment(editor) {
    const scene = editor?.scene
    const renderer = editor?.renderer
    if (!scene || !renderer) return null
    if (scene.environment) return scene.environment

    try {
        if (!editor[ENV_MAP_KEY]) {
            const pmrem = new THREE.PMREMGenerator(renderer)
            editor[ENV_MAP_KEY] = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
            pmrem.dispose()
        }
        scene.environment = editor[ENV_MAP_KEY]
        return scene.environment
    } catch (error) {
        return null
    }
}

function copyTextureFields(source, target) {
    [
        'map',
        'alphaMap',
        'aoMap',
        'bumpMap',
        'displacementMap',
        'emissiveMap',
        'envMap',
        'lightMap',
        'metalnessMap',
        'normalMap',
        'roughnessMap',
        'specularColorMap',
        'specularIntensityMap',
        'transmissionMap',
    ].forEach((key) => {
        if (source?.[key]) target[key] = source[key]
    })
}

function createPhysicalMaterial(editor, source) {
    if (source?.isMeshPhysicalMaterial) return source

    const fallbackRoughness = source?.isMeshBasicMaterial || source?.isMeshLambertMaterial ? 0.55 : 0.5
    const material = new THREE.MeshPhysicalMaterial({
        name: source?.name || 'Principled BSDF',
        color: source?.color ? source.color.clone() : new THREE.Color(0xffffff),
        metalness: getNumber(source?.metalness, 0),
        roughness: getNumber(source?.roughness, fallbackRoughness),
        opacity: getNumber(source?.opacity, 1),
        transparent: Boolean(source?.transparent) || getNumber(source?.opacity, 1) < 1,
        side: source?.side ?? THREE.FrontSide,
        depthTest: source?.depthTest ?? true,
        depthWrite: source?.depthWrite ?? true,
        alphaTest: getNumber(source?.alphaTest, 0),
        wireframe: Boolean(source?.wireframe),
    })

    // Preserve the original shared material's render flags, UV maps and normal
    // settings when adding physical controls. Copying just color/alpha loses
    // leaf coverage, blending and per-material shadow settings.
    if (source?.isMeshStandardMaterial) {
        THREE.MeshStandardMaterial.prototype.copy.call(material, source)
        material.defines = { ...source.defines, STANDARD: '', PHYSICAL: '' }
    } else if (source?.isMaterial) {
        THREE.Material.prototype.copy.call(material, source)
    }
    if (source?.isMaterial) {
        material.onBeforeCompile = source.onBeforeCompile
        material.customProgramCacheKey = source.customProgramCacheKey
    }

    copyTextureFields(source, material)
    // Keep an inherited scene environment inherited. Turning it into an explicit
    // material envMap would bypass scene.environmentIntensity on an edited leaf.
    ensureMaterialEnvironment(editor)
    material.envMapIntensity = getNumber(source?.envMapIntensity, 0.9)
    material.ior = getNumber(source?.ior, 1.45)
    material.clearcoat = getNumber(source?.clearcoat, 0)
    material.clearcoatRoughness = getNumber(source?.clearcoatRoughness, 0.2)
    material.transmission = getNumber(source?.transmission, 0)
    material.thickness = getNumber(source?.thickness, 0)
    material.specularIntensity = getNumber(source?.specularIntensity, 0.5)
    material.sheen = getNumber(source?.sheen, 0)
    material.sheenRoughness = getNumber(source?.sheenRoughness, 0.5)
    material.iridescence = getNumber(source?.iridescence, 0)
    material.iridescenceIOR = getNumber(source?.iridescenceIOR, 1.3)

    if (source?.emissive) material.emissive.copy(source.emissive)
    material.emissiveIntensity = getNumber(source?.emissiveIntensity, 0)
    if (source?.normalScale) material.normalScale.copy(source.normalScale)

    material.needsUpdate = true
    return material
}

function upgradeRecord(editor, record) {
    ensureMaterialEnvironment(editor)
    // Runtime finish/texture copies are presentation resources. Upgrade their
    // editable source so generated maps and shader callbacks cannot enter saves.
    if (record.material?.isMeshPhysicalMaterial) return record.material
    const source = editor.getNanjingSourceMaterial?.(record.material) || record.material
    const material = createPhysicalMaterial(editor, source)
    if (material !== record.material) {
        replaceMaterialGroup(editor.scene, record, material)
        markDirty(editor, material)
        // A button click only redraws in the restore host. A material identity
        // replacement also needs its existing change/invalidation pipeline so
        // cached instance batches and saved appearance use the new resource.
        const panel = document.getElementById(PANEL_ID)
        if (panel) panel.dispatchEvent(new panel.ownerDocument.defaultView.Event('change', { bubbles: true }))
    }
    return material
}

function materialForProperty(editor, record, property) {
    return property in record.material ? record.material : upgradeRecord(editor, record)
}

function isDisplayGround(record) {
    return record?.mesh?.userData?.isInitialGridGround || /栅格地面|Grid Ground|Display Ground/i.test(record?.mesh?.name || '')
}

function setMetalness(editor, record, value) {
    if ('metalness' in record.material) {
        record.material.metalness = value
        markDirty(editor, record.material)
        return
    }
    const material = upgradeRecord(editor, record)
    const environment = ensureMaterialEnvironment(editor)
    if (environment && !material.envMap) material.envMap = environment

    material.metalness = value
    material.envMapIntensity = Math.max(getNumber(material.envMapIntensity, 0.9), value > 0.02 ? 1.15 : 0.9)

    if (value > 0.02 && getNumber(material.roughness, 1) > 0.72) {
        material.roughness = 0.55
    }

    if (isDisplayGround(record)) {
        material.color.set(0xb4bac0)
        material.emissive.set(0x2f3336)
        material.emissiveIntensity = Math.max(getNumber(material.emissiveIntensity, 0), 0.06)
        material.roughness = Math.min(getNumber(material.roughness, 0.55), 0.55)
    }

    markDirty(editor, material)
}

function getSelectedObject(editor) {
    return [
        editor?.transformControls?.object,
        editor?.handler?.transformControls?.object,
        editor?.handler?.select?.object,
        editor?.effectComposer?.effectPass?.outlinePass?.selectedObjects?.[0],
        editor?.outlinePass?.selectedObjects?.[0],
    ].find(Boolean)
}

function collectMaterialRecords(editor) {
    return sortMaterialDisplay(collectMaterialGroups(editor?.scene, getSelectedObject(editor)))
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
        #${PANEL_ID} {
            position: fixed;
            top: 92px;
            right: calc(var(--editor-right-width, 280px) + 12px);
            width: min(320px, calc(100vw - 24px));
            max-height: calc(100vh - 120px);
            z-index: 100000;
            display: flex;
            flex-direction: column;
            color: #e5e7eb;
            background: #202830;
            border: 1px solid #303b4a;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 16px 42px rgba(0,0,0,.42);
            font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #${PANEL_ID} * { box-sizing: border-box; }
        #${PANEL_ID} .material-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 34px;
            padding: 0 10px;
            cursor: move;
            color: #fff;
            background: #2b3e53;
            user-select: none;
        }
        #${PANEL_ID} .material-close {
            width: 22px;
            height: 22px;
            border: 0;
            border-radius: 4px;
            color: #dbeafe;
            background: transparent;
            cursor: pointer;
        }
        #${PANEL_ID} .material-body {
            overflow: auto;
            padding: 10px;
        }
        #${PANEL_ID} .material-target {
            width: 100%;
            margin: 0 0 8px;
            padding: 5px 6px;
            color: #f8fafc;
            background: #1d2936;
            border: 1px solid #303b4a;
            border-radius: 6px;
        }
        #${PANEL_ID} .material-row {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr) 52px;
            gap: 8px;
            align-items: center;
            min-height: 28px;
            margin: 3px 0;
        }
        #${PANEL_ID} .material-row.slim { grid-template-columns: 92px minmax(0, 1fr); }
        #${PANEL_ID} input[type="range"] { width: 100%; accent-color: #82b9ed; }
        #${PANEL_ID} input[type="number"] {
            width: 52px;
            height: 22px;
            padding: 0 4px;
            color: #f8fafc;
            background: #1d2936;
            border: 0;
            border-radius: 6px;
            text-align: right;
        }
        #${PANEL_ID} input[type="color"] {
            width: 100%;
            height: 24px;
            padding: 0;
            border: 0;
            background: transparent;
        }
        #${PANEL_ID} details {
            margin-top: 4px;
            border-top: 1px solid rgba(255,255,255,.06);
        }
        #${PANEL_ID} summary {
            padding: 7px 0;
            cursor: pointer;
            color: #dbeafe;
        }
        #${PANEL_ID} .material-button {
            width: 100%;
            height: 28px;
            margin: 6px 0 8px;
            border: 0;
            border-radius: 3px;
            color: #fff;
            background: #4a4a4a;
            cursor: pointer;
        }
        #${PANEL_ID} .material-button:hover { background: #5a5a5a; }
        #${PANEL_ID} .material-note {
            margin: 0 0 8px;
            color: #94a3b8;
            font-size: 12px;
        }
        @media (max-width: 900px) {
            #${PANEL_ID} { right: 12px; }
        }
    `
    style.textContent += MATERIAL_TEXTURE_STYLES
    document.head.appendChild(style)
}

function makeDraggable(panel, handle) {
    let dragging = false
    let offsetX = 0
    let offsetY = 0

    handle.addEventListener('pointerdown', (event) => {
        if (event.target?.closest?.('button,input,select,textarea,a')) return
        dragging = true
        offsetX = event.clientX - panel.offsetLeft
        offsetY = event.clientY - panel.offsetTop
        handle.setPointerCapture?.(event.pointerId)
    })

    handle.addEventListener('pointermove', (event) => {
        if (!dragging) return
        panel.style.left = `${Math.max(0, event.clientX - offsetX)}px`
        panel.style.top = `${Math.max(0, event.clientY - offsetY)}px`
        panel.style.right = 'auto'
    })

    const finish = (event) => {
        dragging = false
        if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture?.(event.pointerId)
    }
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
}

function getParams(material) {
    return {
        color: getColorValue(material.color),
        metalness: getNumber(material.metalness, 0),
        roughness: getNumber(material.roughness, 0.5),
        ior: getNumber(material.ior, 1.45),
        opacity: getNumber(material.opacity, 1),
        normalScaleX: getNumber(material.normalScale?.x, 1),
        normalScaleY: getNumber(material.normalScale?.y, 1),
        aoMapIntensity: getNumber(material.aoMapIntensity, 1),
        specularIntensity: getNumber(material.specularIntensity, 0.5),
        specularColor: getColorValue(material.specularColor),
        transmission: getNumber(material.transmission, 0),
        thickness: getNumber(material.thickness, 0),
        clearcoat: getNumber(material.clearcoat, 0),
        clearcoatRoughness: getNumber(material.clearcoatRoughness, 0.2),
        sheen: getNumber(material.sheen, 0),
        sheenRoughness: getNumber(material.sheenRoughness, 0.5),
        sheenColor: getColorValue(material.sheenColor),
        emissive: getColorValue(material.emissive, '#000000'),
        emissiveIntensity: getNumber(material.emissiveIntensity, 0),
        iridescence: getNumber(material.iridescence, 0),
        iridescenceIOR: getNumber(material.iridescenceIOR, 1.3),
    }
}

function appendNumber(parent, label, value, min, max, step, onInput) {
    const row = document.createElement('label')
    row.className = 'material-row'
    row.innerHTML = `<span>${label}</span>`

    const range = document.createElement('input')
    range.type = 'range'
    range.setAttribute('aria-label', label)
    range.min = String(min)
    range.max = String(max)
    range.step = String(step)
    range.value = String(value)

    const number = document.createElement('input')
    number.type = 'number'
    number.setAttribute('aria-label', `${label}数值`)
    number.min = String(min)
    number.max = String(max)
    number.step = String(step)
    number.value = Number(value).toFixed(step < 0.01 ? 3 : 2)

    const commit = (nextValue) => {
        const numeric = THREE.MathUtils.clamp(Number(nextValue), min, max)
        range.value = String(numeric)
        number.value = numeric.toFixed(step < 0.01 ? 3 : 2)
        try {
            onInput(numeric)
        } catch (error) {
            console.warn('[material-panel] update skipped:', error)
        }
    }

    range.addEventListener('input', () => commit(range.value))
    number.addEventListener('change', () => commit(number.value))
    row.append(range, number)
    parent.appendChild(row)
}

function appendColor(parent, label, value, onInput) {
    const row = document.createElement('label')
    row.className = 'material-row slim'
    row.innerHTML = `<span>${label}</span>`

    const input = document.createElement('input')
    input.type = 'color'
    input.setAttribute('aria-label', label)
    input.value = value
    input.addEventListener('input', () => {
        try {
            onInput(input.value)
        } catch (error) {
            console.warn('[material-panel] color update skipped:', error)
        }
    })
    row.appendChild(input)
    parent.appendChild(row)
}

function appendSection(parent, title, open = false) {
    const details = document.createElement('details')
    details.open = open
    const summary = document.createElement('summary')
    summary.textContent = title
    details.appendChild(summary)
    parent.appendChild(details)
    return details
}

function setMaterialColor(editor, material, key, value) {
    if (!material[key]) material[key] = new THREE.Color(value)
    else material[key].set(value)
    markDirty(editor, material)
}

function setMaterialNumber(editor, material, key, value) {
    material[key] = value
    markDirty(editor, material)
}

function renderPanel(editor, selectedMaterial = null) {
    ensureStyle()

    document.getElementById(PANEL_ID)?.remove()

    let records = collectMaterialRecords(editor)
    const panel = document.createElement('div')
    panel.id = PANEL_ID

    const title = document.createElement('div')
    title.className = 'material-title'
    title.innerHTML = '<strong>原理化 BSDF</strong>'
    const close = document.createElement('button')
    close.className = 'material-close'
    close.type = 'button'
    close.setAttribute('aria-label', '关闭材质面板')
    close.textContent = '×'
    close.addEventListener('click', () => panel.remove())
    title.appendChild(close)
    panel.appendChild(title)

    const body = document.createElement('div')
    body.className = 'material-body'
    panel.appendChild(body)

    if (!records.length) {
        const note = document.createElement('p')
        note.className = 'material-note'
        note.textContent = '当前场景没有可编辑材质。请先导入或选中一个模型。'
        body.appendChild(note)
        document.body.appendChild(panel)
        makeDraggable(panel, title)
        return
    }

    // Keep the editing target by resource identity when names or sort positions
    // change. A selected object's materials stay in their alphabetical places.
    const record = records.find((item) => item.material === selectedMaterial)
        || records.find((item) => item.selected)
        || records[0]
    let material = record.material
    const params = getParams(material)

    const select = document.createElement('select')
    select.className = 'material-target'
    select.setAttribute('aria-label', '场景材质')
    select.title = '按材质名称排序（中文拼音 / A–Z，数字自然顺序）'
    let optionsSignature = ''
    const refreshOptions = () => {
        records = collectMaterialRecords(editor)
        // Re-read after external renames, imports or removals. If this resource
        // was removed, rebuild its controls too so the selector cannot disagree.
        if (!records.some((item) => item.material === record.material)) {
            renderPanel(editor)
            return
        }
        const signature = JSON.stringify(records.map((item) => [item.material.uuid, item.label, item.selected]))
        if (signature === optionsSignature) return
        optionsSignature = signature
        select.replaceChildren()
        records.forEach((item) => {
            const option = document.createElement('option')
            option.value = item.material.uuid
            option.textContent = item.selected ? `选中: ${item.label}` : item.label
            option.title = `${item.material.type} · ${item.usages.length} 个材质槽共享此材质`
            select.appendChild(option)
        })
        select.value = record.material.uuid
    }
    refreshOptions()
    select.addEventListener('focus', refreshOptions)
    select.addEventListener('pointerdown', refreshOptions)
    select.addEventListener('change', () => {
        const nextRecord = records.find((item) => item.material.uuid === select.value)
        if (nextRecord) renderPanel(editor, nextRecord.material)
    })
    body.appendChild(select)

    const note = document.createElement('p')
    note.className = 'material-note'
    note.textContent = `共 ${records.length} 个材质 · 当前用于 ${record.meshCount} 个模型，修改会同步作用于这些模型。仅新增不支持的 PBR 属性时转为物理材质。`
    body.appendChild(note)

    const upgradeButton = document.createElement('button')
    upgradeButton.className = 'material-button'
    upgradeButton.type = 'button'
    upgradeButton.textContent = material.isMeshPhysicalMaterial ? '已是物理材质' : '转换为物理材质'
    upgradeButton.addEventListener('click', () => {
        material = upgradeRecord(editor, record)
        renderPanel(editor, material)
    })
    body.appendChild(upgradeButton)

    appendColor(body, '基础色', params.color, (value) => setMaterialColor(editor, record.material, 'color', value))
    appendBaseColorTextureControls(body, { editor, record, markDirty,
        onApplied: () => {
            // Rebuild if a display controller replaces its material after the edit.
            setTimeout(() => {
                if (!panel.isConnected) return
                const current = Array.isArray(record.mesh.material) ? record.mesh.material[record.slot] : record.mesh.material
                if (current !== record.material) renderPanel(editor, current)
            }, 300)
        },
    })
    appendNumber(body, '金属度', params.metalness, 0, 1, 0.001, (value) => setMetalness(editor, record, value))
    appendNumber(body, '糙度', params.roughness, 0, 1, 0.001, (value) => setMaterialNumber(editor, materialForProperty(editor, record, 'roughness'), 'roughness', value))
    appendNumber(body, '折射率(IOR)', params.ior, 1, 2.333, 0.001, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'ior', value))
    appendNumber(body, 'Alpha', params.opacity, 0, 1, 0.001, (value) => {
        const nextMaterial = materialForProperty(editor, record, 'opacity')
        nextMaterial.opacity = value
        nextMaterial.transparent = value < 1
        // Alpha blending must not leave an opaque depth barrier in front of
        // the other building faces. Restore the opaque mode at Alpha 1.
        nextMaterial.depthWrite = value >= 1
        markDirty(editor, nextMaterial)
    })

    const normal = appendSection(body, '法向')
    appendNumber(normal, '法向 X', params.normalScaleX, -2, 2, 0.01, (value) => {
        const nextMaterial = materialForProperty(editor, record, 'normalScale')
        if (!nextMaterial.normalScale) nextMaterial.normalScale = new THREE.Vector2(1, 1)
        nextMaterial.normalScale.x = value
        markDirty(editor, nextMaterial)
    })
    appendNumber(normal, '法向 Y', params.normalScaleY, -2, 2, 0.01, (value) => {
        const nextMaterial = materialForProperty(editor, record, 'normalScale')
        if (!nextMaterial.normalScale) nextMaterial.normalScale = new THREE.Vector2(1, 1)
        nextMaterial.normalScale.y = value
        markDirty(editor, nextMaterial)
    })

    const diffuse = appendSection(body, '漫射')
    appendNumber(diffuse, 'AO 强度', params.aoMapIntensity, 0, 3, 0.01, (value) => setMaterialNumber(editor, materialForProperty(editor, record, 'aoMapIntensity'), 'aoMapIntensity', value))

    const subsurface = appendSection(body, '次表面')
    appendNumber(subsurface, '厚度', params.thickness, 0, 5, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'thickness', value))

    const specular = appendSection(body, '高光')
    appendNumber(specular, '高光强度', params.specularIntensity, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'specularIntensity', value))
    appendColor(specular, '高光颜色', params.specularColor, (value) => setMaterialColor(editor, upgradeRecord(editor, record), 'specularColor', value))

    const transmission = appendSection(body, '透射')
    appendNumber(transmission, '透射', params.transmission, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'transmission', value))
    appendNumber(transmission, '厚度', params.thickness, 0, 5, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'thickness', value))

    const clearcoat = appendSection(body, '涂层')
    appendNumber(clearcoat, '涂层', params.clearcoat, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'clearcoat', value))
    appendNumber(clearcoat, '涂层糙度', params.clearcoatRoughness, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'clearcoatRoughness', value))

    const sheen = appendSection(body, '边缘光泽')
    appendNumber(sheen, '光泽', params.sheen, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'sheen', value))
    appendNumber(sheen, '光泽糙度', params.sheenRoughness, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'sheenRoughness', value))
    appendColor(sheen, '光泽颜色', params.sheenColor, (value) => setMaterialColor(editor, upgradeRecord(editor, record), 'sheenColor', value))

    const emissive = appendSection(body, '自发光')
    appendColor(emissive, '自发光颜色', params.emissive, (value) => setMaterialColor(editor, materialForProperty(editor, record, 'emissive'), 'emissive', value))
    appendNumber(emissive, '自发光强度', params.emissiveIntensity, 0, 10, 0.01, (value) => setMaterialNumber(editor, materialForProperty(editor, record, 'emissiveIntensity'), 'emissiveIntensity', value))

    const film = appendSection(body, '薄膜')
    appendNumber(film, '薄膜强度', params.iridescence, 0, 1, 0.01, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'iridescence', value))
    appendNumber(film, '薄膜 IOR', params.iridescenceIOR, 1, 2.333, 0.001, (value) => setMaterialNumber(editor, upgradeRecord(editor, record), 'iridescenceIOR', value))

    document.body.appendChild(panel)
    makeDraggable(panel, title)
}

function safeRenderPanel(editor, selectedMaterial = null) {
    try {
        renderPanel(editor, selectedMaterial)
    } catch (error) {
        console.warn('[material-panel] open skipped:', error)
    }
}

function getFolderTitle(folder) {
    return [
        folder?._title,
        folder?.title,
        folder?.$title?.textContent,
        folder?.domElement?.querySelector?.('.title')?.textContent,
    ].find((value) => typeof value === 'string' && value.trim())?.trim()
}

function findFolderByTitle(root, title) {
    if (!root) return null
    if (getFolderTitle(root) === title) return root
    for (const child of root.children || []) {
        const result = findFolderByTitle(child, title)
        if (result) return result
    }
    return null
}

function findSceneFolder(gui) {
    const matched = findFolderByTitle(gui, '场景')
    if (matched) return matched

    const children = (gui?.children || []).filter((child) => typeof child?.addFn === 'function')
    return children[1] || null
}

function attachMaterialButton(editor) {
    const sceneFolder = findSceneFolder(editor?.GUI)
    if (!sceneFolder?.addFn || sceneFolder[BUTTON_KEY]) return

    const controller = sceneFolder.addFn(() => safeRenderPanel(editor))
    controller?.name?.('材质调整')
    sceneFolder[BUTTON_KEY] = controller
}

export function installMaterialPanel(editor) {
    if (!editor || editor[INSTALL_KEY] || typeof editor.openControlPanel !== 'function') return

    editor[INSTALL_KEY] = true
    const openControlPanel = editor.openControlPanel.bind(editor)

    editor.openControlPanel = (...args) => {
        const result = openControlPanel(...args)
        requestAnimationFrame(() => attachMaterialButton(editor))
        return result
    }
}
