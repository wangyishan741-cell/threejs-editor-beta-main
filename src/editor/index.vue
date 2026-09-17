<template>
  <div v-show="!namePreviewScene" class="layout" :class="{ 'is-preview': previewScene }">
    <header class="header" v-show="!previewScene" aria-label="工程工具栏">
      <div class="header-left">
        <span class="editor-brand"><span aria-hidden="true">◇</span><span class="brand-label">三维编辑器</span></span>
        <el-select :model-value="dataCores.sceneName" @update:model-value="name => openProjectRecord(name, true)"
          :disabled="projectRecordBusy" class="project-select" aria-label="当前工程" placeholder="选择工程">
          <el-option v-for="item in dataCores.options" :key="item.name" :label="item.name" :value="item.name">
            <div class="project-option">
              <span>{{ item.name }}</span>
              <el-popconfirm title="确定删除该工程记录？" @confirm="() => delScene(item)">
                <template #reference><button type="button" class="delete-project" :aria-label="'删除工程 ' + item.name" @click.stop>×</button></template>
              </el-popconfirm>
            </div>
          </el-option>
        </el-select>
      </div>
      <nav class="header-actions" aria-label="工程操作">
        <el-dropdown trigger="click" @command="handleProjectCommand">
          <el-button>工程 <span aria-hidden="true">⌄</span></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="new" :disabled="projectRecordBusy">新建工程</el-dropdown-item>
            <el-dropdown-item command="save-as" :disabled="!sceneReady || projectRecordBusy">另存为新工程</el-dropdown-item>
            <el-dropdown-item command="local" divided>本地导入模型</el-dropdown-item>
            <el-dropdown-item command="url">从链接导入模型</el-dropdown-item>
            <el-dropdown-item command="importProject" :disabled="!sceneReady">导入工程 JSON + GLB</el-dropdown-item>
            <el-dropdown-item command="glb" divided :disabled="!sceneReady">导出 GLB 模型</el-dropdown-item>
            <el-dropdown-item command="json" :disabled="!sceneReady">导出工程 JSON</el-dropdown-item>
            <el-dropdown-item command="image" :disabled="!sceneReady">导出截图</el-dropdown-item>
            <el-dropdown-item command="share" divided>分享链接</el-dropdown-item>
            <el-dropdown-item command="preview">预览场景</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-button v-if="hasNanjingEffects" @click="openEffects">画面效果</el-button>
        <el-button :disabled="!sceneReady" @click="openPanel">属性面板</el-button>
        <el-button class="preview-action" @click="previewScene = true">预览</el-button>
        <el-dropdown trigger="click">
          <el-button class="help-action">帮助 <span aria-hidden="true">⌄</span></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item @click="showOperationSettings = true">操作与快捷键</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://z2586300277.github.io/editor-docs/')">使用文档</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://z2586300277.github.io/three-cesium-examples')">开源案例</el-dropdown-item>
            <el-dropdown-item divided @click="openUrl('https://z2586300277.github.io/threejs-editor/apply.html')">嵌入项目</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://github.com/z2586300277/threejs-editor/tree/main/src/editor/compoents')">组件源码</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://github.com/z2586300277/threejs-editor-beta')">编辑器源码</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://pan.quark.cn/s/1f507069e8f1')">下载编辑器</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://z2586300277.github.io/')">官网</el-dropdown-item>
            <el-dropdown-item @click="openUrl('https://z2586300277.github.io/three-editor/dist/#/editor')">旧版编辑器</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-button type="primary" class="save-action" :loading="projectRecordBusy" :disabled="!sceneReady" @click="saveScene">保存工程</el-button>
      </nav>
      <el-upload class="hidden-upload" ref="myUpload" :auto-upload="false" :show-file-list="false" action="" accept=".glb,.fbx" :on-change="uploadChange"><span /></el-upload>
    </header>

    <div class="main-container">
      <aside class="side-panel left-panel" :class="{ 'collapsed': leftCollapsed }" v-show="!previewScene" aria-label="工程与资源">
        <LeftPanel :collapsed="leftCollapsed" :project-records="projectRecords" :current-project-name="dataCores.sceneName"
          :project-record-busy="projectRecordBusy" :project-record-status="projectRecordStatus" :project-record-error="projectRecordError"
          @expand="leftCollapsed = false" @save-project="saveScene" @open-project="openProjectRecord"
          @restore-version="restoreProjectRecordVersion" />
        <button type="button" class="panel-toggle" @click="leftCollapsed = !leftCollapsed" :aria-label="leftCollapsed ? '展开资源面板' : '收起资源面板'" :aria-expanded="!leftCollapsed">{{ leftCollapsed ? '›' : '‹' }}</button>
      </aside>

      <div class="top-toolbar" v-show="!previewScene" role="toolbar" aria-label="场景编辑工具">
        <el-radio-group v-model="currentMode" size="small" aria-label="编辑模式">
          <el-radio-button value="选中" label="选中" title="选择物体"><el-icon><Pointer /></el-icon>选择</el-radio-button>
          <el-radio-button value="平移" label="平移" title="平移 (R)"><el-icon><Position /></el-icon>平移</el-radio-button>
          <el-radio-button value="旋转" label="旋转" title="旋转 (T)"><el-icon><Refresh /></el-icon>旋转</el-radio-button>
          <el-radio-button value="缩放" label="缩放" title="缩放 (G)"><el-icon><ZoomIn /></el-icon>缩放</el-radio-button>
          <el-radio-button value="预览" label="预览" title="浏览场景，不选择物体"><el-icon><Remove /></el-icon>浏览</el-radio-button>
        </el-radio-group>
        <span class="divider" aria-hidden="true"></span>
        <el-button-group size="small">
          <el-button @click="handleUndo" title="撤销 (Ctrl+Z)" aria-label="撤销 (Ctrl+Z)"><el-icon><RefreshLeft /></el-icon></el-button>
          <el-button @click="handleRedo" title="重做 (Ctrl+Y)" aria-label="重做 (Ctrl+Y)"><el-icon><RefreshRight /></el-icon></el-button>
        </el-button-group>
        <el-button size="small" @click="showOperationSettings = !showOperationSettings" :aria-expanded="showOperationSettings" aria-controls="editor-operation-settings">操作设置</el-button>
      </div>

      <aside class="side-panel right-panel" :class="{ 'collapsed': rightCollapsed }" v-show="!previewScene" aria-label="场景与环境">
        <div class="panel-content" v-show="!rightCollapsed"><RightPanel ref="rightPanel" :scene-name="dataCores.sceneName" /></div>
        <button type="button" class="panel-toggle" @click="rightCollapsed = !rightCollapsed" :aria-label="rightCollapsed ? '展开场景面板' : '收起场景面板'" :aria-expanded="!rightCollapsed">{{ rightCollapsed ? '‹' : '›' }}</button>
      </aside>
    </div>

    <section v-if="showOperationSettings && !previewScene" id="editor-operation-settings" class="operation-settings" role="dialog" aria-label="操作与快捷键" @keydown.esc="showOperationSettings = false">
      <header><h2>操作与快捷键</h2><button type="button" aria-label="关闭操作设置" @click="showOperationSettings = false">×</button></header>
      <div class="operation-switches">
        <el-checkbox v-model="selectChildMode">选择模型子级</el-checkbox>
        <el-checkbox v-model="rightClickMenusEnable">启用右键菜单</el-checkbox>
        <el-checkbox v-model="openKeyEnable">启用快捷键</el-checkbox>
      </div>
      <p class="shortcut-note">{{ openKeyEnable ? '快捷键已开启' : '开启后可使用以下快捷键' }}</p>
      <dl class="shortcut-list">
        <div><dt>R / T / G</dt><dd>平移 / 旋转 / 缩放</dd></div>
        <div><dt>Tab</dt><dd>变换与选择切换</dd></div>
        <div><dt>Shift + Tab</dt><dd>根节点与子级切换</dd></div>
        <div><dt>↑ / ↓</dt><dd>切换子层级</dd></div>
        <div><dt>Q W E A S D</dt><dd>XYZ 轴微调</dd></div>
        <div><dt>Shift + X / Y / Z</dt><dd>绕轴旋转 90°</dd></div>
        <div><dt>Ctrl + C</dt><dd>复制选中物体</dd></div>
        <div><dt>Ctrl + Z / Y</dt><dd>撤销 / 重做</dd></div>
        <div><dt>Del / Esc</dt><dd>删除 / 取消选中</dd></div>
      </dl>
    </section>
    <button v-if="previewScene" type="button" class="exit-preview" @click="previewScene = false">退出预览 · 继续编辑</button>
    <el-dialog v-model="dialogVisible" :title="projectDialogMode === 'save-as' ? '另存为新工程' : '新建工程'" width="min(440px, 90vw)" append-to-body>
      <el-input v-model="inputSceneName" placeholder="请输入工程名称" aria-label="新工程名称" @keyup.enter="submitProjectDialog" />
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="projectRecordBusy" @click="submitProjectDialog">{{ projectDialogMode === 'save-as' ? '另存并打开' : '创建工程' }}</el-button></template>
    </el-dialog>
  </div>
  <Editor @dblclick="getEvent" :dataCores="dataCores" @emitThreeEditor="emitThreeEditor" class="editor" />
  <AiPanel v-show="!previewScene" />
