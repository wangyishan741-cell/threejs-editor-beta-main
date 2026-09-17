<template>
    <aside class="inspector-panel" :class="{ 'scene-collapsed': !expandedSections.scene }" aria-label="场景与设置">
        <section class="inspector-section scene-section" :class="{ 'is-open': expandedSections.scene }">
            <button type="button" class="section-heading" :aria-expanded="expandedSections.scene"
                aria-controls="inspector-scene-tree" @click="expandedSections.scene = !expandedSections.scene">
                <span>场景集合 <span class="section-count">{{ rootCount }}</span></span>
                <el-icon class="section-chevron" :class="{ 'is-open': expandedSections.scene }" aria-hidden="true"><ArrowRightBold /></el-icon>
            </button>
            <div id="inspector-scene-tree" v-show="expandedSections.scene" class="scene-content">
                <p class="section-hint">展开集合选择模型 · 可单独移动 · 集合内删除可撤销</p>
                <input v-model="treeQuery" class="tree-search" type="search" aria-label="查找集合或模型" placeholder="查找集合或模型" @keydown.stop />
                <ul v-if="treeRows.length" ref="treeElement" class="scene-tree" role="tree" aria-label="场景对象" @scroll="treeScroll = $event.target.scrollTop">
                    <li v-if="treeStart" role="presentation" aria-hidden="true" :style="{ height: `${treeStart * ROW_HEIGHT}px` }"></li>
                    <li v-for="value in virtualTreeRows" :key="value.id" class="tree-item" :class="{ 'is-selected': selectedId === value.id }"
                        role="treeitem" :aria-level="value.depth + 1" :aria-expanded="value.hasChildren ? value.expanded : undefined" :aria-selected="selectedId === value.id"
                        :style="{ paddingLeft: `${3 + Math.min(value.depth, 12) * 12}px` }">
                        <button v-if="value.hasChildren" type="button" class="tree-disclosure" :aria-label="(value.expanded ? '折叠集合 ' : '展开集合 ') + value.name"
                            :aria-expanded="value.expanded" @click="toggleCollection(value)">{{ value.expanded ? '▾' : '▸' }}</button>
                        <span v-else class="tree-disclosure empty" aria-hidden="true">·</span>
                        <button type="button" class="icon-button visibility-button" :aria-label="(value.visible ? '隐藏 ' : '显示 ') + value.name"
                            :title="value.visible ? '隐藏对象' : '显示对象'" :aria-pressed="!!value.visible" @click="toggleObjectVisibility(value.object)">
                            <el-icon aria-hidden="true"><View v-if="value.visible" /><Hide v-else /></el-icon>
                        </button>
                        <input v-if="editingId === value.id" v-model="renameValue" class="rename-input" autofocus
                            aria-label="对象名称" @blur="commitRename(value.object)" @keydown.stop @keyup.enter="commitRename(value.object)" @keyup.esc="editingId = null" />
                        <button v-else type="button" class="object-name" :class="{ 'is-hidden': !value.effectiveVisible }"
                            :title="value.name + (value.hasChildren ? ` · ${value.childCount} 个子级` : '')" :aria-label="'选择 ' + value.name"
                            @click="selectObj(value.object)" @dblclick="beginRename(value)" @keydown.f2.prevent="beginRename(value)"
                            @keydown.right.prevent="expandCollection(value)" @keydown.left.prevent="collapseCollection(value)"
                            @keydown.delete.prevent.stop="delI(value.object)">
                            <span class="object-kind">{{ value.kind === '集合' ? '▣' : '◇' }}</span>{{ value.name }}
                        </button>
                        <button type="button" class="icon-button delete-button" :aria-label="'删除 ' + value.name" :title="lightingEditor?.modelCollectionEdits?.getRoot(value.object) ? '删除对象（可撤销）' : '删除对象'" @click="delI(value.object)">
                            <el-icon aria-hidden="true"><Delete /></el-icon>
                        </button>
                    </li>
                    <li v-if="treeEnd < treeRows.length" role="presentation" aria-hidden="true" :style="{ height: `${(treeRows.length - treeEnd) * ROW_HEIGHT}px` }"></li>
                </ul>
                <p v-else class="empty-message">{{ treeQuery ? '没有匹配的集合或模型' : '场景中还没有可编辑对象' }}</p>
                <dl class="scene-stats" aria-label="场景统计">
                    <div><dt>物体</dt><dd>{{ sceneStats.objects.toLocaleString() }}</dd></div>
                    <div><dt>顶点</dt><dd>{{ sceneStats.vertices.toLocaleString() }}</dd></div>
                    <div><dt>三角面</dt><dd>{{ sceneStats.triangles.toLocaleString() }}</dd></div>
                </dl>
            </div>
        </section>

        <div class="secondary-sections" aria-label="场景设置分组">
            <section class="inspector-section">
                <button type="button" class="section-heading" :aria-expanded="expandedSections.environment"
                    aria-controls="inspector-environment" @click="expandedSections.environment = !expandedSections.environment">
                    <span>环境与光照</span><el-icon class="section-chevron" :class="{ 'is-open': expandedSections.environment }" aria-hidden="true"><ArrowRightBold /></el-icon>
                </button>
                <div id="inspector-environment" v-show="expandedSections.environment" class="section-body">
                    <label class="field-label" for="inspector-sky-select">天空与环境素材</label>
                    <el-select id="inspector-sky-select" v-model="selectedSet" placeholder="选择素材套" class="full-width" size="small" aria-label="天空与环境素材">
                        <el-option v-for="i in datalist" :key="i.name" :label="i.name" :value="i.name" />
                    </el-select>
                    <div class="two-actions">
                        <el-button size="small" @click="setSky(selectedSet)" icon="CircleCheckFilled">设为天空</el-button>
                        <el-button size="small" @click="setEnv(selectedSet)" icon="StarFilled">设为环境</el-button>
                    </div>
                    <div v-if="expandedSections.environment && getUrl" class="resource" aria-label="环境素材六面预览">
                        <el-image v-for="k in 6" :key="k" class="resource-image" :src="getUrl + k + '.png'" fit="cover" :alt="'环境预览 ' + k" />
                    </div>
                    <p v-if="nanjingScene" class="section-hint source-lighting-note">沿用工程的 HDR 与原有灯光，调整强度和曝光后随工程保存。</p>
                    <div class="lighting-controls">
                        <div class="lighting-control">
                            <div class="field-row"><span>日光强度</span><output>{{ lightingSettings.sunIntensity.toFixed(2) }}</output></div>
                            <el-slider v-model="lightingSettings.sunIntensity" :disabled="lightingSettings.sunAvailable === false" :min="0" :max="Math.max(nanjingScene ? 30 : 3, Math.ceil(lightingSettings.sunIntensity))" :step="0.05" aria-label="日光强度" @input="saveLightingField('sunIntensity')" />
                        </div>
                        <div class="lighting-control">
                            <div class="field-row"><span>环境补光</span><output>{{ lightingSettings.ambientIntensity.toFixed(2) }}</output></div>
                            <el-slider v-model="lightingSettings.ambientIntensity" :min="0" :max="Math.max(5, Math.ceil(lightingSettings.ambientIntensity))" :step="0.01" aria-label="环境补光" @input="saveLightingField('ambientIntensity')" />
                        </div>
                        <div class="lighting-control">
                            <div class="field-row"><span>曝光</span><output>{{ lightingSettings.exposure.toFixed(2) }}</output></div>
                            <el-slider v-model="lightingSettings.exposure" :min="nanjingScene ? 0.02 : 0" :max="Math.max(2, Math.ceil(lightingSettings.exposure))" :step="0.02" aria-label="曝光" @input="saveLightingField('exposure')" />
                        </div>
                        <div v-if="!nanjingScene" class="control-options">
                            <el-checkbox v-model="lightingSettings.skyEnabled" @change="saveLightingField('skyEnabled')">天空大气</el-checkbox>
                            <el-checkbox v-model="lightingSettings.shadowFloorEnabled" @change="saveLightingField('shadowFloorEnabled')">栅格地面</el-checkbox>
                            <el-checkbox v-model="lightingSettings.ambientOcclusionEnabled" @change="saveLightingField('ambientOcclusionEnabled')">环境遮蔽</el-checkbox>
                        </div>
                        <div class="two-actions">
                            <el-button v-if="!nanjingScene" size="small" @click="resetLightingSettings">重置光照</el-button>
                            <el-button size="small" type="primary" plain @click="refreshLighting">刷新光照</el-button>
                        </div>
                    </div>
                </div>
            </section>

            <section class="inspector-section">
                <button type="button" class="section-heading" :aria-expanded="expandedSections.display"
                    aria-controls="inspector-display" @click="expandedSections.display = !expandedSections.display">
                    <span>显示与辅助</span><el-icon class="section-chevron" :class="{ 'is-open': expandedSections.display }" aria-hidden="true"><ArrowRightBold /></el-icon>
                </button>
                <div id="inspector-display" v-show="expandedSections.display" class="section-body">
                    <div class="field-row pixel-ratio">
                        <label for="inspector-pixel-ratio">像素比</label>
                        <el-input-number id="inspector-pixel-ratio" size="small" v-model="pixelRatio" :min="0.5" :max="3" :step="0.5" aria-label="像素比" />
                    </div>
                    <p class="section-hint">修改像素比或深度缓冲后会刷新页面。</p>
                    <div class="control-options">
                        <el-checkbox v-model="logbuffer">对数深度缓冲</el-checkbox>
                        <el-checkbox v-model="showGrid" @change="toggleGrid">显示网格</el-checkbox>
                        <el-checkbox v-model="showAxes" @change="toggleAxes">显示坐标轴</el-checkbox>
                    </div>
                </div>
            </section>

            <section class="inspector-section">
                <button type="button" class="section-heading" :aria-expanded="expandedSections.animation"
                    aria-controls="inspector-animation" @click="expandedSections.animation = !expandedSections.animation">
                    <span>动画 <span v-if="sceneSheets.length" class="section-count">{{ sceneSheets.length }}</span></span>
                    <el-icon class="section-chevron" :class="{ 'is-open': expandedSections.animation }" aria-hidden="true"><ArrowRightBold /></el-icon>
                </button>
                <div id="inspector-animation" v-show="expandedSections.animation" class="section-body">
                    <label class="field-label" for="inspector-animation-select">动画预设</label>
                    <el-select id="inspector-animation-select" v-model="selectedAnimation" placeholder="选择动画" class="full-width" size="small" aria-label="动画预设">
                        <el-option v-for="(anim, index) in animationList" :key="index" :label="anim.name" :value="anim.url" />
                    </el-select>
                    <div class="two-actions">
                        <el-button size="small" @click="applyAnimation" icon="VideoPlay">应用动画</el-button>
                        <el-button size="small" @click="clearAnimation" icon="Delete">清除动画</el-button>
                    </div>
                    <p class="section-hint">应用或清除动画后会刷新页面。</p>
                    <ul v-if="sceneSheets.length" class="animation-sheets" aria-label="场景动画列表">
                        <li v-for="(s, i) in sceneSheets" :key="i" class="animation-sheet">
                            <span class="sheet-name" :title="s.name">{{ s.name }}</span>
                            <div class="sheet-actions">
                                <el-button size="small" :icon="VideoPlay" circle title="播放" :aria-label="'播放 ' + s.name" @click="sheetPlay(i)" />
                                <el-button size="small" icon="VideoPause" circle title="暂停" :aria-label="'暂停 ' + s.name" @click="sheetPause(i)" />
                                <el-button size="small" icon="RefreshLeft" circle title="重置" :aria-label="'重置 ' + s.name" @click="sheetReset(i)" />
                            </div>
                        </li>
                    </ul>
                    <p v-else class="empty-message">当前场景没有动画序列</p>
                </div>
            </section>

            <section class="inspector-section">
                <button type="button" class="section-heading" :aria-expanded="expandedSections.resources"
                    aria-controls="inspector-resources" @click="expandedSections.resources = !expandedSections.resources">
                    <span>帮助与资源</span><el-icon class="section-chevron" :class="{ 'is-open': expandedSections.resources }" aria-hidden="true"><ArrowRightBold /></el-icon>
                </button>
                <div id="inspector-resources" v-show="expandedSections.resources" class="section-body">
                    <div class="links-container">
                        <el-button v-for="link in externalLinks" :key="link.name" plain size="small" @click="openLink(link.url)">
                            <el-icon aria-hidden="true"><component :is="link.icon" /></el-icon><span>{{ link.name }}</span>
                        </el-button>
                    </div>
                    <div class="maintenance-row">
                        <el-button size="small" plain :icon="BrushFilled" @click="clear">清理浏览器缓存</el-button>
                        <p class="section-hint">需确认后执行，完成后刷新页面。</p>
                    </div>
                </div>
            </section>
        </div>
    </aside>
