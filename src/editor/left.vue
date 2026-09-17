<template>
  <div class="left" :class="{ collapsed }">
    <nav class="nav-menu" aria-label="编辑器资源导航">
      <button type="button" class="menu-item" v-for="item in data" :key="item.title" @click="setActive(item)"
        :aria-pressed="active === item.title" :title="item.title">
        <el-icon :class="{ 'active-icon': active == item.title, 'normal-icon': active != item.title }" aria-hidden="true">
          <component :is="item.icon" />
        </el-icon>
        <span :class="{ 'active-text': active == item.title }">{{ item.title }}</span>
      </button>
    </nav>

    <div v-show="!collapsed" class="content-panel" :class="{ 'records-panel': active === '工程记录' }">
      <ProjectRecords v-if="active === '工程记录'" :project-records="projectRecords"
        :current-project-name="currentProjectName" :project-record-busy="projectRecordBusy"
        :project-record-status="projectRecordStatus" :project-record-error="projectRecordError"
        @save-project="label => emit('save-project', label)" @open-project="name => emit('open-project', name)"
        @restore-version="value => emit('restore-version', value)" />
      <template v-else>
      <header class="resource-header"><h2>{{ active }}</h2><p>点击添加到场景，也可拖入视图区</p></header>
      <div class="search-box">
        <el-input v-model="searchText" :placeholder="'搜索' + active" :aria-label="'搜索' + active" clearable size="small" />
      </div>
      <p v-if="!filteredList.length" class="resource-empty">没有找到匹配内容</p>
      <div class="build">
        <div class="back" v-for="i in filteredList" :key="i">
          <div class="item" draggable="true" @dragend="e => dragAdd(e, i)">
            <el-link @click="clickLeft(i)">
              {{ i.split('/').pop() }}
            </el-link>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ThreeEditor, getObjectViews, createGsapAnimation } from './lib'
import * as THREE from 'three';
import { ElMessage } from 'element-plus';
import { enableObjectShadows, scheduleRealisticLightingRefresh } from './lightingDefaults'
import ProjectRecords from './projectRecords.vue'

defineProps({
  collapsed: { type: Boolean, default: false },
  projectRecords: { type: Array, default: () => [] },
  currentProjectName: { type: String, default: '' },
  projectRecordBusy: { type: Boolean, default: false },
  projectRecordStatus: { type: String, default: '' },
  projectRecordError: { type: String, default: '' }
})
const emit = defineEmits(['save-project', 'open-project', 'restore-version', 'expand'])

ThreeEditor.__GLSLLIB__.push(
       {
        name: '荧光流动',
        commonUniforms: true,
        vertex: 'vUv-material',
        fragment: `
            vec4 o = gl_FragColor.rgba;
            vec2 u = gl_FragCoord.xy;
            vec2 v = iResolution.xy;
            vec2 uv = .2*(u+u-v)/v.y;  
            <UV_PLACEHOLDER>
            u =  uv;
            vec4 z = o = vec4(1,2,3,0);
            for (float a = .5, t = iTime, i; 
                ++i < 19.; 
                o += (1. + cos(z+t)) 
                    / length((1.+i*dot(v,v)) 
                        * sin(1.5*u/(.5-dot(u,u)) - 9.*u.yx + t))
                )  
                v = cos(++t - 7.*u*pow(a += .03, i)) - 5.*u, 
                u += tanh(40. * dot(u *= mat2(cos(i + .02*t - vec4(0,11,33,0)))
                                ,u)
                            * cos(1e2*u.yx + t)) / 2e2
                + .2 * a * u
                + cos(4./exp(dot(o,o)/1e2) + t) / 3e2;
                        
                o = 25.6 / (min(o, 13.) + 164. / o) 
                - dot(u, u) / 250.;
                vec3 col = o.rgb;
            `
        ,
        key: 'col',
        commonFinish: true,
        render: 'iTime+speed'
    },
    {
      name: '太阳照射',
      commonUniforms: true,
      vertex: 'vUv-material',
      fragment:`
        float cheap_star(vec2 uv, float anim)
        {
            uv = abs(uv);
            vec2 pos = min(uv.xy/uv.yx, anim);
            float p = (2.0 - pos.x - pos.y);
            return (2.0+p*(p*p-1.5)) / (uv.x+uv.y);      
        }
        <SPLIT_PLACEHOLDER>
        vec2 uv = ( gl_FragCoord.xy - .5*iResolution.xy ) / iResolution.y;
        <UV_PLACEHOLDER>
        uv *= 2.0 * ( cos(iTime * 2.0) -2.5); // scale
        float anim = sin(iTime * 12.0) * 0.1 + 1.0;
        vec3 col = cheap_star(uv, anim) * vec3(0.35,0.2,0.15);
      `,
      key: 'col',
      commonFinish: true,
      render: 'iTime+speed'
    }
  )

