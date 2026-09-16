import { BufferAttribute, Matrix4, Vector3 } from 'three'

const EPS = 1e-8
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t)
function buildTree(rows) {
  if (!rows.length) return null
  const node = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const row of rows) {
    node.minX = Math.min(node.minX, row.minX); node.maxX = Math.max(node.maxX, row.maxX)
    node.minZ = Math.min(node.minZ, row.minZ); node.maxZ = Math.max(node.maxZ, row.maxZ)
  }
  if (rows.length <= 12) node.rows = rows
  else {
    const axis = node.maxX - node.minX > node.maxZ - node.minZ ? 'X' : 'Z'
    rows.sort((a, b) => a[`min${axis}`] + a[`max${axis}`] - b[`min${axis}`] - b[`max${axis}`])
    const middle = rows.length >> 1; node.left = buildTree(rows.slice(0, middle)); node.right = buildTree(rows.slice(middle))
  }
  return node
}
function distanceBox(node, x, z) {
  return Math.max(node.minX - x, 0, x - node.maxX) ** 2 + Math.max(node.minZ - z, 0, z - node.maxZ) ** 2
}
function barycentric(row, x, z) {
  const [a, b, c] = row.points
  const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator
  const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator
  return [u, v, 1 - u - v]
}
function closest(row, x, z) {
  const weights = barycentric(row, x, z)
  if (Math.min(...weights) >= -EPS) return { distance: 0, weights }
  let result = { distance: Infinity }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, a = row.points[i], b = row.points[j], dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
    const distance = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2
    if (distance < result.distance) { const w = [0, 0, 0]; w[i] = 1 - t; w[j] = t; result = { distance, weights: w } }
  }
  return result
}

/** A single piecewise-linear additional height, measured on the original
 * paving triangles. Every overlaid grass, edging and path uses the same field. */
export function createNanjingGroundHeightSurface(records, { absolute = false } = {}) {
  const rows = [], point = new Vector3(), next = new Vector3()
  for (const record of records) {
    const source = record.source, storedHeight = record.geometry.attributes.nanjingOriginalHeight
    const p = storedHeight ? record.geometry.attributes.position : source.attributes.position, q = record.geometry.attributes.position, index = storedHeight ? record.geometry.index : source.index
    let maxY = -Infinity
    for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, storedHeight ? storedHeight.getX(i) : point.fromBufferAttribute(p, i).applyMatrix4(record.object.matrixWorld).y)
    for (let offset = 0; offset < (index?.count ?? p.count); offset += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(offset + j) : offset + j)
      const points = ids.map(id => { const v = new Vector3().fromBufferAttribute(p, id).applyMatrix4(record.object.matrixWorld); if (storedHeight) v.y = storedHeight.getX(id); return v })
      if (!absolute && Math.min(...points.map(v => v.y)) < maxY - .01) continue
      if (absolute && Math.max(...points.map(v => v.y)) - Math.min(...points.map(v => v.y)) > .006) continue
      const area = (points[1].x - points[0].x) * (points[2].z - points[0].z) - (points[1].z - points[0].z) * (points[2].x - points[0].x)
      if (Math.abs(area) < 1e-10) continue
      const deltas = ids.map((id, j) => next.fromBufferAttribute(q, id).applyMatrix4(record.object.matrixWorld).y - (absolute ? 0 : points[j].y))
      rows.push({ points, deltas, sign: Math.sign(area), minX: Math.min(...points.map(v => v.x)), maxX: Math.max(...points.map(v => v.x)), minZ: Math.min(...points.map(v => v.z)), maxZ: Math.max(...points.map(v => v.z)) })
    }
  }
  const tree = buildTree([...rows])
  const value = (row, x, z) => barycentric(row, x, z).reduce((sum, weight, i) => sum + weight * row.deltas[i], 0)
  function query(box) {
    const found = []
    function visit(node) {
      if (!node || node.maxX < box.minX - EPS || node.minX > box.maxX + EPS || node.maxZ < box.minZ - EPS || node.minZ > box.maxZ + EPS) return
      if (node.rows) for (const row of node.rows) {
        if (row.maxX >= box.minX - EPS && row.minX <= box.maxX + EPS && row.maxZ >= box.minZ - EPS && row.minZ <= box.maxZ + EPS) found.push(row)
      } else { visit(node.left); visit(node.right) }
    }
    visit(tree)
    if (absolute) found.sort((a, b) => Math.max(...b.deltas) - Math.max(...a.deltas))
    return found
  }
  function sample(x, z, taper = false) {
    let best = Infinity, result = 0
    function visit(node) {
      if (!node || best === 0 || distanceBox(node, x, z) > best) return
      if (node.rows) for (const row of node.rows) {
        const hit = closest(row, x, z)
        if (hit.distance < best) { best = hit.distance; result = hit.weights.reduce((sum, weight, i) => sum + weight * row.deltas[i], 0) }
      } else {
        if (distanceBox(node.left, x, z) < distanceBox(node.right, x, z)) { visit(node.left); visit(node.right) }
        else { visit(node.right); visit(node.left) }
      }
    }
    visit(tree)
    if (taper) { const t = Math.max(0, 1 - Math.sqrt(best) / 3); result *= t * t * (3 - 2 * t) }
    return result
  }
  return { rows, count: rows.length, query, value, sample }
}