</template>

<script setup>
import { computed, reactive, ref, shallowRef, watch, onUnmounted, nextTick } from 'vue'
import { View, Hide, Delete, ArrowRightBold, BrushFilled, VideoPlay } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { sceneHierarchyRows, sceneHierarchyChildren, observeSceneHierarchy } from './sceneHierarchy.js'
import {
    REALISTIC_LIGHTING_DEFAULTS,
    getRealisticLightingSettings,
    setRealisticLightingSettings,
    scheduleRealisticLightingRefresh,
    setProjectLightingBackground,
} from './lightingDefaults'

const treeRows = shallowRef([])
const rootCount = ref(0)
const treeQuery = ref('')
const treeElement = ref(null)
const treeScroll = ref(0)
const expandedCollections = new Set()
const selectedId = ref(null)
const renameValue = ref('')
const ROW_HEIGHT = 32
const treeStart = computed(() => Math.max(0, Math.min(Math.floor(treeScroll.value / ROW_HEIGHT) - 8, treeRows.value.length - 48)))
const treeEnd = computed(() => Math.min(treeRows.value.length, treeStart.value + 48))
const virtualTreeRows = computed(() => treeRows.value.slice(treeStart.value, treeEnd.value))
let stopTreeObserver = null, treeTimer = null, lastSelectionId = null
const props = defineProps({ sceneName: String })
const nanjingScene = ref(false)
const editingId = ref(null)
const expandedSections = reactive({ scene: true, environment: false, display: false, animation: false, resources: false })
const sceneStats = reactive({ vertices: 0, edges: 0, triangles: 0, objects: 0 })
const lightingSettings = reactive({ ...REALISTIC_LIGHTING_DEFAULTS })
let lightingEditor = null