// 导入外置组件
ThreeEditor.__DESIGNS__.unshift(...Object.values(import.meta.glob('./compoents/\*.js', { eager: true, import: 'default' }))) 

const editor_components = ThreeEditor.__DESIGNS__.map(v => v.label)

const loadingDiv = document.createElement('div')
Object.assign(loadingDiv.style, {
  pointerEvents: 'none',
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%,-50%)',
  color: 'white',
  fontSize: '20px',
  backgroundColor: 'rgba(0,0,0,0.5)',
  padding: '10px 20px',
  borderRadius: '5px'
})
let addList = window.addon_editor_json || []
if(addList.length) localStorage.setItem('newEditor_addon_editor_json', JSON.stringify(addList))
else {
  const local_addon = localStorage.getItem('newEditor_addon_editor_json')
  if(local_addon) addList = JSON.parse(local_addon)
}
const listJ = window.editorJsons.map(v => __isProduction__ ? '/threejs-editor-beta/' + v : '/' + v)
listJ.splice(9, 0, ...addList)
const lightTypes = ['环境光', '平行光', '点光源', '聚光灯', '半球光', '平面光'];
const data = [
  {
    icon: 'FolderOpened',
    title: '工程记录',
    list: []
  },
  {
    icon: 'set-up',
    title: '配置案例',
    list: listJ
  },
  {
    icon: 'office-building',
    title: '模型',
    list: window.models,
  },
  {
    title: '灯光',
    icon: 'sunny',
    list: lightTypes
  },
  {
    title: '组件',
    icon: 'connection',
    list: editor_components
  }
];

const activeLocal = localStorage.getItem('new_active')
const initialItem = data.find(v => v.title === activeLocal) || data[0];
const showList = ref(initialItem.list);
const active = ref(initialItem.title);
const searchText = ref('');

const filteredList = computed(() => {
  if (!searchText.value) return showList.value;
  return showList.value.filter(item =>
    item.split('/').pop().toLowerCase().includes(searchText.value.toLowerCase())
  );
});

function setActive(item) {
  emit('expand')
  // Navigation still works when browser storage cannot persist this preference.
  try { localStorage.setItem('new_active', item.title); } catch {}
  active.value = item.title;
  showList.value = item.list;
  searchText.value = '';
}

let current_scene_url = localStorage.getItem('current_scene_url')
const loadScene = async (v) => {
  if(v.indexOf('动画时间线') > -1) {
    let str = v 
    const newUrl = str.replace('/editorJson/', '/animateJson/').replace(/动画时间线-/g, '')
    if(current_scene_url!==newUrl) {
        const res = await fetch(newUrl).then(res => res.json())
        localStorage.setItem('current_scene_url', newUrl)
        localStorage.removeItem('theatre-0.4.persistent')
        localStorage.setItem('THREE_EDITOR_ANIMATIONS', JSON.stringify(res))
        ElMessage.success('此场景包含动画时间线, 已加载了动画数据, 即将刷新页面, 再次点击当前场景即可正常查看动画效果')
        return setTimeout(() => window.location.reload(), 1000)
    }
  }
  fetch(v).then(res => res.json()).then(res => {
    threeEditor?.resetEditorStorage(res)
    scheduleRealisticLightingRefresh(threeEditor)
  })
}
const loadModel = (url, point) => {
  const { modelCores } = window.threeEditor
  const { camera, controls, transformControls } = threeEditor
  const { loaderService } = modelCores.loadModel(url)
  document.body.appendChild(loadingDiv)
  loaderService.progress = progress => loadingDiv.innerText = '下载' + (progress * 100).toFixed(2) + '%'
  loaderService.complete = model => {
    if(point) model.position.copy(point)
    enableObjectShadows(model)
    scheduleRealisticLightingRefresh(threeEditor)
    document.body.removeChild(loadingDiv)
    const { maxView, target } = getObjectViews(model)
    Promise.all([createGsapAnimation(camera.position, maxView, { duration: 0.3 }), createGsapAnimation(controls.target, target, { duration: 0.3 })]).then(() => {
      transformControls.attach(model)
    })
  }
}
window.left_loadModel = loadModel
async function clickLeft(v, point) {
  if (active.value === '配置案例') {
    window.currentOnlineSceneName = v.split('/').pop().replace('.json', '')
    loadScene(v)
  }
  else if (active.value === '模型') loadModel(v, point)
  else if (active.value === '组件') {
    const { scene, transformControls } = threeEditor
    const design = ThreeEditor.__DESIGNS__.find(d => d.label === v)
    const mesh = await design.create(null, threeEditor, threeEditor)
    if (!mesh) return
    mesh.editorType = 'isDesignMesh'
    mesh.designType = design.name
    enableObjectShadows(mesh, { castShadow: false, receiveShadow: true })
    scene.add(mesh)
    if (point) mesh.position.copy(point)
    const { maxView, target } = getObjectViews(mesh)
    //检测是否存在maxView
    if(maxView.x){
      createGsapAnimation(threeEditor.camera.position, maxView, { duration: 0.3 })
      createGsapAnimation(threeEditor.controls.target, target, { duration: 0.3 })
    }
    transformControls.attach(mesh)
    scheduleRealisticLightingRefresh(threeEditor)
  }
  else if (active.value === '灯光') {
    const { scene, transformControls } = threeEditor
    const lightMap = {
      '环境光': () => new THREE.AmbientLight(0xffffff, 1),
      '平行光': () => new THREE.DirectionalLight(0xffffff, 1),
      '点光源': () => new THREE.PointLight(0xffffff, 1, 0, 0),
      '聚光灯': () => new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 6, 0, 0),
      '半球光': () => new THREE.HemisphereLight(0xffffff, 0x000000, 1),
      '平面光': () => new THREE.RectAreaLight(0xffffff, 1, 100, 100),
    }
    const light = lightMap[v]()
    if (light.target) scene.add(light.target)
    light.editorType = 'isLight'
    light.name = v
    if (point) light.position.copy(point)
    scene.add(light)
    transformControls.attach(light)
  }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragAdd = (e, v) => {
  e.preventDefault();
  const { dataTransfer } = e;
  const { clientX, clientY } = e;
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, threeEditor.camera);
  const intersects = raycaster.intersectObjects(threeEditor.scene.children, true);
  if (intersects.length > 0) {
    const intersect = intersects[0];
    const { point } = intersect;
    clickLeft(v, point)
  }
}

