<template>
  <section class="project-records" aria-label="工程记录" :aria-busy="projectRecordBusy || versionExport.busy">
    <header class="records-header">
      <h2>工程记录</h2>
      <p class="storage-note">每次保存保留独立版本 · 存在当前浏览器</p>
      <label class="version-note-label" for="project-version-note">本次修改说明</label>
      <input id="project-version-note" v-model="versionNote" class="version-note" maxlength="100"
        placeholder="例如：弱化远景雾场" :disabled="projectRecordBusy" />
      <button type="button" class="save-button" :disabled="projectRecordBusy" @click="saveProject">
        保存新版本
      </button>
      <p class="storage-status" role="status" aria-live="polite">
        {{ projectRecordStatus || (projectRecordBusy ? '正在处理，请稍候…' : '保存后可在这里继续编辑') }}
      </p>
      <div v-if="projectRecordError" class="record-error" role="alert">
        <p>{{ projectRecordError }}</p>
        <button v-if="lastAction" type="button" class="retry-button" :disabled="projectRecordBusy" @click="retryAction">
          {{ lastAction.type === 'save' ? '重试保存' : lastAction.type === 'restore' ? '重试恢复' : '重试打开' }}
        </button>
        <p v-else class="retry-note">请再次保存或选择工程重试。</p>
      </div>
    </header>

    <div class="records-search">
      <label class="search-label" for="project-record-search">搜索工程</label>
      <div class="search-control">
        <input id="project-record-search" v-model="search" type="search" placeholder="输入工程名称"
          autocomplete="off" aria-label="搜索工程记录" aria-describedby="project-record-result-count" />
        <button v-if="search" type="button" class="clear-search" aria-label="清除工程搜索" @click="search = ''">清除</button>
      </div>
      <p id="project-record-result-count" class="result-count" role="status" aria-live="polite">
        {{ search.trim() ? `找到 ${filteredRecords.length} 个工程` : `${filteredRecords.length} 个工程 · 最近使用优先` }}
      </p>
    </div>

    <ul v-if="filteredRecords.length" class="record-list" aria-label="已保存的工程">
      <li v-for="record in filteredRecords" :key="record.name">
        <article class="record-card" :class="{ 'is-current': record.name === currentProjectName }"
          :aria-label="`工程：${record.name}`" :aria-current="record.name === currentProjectName ? 'true' : undefined">
          <h3 :title="record.name">{{ record.name }}</h3>
          <span v-if="record.name === currentProjectName" class="current-badge">当前工程</span>
          <p class="saved-at">保存时间：<time v-if="dateValue(record.updatedAt)" :datetime="dateValue(record.updatedAt).toISOString()">{{ formatTime(record.updatedAt) }}</time><span v-else>暂无保存时间</span></p>
          <button type="button" class="open-button" :disabled="projectRecordBusy"
            :aria-label="`继续编辑 ${record.name}`" @click="openProject(record.name)">继续编辑</button>
          <button type="button" class="versions-button" :disabled="projectRecordBusy"
            :aria-expanded="expandedName === record.name" @click="toggleVersions(record.name)">
            {{ expandedName === record.name ? '收起历史版本' : `历史版本（${record.versionCount || 1}）` }}
          </button>
          <section v-if="expandedName === record.name" class="version-history" :aria-label="`${record.name} 的历史版本`">
            <p class="history-note">恢复前自动保留当前工程，可再次回档。</p>
            <p v-if="versionsLoading" role="status">正在读取版本…</p>
            <p v-else-if="versionsError" role="alert">{{ versionsError }} <button type="button" @click="loadVersions(record.name)">重试</button></p>
            <ol v-else class="version-list">
              <li v-for="version in versions" :key="version.id">
                <div class="version-heading"><strong>V{{ version.number }}</strong><span>{{ version.label || kindLabel(version.kind) }}</span></div>
                <time v-if="dateValue(version.createdAt)" :datetime="dateValue(version.createdAt).toISOString()">{{ formatTime(version.createdAt) }}</time>
                <span v-else>旧存档 · 未记录时间</span>
                <small>标识 {{ version.id.slice(0, 8) }}</small>
                <p v-if="version.kind === 'legacy'" class="history-note">旧存档保留原有数据；此前被覆盖的版本无法补回，未记录的派生标高效果也无法追溯。</p>
                <button type="button" class="restore-button" :disabled="projectRecordBusy || deleteVersionBusy"
                  :aria-label="`恢复 ${record.name} 的 V${version.number}`" @click="restoreVersion(record.name, version.id)">恢复此版本</button>
                <button type="button" class="delete-version-button" :disabled="projectRecordBusy || deleteVersionBusy"
                  :aria-label="`删除 ${record.name} 的 V${version.number}`" @click="deleteVersion(record.name, version)">删除此版本</button>
                <button type="button" class="export-version-button" :disabled="projectRecordBusy || versionExport.busy || deleteVersionBusy"
                  :aria-label="`导出 ${record.name} 的 V${version.number} 版本模板`" @click="exportVersion(record.name, version)">
                  {{ versionExport.busy && versionExport.id === version.id ? '正在导出…' : '导出版本模板' }}
                </button>
                <p v-if="versionExport.id === version.id" class="version-export-status" :class="{ 'is-error': versionExport.error }"
                  :role="versionExport.error ? 'alert' : 'status'" aria-live="polite">{{ versionExport.message }}</p>
              </li>
            </ol>
          </section>
        </article>
      </li>
    </ul>
    <div v-else class="empty-state" role="status">
      <p>{{ search.trim() ? '没有找到匹配的工程' : '还没有工程记录' }}</p>
      <p class="empty-help">{{ search.trim() ? '换个名称搜索，或清除搜索条件。' : '点击“保存当前工程”，下次可从这里继续。' }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { listProjectVersions, readProjectVersion, deleteProjectVersion } from './projectRecords.js'

const props = defineProps({
  projectRecords: { type: Array, default: () => [] },
  currentProjectName: { type: String, default: '' },
  projectRecordBusy: { type: Boolean, default: false },
  projectRecordStatus: { type: String, default: '' },
  projectRecordError: { type: String, default: '' }
})
const emit = defineEmits(['save-project', 'open-project', 'restore-version'])
const search = ref('')
const versionNote = ref('')
const lastAction = ref(null)
const expandedName = ref(''), versions = ref([]), versionsLoading = ref(false), versionsError = ref('')
const versionExport = ref({ id: null, busy: false, message: '', error: false })
const deleteVersionBusy = ref(null)
let disposed = false
onBeforeUnmount(() => { disposed = true })
let versionRequest = 0
const kindLabel = kind => ({ save: '手动保存', 'before-restore': '回档前自动备份', restore: '历史回档', legacy: '原有存档' })[kind] || '保存版本'
async function loadVersions(name) {
  const request = ++versionRequest
  versionsLoading.value = true; versionsError.value = ''
  try { const rows = await listProjectVersions(name); if (request === versionRequest) versions.value = rows }
  catch (error) { if (request === versionRequest) versionsError.value = error.message }
  finally { if (request === versionRequest) versionsLoading.value = false }
}
function toggleVersions(name) {
  if (props.projectRecordBusy) return
  if (expandedName.value === name) { expandedName.value = ''; versionRequest++; return }
  expandedName.value = name; loadVersions(name)
}
watch(() => props.projectRecords.find(record => record.name === expandedName.value)?.latestVersionId, () => {
  if (expandedName.value) loadVersions(expandedName.value)
})
function restoreVersion(name, versionId) {
  if (props.projectRecordBusy) return
  lastAction.value = { type: 'restore', name, versionId }
  emit('restore-version', { name, versionId })
}
async function deleteVersion(name, version) {
  if (props.projectRecordBusy || deleteVersionBusy.value) return
  if (!window.confirm(`确定删除 ${name} 的 V${version.number} 吗？此操作无法撤销。`)) return
  deleteVersionBusy.value = version.id
  versionsError.value = ''
  try {
    await deleteProjectVersion(name, version.id)
    await loadVersions(name)
  } catch (error) {
    versionsError.value = error.message
  } finally {
    deleteVersionBusy.value = null
  }
}
async function exportVersion(name, version) {
  if (disposed || props.projectRecordBusy || versionExport.value.busy) return
  versionExport.value = { id: version.id, busy: true, message: `正在读取 V${version.number}…`, error: false }
  let url = null, link = null
  try {
    // Export the immutable record itself, using the same plain scene JSON as
    // 工程 → 导出工程 JSON. Do not capture or restore the current editor scene.
    const params = await readProjectVersion(name, version.id)
    if (disposed) return
    const blob = new Blob([JSON.stringify(params)], { type: 'application/json' })
    const filename = (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 120) || '工程')
      + `-V${version.number}-版本模板.json`
    url = URL.createObjectURL(blob)
    link = document.createElement('a')
    link.href = url; link.download = filename
    document.body.append(link); link.click()
    versionExport.value.message = `已发起 V${version.number} 模板下载，可用此 JSON 恢复工程。`
  } catch (error) {
    if (!disposed) {
      versionExport.value.error = true
      versionExport.value.message = `导出 V${version.number} 失败：${error?.message || '读取版本数据失败'}。请再次点击重试。`
    }
  } finally {
    link?.remove()
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
    if (!disposed) versionExport.value.busy = false
  }
}
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
})