</template>

<script setup>
import { defineAsyncComponent, reactive, ref, watch, watchEffect, onMounted, onUnmounted } from 'vue'
import EditorVue from './editor.vue'
import { ElButton, ElSelect, ElOption, ElMessage, ElIcon, ElMessageBox } from 'element-plus'
import { Pointer, Position, RefreshRight, ZoomIn, Remove, Refresh } from '@element-plus/icons-vue'
import LeftPanel from './left.vue'
import RightPanel from './right.vue'
import AiPanel from './ai/aiPanel.vue'
import { mountSceneAI } from './ai/ai'
import { useRoute, useRouter, isNavigationFailure } from 'vue-router'
import { setIndexDB } from './indexDb'
import { getObjectViews, createGsapAnimation, restoreHistoryHandler } from './lib'
import * as THREE from 'three'
import { exportSourceSceneGlb } from './sourceSceneExport.js'
import { enableObjectShadows, scheduleRealisticLightingRefresh } from './lightingDefaults'
import { isNanjingRestoreRoute, NANJING_SCENE_NAME } from './nanjingRestore'
import { listProjectRecords, readProjectScene, saveProjectScene, removeProjectRecord, touchProjectRecord, restoreProjectVersion } from './projectRecords.js'
import emptyProject from './template.json'

