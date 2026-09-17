<template>
    <div class="edit" ref="editor" @dragover.prevent @drop.prevent>
        <section v-if="loadError" class="project-load-error" role="alert" aria-live="assertive">
            <strong>工程载入失败</strong>
            <p>{{ loadError }}</p>
            <p v-if="windowSceneUrl" class="project-load-error-url">{{ windowSceneUrl }}</p>
            <button type="button" @click="reloadPage">重新加载</button>
        </section>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import tamplateJson from './template.json'
import { ThreeEditor } from './lib'
import { scheduleRealisticLightingRefresh, installProjectLightingSettings } from './lightingDefaults'
import { installMaterialPanel } from './materialPanel'
import { installMaterialTexturePersistence } from './materialTexturePersistence.js'
import { prepareNanjingSceneParams, installNanjingRestore, readNanjingSavedScene, readNanjingSharedAppearance } from './nanjingRestore'
import { isNanjingBenchmarkBaseline } from './nanjingProfiler'
import { getNanjingDeviceProfile } from './nanjingDeviceProfile'
import { readNanjingDisplayQuality, resolveNanjingDisplayQuality } from './nanjingDisplayQuality'
import { installNanjingLifecycle } from './nanjingLifecycle'
import { readProjectScene, saveProjectScene } from './projectRecords.js'
import { readProjectSceneSource, resolveEditableImportedScene } from './projectSceneSource.js'
import { createProjectLoadState } from './projectLoadState.js'
import { registerPostProcessingColor, installPostProcessingColorReset } from './postProcessingColor.js'
import { registerPostProcessingBloom, installPostProcessingBloom } from './postProcessingBloom.js'
import { createModelCollectionEdits } from './modelCollectionEdits.js'
import { prepareNanjingRepairProject, NANJING_REPAIR_ENTRY, NANJING_REPAIR_SOURCE_NAME, NANJING_REPAIR_SOURCE_URL, getNanjingRepairProjectName } from './nanjingRepairProject.js'

registerPostProcessingColor(ThreeEditor)
registerPostProcessingBloom(ThreeEditor)
ThreeEditor.dracoPath = __isProduction__ ? '/threejs-editor-beta/draco/' : '/draco/'

// 初始渲染动画数据
const THREE_EDITOR_ANIMATIONS = localStorage.getItem('THREE_EDITOR_ANIMATIONS')
if (THREE_EDITOR_ANIMATIONS) window.THREE_EDITOR_ANIMATIONS = JSON.parse(THREE_EDITOR_ANIMATIONS)

let threeEditor = null
let editorLifecycle = null
let collectionEdits = null
let materialTexturePersistence = null
let projectLightingSettings = null
let projectLoadState = null
let componentDisposed = false
let sceneRequest = 0
let sceneReadController = null
const loadError = ref('')
const windowSceneUrl = window.editorPreviewSceneUrl || ''
const reloadPage = () => window.location.reload()
const isCurrentRequest = (request, sceneName) => !componentDisposed && request === sceneRequest && dataCores.sceneName === sceneName
const handleResize = () => { if (!componentDisposed) threeEditor?.renderSceneResize?.() }
const editor = ref(null)
window.GUI_PARAMS = {
    step: 0.1,
}

const { dataCores } = defineProps(['dataCores'])
const emits = defineEmits(['emitThreeEditor'])

