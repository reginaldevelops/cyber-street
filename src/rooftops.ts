import * as THREE from 'three'

/** Agent 1 — dirty NYC rooftop clutter (water towers, fire escapes, AC, tar paper). */
const TAR = 0x1a1818
const BRICK_DARK = 0x2a2220
const METAL = 0x4a5058
const RUST = 0x6a4030
const WOOD = 0x4a3828

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function tarMat() {
  return new THREE.MeshStandardMaterial({ color: TAR, roughness: 0.92, metalness: 0.05 })
}

function metalMat() {
  return new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.42, metalness: 0.78 })
}

/** Flat tar-paper roof cap on a facade block. */
export function addTarRoof(group: THREE.Group, width: number, depth: number, y: number) {
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.08, depth * 0.92), tarMat())
  roof.position.set(0, y + 0.04, 0)
  roof.receiveShadow = true
  group.add(roof)

  // Gravel edge lip
  const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.12), metalMat())
  lip.position.set(0, y + 0.02, -depth / 2 + 0.18)
  group.add(lip)
}

/** Classic NYC wooden water tower on stilts. */
function addWaterTower(group: THREE.Group, y: number, seed: number) {
  const ox = (rand(seed) - 0.5) * 1.2
  const oz = (rand(seed + 1) - 0.5) * 0.8
  const legMat = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.88, metalness: 0.05 })
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.82, metalness: 0.08 })

  for (const [lx, lz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), legMat)
    leg.position.set(ox + lx, y + 0.55, oz + lz)
    group.add(leg)
  }

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.9, 10), tankMat)
  tank.position.set(ox, y + 1.35, oz)
  group.add(tank)

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 10), metalMat())
  lid.position.set(ox, y + 1.82, oz)
  group.add(lid)

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.22, 10), metalMat())
  cone.position.set(ox, y + 1.96, oz)
  group.add(cone)
}

/** Rooftop AC unit + rusted duct. */
function addAcUnit(group: THREE.Group, y: number, seed: number, width: number) {
  const x = (rand(seed) - 0.5) * width * 0.55
  const ac = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.55), metalMat())
  ac.position.set(x, y + 0.21, 0.15)
  group.add(ac)

  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.08), metalMat())
  vent.position.set(x, y + 0.44, 0.15)
  group.add(vent)

  if (rand(seed + 2) > 0.4) {
    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 1.2), new THREE.MeshStandardMaterial({ color: RUST, roughness: 0.7, metalness: 0.4 }))
    duct.position.set(x + 0.5, y + 0.12, -0.2)
    group.add(duct)
  }
}

/** Fire escape zigzag on plaza-facing facade. */
function addFireEscape(group: THREE.Group, height: number, width: number, depth: number) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3840, roughness: 0.55, metalness: 0.65 })
  const z = -depth / 2 + 0.35
  const startY = height * 0.35
  const landings = 3
  for (let i = 0; i < landings; i++) {
    const ly = startY + i * (height * 0.22)
    const platform = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.85), railMat)
    platform.position.set(width * 0.38, ly, z)
    group.add(platform)

    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.04, height * 0.2, 0.04), railMat)
    ladder.position.set(width * 0.38, ly - height * 0.1, z - 0.35)
    group.add(ladder)

    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), railMat)
    railL.position.set(width * 0.38 - 0.25, ly + 0.25, z)
    const railR = railL.clone()
    railR.position.x = width * 0.38 + 0.25
    group.add(railL, railR)
  }
}

/** Clothesline between two pipe stubs. */
function addClothesline(group: THREE.Group, y: number, width: number) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.75, metalness: 0.2 })
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), poleMat)
  p1.position.set(-width * 0.25, y + 0.45, 0)
  const p2 = p1.clone()
  p2.position.x = width * 0.2
  group.add(p1, p2)

  const line = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.008, 0.008), poleMat)
  line.position.set(-width * 0.025, y + 0.85, 0)
  group.add(line)

  const clothColors = [0x334455, 0x553344, 0x445533]
  for (let c = 0; c < 3; c++) {
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.28),
      new THREE.MeshStandardMaterial({ color: clothColors[c], roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    )
    cloth.position.set(-width * 0.2 + c * 0.22, y + 0.72, 0)
    group.add(cloth)
  }
}

/** Chimney pipe stack. */
function addChimney(group: THREE.Group, y: number, seed: number) {
  const x = (rand(seed) - 0.5) * 0.8
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), new THREE.MeshStandardMaterial({ color: BRICK_DARK, roughness: 0.85, metalness: 0.1 }))
  pipe.position.set(x, y + 0.45, -0.1)
  group.add(pipe)
}

/**
 * Attach dirty-NYC rooftop kit to a perimeter block.
 * Called from citySurround after each segment is built.
 */
export function attachRooftopDetails(
  group: THREE.Group,
  width: number,
  height: number,
  depth: number,
  seed: number,
) {
  addTarRoof(group, width, depth, height)

  if (rand(seed) > 0.45) addWaterTower(group, height, seed + 10)
  if (rand(seed + 3) > 0.25) addAcUnit(group, height, seed + 20, width)
  if (rand(seed + 5) > 0.62) addFireEscape(group, height, width, depth)
  if (rand(seed + 7) > 0.78) addClothesline(group, height, width)
  if (rand(seed + 9) > 0.55) addChimney(group, height, seed + 30)
}