</script>

<style lang="less" scoped>
.left {
  width: 100%;
  height: 100%;
  background-color: #202830;
  position: relative;
  z-index: 100;
  display: flex;
}

.nav-menu {
  width: 60px;
  flex: 0 0 60px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #303b4a;
  box-sizing: border-box;
}

.menu-item {
  height: 62px;
  flex: 0 0 62px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 1px solid #303b4a;
  user-select: none;
  transition: all 0.2s ease;

  &:hover {
    background-color: #252525;
  }

  &:focus-visible {
    outline: 2px solid rgb(182, 211, 244);
    outline-offset: -3px;
  }

  .normal-icon {
    font-size: 24px;
    transition: all 0.2s;
  }

  .active-icon {
    font-size: 28px;
    color: rgb(182, 211, 244);
    font-weight: 800;
    transition: all 0.2s;
  }

  .active-text {
    color: rgb(182, 211, 244);
    font-weight: bold;
  }
}

.content-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.content-panel.records-panel {
  height: 100%;
  overflow: hidden;
}

.search-box {
  padding: 10px;
  border-bottom: 1px solid #303b4a;
  background-color: #1e1e1e;
}

.build {
  padding: 4px;
  box-sizing: border-box;
  display: grid;
  grid-auto-rows: 80px;
  grid-template-columns: repeat(2, 1fr);
  overflow: auto;
  height: 100%;
  justify-items: center;
  width: 100%;

  .back {
    height: 70px;
    width: 90px;
    border-radius: 6px;
    border: 1px solid #676768;
    display: flex;
    padding: 5px;
    box-sizing: border-box;
  }

  .item {
    border: 1px solid #3d3d3d;
    border-radius: 3px;
    height: 100%;
    width: 100%;
    word-wrap: break-word;
    word-break: break-all;
    font-size: 12px;
    display: flex;
    overflow-wrap: break-word;
    text-align: center;
    justify-content: center;
    align-content: center;
    justify-items: center;
    align-items: center;
    padding: 4px;  box-sizing: border-box;
  }

}
.nav-menu { background: #18212a; padding-top: 6px; gap: 3px; }
.menu-item { border-bottom: 0; height: 64px; flex-basis: 64px; border-radius: 6px; color: #95a9bb; }
.menu-item[aria-pressed="true"] { background: #2a4054; box-shadow: inset 3px 0 #82b9ed; }
.menu-item .normal-icon, .menu-item .active-icon { font-size: 21px; }
.resource-header { padding: 16px 12px 4px; }
.resource-header h2 { margin: 0; font-size: 14px; color: #e0ebf5; }
.resource-header p { margin: 8px 0; font-size: 11px; line-height: 1.6; color: #95a8b9; }
.resource-empty { padding: 16px 12px; color: #97adbf; font-size: 12px; }
.search-box { background: none; }
.build { min-height: 0; flex: 1; height: auto; gap: 6px; padding: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.build .back { width: 100%; background: #25313d; border-color: #40505f; }
.build .item { border: 0; }
</style>