function refreshSceneTree() {
    if (!lightingEditor?.scene) return
    rootCount.value = sceneHierarchyChildren(lightingEditor.scene).length
    treeRows.value = sceneHierarchyRows(lightingEditor.scene, expandedCollections, treeQuery.value)
}
function toggleCollection(row) {
    if (expandedCollections.has(row.id)) expandedCollections.delete(row.id)
    else expandedCollections.add(row.id)
    refreshSceneTree()
}
function expandCollection(row) { if (row.hasChildren) { expandedCollections.add(row.id); refreshSceneTree() } }
function collapseCollection(row) { expandedCollections.delete(row.hasChildren ? row.id : row.parentId); refreshSceneTree() }
watch(treeQuery, () => {
    treeScroll.value = 0
    if (treeElement.value) treeElement.value.scrollTop = 0
    refreshSceneTree()
})
function beginRename(row) {
    editingId.value = row.id; renameValue.value = row.object.name
    nextTick(() => treeElement.value?.querySelector('.rename-input')?.focus())
}
function commitRename(object) {
    if (editingId.value !== object.uuid) return
    const name = renameValue.value.trim()
    if (name && name !== object.name) {
        if (!lightingEditor?.modelCollectionEdits?.rename(object, name)) object.name = name
    }
    editingId.value = null; refreshSceneTree()
}
function toggleObjectVisibility(object) {
    if (!lightingEditor?.modelCollectionEdits?.setVisible(object, !object.visible)) {
        object.visible = !object.visible
        lightingEditor?.transformControls?.dispatchEvent({ type: 'objectChange' })
    }
    refreshSceneTree()
}