window.threeEditorDB = { db: null , list: []}
const Editor = defineAsyncComponent(() => {
    return setIndexDB().then(async res => {
        const { data } = await res.getAllRequest()
        window.threeEditorDB.db = res
        window.threeEditorDB.list = data
        return EditorVue
    }).catch(() => EditorVue)
})

const route = useRoute()
const router = useRouter()
let namePreviewScene = false
window.editorPreviewSceneUrl = null
window.editorPreviewSceneImmutable = false
window.editorPreviewSceneImport = false
if(route.query?.undark) document.getElementsByTagName('html')[0].classList.remove('dark')
if (route.query.sceneName) {
    namePreviewScene = route.query.edit !== '1'
    window.editorPreviewSceneImmutable = route.query.snapshot === '1'
    window.editorPreviewSceneImport = window.editorPreviewSceneImmutable && route.query.import === '1' && typeof route.query.project === 'string' && !!route.query.project.trim()
    const name = window.editorPreviewSceneImmutable ? encodeURIComponent(String(route.query.sceneName)) : route.query.sceneName
    const sn = 'editorJson/' + name + '.json'
    window.editorPreviewSceneUrl = __isProduction__ ? '/threejs-editor-beta/' + sn : '/' + sn
    
    // Fixed public versions resolve identically in every browser. Legacy
    // example links retain their optional local asset-library override.
    if (!window.editorPreviewSceneImmutable) {
      try {
        const addList = JSON.parse(localStorage.getItem('newEditor_addon_editor_json') || '[]')
        const matchLink = Array.isArray(addList) && addList.find(v => typeof v === 'string' && v.includes(route.query.sceneName + '.json'))
        if (matchLink) window.editorPreviewSceneUrl = matchLink
      } catch { /* A damaged local library does not replace the explicit URL. */ }
    } 
}

const rightPanel = ref(null)
const dialogVisible = ref(false);
const inputSceneName = ref('');
const projectDialogMode = ref('new')
const currentMode = ref('平移')
const selectChildMode = ref(true)
const previewScene = ref(false)
const leftCollapsed = ref(window.innerWidth < 1000)
const rightCollapsed = ref(window.innerWidth < 1200)
const rightClickMenusEnable = ref(false)
const openKeyEnable = ref(false)
const showOperationSettings = ref(false)
const sceneReady = ref(false)
const hasNanjingEffects = ref(false)
watchEffect(() => {
  const style = document.documentElement.style
  document.documentElement.classList.toggle('editor-preview', previewScene.value)
  style.setProperty('--editor-header-height', '56px')
  style.setProperty('--editor-left-width', previewScene.value ? '0px' : leftCollapsed.value ? '60px' : '300px')
  style.setProperty('--editor-right-width', previewScene.value || rightCollapsed.value ? '0px' : '280px')
})
const openEffects = () => document.dispatchEvent(new CustomEvent('three-editor-open-effects'))
function handleProjectCommand(command) {
  const actions = {
    new: () => openProjectDialog('new'),
    'save-as': () => openProjectDialog('save-as'),
    local: () => myUpload.value?.$el.querySelector('input[type="file"]')?.click(),
    url: loadModelUrl, glb: exportGLTF, json: exportTemplateJson, image: pict, share: shareLink,
    importProject: () => editorInstance?.nanjingRestore?.importProjectFiles?.() || ElMessage.error('当前工程不支持 JSON + GLB 导入'),
    preview: () => { previewScene.value = true }
  }
  actions[command]?.()
}
const projectRecords = ref([])
const projectRecordBusy = ref(false)
const projectRecordStatus = ref('保存为独立版本，出问题可在历史版本中回档')
const projectRecordError = ref('')
let editorInstance = null
let toolbarTimer = null
let recordsRefresh = 0
let recordsDisposed = false
const requestedProject = typeof route.query.project === 'string' && route.query.project.trim() ? route.query.project : null
const dataCores = reactive({
  sceneName: requestedProject || (isNanjingRestoreRoute() ? NANJING_SCENE_NAME : localStorage.getItem('new_sceneName') || '三维测试'),
  options: readSceneOptions()
})
function readSceneOptions() {
  try {
    const list = JSON.parse(localStorage.getItem('new_sceneList'))
    if (Array.isArray(list)) return list.filter(item => typeof item?.name === 'string' && item.name.trim())
  } catch { /* Saved project records remain independently readable. */ }
  return [{ name: '三维测试' }]
}
if (!dataCores.options.some(item => item.name === dataCores.sceneName)) dataCores.options.push({ name: dataCores.sceneName })

