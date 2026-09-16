const TABS = [['effects', '效果'], ['quality', '画质'], ['inspect', '检查'], ['project', '工程']]

// Layout only: move the existing live controls, including their native event
// handlers and diagnostic datasets. No rendering or project state is copied.
export function createNanjingWorkspacePanel({ panel, status, metrics, report, buttonRow,
  qualitySelect, gpuStatus, deviceStatus, appearanceStatus, instancingButton, foliageZeroAlphaButton,
  effectControls = [], glassDetails, glassControls, fogDetails, fogControls, roadTextureLabel }) {
  const doc = panel.ownerDocument
  const element = (tag, className, text) => {
    const node = doc.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const display = panel.style.display
  panel.style.cssText = ''
  panel.style.display = display
  panel.classList.add('nanjing-workspace-panel')

  const bar = element('div', 'nanjing-workspace-bar')
  const mark = element('span', 'nanjing-workspace-mark')
  mark.setAttribute('aria-hidden', 'true')
  status.style.cssText = ''; status.classList.add('nanjing-workspace-status')
  status.setAttribute('role', 'status')
  const toggle = element('button', 'nanjing-workspace-toggle', '效果设置')
  toggle.type = 'button'; toggle.setAttribute('aria-label', '打开效果设置')
  toggle.setAttribute('aria-controls', 'nanjing-effects-drawer')
  toggle.setAttribute('aria-expanded', 'false')
  bar.append(mark, status, toggle)

  const drawer = element('section', 'nanjing-workspace-drawer')
  drawer.id = 'nanjing-effects-drawer'; drawer.hidden = true
  drawer.setAttribute('aria-label', '画面效果设置')
  const heading = element('div', 'nanjing-workspace-heading')
  const title = element('h2', '', '画面效果')
  const close = element('button', 'nanjing-workspace-close', '×')
  close.type = 'button'; close.setAttribute('aria-label', '收起效果设置'); close.title = '收起 · Esc'
  heading.append(title, close)
  const tabList = element('div', 'nanjing-workspace-tabs')
  tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', '效果设置分组')
  const body = element('div', 'nanjing-workspace-body')
  const tabs = new Map(), pages = new Map()
  for (const [id, label] of TABS) {
    const button = element('button', 'nanjing-workspace-tab', label)
    button.type = 'button'; button.id = `nanjing-effects-tab-${id}`
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `nanjing-effects-page-${id}`)
    const page = element('div', 'nanjing-workspace-page')
    page.id = `nanjing-effects-page-${id}`; page.setAttribute('role', 'tabpanel')
    page.setAttribute('aria-labelledby', button.id)
    button.addEventListener('click', () => selectTab(id))
    tabs.set(id, button); pages.set(id, page); tabList.append(button); body.append(page)
  }
  drawer.append(heading, tabList, body)
  panel.append(bar, drawer)

  function section(page, label, nodes = [], className = '') {
    const group = element('section', `nanjing-workspace-section ${className}`.trim())
    group.append(element('h3', '', label))
    for (const node of nodes.filter(Boolean)) group.append(node)
    pages.get(page).append(group)
    return group
  }
  for (const node of effectControls) node.classList.add('nanjing-workspace-control')
  section('effects', '光照与阴影', effectControls)
  if (roadTextureLabel) {
    roadTextureLabel.classList.add('nanjing-workspace-control')
    section('effects', '区块材质', [roadTextureLabel])
  }
  for (const [details, controls] of [[glassDetails, glassControls], [fogDetails, fogControls]]) {
    details.classList.add('nanjing-workspace-details')
    controls.style.cssText = ''; controls.classList.add('nanjing-workspace-detail-controls')
    for (const label of controls.querySelectorAll('label')) label.classList.add('nanjing-workspace-control')
    pages.get('effects').append(details)
  }
  const qualityLabel = element('label', 'nanjing-workspace-control', '显示质量')
  qualityLabel.append(qualitySelect)
  for (const node of [gpuStatus, deviceStatus, metrics, appearanceStatus, report]) {
    node.style.cssText = ''; node.classList.add('nanjing-workspace-readout')
  }
  const gpuBadge = element('span', 'nanjing-workspace-gpu-badge', '当前集显')
  const gpuWarning = element('p', 'nanjing-workspace-gpu-warning', '最高画质对集显负载较高。')
  const gpuHelp = element('details', 'nanjing-workspace-gpu-help')
  gpuHelp.append(element('summary', '', '如何切换显卡'),
    element('p', '', '由系统和浏览器选择。更改高性能偏好后，重启浏览器或宿主应用，再核对这里的 GPU。'))
  const deviceCard = section('quality', '实际渲染设备', [gpuStatus, deviceStatus, gpuWarning, gpuHelp], 'nanjing-workspace-device')
  deviceCard.querySelector('h3').append(gpuBadge)
  deviceCard.setAttribute('aria-label', '实际渲染设备')
  gpuStatus.classList.add('nanjing-workspace-gpu-name')
  const instancingHelp = element('p', 'nanjing-workspace-readout', '实例化合并重复绘制，使用上方所示显卡。')
  section('quality', '显示与性能', [qualityLabel, instancingButton, instancingHelp, foliageZeroAlphaButton])
  function updateGpuNotice() {
    // Trust the existing classifier's explicit label, not an "Intel" substring
    // in ANGLE metadata: dedicated Intel Arc A/B cards must not be called iGPUs.
    const integrated = /Intel\s*集成显卡/.test(gpuStatus.textContent || '')
    deviceCard.dataset.gpuKind = integrated ? 'intel-integrated' : 'other'
    gpuBadge.hidden = !integrated; gpuWarning.hidden = !integrated
  }
  updateGpuNotice()
  const checks = section('inspect', '画面对比与检查', [], 'nanjing-workspace-actions')
  const tests = section('inspect', '性能测试', [], 'nanjing-workspace-actions')
  section('inspect', '运行信息', [metrics, report])
  report.classList.add('nanjing-workspace-report')
  const files = section('project', '更多工程操作', [], 'nanjing-workspace-actions')
  const sync = section('project', '共享效果', [appearanceStatus], 'nanjing-workspace-actions')
  const restore = section('project', '工程配置', [], 'nanjing-workspace-actions')

  const fileLabels = new Set(['保存工程', '生成固定版本链接', '导出 JSON', '截图'])
  const syncLabels = new Set(['检测并同步', '同步当前效果', '恢复共享更新'])
  for (const node of [...buttonRow.children]) {
    if (node.tagName !== 'BUTTON') { pages.get('effects').append(node); continue }
    const label = node.textContent.trim()
    if (fileLabels.has(label)) files.append(node)
    else if (syncLabels.has(label)) sync.append(node)
    else if (label === '重新应用配置') restore.append(node)
    else if (label === '更新反射') glassControls.append(node)
    else if (label.includes('性能测试') || label === '最高画质测试') tests.append(node)
    else checks.append(node) // Keep optional DEV checks and future actions accessible.
  }
  buttonRow.remove()
  for (const control of drawer.querySelectorAll('button, select, input')) {
    for (const property of ['background', 'color', 'border', 'border-radius', 'padding', 'cursor', 'white-space']) control.style.removeProperty(property)
    if (control.type === 'range') control.style.removeProperty('width')
  }

  let opened = false, activeTab = 'effects', disposed = false, returnFocus = null
  function selectTab(id) {
    if (!tabs.has(id)) id = 'effects'
    activeTab = id
    for (const [key, tab] of tabs) {
      const selected = key === id
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1
      pages.get(key).hidden = !selected
    }
    if (id === 'inspect') { tabs.get(id).removeAttribute('data-new-report'); toggle.removeAttribute('data-new-report') }
  }
  function setOpen(value, tab) {
    if (disposed) return
    if (tab) selectTab(tab)
    if (value && !opened) returnFocus = doc.activeElement
    opened = value; drawer.hidden = !value
    toggle.setAttribute('aria-expanded', String(value))
    toggle.setAttribute('aria-label', value ? '收起效果设置' : '打开效果设置')
    if (value) tabs.get(activeTab).focus({ preventScroll: true })
    else if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  }
  const externalOpen = event => setOpen(true, event.detail?.tab || 'effects')
  const keyboard = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
    if (event.target.getAttribute('role') !== 'tab') return
    const index = TABS.findIndex(([id]) => id === activeTab)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault(); event.stopPropagation(); selectTab(TABS[next][0]); tabs.get(activeTab).focus()
  }
  toggle.addEventListener('click', () => setOpen(!opened))
  close.addEventListener('click', () => setOpen(false))
  drawer.addEventListener('keydown', keyboard)
  doc.addEventListener('three-editor-open-effects', externalOpen)
  selectTab('effects')
  const Observer = doc.defaultView?.MutationObserver
  const observer = Observer && new Observer(records => {
    status.title = status.textContent
    if (records.some(record => record.target === gpuStatus || gpuStatus.contains(record.target))) updateGpuNotice()
    if (records.some(record => record.target === report || report.contains(record.target)) && !(opened && activeTab === 'inspect')) {
      tabs.get('inspect').setAttribute('data-new-report', 'true')
      toggle.setAttribute('data-new-report', 'true')
    }
  })
  observer?.observe(status, { childList: true, subtree: true, characterData: true })
  observer?.observe(report, { childList: true, subtree: true, characterData: true })
  observer?.observe(gpuStatus, { childList: true, subtree: true, characterData: true })
  status.title = status.textContent
  tabs.get('inspect').addEventListener('click', () => toggle.removeAttribute('data-new-report'))
  return {
    open: (tab = 'effects') => setOpen(true, tab), close: () => setOpen(false),
    getStatus: () => ({ open: opened, tab: activeTab, disposed }),
    dispose() {
      if (disposed) return
      disposed = true; observer?.disconnect()
      doc.removeEventListener('three-editor-open-effects', externalOpen)
      drawer.removeEventListener('keydown', keyboard)
    },
  }
}