function syncLightingSettings() {
    if (!lightingEditor) return
    nanjingScene.value = !!lightingEditor.__nanjingRestoreActive
    Object.assign(lightingSettings, { sunAvailable: true }, getRealisticLightingSettings(lightingEditor))
}

function saveLightingField(key) {
    if (!lightingEditor) return
    try {
        setRealisticLightingSettings({ [key]: lightingSettings[key] }, lightingEditor)
    } catch (error) {
        syncLightingSettings()
        ElMessage.error(error?.message || '光照调整失败，已保留原参数')
    }
}

function resetLightingSettings() {
    Object.assign(lightingSettings, REALISTIC_LIGHTING_DEFAULTS)
    if (lightingEditor) setRealisticLightingSettings({ ...lightingSettings }, lightingEditor)
}

function refreshLighting() {
    scheduleRealisticLightingRefresh(lightingEditor)
    syncLightingSettings()
    ElMessage.success('光照已刷新')
}

watch(() => props.sceneName, () => nextTick(syncLightingSettings))

function updateSceneStats() {
  let vertices = 0, triangles = 0, objects = 0
  const scene = lightingEditor?.scene || window.threeEditor?.scene
  if (!scene) return
  scene.traverse(obj => {
    if (obj.userData?.nanjingUtility) return
    if (obj.isTransformControls || obj.isHelper || obj.type?.includes('Helper')) return
    const geo = obj.geometry
    if (!geo) return
    objects++
    const pos = geo.attributes?.position
    if (pos) vertices += pos.count
    if (geo.index) triangles += geo.index.count / 3
    else if (pos) triangles += pos.count / 3
  })
  sceneStats.vertices = vertices
  sceneStats.edges = Math.floor(triangles * 1.5)
  sceneStats.triangles = Math.floor(triangles)
  sceneStats.objects = objects
}
window.updateSceneStats = updateSceneStats
onUnmounted(() => { stopTreeObserver?.(); clearInterval(treeTimer); lightingEditor?.scene?.removeEventListener('project-lighting-settings-changed', syncLightingSettings) })