async function refreshProjectRecords() {
  const generation = ++recordsRefresh
  try {
    const records = await listProjectRecords()
    if (recordsDisposed || generation !== recordsRefresh) return
    projectRecords.value = records
    for (const record of records) if (!dataCores.options.some(item => item.name === record.name)) dataCores.options.push({ name: record.name })
  } catch (error) {
    if (!recordsDisposed && generation === recordsRefresh) projectRecordError.value = '读取工程记录失败：' + error.message
  }
}
function projectRecordChanged(event) {
  refreshProjectRecords()
  if (event.detail?.type === 'saved' && event.detail.name === dataCores.sceneName) projectRecordStatus.value = `已保存 V${event.detail.versionCount || ''}，历史版本仍然保留`
}
onMounted(() => {
  document.documentElement.classList.add('editor-workspace')
  refreshProjectRecords()
  window.addEventListener('three-editor-project-records-changed', projectRecordChanged)
  window.addEventListener('storage', refreshProjectRecords)
})
onUnmounted(() => {
  document.documentElement.classList.remove('editor-workspace', 'editor-preview')
  for (const name of ['--editor-header-height', '--editor-left-width', '--editor-right-width']) document.documentElement.style.removeProperty(name)
  recordsDisposed = true
  recordsRefresh++
  clearInterval(toolbarTimer)
  window.removeEventListener('three-editor-project-records-changed', projectRecordChanged)
  window.removeEventListener('storage', refreshProjectRecords)
})

if (isNanjingRestoreRoute() && !dataCores.options.some(item => item.name === NANJING_SCENE_NAME)) {
  dataCores.options.push({ name: NANJING_SCENE_NAME })
}

const openUrl = (url) => window.open(url, '_blank')

watch(selectChildMode, (val) => threeEditor.handler.selectChildEnabled = val)
watch(rightClickMenusEnable, (val) => threeEditor.handler.rightClickMenusEnable = val)
watch(openKeyEnable, (val) => threeEditor.handler.openKeyEnable = val)
let panelStateBeforePreview = { left: leftCollapsed.value, right: rightCollapsed.value }
watch(leftCollapsed, value => { if (!value && window.innerWidth < 1000) rightCollapsed.value = true })
watch(rightCollapsed, value => { if (!value && window.innerWidth < 1000) leftCollapsed.value = true })
watch(previewScene, (val) => {
  if (val) {
    panelStateBeforePreview = { left: leftCollapsed.value, right: rightCollapsed.value }
    leftCollapsed.value = true
    rightCollapsed.value = true
  } else {
    leftCollapsed.value = panelStateBeforePreview.left
    rightCollapsed.value = panelStateBeforePreview.right
  }
  localStorage.setItem('new_previewScene', val)
})
// Migrate the auto-preview preference introduced for the LAN scene. Start in
// editing mode once; subsequent explicit preview choices remain persistent.
if (isNanjingRestoreRoute() && localStorage.getItem('nanjing_edit_panels_v1') !== '1') {
  localStorage.setItem('new_previewScene', 'false')
  localStorage.setItem('nanjing_edit_panels_v1', '1')
}
if (localStorage.getItem('new_previewScene') === 'true') {
  previewScene.value = true
  leftCollapsed.value = true
  rightCollapsed.value = true
}

watch(currentMode, (val) => {
  if (!editorInstance) return
  const { transformControls, handler } = editorInstance
  const selected = transformControls.object || editorInstance.effectComposer?.effectPass?.outlinePass?.selectedObjects?.[0]
  if (val === '选中') {
    handler.mode = 'select'
    transformControls.detach()
    editorInstance.setOutlinePass(selected?.parent ? [selected] : [])
  } else if(val === '预览') {
    handler.mode = 'none'
    transformControls.detach()
    editorInstance.setOutlinePass([])
  } else {
    handler.mode = 'transform'
    if (selected?.parent) transformControls.attach(selected)
    editorInstance.setOutlinePass([])
  }
  if (val === '平移') transformControls.setMode('translate')
  else if (val === '旋转') transformControls.setMode('rotate')
  else if (val === '缩放') transformControls.setMode('scale')
})