watch(() => dataCores.sceneName, async (val) => {
    if (componentDisposed) return
    // A scene selected while initial data is pending starts a fresh initial
    // request. The obsolete request will stop at its next asynchronous boundary.
    if (!threeEditor) return init()
    const request = ++sceneRequest
    sceneReadController?.abort()
    loadError.value = ''
    const generation = projectLoadState?.begin()
    try {
        let params = await readProjectScene(val, tamplateJson)
        if (!isCurrentRequest(request, val)) return
        params = await readNanjingSavedScene(params, val)
        if (!isCurrentRequest(request, val)) return
        params = await readNanjingSharedAppearance(prepareNanjingSceneParams(params, val), val)
        if (!isCurrentRequest(request, val)) return
        params = changeDBModelUrl(prepareNanjingSceneParams(params, val))
        if (!threeEditor) throw new Error('当前编辑器尚未载入')
        threeEditor.resetEditorStorage(params)
        projectLoadState?.attach(threeEditor, params)
        scheduleRealisticLightingRefresh(threeEditor)
    } catch (error) {
        if (!isCurrentRequest(request, val)) return
        loadError.value = error?.message || '工程读取失败'
        projectLoadState?.fail(error, generation)
        console.warn('场景恢复未完成，已保留本地存档', error)
    }

})

async function init() {
    if (componentDisposed) return
    const request = ++sceneRequest
    const sceneName = dataCores.sceneName
    sceneReadController?.abort()
    const readController = sceneReadController = new AbortController()
    loadError.value = ''
    projectLoadState ||= createProjectLoadState()
    let generation = projectLoadState.begin()
    try {
        
        const repairEntry = new URLSearchParams(window.location.hash.split('?')[1] || '').get('repair')
        if (repairEntry === 'water-trees-20260917') throw new Error('旧修复入口的来源版本不正确。请打开 /nanjing-repaired.html，使用你指定的“最新效果版1”固定快照。')
        const repairRequested = repairEntry === NANJING_REPAIR_ENTRY
        if (repairRequested && sceneName !== getNanjingRepairProjectName(NANJING_REPAIR_SOURCE_NAME)) throw new Error('修复入口的工程名称不匹配，原工程未改变')
        let sceneParams = repairRequested ? await prepareNanjingRepairProject({
            name: sceneName, readLocal: readProjectScene, save: saveProjectScene,
            sourceName: NANJING_REPAIR_SOURCE_NAME, sourceUrl: NANJING_REPAIR_SOURCE_URL,
            fetcher: (url, options) => fetch(url, { ...options, signal: readController.signal }),
            modelAssets: window.threeEditorDB?.list || [], isCurrent: () => isCurrentRequest(request, sceneName),
        }) : await readProjectSceneSource({
            sceneName, sceneUrl: windowSceneUrl,
            immutable: window.editorPreviewSceneImmutable === true,
            fallback: tamplateJson, readLocal: readProjectScene, signal: readController.signal,
        })

        if (!isCurrentRequest(request, sceneName)) return
        if (window.editorPreviewSceneImmutable === true && window.editorPreviewSceneImport === true && windowSceneUrl) {
            try {
                await saveProjectScene(sceneName, sceneParams, { createOnly: true, kind: 'import', label: '固定版本导入' })
            } catch (error) {
                // Import once; do not overwrite an existing working project.
                if (error?.code !== 'PROJECT_ALREADY_EXISTS') throw error
            }
            if (!isCurrentRequest(request, sceneName)) return
            sceneParams = await resolveEditableImportedScene({
                remote: sceneParams, sceneName, readLocal: readProjectScene,
                editableImport: new URLSearchParams(window.location.hash.split('?')[1] || '').get('edit') === '1',
            })
            if (!isCurrentRequest(request, sceneName)) return
        }
        sceneParams = await readNanjingSavedScene(sceneParams, sceneName)
        if (!isCurrentRequest(request, sceneName)) return
        sceneParams = prepareNanjingSceneParams(sceneParams, sceneName)
        sceneParams = await readNanjingSharedAppearance(sceneParams, sceneName)
        if (!isCurrentRequest(request, sceneName)) return
        sceneParams = changeDBModelUrl(sceneParams)
        generation = projectLoadState.begin(sceneParams)
        let logarithmicDepthBuffer = true
        if (localStorage.getItem('new_threeEditor_logBuffer') === 'false') logarithmicDepthBuffer = false
        let pixelRatioMulti = 1
        if (localStorage.getItem('new_threeEditor_pixelRatio')) pixelRatioMulti = parseFloat(localStorage.getItem('new_threeEditor_pixelRatio'))
        const largeProject = !!sceneParams?.nanjingRestore
        const optimizedProject = largeProject && !isNanjingBenchmarkBaseline()
        const initialDisplay = getNanjingDeviceProfile({
            platform: navigator.platform, userAgent: navigator.userAgent,
            userAgentDataPlatform: navigator.userAgentData?.platform, maxTouchPoints: navigator.maxTouchPoints,
            quality: resolveNanjingDisplayQuality({ preference: readNanjingDisplayQuality() }),
            nativePixelRatio: window.devicePixelRatio * pixelRatioMulti,
            width: editor.value.clientWidth, height: editor.value.clientHeight,
            baseline: !optimizedProject,
        })
        threeEditor = new ThreeEditor(editor.value, {
            fps: null,
            pixelRatio: initialDisplay.pixelRatio,
            webglRenderParams: { antialias: true, alpha: true, powerPreference: optimizedProject ? 'high-performance' : 'default', logarithmicDepthBuffer: optimizedProject ? false : logarithmicDepthBuffer, reversedDepthBuffer: optimizedProject },
            sceneParams
        })
        installPostProcessingColorReset(threeEditor)
        installPostProcessingBloom(threeEditor)
        materialTexturePersistence = installMaterialTexturePersistence(threeEditor, sceneParams)
        collectionEdits = createModelCollectionEdits(threeEditor, sceneParams)
        for (const root of threeEditor.scene.children) collectionEdits.registerRoot(root, { pristine: false })
        projectLoadState.attach(threeEditor)
        editorLifecycle = installNanjingLifecycle(threeEditor)
        installNanjingRestore(threeEditor, sceneParams, { getProjectName: () => dataCores.sceneName })
        projectLightingSettings = installProjectLightingSettings(threeEditor, sceneParams)
        installMaterialPanel(threeEditor)
    } catch (error) {
        if (!isCurrentRequest(request, sceneName)) return
        loadError.value = error?.message || '工程读取失败'
        projectLoadState?.fail(error, generation)
        console.warn('编辑器载入未完成，已保留本地存档', error)
        return
    }

    if (!isCurrentRequest(request, sceneName)) return
    emits('emitThreeEditor', threeEditor)
    scheduleRealisticLightingRefresh(threeEditor)
    window.addEventListener('resize', handleResize)

}