const selectedSet = ref('蓝天')
const datalist = reactive([
    {
        name: '蓝天',
        url: 'https://z2586300277.github.io/three-editor/dist/files/scene/skyBox0/'
    },
    {
        name: '晴天',
        url: 'https://z2586300277.github.io/3d-file-server/files/sky/skyBox1/'
    },
    {
        name: '森林',
        url: 'https://z2586300277.github.io/three-editor/dist/files/scene/skyBox8/'
    },
    { name: '清除', url: '' }
])

const getUrl = computed(() => datalist.find(i => i.name === selectedSet.value).url)

const listJ = window.animateJsons.map(v => __isProduction__ ? '/threejs-editor-beta/' + v : '/' + v)
// 动画列表
const selectedAnimation = ref('')
const animationList = computed(() => {
    return listJ.map((url, index) => {
        const name = url.split('/').pop().replace('.json', '')
        return { name, url }
    })
})

// 应用动画
const applyAnimation = () => {
    if (!selectedAnimation.value) return ElMessage.warning('请先选择动画')
    fetch(selectedAnimation.value).then(res => res.json()).then(res => {
        if (res) {
            localStorage.removeItem('theatre-0.4.persistent')
            localStorage.setItem('THREE_EDITOR_ANIMATIONS', JSON.stringify(res))
            ElMessage.success('动画已应用')
            setTimeout(() =>window.location.reload(), 1000);
        }
    })
}

// 清除动画
const clearAnimation = () => {
    localStorage.removeItem('theatre-0.4.persistent')
    localStorage.removeItem('THREE_EDITOR_ANIMATIONS')
    ElMessage.success('动画已清除')
    setTimeout(() => window.location.reload(), 1000)
}

const setSky = (v) => {
    const set = datalist.find(i => i.name === v)
    if (!set || !lightingEditor) return
    setProjectLightingBackground(lightingEditor, 'backgroundUrls', set.url ? Array.from({ length: 6 }, (_, i) => `${set.url}${i + 1}.png`) : null)
}

const setEnv = (v) => {
    const set = datalist.find(i => i.name === v)
    if (!set || !lightingEditor) return
    setProjectLightingBackground(lightingEditor, 'environmentUrls', set.url ? Array.from({ length: 6 }, (_, i) => `${set.url}${i + 1}.png`) : null)
};

// 网格和坐标轴控制
const showGrid = ref(false)
const showAxes = ref(false)
const syncNanjingHelpers = () => {
    const helpers = lightingEditor?.handler?.helpers
    if (!helpers) return
    showGrid.value = helpers.grid.showGrid
    showAxes.value = helpers.axes.showAxes
}
window.addEventListener('nanjing-helpers-updated', syncNanjingHelpers)
onUnmounted(() => window.removeEventListener('nanjing-helpers-updated', syncNanjingHelpers))