/* 这是内置事件 如不需要也可以自行使用原生 射线获取场景点击 */
const getEvent = (e) => {
  threeEditor.getSceneEvent(e, info => {
     info.rootObject?.EVENTCALL?.(info) // 添加在定义点击事件处理
  })
}
const openPanel = () => editorInstance?.openControlPanel()

const emitThreeEditor = (threeEditor) => {
  if (!threeEditor) { projectRecordError.value = '工程尚未载入，已保留已有记录'; return }
  editorInstance = threeEditor
  threeEditor.handler.selectChildEnabled = true
  threeEditor.handler.selectChildLevel = 1
  sceneReady.value = true
  hasNanjingEffects.value = !!threeEditor.__nanjingRestoreActive
  rightPanel.value.helperConf(threeEditor)
  rightPanel.value.startEditor(threeEditor)
  window.threeEditor = threeEditor
  mountSceneAI(threeEditor)
  scheduleRealisticLightingRefresh(threeEditor)

  // 轮询 handler 状态，值变化时才同步到工具栏 Vue ref
  const tcModeMap = { translate: '平移', rotate: '旋转', scale: '缩放' }
  clearInterval(toolbarTimer)
  toolbarTimer = setInterval(() => {
    try {
    const { handler, transformControls } = threeEditor
    if (openKeyEnable.value !== handler.openKeyEnable) openKeyEnable.value = handler.openKeyEnable
    if (rightClickMenusEnable.value !== handler.rightClickMenusEnable) rightClickMenusEnable.value = handler.rightClickMenusEnable
    if (selectChildMode.value !== handler.selectChildEnabled) selectChildMode.value = handler.selectChildEnabled
    const newMode = handler.mode === 'select' ? '选中' : handler.mode === 'none' ? '预览' : (tcModeMap[transformControls.mode] ?? '平移')
    if (currentMode.value !== newMode) currentMode.value = newMode
    } catch (error) {
    }
  }, 600)
}

function saveLocal() {
  // These are navigation preferences, not the authoritative scene payload.
  try {
    localStorage.setItem('new_sceneList', JSON.stringify(dataCores.options))
    localStorage.setItem('new_sceneName', dataCores.sceneName)
  } catch { /* An IndexedDB save must not be reported as failed by a full preference store. */ }
}

function openProjectDialog(mode) {
  projectDialogMode.value = mode
  inputSceneName.value = mode === 'save-as'
    ? editorInstance?.__nanjingRestoreActive ? '南京数智城A地块 · 最新效果版' : dataCores.sceneName + ' · 副本'
    : ''
  dialogVisible.value = true
}

const submitProjectDialog = () => projectDialogMode.value === 'save-as' ? saveAsNewProject() : createEditor()

async function saveAsNewProject() {
  const name = inputSceneName.value.trim()
  if (!name) return ElMessage.error('请输入工程名称')
  if (dataCores.options.some(item => item.name === name)) return ElMessage.error('工程名称已存在，请使用其他名称')
  if (projectRecordBusy.value) return
  projectRecordBusy.value = true
  projectRecordError.value = ''
  projectRecordStatus.value = '正在另存新工程…'
  try {
    if (!editorInstance?.saveSceneEdit || (!editorInstance.__nanjingRestoreActive && editorInstance.__projectLoading)
      || editorInstance.__nanjingRestoreActive && !editorInstance.nanjingRestore.getStatus().ready) throw new Error('请等待当前工程载入完成')
    // saveSceneEdit enters the existing source-material/geometry wrappers.
    // Only the destination is written; the original record/history is intact.
    const params = editorInstance.saveSceneEdit()
    await saveProjectScene(name, params, { createOnly: true, kind: 'save-as', label: '另存为新工程' })
    await refreshProjectRecords()
    dialogVisible.value = false
    await navigateProject(name)
  } catch (error) {
    projectRecordError.value = '另存未完成：' + error.message
    projectRecordStatus.value = '原工程及历史版本未改变'
    ElMessage.error(projectRecordError.value)
  } finally { projectRecordBusy.value = false }
}

async function createEditor() {
  const name = inputSceneName.value.trim()
  if (!name) return ElMessage.error('请输入场景名称')
  if (dataCores.options.some(item => item.name === name)) return ElMessage.error('场景名称已存在')
  if (projectRecordBusy.value) return
  projectRecordBusy.value = true
  projectRecordError.value = ''
  try {
    await persistCurrentProject()
    await saveProjectScene(name, emptyProject, { createOnly: true })
    await refreshProjectRecords()
    await navigateProject(name)
  } catch (error) {
    projectRecordError.value = '新建工程未完成：' + error.message
    projectRecordStatus.value = '当前工程仍然保留'
    ElMessage.error(projectRecordError.value)
  } finally { projectRecordBusy.value = false }
}