function splitPolygon(polygon, edge, points) {
  const [a, b, sign] = edge
  const signed = vertex => {
    const x = vertex.reduce((sum, w, i) => sum + w * points[i].x, 0), z = vertex.reduce((sum, w, i) => sum + w * points[i].z, 0)
    return sign * ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x))
  }
  const inside = [], outside = []
  for (let i = 0; i < polygon.length; i++) {
    const aVertex = polygon[i], bVertex = polygon[(i + 1) % polygon.length], da = signed(aVertex), db = signed(bVertex)
    if (da >= -EPS) inside.push(aVertex)
    if (da < -EPS) outside.push(aVertex)
    if (da > EPS && db < -EPS || da < -EPS && db > EPS) {
      const crossing = mix(aVertex, bVertex, da / (da - db)); inside.push(crossing); outside.push(crossing)
    } else if (Math.abs(da) <= EPS && db < -EPS) outside.push(aVertex)
    else if (da < -EPS && Math.abs(db) <= EPS) outside.push(bVertex)
  }
  return { inside, outside }
}

/** Subdivide only where a source face crosses the paving's height triangles.
 * Interpolate original UV/color attributes, retain holes and existing sides,
 * and add no supporting faces. All output resources are privately owned. */
export function warpNanjingGroundSurface(object, surface, { bounds, isRoad = false, cap = false, sourceGeometry = object.geometry, stackOffset = 0 } = {}) {
  const source = object.geometry, p = source.attributes.position, index = source.index, inverse = new Matrix4().copy(object.matrixWorld).invert()
  const world = [], originalHeights = [], columns = new Map(), point = new Vector3()
  for (let i = 0; i < p.count; i++) {
    const v = new Vector3().fromBufferAttribute(p, i).applyMatrix4(object.matrixWorld), key = `${Math.round(v.x * 1e4)},${Math.round(v.z * 1e4)}`
    let column = columns.get(key)
    if (!column) { column = { min: v.y, max: v.y }; columns.set(key, column) }
    column.min = Math.min(column.min, v.y); column.max = Math.max(column.max, v.y); world.push({ ...v, column })
    if (cap) originalHeights.push(point.fromBufferAttribute(sourceGeometry.attributes.position, i).applyMatrix4(object.matrixWorld).y)
  }
  const weights = world.map(v => bounds.max.y - bounds.min.y <= .003 ? 1 : v.column.max - v.column.min > .0001
    ? Math.max(0, Math.min(1, (v.y - v.column.min) / (v.column.max - v.column.min))) : v.y >= bounds.max.y - .003 ? 1 : 0)
  const attributes = Object.entries(source.attributes), output = Object.fromEntries(attributes.map(([key]) => [key, []])), indices = [], vertices = new Map(), groups = [], storedHeights = []
  let changedVertices = 0, splitTriangles = 0
  const tempA = new Vector3(), tempB = new Vector3(), tempC = new Vector3()
  function vertex(ids, bary, row) {
    let x = 0, y = 0, z = 0, weight = 0
    for (let j = 0; j < 3; j++) { const v = world[ids[j]]; x += bary[j] * v.x; y += bary[j] * v.y; z += bary[j] * v.z; weight += bary[j] * weights[ids[j]] }
    const originalHeight = cap ? bary.reduce((sum, w, j) => sum + w * originalHeights[ids[j]], 0) : y
    const rise = cap ? (row ? Math.max(originalHeight, Math.min(y, surface.value(row, x, z) - stackOffset)) - y : 0)
      : weight * Math.max(0, row ? surface.value(row, x, z) : surface.sample(x, z, isRoad))
    const local = point.set(x, y + rise, z).applyMatrix4(inverse)
    const values = Object.fromEntries(attributes.map(([key, attribute]) => [key, key === 'position' ? [local.x, local.y, local.z]
      : Array.from({ length: attribute.itemSize }, (_, component) => bary.reduce((sum, w, j) => sum + w * attribute.getComponent(ids[j], component), 0))]))
    // Include original attributes so UV seams and deliberately hard normals are
    // not welded together; shared cut vertices still get smooth source normals.
    const key = attributes.flatMap(([name]) => values[name].map(v => Math.round(v * 1e7))).join(',')
    if (vertices.has(key)) return vertices.get(key)
    const id = output.position.length / 3; vertices.set(key, id)
    for (const [name] of attributes) output[name].push(...values[name])
    if (cap) storedHeights.push(originalHeight)
    if (Math.abs(rise) > 1e-7) changedVertices++
    return id
  }
  function emit(ids, polygon, row) {
    if (polygon.length < 3) return
    const first = vertex(ids, polygon[0], row)
    for (let j = 1; j + 1 < polygon.length; j++) {
      const second = vertex(ids, polygon[j], row), third = vertex(ids, polygon[j + 1], row)
      tempA.fromArray(output.position, first * 3); tempB.fromArray(output.position, second * 3).sub(tempA); tempC.fromArray(output.position, third * 3).sub(tempA)
      if (tempB.cross(tempC).lengthSq() > 1e-20) indices.push(first, second, third)
    }
  }
  const total = index?.count ?? p.count
  let currentGroup = null
  for (let offset = 0; offset < total; offset += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(offset + j) : offset + j), points = ids.map(id => world[id])
    const sourceGroup = source.groups.find(group => offset >= group.start && offset < group.start + group.count)
    const materialIndex = sourceGroup?.materialIndex ?? 0
    if (!currentGroup || currentGroup.materialIndex !== materialIndex) { currentGroup = { start: indices.length, count: 0, materialIndex }; groups.push(currentGroup) }
    const before = indices.length
    if (ids.every(id => weights[id] < EPS)) emit(ids, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], null)
    else {
      const candidates = surface.query({ minX: Math.min(...points.map(v => v.x)), maxX: Math.max(...points.map(v => v.x)), minZ: Math.min(...points.map(v => v.z)), maxZ: Math.max(...points.map(v => v.z)) })
      // Most source triangulation merely tessellates a constant-height patch.
      // Crossing those internal edges needs no new faces. This exact affine
      // agreement test avoids subdividing thousands of already level curbs.
      const containing = candidates.find(row => points.every(v => Math.min(...barycentric(row, v.x, v.z)) >= -EPS))
      const first = candidates[0]
      const samePlane = first && candidates.every(row => points.every(v => Math.abs(surface.value(row, v.x, v.z) - surface.value(first, v.x, v.z)) < 2e-6))
      const allCovered = samePlane && points.every(v => candidates.some(row => Math.min(...barycentric(row, v.x, v.z)) >= -EPS))
      if (cap ? containing && containing === first : containing || allCovered) {
        emit(ids, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], containing || first)
        currentGroup.count += indices.length - before
        continue
      }
      let pending = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]]
      for (const row of candidates) {
        if (!pending.length) break
        const remaining = []
        for (const polygon of pending) {
          let inside = polygon
          for (let edge = 0; edge < 3 && inside.length >= 3; edge++) {
            const split = splitPolygon(inside, [row.points[edge], row.points[(edge + 1) % 3], row.sign], points)
            if (split.outside.length >= 3) remaining.push(split.outside)
            inside = split.inside
          }
          if (inside.length >= 3) emit(ids, inside, row)
        }
        pending = remaining
      }
      for (const polygon of pending) emit(ids, polygon, null)
    }
    if (indices.length - before > 3) splitTriangles++
    currentGroup.count += indices.length - before
  }
  const geometry = source.clone()
  for (const [name, attribute] of attributes) geometry.setAttribute(name, new BufferAttribute(new Float32Array(output[name]), attribute.itemSize))
  if (cap) geometry.setAttribute('nanjingOriginalHeight', new BufferAttribute(new Float32Array(storedHeights), 1))
  geometry.setIndex(indices); geometry.clearGroups()
  if (source.groups.length) for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex)
  geometry.setDrawRange(0, Infinity)
  geometry.computeVertexNormals()
  if (geometry.attributes.tangent && geometry.attributes.uv) geometry.computeTangents()
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return { geometry, changedVertices, addedTriangles: indices.length / 3 - total / 3, splitTriangles }
}