// 处理网格显示/隐藏
const toggleGrid = (val) => {
    threeEditor.handler.helpers.grid.showGrid = val
}

// 处理坐标轴显示/隐藏
const toggleAxes = (val) => {
    threeEditor.handler.helpers.axes.showAxes = val
}

// 像素比设置
const pixelRatio = ref(1)
if (localStorage.getItem('new_threeEditor_pixelRatio')) pixelRatio.value = parseFloat(localStorage.getItem('new_threeEditor_pixelRatio'))
watch(pixelRatio, (val) => {
    localStorage.setItem('new_threeEditor_pixelRatio', val)
    setTimeout(() => {
        window.location.reload()
    }, 500);
})

// 外部链接数据
const externalLinks = reactive([
    { name: '素材库', url: 'https://z2586300277.github.io/3d-file-server/link.html', icon: 'Collection' },
    // { name: 'Npm内核', url: 'https://www.npmjs.com/package/three-edit-cores', icon: 'Box' },
    // { name: 'B站', url: 'https://space.bilibili.com/245165721' , icon: 'ChatDotRound' },
    // { name: '交流群', url: 'https://z2586300277.github.io/personalCode.html', icon: 'Document' },
    { name: '定制开发', url: 'https://www.goofish.com/personal?userId=2885508577', icon: 'Promotion' },
    // { name: '赞赏', url: 'https://z2586300277.github.io/sponsor.html', icon: 'StarFilled' },
])

// 打开外部链接
const openLink = (url) => {
    window.open(url, '_blank')
}

const logbuffer = ref(true)
if (localStorage.getItem('new_threeEditor_logBuffer') === 'false') logbuffer.value = false
watch(logbuffer, (val) => {
    localStorage.setItem('new_threeEditor_logBuffer', val)
    setTimeout(() => {
        window.location.reload()
    }, 500);
})

defineExpose({
    helperConf(tr) {
        showGrid.value = tr.handler.helpers.grid.showGrid
        showAxes.value = tr.handler.helpers.axes.showAxes
    },
    startEditor(te) {
        stopTreeObserver?.(); clearInterval(treeTimer)
        lightingEditor?.scene?.removeEventListener('project-lighting-settings-changed', syncLightingSettings)
        expandedCollections.clear(); lastSelectionId = null
        lightingEditor = te
        te.scene.addEventListener('project-lighting-settings-changed', syncLightingSettings)
        syncLightingSettings()
        scheduleRealisticLightingRefresh(te)
        loadSceneAnimations(te)
        stopTreeObserver = observeSceneHierarchy(te.scene, () => { refreshSceneTree(); updateSceneStats() })
        refreshSceneTree(); updateSceneStats()
        // Poll only selection and the displayed rows; never rebuild the full
        // large model tree on animation frames or convert Three objects to Vue proxies.
        treeTimer = setInterval(() => {
            const selected = te.transformControls.object || te.effectComposer?.effectPass?.outlinePass?.selectedObjects?.[0]
            selectedId.value = selected?.uuid || null
            if (selected && selected.uuid !== lastSelectionId) {
                lastSelectionId = selected.uuid
                for (let parent = selected.parent; parent && parent !== te.scene; parent = parent.parent) expandedCollections.add(parent.uuid)
                refreshSceneTree()
                const index = treeRows.value.findIndex(row => row.id === selected.uuid)
                if (index >= 0 && treeElement.value && (index < treeStart.value || index >= treeEnd.value)) {
                    treeElement.value.scrollTop = index * ROW_HEIGHT; treeScroll.value = index * ROW_HEIGHT
                }
            } else if (virtualTreeRows.value.some(row => row.object.visible !== row.visible || (row.object.name || row.object.type) !== row.name)) refreshSceneTree()
            if (!selected) lastSelectionId = null
        }, 250)
    }
});

function selectObj(item) {
    const editor = lightingEditor
    if (!editor || !item?.parent) return
    editor.handler.currentInfo = { object: item, rootObject: (() => { let root = item; while (root.parent && root.parent !== editor.scene) root = root.parent; return root })() }
    editor.transformControls.detach()
    editor.setOutlinePass?.([])
    if (editor.handler.mode === 'transform') editor.transformControls.attach(item)
    else editor.setOutlinePass?.([item])
    selectedId.value = item.uuid
    editor.transformControls.dispatchEvent({ type: 'change' })
}