function dateValue(value) {
  if (value == null || value === '' || !['string', 'number'].includes(typeof value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null
}

function recentTime(record) {
  return Math.max(dateValue(record.updatedAt)?.getTime() ?? 0, dateValue(record.lastOpenedAt)?.getTime() ?? 0)
}

function formatTime(value) {
  const date = dateValue(value)
  return date ? dateFormatter.format(date) : '暂无保存时间'
}

const filteredRecords = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.projectRecords
    .filter(record => typeof record?.name === 'string' && record.name.trim()
      && record.name.toLocaleLowerCase().includes(query))
    .slice().sort((a, b) => recentTime(b) - recentTime(a) || a.name.localeCompare(b.name, 'zh-CN'))
})

function saveProject() {
  if (props.projectRecordBusy) return
  lastAction.value = { type: 'save' }
  emit('save-project', versionNote.value.trim())
}

function openProject(name) {
  if (props.projectRecordBusy) return
  lastAction.value = { type: 'open', name }
  emit('open-project', name)
}

function retryAction() {
  if (lastAction.value?.type === 'save') saveProject()
  else if (lastAction.value?.type === 'open') openProject(lastAction.value.name)
  else if (lastAction.value?.type === 'restore') restoreVersion(lastAction.value.name, lastAction.value.versionId)
}
</script>

