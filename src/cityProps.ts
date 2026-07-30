import * as THREE from 'three'
import type { CityGridContext } from './cityGrid.js'

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_RED = 0xff2244
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Covered bike parking — Dutch fietsenstalling + Asian bike rack vibe. */
export function addBikeStall(
  root: THREE.Group,
  x: number,
  z: number,
  rotY: number,
  seed: number,
) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3848, roughness: 0.45, metalness: 0.75 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x554466, roughness: 0.55, metalness: 0.35 })

  const w = 3.2
  const d = 1.8
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 0.08), frameMat)
    post.position.set(px, 0.68, pz)
    g.add(post)
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, d + 0.35), roofMat)
  roof.position.y = 1.38
  g.add(roof)
  const roofGlow = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.85,
  })
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.08), roofGlow)
  strip.position.set(0, 1.34, d / 2 + 0.1)
  g.add(strip)

  const rail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.05, 0.04), frameMat)
  rail.position.set(0, 0.35, 0)
  g.add(rail)

  const bikeCount = 3 + Math.floor(rand(seed) * 3)
  const bikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.4, metalness: 0.6 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5, metalness: 0.4 })
  for (let i = 0; i < bikeCount; i++) {
    const bx = -w / 2 + 0.55 + i * 0.65
    const bike = new THREE.Group()
    bike.position.set(bx, 0, 0.15)
    bike.rotation.y = (rand(seed + i) - 0.5) * 0.25
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.55), bikeMat)
    frame.position.y = 0.35
    bike.add(frame)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.04), bikeMat)
    handle.position.set(0, 0.52, -0.18)
    bike.add(handle)
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10), wheelMat)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(0, 0.16, side * 0.22)
      bike.add(wheel)
    }
    g.add(bike)
  }

  const signMat = new THREE.MeshStandardMaterial({
    color: NEON_YELLOW,
    emissive: NEON_YELLOW,
    emissiveIntensity: 0.5,
  })
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.04), signMat)
  sign.position.set(0, 1.05, d / 2 + 0.12)
  g.add(sign)

  root.add(g)
}

/** Red paper lantern string — night market atmosphere. */
export function addLanternString(root: THREE.Group, x1: number, z1: number, x2: number, z2: number, seed: number) {
  const count = 4 + Math.floor(rand(seed) * 4)
  const lanMat = new THREE.MeshStandardMaterial({
    color: 0xcc1111,
    emissive: 0xff2233,
    emissiveIntensity: 0.75,
    roughness: 0.55,
  })
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const x = THREE.MathUtils.lerp(x1, x2, t)
    const z = THREE.MathUtils.lerp(z1, z2, t)
    const y = 2.8 + Math.sin(t * Math.PI) * 0.15
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lanMat)
    lan.scale.set(1, 1.35, 1)
    lan.position.set(x, y, z)
    root.add(lan)
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    )
    cord.position.set(x, y + 0.35, z)
    root.add(cord)
  }
}

export function addVendingMachine(root: THREE.Group, x: number, z: number, rotY: number) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 1.45, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.35, metalness: 0.5 }),
  )
  body.position.y = 0.73
  g.add(body)
  const glow = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.45,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.55), glow)
  screen.position.set(0, 0.95, 0.28)
  g.add(screen)
  root.add(g)
}

export function addStreetCart(root: THREE.Group, ctx: CityGridContext, x: number, z: number, rotY: number, seed: number) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  const cartMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.7, metalness: 0.2 })
  const cart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.65), cartMat)
  cart.position.y = 0.55
  g.add(cart)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 })
  for (const wx of [-0.35, 0.35]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), wheelMat)
    w.rotation.z = Math.PI / 2
    w.position.set(wx, 0.12, 0)
    g.add(w)
  }
  const canopyMat = new THREE.MeshStandardMaterial({
    color: NEON_PINK,
    emissive: NEON_PINK,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  })
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.9), canopyMat)
  canopy.position.y = 1.05
  g.add(canopy)
  ctx.flickerMats.push({ mat: canopyMat, base: 0.35, t: seed })
  const steam = new THREE.PointLight(NEON_ORANGE, 0.2, 4, 2)
  steam.position.set(0, 0.9, 0)
  g.add(steam)
  root.add(g)
}