const sceneSheets = ref([])
let _sheetsRaw = []

function loadSceneAnimations(t) {
    const { scene } = t
    scene.SET_STORAGE_CALL = () => {
        const { studio } = t.other.animateEditor
        const sheets = studio.studioProject.sheets
        _sheetsRaw = []
        Object.keys(sheets).forEach(k => {
            const s = sheets[k]
            _sheetsRaw.push({ name: s.name || k, sequence: s.sequence })
        })
        sceneSheets.value = _sheetsRaw.map(s => ({ name: s.name }))
    }
    scene.SET_STORAGE_CALL()
}

function sheetPlay(i) {
    _sheetsRaw[i]?.sequence.play({ iterationCount: Infinity })
}
function sheetPause(i) {
    _sheetsRaw[i]?.sequence.pause()
}
function sheetReset(i) {
    const seq = _sheetsRaw[i]?.sequence
    if (seq) { seq.pause(); seq.position = 0 }
}

async function delI(item) {
    if (!item?.parent) return
    if (!lightingEditor?.modelCollectionEdits?.remove(item)) {
        try { await ElMessageBox.confirm(`确定删除“${item.name || item.type}”？`, '删除对象', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) }
        catch { return }
        item.removeFromParent()
        lightingEditor?.transformControls.detach()
        lightingEditor?.setOutlinePass?.([])
        lightingEditor?.transformControls.dispatchEvent({ type: 'objectChange' })
    }
    selectedId.value = null; refreshSceneTree()
}

function clear() {
    ElMessageBox.confirm('确定要清理所有缓存吗？这将清除浏览器存储的 localStorage、sessionStorage 和 IndexedDB 数据，页面将自动刷新。', '清理缓存', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
    }).then(() => {
        // 清除 localStorage
        localStorage.clear()
        // 清除 sessionStorage
        sessionStorage.clear()
        // 清除 IndexedDB
        window.indexedDB.deleteDatabase('new_threeEditor_db')
        ElMessage({
            type: 'success',
            message: '缓存已清理，页面即将刷新',
        })
        setTimeout(() => window.location.reload(), 1000)
    }).catch(() => {})
}
</script>

