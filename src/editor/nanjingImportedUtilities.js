// Older GLB exports included render-only groups. Their world-only transforms
// and instance/source relationship cannot survive GLTFExporter cloning. Only
// suppress these identified artifacts INSIDE an imported model, never live
// controller groups attached to the editor scene. Keep the immutable GLB and
// scene hierarchy intact; current controllers recreate the supported draws.
const marking = name => /^南京道路(?:缺失双黄线|双黄线恢复)/.test(name)
const paving = name => /^南京门前路口(?:两侧薄铺装|薄铺装_)/.test(name)
export function suppressNanjingImportedUtilities(editor) {
  const found = []
  for (const root of editor.scene?.children || []) {
    if (root.editorType !== 'isModelGroup' || root.userData?.nanjingUtility) continue
    const visit = object => {
      const data = object.userData || {}, name = object.name || ''
      // An old export may contain trunks ONLY in its instanced batch. Tree
      // density reconciles those per instance; never hide a whole GPU group.
      if (data.nanjingImportedArtifact === 'instanced-duplicates') {
        object.visible = true; delete data.nanjingImportedArtifact
      }
      const kind = data.nanjingUtility && (marking(name) ? 'road-marking' : paving(name) ? 'entrance-paving' : null)
      if (kind) {
        object.visible = false
        object.userData.nanjingImportedArtifact = kind
        found.push({ name, kind })
        return
      }
      for (const child of object.children || []) visit(child)
    }
    visit(root)
  }
  return { version: 1, hidden: found.length, artifacts: found, sourceGeometryChanged: false }
}