export function addTrafficLight(root: THREE.Group, x: number, z: number) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 3.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x35333e, roughness: 0.42, metalness: 0.78 }),
  )
  pole.position.set(x, 1.9, z)
  root.add(pole)
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.75, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5, metalness: 0.6 }),
  )
  box.position.set(x, 3.55, z)
  root.add(box)
  const colors = [0xff2233, 0xffee44, 0x22ff66]
  for (let i = 0; i < 3; i++) {
    const lens = new THREE.MeshStandardMaterial({
      color: colors[i],
      emissive: colors[i],
      emissiveIntensity: i === 0 ? 0.85 : 0.12,
    })
    const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), lens)
    lensMesh.position.set(x, 3.72 - i * 0.22, z + 0.12)
    root.add(lensMesh)
  }
}

export function addUtilityBox(root: THREE.Group, x: number, z: number, rotY: number) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.35),
    new THREE.MeshStandardMaterial({ color: NEON_YELLOW, roughness: 0.55, metalness: 0.25 }),
  )
  box.position.y = 0.43
  g.add(box)
  root.add(g)
}

export function addSidewalkTiles(root: THREE.Group, cx: number, cz: number, w: number, d: number) {
  const tileA = new THREE.MeshStandardMaterial({ color: 0x5a5e68, roughness: 0.88, metalness: 0.08 })
  const tileB = new THREE.MeshStandardMaterial({ color: 0x50545e, roughness: 0.88, metalness: 0.08 })
  const tileSize = 1.05
  const gap = 0.1
  const h = 0.07
  for (let x = cx - w / 2 + tileSize / 2; x < cx + w / 2; x += tileSize) {
    for (let z = cz - d / 2 + tileSize / 2; z < cz + d / 2; z += tileSize) {
      const ix = Math.round(x / tileSize)
      const iz = Math.round(z / tileSize)
      const mat = (ix + iz) % 2 === 0 ? tileA : tileB
      const tile = new THREE.Mesh(new THREE.BoxGeometry(tileSize - gap, h, tileSize - gap), mat)
      tile.position.set(x, h / 2, z)
      tile.receiveShadow = true
      root.add(tile)
    }
  }
}

export function addBenchAndBin(root: THREE.Group, x: number, z: number, rotY: number) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.85, metalness: 0.05 })
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), wood)
  seat.position.set(0, 0.42, 0)
  g.add(seat)
  for (const bx of [-0.45, 0.45]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.35), wood)
    leg.position.set(bx, 0.21, 0)
    g.add(leg)
  }
  const bin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x226633, roughness: 0.6, metalness: 0.2 }),
  )
  bin.position.set(0.85, 0.28, 0)
  g.add(bin)
  root.add(g)
}

export function addPowerLines(root: THREE.Group, x1: number, z1: number, x2: number, z2: number, y: number) {
  const points = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)]
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0x222228, transparent: true, opacity: 0.7 }),
  )
  root.add(line)
}

export function scatterStreetProps(
  root: THREE.Group,
  ctx: CityGridContext,
  x: number,
  z: number,
  seed: number,
) {
  const r = rand(seed)
  if (r < 0.18) addBikeStall(root, x, z, rand(seed + 1) * Math.PI * 2, seed)
  else if (r < 0.28) addVendingMachine(root, x, z, rand(seed + 2) * Math.PI * 2)
  else if (r < 0.36) addStreetCart(root, ctx, x, z, rand(seed + 3) * Math.PI * 2, seed)
  else if (r < 0.42) addTrafficLight(root, x, z)
  else if (r < 0.48) addUtilityBox(root, x, z, rand(seed + 4) * Math.PI * 2)
  else if (r < 0.55) addBenchAndBin(root, x, z, rand(seed + 5) * Math.PI * 2)
}
