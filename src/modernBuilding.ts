import * as THREE from 'three'

export interface ModernTowerConfig {
  width: number
  depth: number
  floors: number
  floorHeight?: number
  windowCols?: number
  balconies?: boolean
  balconySide?: 1 | -1
  seed?: number
  collider?: boolean
  /** Collect window materials for flicker pool. */
  windowMatsOut?: THREE.MeshStandardMaterial[]
}

const FRAME = 0x3a3834
const FRAME_DARK = 0x2a2826
const BALCONY_SLAB = 0x6a6a70
const RAIL = 0x141418
const DOOR = 0x7ab0d0
const ROOF_BLOCK = 0x555860

const WINDOW_BLUES = [0x5a90b0, 0x6a9ec0, 0x78aac8, 0x88b8d8, 0x4a8098, 0x6898b8]

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function frameMat() {
  return new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.78, metalness: 0.12 })
}

function frameDarkMat() {
  return new THREE.MeshStandardMaterial({ color: FRAME_DARK, roughness: 0.82, metalness: 0.08 })
}

/** Low-poly modern apartment tower — window grid, balconies, roof mechanical block. */
export function buildModernTower(cfg: ModernTowerConfig): THREE.Group {
  const {
    width: w,
    depth: d,
    floors,
    floorHeight: fh = 1.35,
    windowCols: cols = Math.max(4, Math.floor(w / 0.52)),
    balconies = true,
    balconySide = 1,
    seed = 0,
  } = cfg

  const root = new THREE.Group()
  root.name = 'modern-tower'

  const bodyH = floors * fh
  const baseH = 0.35
  const totalH = bodyH + baseH

  // Base plinth — slightly wider trim
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.28, baseH, d + 0.28),
    frameDarkMat(),
  )
  plinth.position.y = baseH / 2
  plinth.castShadow = true
  plinth.receiveShadow = true
  root.add(plinth)

  // Main shell
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), frameMat())
  shell.position.y = baseH + bodyH / 2
  shell.castShadow = true
  shell.receiveShadow = true
  root.add(shell)
  if (cfg.collider) shell.userData.collider = true

  const frontZ = -d / 2 + 0.04
  const marginX = 0.28
  const usableW = w - marginX * 2
  const colW = usableW / cols
  const winW = colW * 0.52
  const winH = fh * 0.72

  // Window grid — front facade (−Z)
  for (let f = 0; f < floors; f++) {
    const floorY = baseH + fh * f + fh * 0.5
    for (let c = 0; c < cols; c++) {
      const wx = -usableW / 2 + colW * (c + 0.5)
      const blue = WINDOW_BLUES[Math.floor(rand(seed + f * 17 + c * 3) * WINDOW_BLUES.length)]
      const winMat = new THREE.MeshStandardMaterial({
        color: blue,
        emissive: blue,
        emissiveIntensity: 0.25 + rand(seed + f + c) * 0.2,
        roughness: 0.15,
        metalness: 0.55,
      })
      cfg.windowMatsOut?.push(winMat)
      const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat)
      win.position.set(wx, floorY, frontZ)
      root.add(win)

      // Floor line mullion
      if (c === 0) {
        const sill = new THREE.Mesh(
          new THREE.BoxGeometry(usableW + 0.04, 0.06, 0.04),
          frameDarkMat(),
        )
        sill.position.set(0, baseH + fh * f + 0.08, frontZ - 0.01)
        root.add(sill)
      }
    }
  }

  // Vertical mullions between window columns
  for (let c = 1; c < cols; c++) {
    const mx = -usableW / 2 + colW * c
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, bodyH * 0.92, 0.05), frameDarkMat())
    mullion.position.set(mx, baseH + bodyH / 2, frontZ - 0.02)
    root.add(mullion)
  }

  // Side windows — right facade (+X), fewer columns
  const sideCols = Math.max(2, Math.floor(d / 0.9))
  const sideColW = (d - 0.5) / sideCols
  for (let f = 0; f < floors; f++) {
    const floorY = baseH + fh * f + fh * 0.5
    for (let c = 0; c < sideCols; c++) {
      const blue = WINDOW_BLUES[Math.floor(rand(seed + f * 11 + c * 5 + 50) * WINDOW_BLUES.length)]
      const winMat = new THREE.MeshStandardMaterial({
        color: blue,
        emissive: blue,
        emissiveIntensity: 0.2,
        roughness: 0.15,
        metalness: 0.55,
      })
      cfg.windowMatsOut?.push(winMat)
      const win = new THREE.Mesh(new THREE.PlaneGeometry(sideColW * 0.45, winH), winMat)
      win.rotation.y = -Math.PI / 2
      win.position.set(w / 2 + 0.02, floorY, -d / 2 + 0.35 + sideColW * (c + 0.5))
      root.add(win)
    }
  }

  // Balconies on +X / −X side
  if (balconies) {
    const slabMat = new THREE.MeshStandardMaterial({ color: BALCONY_SLAB, roughness: 0.65, metalness: 0.35 })
    const railMat = new THREE.MeshStandardMaterial({ color: RAIL, roughness: 0.4, metalness: 0.6 })
    const bx = balconySide * (w / 2 + 0.02)
    const ext = 0.85

    for (let f = 1; f < floors; f++) {
      const by = baseH + fh * f + 0.12
      const slab = new THREE.Mesh(new THREE.BoxGeometry(ext, 0.07, d * 0.55), slabMat)
      slab.position.set(bx + balconySide * ext / 2, by, d * 0.08)
      slab.castShadow = true
      root.add(slab)

      for (const [rx, rz, rw, rd] of [
        [balconySide * ext, 0, 0.04, d * 0.55],
        [balconySide * (ext - 0.02), d * 0.28, ext, 0.04],
        [balconySide * (ext - 0.02), -d * 0.28, ext, 0.04],
      ] as [number, number, number, number][]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.55, rd), railMat)
        rail.position.set(bx + rx * 0.5, by + 0.32, rz)
        root.add(rail)
      }
    }
  }

  // Ground entrance door on front-right
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 1.05),
    new THREE.MeshStandardMaterial({ color: DOOR, emissive: 0x446688, emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.4 }),
  )
  door.position.set(w * 0.22, baseH + 0.55, frontZ + 0.01)
  root.add(door)

  // Flat roof cap
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.1, d + 0.06), frameDarkMat())
  roof.position.y = totalH + 0.05
  root.add(roof)

  // Mechanical room block on roof (toward back)
  const mech = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.9, d * 0.45), new THREE.MeshStandardMaterial({ color: ROOF_BLOCK, roughness: 0.7, metalness: 0.2 }))
  mech.position.set(0, totalH + 0.55, -d * 0.18)
  mech.castShadow = true
  root.add(mech)

  return root
}

/** Collect collider meshes from a tower (shell). */
export function towerColliderMeshes(tower: THREE.Group): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  tower.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData.collider) out.push(obj)
  })
  return out
}