<style scoped>
.project-records { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; color: #dedee2; font-size: 12px; box-sizing: border-box; }
.records-header { padding: 14px 12px 10px; border-bottom: 1px solid #3e3e3e; background: #1e1e1e; }
h2 { margin: 0; color: #f0f0f2; font-size: 15px; font-weight: 600; }
.storage-note { margin: 6px 0 12px; color: #b0b0b8; font-size: 11px; line-height: 1.5; }
button, input { box-sizing: border-box; font: inherit; }
button { cursor: pointer; border-radius: 4px; transition: background-color .15s; }
button:focus-visible, input:focus-visible { outline: 2px solid #b6d3f4; outline-offset: 2px; }
button:disabled { opacity: .5; cursor: wait; }
.save-button { width: 100%; min-height: 32px; border: 1px solid #5581b0; background: #315579; color: #f0f6ff; }
.version-note-label { display: block; margin: 8px 0 5px; color: #b0b0b8; }
.version-note { width: 100%; min-height: 32px; margin-bottom: 8px; padding: 6px 8px; border: 1px solid #50505a; border-radius: 4px; background: #29292f; color: #f0f0f2; }
.save-button:hover:not(:disabled) { background: #3d678f; }
.storage-status { min-height: 16px; margin: 8px 0 0; color: #b9c7d5; font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.record-error { margin-top: 8px; padding: 8px; border: 1px solid #8c4d4d; border-radius: 4px; background: #352425; color: #ffc5c5; overflow-wrap: anywhere; }
.record-error p { margin: 0; line-height: 1.5; }
.record-error .retry-note { margin-top: 5px; color: #d7babb; font-size: 11px; }
.retry-button { margin-top: 7px; padding: 4px 8px; border: 1px solid #ac7373; background: transparent; color: #ffe1e1; }
.records-search { padding: 10px 12px 8px; }
.search-label { display: block; margin-bottom: 6px; color: #b9b9c0; font-size: 11px; }
.search-control { position: relative; }
.search-control input { width: 100%; min-height: 30px; padding: 5px 42px 5px 8px; border: 1px solid #49494e; border-radius: 4px; background: #252526; color: #eee; }
.search-control input::placeholder { color: #92929b; }
.search-control input::-webkit-search-cancel-button { display: none; }
.clear-search { position: absolute; top: 3px; right: 3px; height: 24px; padding: 0 4px; border: 0; background: transparent; color: #b6d3f4; font-size: 11px; }
.result-count { margin: 7px 0 0; color: #a2a2ad; font-size: 11px; }
.record-list { flex: 1; min-height: 0; margin: 0; padding: 2px 12px 14px; overflow-y: auto; list-style: none; }
.record-list li + li { margin-top: 9px; }
.record-card { padding: 10px; border: 1px solid #414146; border-radius: 6px; background: #222224; }
.record-card.is-current { border-color: #6486aa; background: #242e39; }
h3 { margin: 0; color: #ededf0; font-size: 12px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.current-badge { display: inline-block; margin-top: 5px; padding: 1px 5px; border-radius: 3px; background: #36506c; color: #d4e7ff; font-size: 10px; }
.saved-at { margin: 8px 0 10px; color: #b2b2be; font-size: 11px; line-height: 1.6; }
.saved-at time { white-space: normal; }
.open-button { width: 100%; min-height: 28px; padding: 4px 8px; border: 1px solid #55555d; background: #303035; color: #e2e2e9; }
.open-button:hover:not(:disabled) { background: #3c4652; border-color: #7d9dbf; }
.versions-button { margin-top: 7px; width: 100%; min-height: 28px; border: 1px solid #526b84; background: #293849; color: #d1e7ff; }
.version-history { margin-top: 10px; padding-top: 7px; border-top: 1px solid #475566; }
.history-note { color: #b0c0ce; font-size: 11px; line-height: 1.5; margin: 4px 0 8px; }
.version-list { margin: 0; padding: 0; list-style: none; }
.version-list li { padding: 9px 7px; background: #1c252e; border: 1px solid #394958; border-radius: 4px; }
.version-heading { display: flex; gap: 8px; margin-bottom: 5px; align-items: center; }
.version-heading strong { color: #c6dfff; }
.version-list time, .version-list small { display: block; color: #aebbca; margin: 4px 0; font-size: 10px; }
.restore-button { width: 100%; margin-top: 5px; min-height: 28px; border: 1px solid #688db2; background: #324f6b; color: #f3f8ff; }
.export-version-button { width: 100%; margin-top: 5px; min-height: 28px; border: 1px solid #536b80; background: #263642; color: #d3e5f4; }
.export-version-button:hover:not(:disabled) { background: #344a5b; }
.delete-version-button { width: 100%; margin-top: 5px; min-height: 28px; border: 1px solid #7b5050; background: #3b2828; color: #ffd9d9; }
.delete-version-button:hover:not(:disabled) { background: #523232; }
.version-export-status { margin: 6px 0 0; color: #b9d2e5; font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.version-export-status.is-error { color: #ffc5c5; }
.empty-state { padding: 24px 16px; text-align: center; color: #c6c6ce; line-height: 1.7; }
.empty-state p { margin: 0; }
.empty-state .empty-help { margin-top: 7px; color: #a1a1ad; font-size: 11px; }
</style>
