import * as THREE from 'three'

const _dummy = new THREE.Object3D()

/** Shared chunky asphalt tile look for roads (daytime-readable greys). */
export function makeTileAsphaltMat(seedTint = 0x3a3e48) {
  return new THREE.MeshStandardMaterial({
    color: seedTint,
    roughness: 0.92,
    metalness: 0.12,
  })
}

export function makeTileGroutMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x2a2e36,
    roughness: 0.96,
    metalness: 0.04,
  })
}

/**
 * Lay a rectangle of raised box tiles with visible grout gaps.
 * Uses InstancedMesh for performance.
 */
export function addTilePlane(
  root: THREE.Group,
  opts: {
    cx: number
    cz: number
    width: number
    depth: number
    tileSize?: number
    y?: number
    height?: number
    gap?: number
    mat: THREE.Material
    altMat?: THREE.Material
    rotY?: number
    checker?: boolean
  },
) {
  const tileSize = opts.tileSize ?? 1.6
  const gap = opts.gap ?? 0.08
  const h = opts.height ?? 0.06
  const y = opts.y ?? h / 2
  const rotY = opts.rotY ?? 0

  const cols = Math.max(1, Math.floor(opts.width / tileSize))
  const rows = Math.max(1, Math.floor(opts.depth / tileSize))
  const cellW = opts.width / cols
  const cellD = opts.depth / rows
  const meshW = cellW - gap
  const meshD = cellD - gap
  const count = cols * rows

  const geo = new THREE.BoxGeometry(meshW, h, meshD)
  const primary = new THREE.InstancedMesh(geo, opts.mat, count)
  primary.castShadow = false
  primary.receiveShadow = true

  let alt: THREE.InstancedMesh | null = null
  let altCount = 0
  if (opts.altMat && opts.checker) {
    alt = new THREE.InstancedMesh(geo, opts.altMat, count)
    alt.receiveShadow = true
  }

  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  let pi = 0
  let ai = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lx = -opts.width / 2 + cellW * (col + 0.5)
      const lz = -opts.depth / 2 + cellD * (row + 0.5)
      const wx = opts.cx + lx * cos - lz * sin
      const wz = opts.cz + lx * sin + lz * cos
      _dummy.position.set(wx, y, wz)
      _dummy.rotation.set(0, rotY, 0)
      _dummy.scale.set(1, 1, 1)
      _dummy.updateMatrix()

      const isAlt = opts.checker && (col + row) % 2 === 1
      if (isAlt && alt) {
        alt.setMatrixAt(ai++, _dummy.matrix)
      } else {
        primary.setMatrixAt(pi++, _dummy.matrix)
      }
    }
  }

  primary.count = pi
  primary.instanceMatrix.needsUpdate = true
  root.add(primary)

  if (alt) {
    alt.count = ai
    alt.instanceMatrix.needsUpdate = true
    root.add(alt)
  }

  return { cols, rows, count }
}

/** Road strip as discrete asphalt tiles (axis-aligned). */
export function addTiledRoadStrip(
  root: THREE.Group,
  mat: THREE.Material,
  altMat: THREE.Material,
  cx: number,
  cz: number,
  width: number,
  length: number,
  alongZ: boolean,
  tileSize = 1.6,
) {
  if (alongZ) {
    addTilePlane(root, {
      cx,
      cz,
      width,
      depth: length,
      tileSize,
      y: 0.03,
      height: 0.06,
      gap: 0.1,
      mat,
      altMat,
      checker: true,
    })
  } else {
    addTilePlane(root, {
      cx,
      cz,
      width: length,
      depth: width,
      tileSize,
      y: 0.03,
      height: 0.06,
      gap: 0.1,
      mat,
      altMat,
      checker: true,
    })
  }
}

/** Square ring of tiles (plaza street) — four strips, no corner double-stack. */
export function addTiledStreetRing(
  root: THREE.Group,
  mat: THREE.Material,
  altMat: THREE.Material,
  inner: number,
  outer: number,
  tileSize = 1.5,
) {
  const mid = (inner + outer) / 2
  const streetW = outer - inner
  const straight = inner * 2

  // N/S strips (along X)
  addTilePlane(root, {
    cx: 0,
    cz: -mid,
    width: straight + streetW * 2,
    depth: streetW,
    tileSize,
    y: 0.03,
    height: 0.06,
    gap: 0.1,
    mat,
    altMat,
    checker: true,
  })
  addTilePlane(root, {
    cx: 0,
    cz: mid,
    width: straight + streetW * 2,
    depth: streetW,
    tileSize,
    y: 0.03,
    height: 0.06,
    gap: 0.1,
    mat,
    altMat,
    checker: true,
  })
  // E/W strips (along Z) — only the middle span to avoid double corners
  addTilePlane(root, {
    cx: -mid,
    cz: 0,
    width: streetW,
    depth: straight,
    tileSize,
    y: 0.031,
    height: 0.06,
    gap: 0.1,
    mat,
    altMat,
    checker: true,
  })
  addTilePlane(root, {
    cx: mid,
    cz: 0,
    width: streetW,
    depth: straight,
    tileSize,
    y: 0.031,
    height: 0.06,
    gap: 0.1,
    mat,
    altMat,
    checker: true,
  })
}