function changeDBModelUrl(sceneParams) {
    sceneParams?.modelCores?.forEach(i => {
        if (i.modelInfo.threeEditorDBNameUrl) {
            const [_, name] = i.modelInfo.threeEditorDBNameUrl.split(':')
            const item = window.threeEditorDB.list.find(i => i.name === name)
            if (item?.blob) i.modelInfo.url = URL.createObjectURL(item.blob)
            else throw new Error('缺少工程本地模型文件：' + name + '，已保留原存档')
        }
    })
    return sceneParams
}

onMounted(() => init())
onUnmounted(() => {
    componentDisposed = true
    sceneReadController?.abort()
    sceneRequest++
    window.removeEventListener('resize', handleResize)
    try { projectLightingSettings?.dispose(); materialTexturePersistence?.dispose(); collectionEdits?.dispose(); threeEditor?.destroySceneRender() }
    finally { projectLoadState?.dispose(); editorLifecycle?.destroy() }
});

</script>

<style scoped>
.edit {
    width: 100vw;
    height: 100vh;
}
.project-load-error {
    position: fixed;
    z-index: 10000;
    top: 88px;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 48px));
    box-sizing: border-box;
    padding: 20px;
    border: 1px solid #b87b70;
    border-radius: 8px;
    color: #f7efed;
    background: #342c2a;
}
.project-load-error p { margin: 12px 0; }
.project-load-error-url { overflow-wrap: anywhere; font-size: 12px; color: #d9c3be; }
.project-load-error button { padding: 6px 12px; cursor: pointer; }
</style>