async function delScene(item) {
  const index = dataCores.options.findIndex(i => i.name === item.name)
  if (index > -1) {
    try { await removeProjectRecord(item.name) }
    catch (error) { ElMessage.error('删除工程记录失败：' + error.message); return }
    dataCores.options.splice(index, 1)
    saveLocal()
    if (dataCores.sceneName === item.name) dataCores.sceneName = dataCores.options[0]?.name || '三维测试'
  }
}

function exportTemplateJson() {
  if (!threeEditor) return ElMessage.error('没有可导出的场景')
  ElMessageBox.confirm('是否下载当前渲染场景json模板？', '模板下载', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'info' }).then(() => {
  const params = threeEditor.saveSceneEdit()
  if (params?.nanjingRestore) {
    delete params.nanjingRestore.sharedAppearance
    delete params.nanjingRestore.historySnapshot
  }
  const blob = new Blob([JSON.stringify(params)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = (dataCores.sceneName || '场景') + '.json'
  link.click()
  }).catch(() => {})
}

function pict() {
  const base64 = threeEditor.getSceneEditorImage(['image/png', '0.8'])
  const link = document.createElement('a');
  link.href = base64;
  link.download = (dataCores.sceneName || '场景') + '.png';
  link.click();
}

async function persistCurrentProject(label) {
  if (!editorInstance?.saveSceneEdit) throw new Error('请等待工程载入完成')
  if (!editorInstance.__nanjingRestoreActive && editorInstance.__projectLoading) throw new Error(editorInstance.__projectLoadError || '模型仍在载入，请稍后重试')
  if (editorInstance.__nanjingRestoreActive) {
    if (!editorInstance.nanjingRestore.getStatus().ready) throw new Error('南京工程仍在载入，请稍后重试')
    await editorInstance.nanjingRestore.save({ label })
  } else await saveProjectScene(dataCores.sceneName, editorInstance.saveSceneEdit(), { label })
  await refreshProjectRecords()
  saveLocal()
}

async function saveScene(note) {
  if (projectRecordBusy.value) return
  projectRecordBusy.value = true
  projectRecordError.value = ''
  projectRecordStatus.value = '正在保存工程…'
  try {
    await persistCurrentProject(typeof note === 'string' ? note.trim().slice(0, 100) || undefined : undefined)
    projectRecordStatus.value = '新版本已保存，可在历史版本中回档'
    ElMessage.success('工程已保存到工程记录')
  } catch (error) {
    projectRecordError.value = '保存失败：' + error.message
    projectRecordStatus.value = '本次修改尚未保存'
    ElMessage.error(projectRecordError.value)
  } finally { projectRecordBusy.value = false }
}

async function openProjectRecord(name, allowEmpty = false) {
  if (projectRecordBusy.value) return
  if (name === dataCores.sceneName) {
    projectRecordError.value = ''
    previewScene.value = false
    rightCollapsed.value = false
    projectRecordStatus.value = '正在编辑此工程，当前修改已保留'
    return
  }
  projectRecordBusy.value = true
  projectRecordError.value = ''
  try {
    // Check the requested record before touching the current scene. A failed
    // save or a missing record never navigates away from unsaved edits.
    if (!await readProjectScene(name) && !allowEmpty) throw new Error('找不到该工程的存档')
    projectRecordStatus.value = '正在保存当前工程…'
    await persistCurrentProject()
    await touchProjectRecord(name)
    await navigateProject(name)
  } catch (error) {
    projectRecordError.value = '未切换工程：' + error.message
    projectRecordStatus.value = '当前工程仍然保留'
    projectRecordBusy.value = false
  }
}

async function restoreProjectRecordVersion({ name, versionId }) {
  if (projectRecordBusy.value) return
  projectRecordBusy.value = true; projectRecordError.value = ''
  projectRecordStatus.value = '正在备份当前工程并恢复历史版本…'
  try {
    if (!editorInstance?.saveSceneEdit || editorInstance.__projectLoading
      || editorInstance.__nanjingRestoreActive && !editorInstance.nanjingRestore.getStatus().ready) throw new Error('请等待当前工程载入完成后回档')
    const currentProject = { name: dataCores.sceneName, params: editorInstance.saveSceneEdit() }
    const result = await restoreProjectVersion(name, versionId, { currentProject })
    await refreshProjectRecords()
    await navigateProject(name, result.record.latestVersionId)
  } catch (error) {
    projectRecordError.value = '回档未完成：' + error.message
    projectRecordStatus.value = '当前画面仍然保留；已提交的备份可在历史版本中找到'
    projectRecordBusy.value = false
  }
}

async function navigateProject(name, restoredVersionId) {
  const query = name === NANJING_SCENE_NAME ? { restore: 'nanjing', project: name } : { project: name }
  if (restoredVersionId) query.restored = restoredVersionId
  const failure = await router.replace({ path: '/editor', query })
  if (isNavigationFailure(failure)) throw new Error('页面未能切换，请重试')
  try {
    localStorage.setItem('new_sceneName', name)
    localStorage.setItem('new_previewScene', 'false')
  } catch { /* The project query is the authoritative reload destination. */ }
  projectRecordStatus.value = '正在打开工程…'
  // Pending model requests and GPU resources belong to one document. A fresh
  // load prevents delayed callbacks from a previous project entering this one.
  window.location.reload()
}

function loadModelUrl() {
  const url = window.prompt('请输入模型地址url', 'https://z2586300277.github.io/3d-file-server/examples/coffeeMug/coffeeMug.glb')
  window.left_loadModel?.(url)
}
function shareLink() {
  const sceneName = window.currentOnlineSceneName || ''
  window.open(router.resolve({ path: '/editor', query: { sceneName } }).href, '_blank')
}

const myUpload = ref(null)
const uploadChange = file => {
    const [_, end] = file.name.split('.')
    myUpload.value.clearFiles()
    if (!['fbx', 'glb', 'FBX', 'GLB'].includes(end)) return ElMessage.error('请上传fbx或glb格式的模型')
    const url = URL.createObjectURL(file.raw)
    window.threeEditorDB.db.getRequest(file.name, url).then(res => {
        const rootInfo = { url: res.url, type: end.toLocaleUpperCase() === 'GLB' ? 'GLTF' : end.toLocaleUpperCase(), threeEditorDBNameUrl: 'IndexDB:' + file.name }
        const { loaderService } = threeEditor.modelCores.loadModel(rootInfo)
        loaderService.complete = m => {
            enableObjectShadows(m)
            scheduleRealisticLightingRefresh(threeEditor)
            const { transformControls, camera, controls } = threeEditor
            const { maxView, target } = getObjectViews(m)
            Promise.all([createGsapAnimation(camera.position, maxView), createGsapAnimation(controls.target, target)]).then(() => {
                threeEditor.setOutlinePass([m])
                controls.target.copy(target)
                transformControls.attach(m)
            })
        }
    })
}

const exportGLTF = () => {
  ElMessageBox.confirm('确定要导出当前场景为 GLB 文件吗？', '导出确认', {
    confirmButtonText: '导出',
    cancelButtonText: '取消',
    type: 'info'
  }).then(() => {
    doExport()
  }).catch(() => {})
}


const doExport = async () => {
  try {
    const { data: result, objectCount } = await exportSourceSceneGlb(threeEditor)
    if (!objectCount) {
      ElMessage.warning('场景中没有可导出的模型')
      return
    }
    const isBuffer = result instanceof ArrayBuffer
    const blob = new Blob(
      [isBuffer ? result : JSON.stringify(result, null, 2)],
      { type: isBuffer ? 'model/gltf-binary' : 'model/gltf+json' }
    )
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${dataCores.sceneName}.glb`
    link.click()
    URL.revokeObjectURL(link.href)
    ElMessage.success(`导出成功`)
  } catch (error) {
    ElMessage.error('导出失败: ' + error.message)
  }
}

const handleUndo = () => {
  if (threeEditor) restoreHistoryHandler(threeEditor.handler.handlerHistory, 'z')
}

const handleRedo = () => {
  if (threeEditor) restoreHistoryHandler(threeEditor.handler.handlerHistory, 'y')
}
</script>

<style scoped>
.editor { position: absolute; top: 0; }
:global(html.editor-workspace .footer-links) { display: none; }
:global(html.editor-preview .vanui-window), :global(html.editor-preview #realistic-material-panel), :global(html.editor-preview #nanjing-restore-tools) { display: none !important; }
.layout { height: 100vh; width: 100vw; color: #e4ebf3; overflow: hidden; pointer-events: none; font-size: 12px; }
.header { position: fixed; inset: 0 0 auto; height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; box-sizing: border-box; background: #19222b; border-bottom: 1px solid #303b4a; z-index: 90; pointer-events: auto; }
.header-left, .header-actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.header-left { flex: 1; }
.header-actions { flex: 0 0 auto; }
.header-actions :deep(.el-button + .el-button) { margin-left: 0; }
.header-actions :deep(.el-button) { font-size: 12px; border-radius: 6px; padding: 8px 11px; }
.editor-brand { display: flex; align-items: center; gap: 7px; white-space: nowrap; color: #dbe9f6; font-size: 13px; font-weight: 600; }
.editor-brand > span:first-child { font-size: 29px; line-height: 1; color: #82b9ed; }
.project-select { width: 260px; max-width: 100%; min-width: 130px; }
.project-select :deep(.el-select__wrapper) { box-shadow: none; background: #202b36; }
.project-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.project-option > span { overflow: hidden; text-overflow: ellipsis; }
.delete-project { border: 0; background: none; color: #adbac9; cursor: pointer; font-size: 17px; }
.hidden-upload { display: none; }
.main-container { position: fixed; inset: 56px 0 0; z-index: 1; pointer-events: none; }
.side-panel { position: absolute; top: 0; bottom: 0; background: #202830; z-index: 120; pointer-events: auto; }
.left-panel { left: 0; width: 300px; border-right: 1px solid #303b4a; }
.left-panel.collapsed { width: 60px; }
.right-panel { right: 0; width: 280px; border-left: 1px solid #303b4a; }
.right-panel.collapsed { width: 0; border: 0; }
.panel-content { height: 100%; width: 100%; }
.panel-toggle { position: absolute; top: 12px; width: 18px; height: 34px; padding: 0; border: 1px solid #3b4c5b; color: #c0d1e1; background: #202b36; cursor: pointer; font-size: 20px; z-index: 2; }
.left-panel .panel-toggle { right: -19px; border-radius: 0 5px 5px 0; }
.right-panel .panel-toggle { left: -19px; border-radius: 5px 0 0 5px; }
.panel-toggle:hover { background: #324657; }
.top-toolbar { position: fixed; top: 68px; left: calc(var(--editor-left-width, 300px) + 30px); max-width: calc(100vw - var(--editor-left-width, 300px) - var(--editor-right-width, 280px) - 60px); display: flex; align-items: center; gap: 8px; padding: 6px; box-sizing: border-box; border: 1px solid #3b4957; border-radius: 8px; background: #202830f5; box-shadow: 0 3px 12px #0003; z-index: 125; pointer-events: auto; overflow-x: auto; }
.top-toolbar > * { flex-shrink: 0; }
.top-toolbar :deep(.el-radio-group) { display: flex; flex-wrap: nowrap; }
.top-toolbar :deep(.el-radio-button__inner) { display: flex; align-items: center; gap: 4px; padding: 7px 9px; font-size: 12px; }
.divider { width: 1px; height: 22px; background: #3b4957; }
.operation-settings { position: fixed; top: 116px; left: min(calc(var(--editor-left-width, 300px) + 30px), calc(100vw - 324px)); width: 300px; max-height: calc(100vh - 150px); overflow-y: auto; box-sizing: border-box; padding: 14px; border: 1px solid #44566a; border-radius: 8px; background: #202830; box-shadow: 0 8px 30px #0005; z-index: 260; pointer-events: auto; }
.operation-settings header { display: flex; justify-content: space-between; align-items: center; }
.operation-settings h2 { font-size: 14px; margin: 0; }
.operation-settings header button { border: 0; background: none; color: #b9ccdd; font-size: 22px; cursor: pointer; }
.operation-switches { display: flex; flex-direction: column; align-items: flex-start; margin: 12px 0; }
.operation-switches :deep(.el-checkbox) { margin: 0; }
.shortcut-note { color: #98adbf; font-size: 11px; border-top: 1px solid #354452; padding-top: 10px; }
.shortcut-list { margin: 0; }
.shortcut-list > div { display: flex; justify-content: space-between; gap: 8px; margin-top: 9px; font-size: 11px; }
.shortcut-list dt { color: #cfdfed; }
.shortcut-list dd { color: #97aabb; margin: 0; }
.exit-preview { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); padding: 9px 16px; border: 1px solid #53728d; border-radius: 6px; color: #e7f1fa; background: #202830ee; z-index: 300; cursor: pointer; pointer-events: auto; }
button:focus-visible { outline: 2px solid #82b9ed; outline-offset: 2px; }
.layout :deep(::-webkit-scrollbar) { width: 5px; height: 5px; }
.layout :deep(::-webkit-scrollbar-thumb) { border-radius: 3px; background: #526171; }
@media (max-width: 1200px) { .brand-label { display: none; } .header { gap: 8px; padding: 0 10px; } .project-select { width: 210px; } }
@media (max-width: 760px) { .editor-brand { display: none; } .header-actions { gap: 4px; } .header-actions :deep(.el-button) { padding: 8px 7px; } .project-select { width: 160px; min-width: 100px; } .help-action { display: none; } .top-toolbar { left: calc(var(--editor-left-width, 60px) + 24px); max-width: calc(100vw - var(--editor-left-width, 60px) - 48px); } }
@media (max-width: 560px) { .header { gap: 4px; padding: 0 6px; } .project-select { width: 110px; min-width: 70px; } .preview-action { display: none; } .header-actions :deep(.el-button) { font-size: 11px; padding: 8px 5px; } }
</style>