<style scoped>
.inspector-panel {
    --el-color-primary: #82b9ed;
    --el-bg-color: #202830;
    --el-bg-color-overlay: #202830;
    --el-fill-color-blank: #202830;
    --el-fill-color-light: #273340;
    --el-border-color: #303b4a;
    --el-border-color-light: #303b4a;
    --el-text-color-primary: #e2e9f1;
    --el-text-color-regular: #c1cedc;
    --el-text-color-placeholder: #899aac;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;
    background: #202830;
    color: #c1cedc;
    font-size: 12px;
}
.inspector-section { min-width: 0; border: 1px solid #303b4a; border-radius: 6px; overflow: hidden; background: #202830; }
.section-heading { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 38px; padding: 9px 10px; border: 0; color: #e2e9f1; background: #242f3b; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.section-heading:hover { background: #2b3a49; }
.section-count { margin-left: 5px; color: #899aac; font-size: 11px; font-weight: 400; }
.section-chevron { color: #82b9ed; font-size: 10px; transition: transform .15s; }
.section-chevron.is-open { transform: rotate(90deg); }
.section-heading:focus-visible, .icon-button:focus-visible, .object-name:focus-visible { outline: 2px solid #82b9ed; outline-offset: -2px; }
.scene-section { flex: 0 0 auto; display: flex; flex-direction: column; }
.scene-section.is-open { flex: 1 1 0; min-height: min(180px, 40%); }
.scene-content { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.section-hint { margin: 7px 0; color: #899aac; font-size: 11px; line-height: 1.6; }
.scene-content > .section-hint { flex-shrink: 0; margin: 7px 10px 4px; }
.scene-tree { flex: 1; min-height: 0; margin: 0; padding: 3px 5px 8px; list-style: none; overflow: auto; scrollbar-width: thin; scrollbar-color: #43566a transparent; }
.tree-search { flex-shrink: 0; min-width: 0; margin: 3px 8px 6px; padding: 6px 8px; border: 1px solid #43566a; border-radius: 4px; background: #1c242d; color: #d5dfeb; font: inherit; }
.tree-item { display: flex; align-items: center; height: 32px; box-sizing: border-box; gap: 3px; padding: 1px 3px; border-radius: 4px; }
.tree-item:hover { background: #2b3744; }
.tree-item.is-selected { background: #304b66; }
.tree-disclosure { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 18px; width: 18px; height: 26px; padding: 0; border: 0; color: #b7cadc; background: transparent; cursor: pointer; }
.tree-disclosure.empty { color: #65798e; cursor: default; }
.tree-disclosure:focus-visible, .tree-search:focus-visible { outline: 2px solid #82b9ed; outline-offset: -2px; }
.object-kind { margin-right: 5px; color: #82b9ed; }
.icon-button { display: inline-flex; flex: 0 0 24px; align-items: center; justify-content: center; width: 24px; height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #a9bbcd; cursor: pointer; font: inherit; }
.icon-button:hover { color: #82b9ed; background: #344353; }
.delete-button { color: #899aac; }
.delete-button:hover { color: #eca3a3; }
.object-name { flex: 1; min-width: 0; padding: 4px 1px; border: 0; background: transparent; color: #d5dfeb; font: inherit; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.object-name:hover { color: #82b9ed; }
.object-name.is-hidden { color: #8190a1; }
.rename-input { flex: 1; min-width: 0; }
.scene-stats { flex-shrink: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin: 0; padding: 8px 9px; border-top: 1px solid #303b4a; background: #1c242d; }
.scene-stats dt { margin-bottom: 3px; color: #899aac; font-size: 10px; }
.scene-stats dd { margin: 0; color: #b7cadc; font-size: 11px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.secondary-sections { display: flex; flex: 0 1 auto; flex-direction: column; gap: 7px; max-height: 45%; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #43566a transparent; }
.secondary-sections > .inspector-section { flex-shrink: 0; }
.scene-collapsed .secondary-sections { flex: 1; max-height: none; }
.section-body { padding: 10px; border-top: 1px solid #303b4a; }
.field-label { display: block; margin-bottom: 7px; color: #b7cadc; }
.full-width { width: 100%; }
.two-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.two-actions :deep(.el-button) { margin-left: 0; padding: 5px 6px; }
.resource { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin-top: 10px; }
.resource-image { width: 100%; height: 48px; border-radius: 4px; background: #18202a; }
.source-lighting-note { margin-bottom: 0; }
.lighting-controls { margin-top: 12px; padding-top: 10px; border-top: 1px solid #303b4a; }
.lighting-control + .lighting-control { margin-top: 5px; }
.field-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; line-height: 1.6; }
.field-row output { color: #82b9ed; font-variant-numeric: tabular-nums; }
.lighting-control :deep(.el-slider) { width: calc(100% - 12px); margin: 0 6px; height: 28px; }
.control-options { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.control-options :deep(.el-checkbox) { margin-right: 0; min-height: 26px; height: auto; }
.control-options :deep(.el-checkbox__label) { font-size: 12px; white-space: normal; line-height: 1.5; }
.pixel-ratio :deep(.el-input-number) { width: 118px; }
.animation-sheets { margin: 9px 0 0; padding: 0; list-style: none; border-top: 1px solid #303b4a; }
.animation-sheet { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 8px; }
.sheet-name { min-width: 0; color: #b7cadc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet-actions { display: flex; flex-shrink: 0; gap: 4px; }
.sheet-actions :deep(.el-button) { margin-left: 0; width: 24px; height: 24px; }
.empty-message { margin: 0; padding: 14px 10px; color: #899aac; line-height: 1.6; text-align: center; }
.scene-content > .empty-message { flex: 1; }
.links-container { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.links-container :deep(.el-button) { margin-left: 0; padding: 5px 7px; }
.links-container :deep(.el-icon) { margin-right: 5px; }
.maintenance-row { margin-top: 12px; padding-top: 10px; border-top: 1px solid #303b4a; }
.maintenance-row .section-hint { margin-bottom: 0; }
.inspector-panel :deep(.el-button), .inspector-panel :deep(.el-input__wrapper), .inspector-panel :deep(.el-select__wrapper) { border-radius: 6px; font-size: 12px; }
</style>
