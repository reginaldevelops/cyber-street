import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
// ── Tuning ────────────────────────────────────────────────────────────────
const WALK_SPEED = 5.4
const SPRINT_SPEED = 8.8
const ACCEL = 14
const DECEL = 11

const ISO_FRUSTUM = 30 // orthografische zoom — iets wijder voor het plein
const ISO_CAM_OFFSET = new THREE.Vector3(26, 26, 26)
const ISO_FOLLOW = 9
const ISO_FORWARD = new THREE.Vector3(-1, 0, -1).normalize()
const ISO_RIGHT = new THREE.Vector3(1, 0, -1).normalize()

const FIRE_INTERVAL = 0.115
const GUN_RANGE = 90
const AIM_ASSIST_ANGLE = 0.055

const PLAZA_SIZE = 40
const PLAZA_HALF = PLAZA_SIZE / 2
const PLAYER_LIMIT_X = PLAZA_HALF - 2.5
const PLAYER_LIMIT_Z = PLAZA_HALF - 2.5

const ENEMY_COUNT = 5
const ENEMY_HP = 3
const ENEMY_SPEED = 2.6
const ENEMY_RESPAWN = 2.6

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622

type Keys = { w: boolean; a: boolean; s: boolean; d: boolean; sprint: boolean }

interface Enemy {
  root: THREE.Group
  hitMeshes: THREE.Mesh[]
  mats: THREE.MeshStandardMaterial[]
  visorMat: THREE.MeshStandardMaterial
  hp: number
  state: 'alive' | 'dying' | 'dead'
  timer: number
  flash: number
  walkPhase: number
  fallDir: number
}

interface Tracer {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  life: number
}

interface SparkBurst {
  points: THREE.Points
  vels: Float32Array
  life: number
}

/** Frame-rate onafhankelijke smoothing van hoeken via kortste pad. */
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const _mouseNdc = new THREE.Vector2()
const _aimHit = new THREE.Vector3()

type ShopKind = 'bar' | 'weapons' | 'armor' | 'bank' | 'inn' | 'tech' | 'clinic' | 'general'

export class Game {
  private container: HTMLElement
  private hintEl: HTMLElement
  private killsEl: HTMLElement | null
  private crosshairEl: HTMLElement | null

  private renderer: THREE.WebGLRenderer
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private scene = new THREE.Scene()
  private camera!: THREE.OrthographicCamera
  private clock = new THREE.Clock()

  // Speler
  private player = new THREE.Group()
  private playerBody = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private gun!: THREE.Group
  private gunHolder = new THREE.Group()
  private muzzle = new THREE.Object3D()
  private muzzleLight!: THREE.PointLight
  private walkPhase = 0

  private velocity = new THREE.Vector3()
  private gunKick = 0
  private aimYaw = 0
  private aimPoint = new THREE.Vector3(0, 0, 8)
  private mouseScreen = { x: 0, y: 0 }

  // Camera / input
  private camFocus = new THREE.Vector3(0, 0, 0)
  private keys: Keys = { w: false, a: false, s: false, d: false, sprint: false }
  private firing = false
  private fireCooldown = 0

  // Wereld / gevecht
  private worldColliders: THREE.Mesh[] = []
  private enemies: Enemy[] = []
  private enemyHitMeshes: THREE.Mesh[] = []
  private tracers: Tracer[] = []
  private sparks: SparkBurst[] = []
  private raycaster = new THREE.Raycaster()
  private kills = 0

  // Sfeer
  private rain!: THREE.Points
  private flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[] = []
  private holoRing!: THREE.Group

  constructor(container: HTMLElement, hintEl: HTMLElement) {
    this.container = container
    this.hintEl = hintEl
    this.killsEl = document.getElementById('kills')
    this.crosshairEl = document.getElementById('crosshair')

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.38
    container.appendChild(this.renderer.domElement)

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1)
    this.camera = new THREE.OrthographicCamera(
      (-ISO_FRUSTUM * aspect) / 2,
      (ISO_FRUSTUM * aspect) / 2,
      ISO_FRUSTUM / 2,
      -ISO_FRUSTUM / 2,
      0.1,
      220,
    )

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.28

    this.setupPost()
    this.buildWorld()
    this.buildIsoPlayer()
    this.buildEnemies()
    this.bindEvents()
    window.addEventListener('resize', () => this.onResize())
    this.onResize()
    this.camFocus.copy(this.player.position)
    this.mouseScreen.x = window.innerWidth / 2
    this.mouseScreen.y = window.innerHeight / 2
    this.updateCrosshair()
    this.updateCamera(0)
    this.clock.start()
    this.animate()
    ;(window as unknown as { __game: Game }).__game = this
  }

  private setupPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.48, 0.82)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  // ── Wereld ──────────────────────────────────────────────────────────────

  private buildWorld() {
    this.scene.background = new THREE.Color(0x141024)
    this.scene.fog = new THREE.FogExp2(0x221636, 0.011)

    this.scene.add(new THREE.AmbientLight(0x665577, 0.45))

    const hemi = new THREE.HemisphereLight(0x8aadff, 0x281018, 0.85)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0xb8c4ff, 0.78)
    moon.position.set(-14, 26, -10)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 100
    moon.shadow.camera.left = -42
    moon.shadow.camera.right = 42
    moon.shadow.camera.top = 42
    moon.shadow.camera.bottom = -42
    this.scene.add(moon)

    const fill = new THREE.DirectionalLight(0xff88cc, 0.22)
    fill.position.set(8, 10, 14)
    this.scene.add(fill)

    this.buildPlazaFloor()
    this.buildCourtyardShops()
    this.buildMarketStalls()
    this.buildBarPatio()
    this.buildCentralFountain()
    this.buildCourtyardProps()
    this.buildCourtyardLighting()

    this.holoRing = new THREE.Group()
    const ringMat = new THREE.MeshBasicMaterial({
      color: NEON_CYAN,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 8, 64), ringMat)
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.04, 8, 64), ringMat.clone())
    ;(ring2.material as THREE.MeshBasicMaterial).color.set(NEON_PINK)
    ring2.rotation.x = Math.PI / 3
    this.holoRing.add(ring1, ring2)
    this.holoRing.position.set(0, 7.5, 0)
    this.scene.add(this.holoRing)

    this.rain = this.makeRain()
    this.scene.add(this.rain)
  }

  private buildPlazaFloor() {
    const cobbleMat = new THREE.MeshStandardMaterial({
      color: 0x1c1824,
      roughness: 0.72,
      metalness: 0.18,
    })
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA_SIZE, PLAZA_SIZE), cobbleMat)
    plaza.rotation.x = -Math.PI / 2
    plaza.receiveShadow = true
    this.scene.add(plaza)
    this.worldColliders.push(plaza)

    const trimMat = new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 1.2,
      roughness: 0.4,
      metalness: 0.35,
    })
    const borderW = 0.35
    const borders: [number, number, number, number][] = [
      [0, 0.02, -PLAZA_HALF + borderW / 2, PLAZA_SIZE],
      [0, 0.02, PLAZA_HALF - borderW / 2, PLAZA_SIZE],
      [-PLAZA_HALF + borderW / 2, 0.02, 0, PLAZA_SIZE],
      [PLAZA_HALF - borderW / 2, 0.02, 0, PLAZA_SIZE],
    ]
    for (const [bx, by, bz, len] of borders) {
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(bx === 0 ? PLAZA_SIZE : borderW, bz === 0 ? PLAZA_SIZE : borderW),
        trimMat,
      )
      edge.rotation.x = -Math.PI / 2
      edge.position.set(bx, by, bz)
      this.scene.add(edge)
      this.flickerMats.push({ mat: trimMat, base: 1.2, t: Math.random() * 4 })
    }

    // Kassteenpatroon — subtiele tegels
    const tileMat = new THREE.MeshStandardMaterial({
      color: 0x242030,
      roughness: 0.68,
      metalness: 0.12,
    })
    for (let tx = -PLAZA_HALF + 3; tx < PLAZA_HALF; tx += 2.4) {
      for (let tz = -PLAZA_HALF + 3; tz < PLAZA_HALF; tz += 2.4) {
        if (Math.abs(tx) < 5 && Math.abs(tz) < 5) continue
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), tileMat)
        tile.rotation.x = -Math.PI / 2
        tile.position.set(tx + 1.1, 0.015, tz + 1.1)
        this.scene.add(tile)
      }
    }
  }

  private makeSignTexture(text: string, hexColor: number): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0a0812'
    ctx.fillRect(0, 0, 256, 64)
    const css = `#${hexColor.toString(16).padStart(6, '0')}`
    ctx.font = 'bold 34px Courier New, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = css
    ctx.shadowColor = css
    ctx.shadowBlur = 14
    ctx.fillText(text, 128, 32)
    const tex = new THREE.CanvasTexture(c)
    tex.needsUpdate = true
    return tex
  }

  private addShop(kind: ShopKind, x: number, z: number, faceYaw: number) {
    const configs: Record<ShopKind, { label: string; color: number; h: number; w: number; d: number }> = {
      bar: { label: 'BAR', color: NEON_PINK, h: 4.2, w: 8, d: 5.5 },
      weapons: { label: 'GUNS', color: NEON_ORANGE, h: 5.2, w: 7, d: 5 },
      armor: { label: 'GEAR', color: NEON_CYAN, h: 5, w: 7, d: 5 },
      bank: { label: 'BANK', color: NEON_YELLOW, h: 5.8, w: 8, d: 5.5 },
      inn: { label: 'INN', color: 0xff8866, h: 4.8, w: 7.5, d: 5 },
      tech: { label: 'TECH', color: 0x9a86ff, h: 5.5, w: 7, d: 5 },
      clinic: { label: 'MED+', color: 0x44ff88, h: 4.6, w: 6.5, d: 5 },
      general: { label: 'SHOP', color: NEON_PINK, h: 4.4, w: 6.5, d: 5 },
    }
    const cfg = configs[kind]
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = faceYaw

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a2436,
      roughness: 0.7,
      metalness: 0.18,
    })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a3448, roughness: 0.5, metalness: 0.4 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.35, metalness: 0.8 })

    const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), wallMat)
    body.position.y = cfg.h / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)
    this.worldColliders.push(body)

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w + 0.08, 0.9, cfg.d + 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1a1622, roughness: 0.85, metalness: 0.1 }),
    )
    plinth.position.y = 0.45
    group.add(plinth)

    const signTex = this.makeSignTexture(cfg.label, cfg.color)
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: cfg.color,
      emissiveIntensity: 0.85,
      emissiveMap: signTex,
      roughness: 0.4,
      metalness: 0.2,
    })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.72), signMat)
    sign.position.set(0, cfg.h * 0.72, cfg.d / 2 + 0.06)
    group.add(sign)
    this.flickerMats.push({ mat: signMat, base: 0.85, t: Math.random() * 5 })

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.1, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.75, metalness: 0.15 }),
    )
    door.position.set(0, 1.15, cfg.d / 2 + 0.04)
    group.add(door)

    const awningMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.35,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
    const awning = new THREE.Mesh(new THREE.BoxGeometry(cfg.w * 0.85, 0.04, 1.4), awningMat)
    awning.position.set(0, 2.35, cfg.d / 2 + 0.85)
    awning.rotation.x = 0.22
    group.add(awning)

    // Ramen
    const winMat = new THREE.MeshBasicMaterial({ color: 0x55ddff })
    for (let wi = -1; wi <= 1; wi += 2) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.42), winMat)
      win.position.set(wi * 1.8, cfg.h * 0.55, cfg.d / 2 + 0.05)
      group.add(win)
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.15, 0.12, cfg.d + 0.15), trimMat)
    roof.position.y = cfg.h + 0.06
    group.add(roof)

    // Shop-specifieke props
    if (kind === 'weapons') {
      for (let r = 0; r < 3; r++) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.5), metalMat)
        rack.position.set(-2 + r * 2, 1.1, cfg.d / 2 + 1.1)
        group.add(rack)
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), metalMat)
        gun.position.set(-2 + r * 2, 1.5, cfg.d / 2 + 1.1)
        gun.rotation.x = -0.4
        group.add(gun)
      }
    } else if (kind === 'armor') {
      const mannequin = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), trimMat)
      mannequin.position.set(1.8, 1.2, cfg.d / 2 + 1)
      group.add(mannequin)
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 8), metalMat)
      shield.rotation.x = Math.PI / 2
      shield.position.set(-1.8, 1.3, cfg.d / 2 + 1)
      group.add(shield)
    } else if (kind === 'bank') {
      const vault = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), metalMat)
      vault.rotation.x = Math.PI / 2
      vault.position.set(0, 1.2, cfg.d / 2 + 0.08)
      group.add(vault)
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16), metalMat)
      wheel.position.set(0, 1.2, cfg.d / 2 + 0.16)
      group.add(wheel)
    } else if (kind === 'bar') {
      for (let b = 0; b < 2; b++) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 10), trimMat)
        barrel.position.set(-2.5 + b * 5, 0.35, cfg.d / 2 + 1.2)
        group.add(barrel)
      }
    } else if (kind === 'tech') {
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8), metalMat)
      dish.position.set(0, cfg.h + 0.45, 0)
      group.add(dish)
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.55),
        new THREE.MeshBasicMaterial({ color: 0x6644ff }),
      )
      screen.position.set(0, 1.6, cfg.d / 2 + 0.06)
      group.add(screen)
    } else if (kind === 'clinic') {
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.06), signMat)
      crossH.position.set(0, cfg.h * 0.82, cfg.d / 2 + 0.07)
      group.add(crossH)
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.06), signMat)
      crossV.position.set(0, cfg.h * 0.82, cfg.d / 2 + 0.07)
      group.add(crossV)
    } else if (kind === 'inn') {
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.35), trimMat)
      chimney.position.set(2, cfg.h + 0.5, -1)
      group.add(chimney)
    }

    this.scene.add(group)
  }

  private buildCourtyardShops() {
    const inset = PLAZA_HALF - 1.5
    // Noordgevel — wapens, armor, tech
    this.addShop('weapons', -10, -inset, 0)
    this.addShop('armor', 0, -inset, 0)
    this.addShop('tech', 10, -inset, 0)
    // Zuidgevel — inn, general, bank
    this.addShop('inn', -10, inset, Math.PI)
    this.addShop('general', 0, inset, Math.PI)
    this.addShop('bank', 10, inset, Math.PI)
    // Westgevel — bar
    this.addShop('bar', -inset, -6, Math.PI / 2)
    // Oostgevel — clinic
    this.addShop('clinic', inset, 6, -Math.PI / 2)

    // Hoekgebouwen — vult de hoeken op
    this.addCornerBlock(-inset, -inset, 0)
    this.addCornerBlock(inset, -inset, Math.PI / 2)
    this.addCornerBlock(-inset, inset, -Math.PI / 2)
    this.addCornerBlock(inset, inset, Math.PI)
  }

  private addCornerBlock(x: number, z: number, rot: number) {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rot
    const mat = new THREE.MeshStandardMaterial({ color: 0x221e2c, roughness: 0.75, metalness: 0.15 })
    const block = new THREE.Mesh(new THREE.BoxGeometry(5, 6.5, 5), mat)
    block.position.y = 3.25
    block.castShadow = true
    group.add(block)
    this.worldColliders.push(block)
    this.scene.add(group)
  }

  private buildMarketStalls() {
    const stallColors = [NEON_YELLOW, NEON_PINK, NEON_CYAN, NEON_ORANGE, 0x9a86ff, NEON_YELLOW]
    const labels = ['FOOD', 'LOOT', 'DATA', 'PARTS', 'GEAR', 'DRINKS']
    const spots: [number, number][] = [
      [-6, -2], [6, -2], [-6, 4], [6, 4], [0, -6], [0, 6],
    ]

    spots.forEach(([sx, sz], i) => {
      const stall = new THREE.Group()
      stall.position.set(sx, 0, sz)
      stall.rotation.y = (i % 3) * 0.6

      const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.82, metalness: 0.08 })
      const color = stallColors[i % stallColors.length]
      const awningMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.45,
        roughness: 0.55,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })

      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), woodMat)
      counter.position.y = 0.45
      counter.castShadow = true
      stall.add(counter)

      const awning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 1.8), awningMat)
      awning.position.set(0, 1.65, 0.2)
      awning.rotation.x = 0.18
      stall.add(awning)
      this.flickerMats.push({ mat: awningMat, base: 0.45, t: Math.random() * 3 })

      const signTex = this.makeSignTexture(labels[i], color)
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex,
        emissive: color,
        emissiveIntensity: 0.7,
        emissiveMap: signTex,
      })
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.38), signMat)
      sign.position.set(0, 1.35, 0.62)
      sign.rotation.x = -0.15
      stall.add(sign)

      for (let c = 0; c < 2; c++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), woodMat)
        crate.position.set(-0.6 + c * 1.2, 0.22, 0.85)
        crate.rotation.y = c * 0.5
        stall.add(crate)
      }

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6), woodMat)
      pole.position.set(-1.1, 0.85, -0.3)
      stall.add(pole)
      const pole2 = pole.clone()
      pole2.position.x = 1.1
      stall.add(pole2)

      this.scene.add(stall)
    })
  }

  private buildBarPatio() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.8, metalness: 0.1 })
    const tableSpots: [number, number][] = [
      [-11, 2], [-9, 5], [-12, 8], [-8, 1],
    ]
    for (const [tx, tz] of tableSpots) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10), woodMat)
      table.position.set(tx, 0.55, tz)
      table.castShadow = true
      this.scene.add(table)

      for (let c = 0; c < 3; c++) {
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), woodMat)
        const angle = (c / 3) * Math.PI * 2
        chair.position.set(tx + Math.cos(angle) * 0.85, 0.25, tz + Math.sin(angle) * 0.85)
        this.scene.add(chair)
      }

      const mug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.05, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: NEON_PINK, emissive: NEON_PINK, emissiveIntensity: 0.6 }),
      )
      mug.position.set(tx, 0.64, tz)
      this.scene.add(mug)
    }

    const stringLightMat = new THREE.MeshStandardMaterial({
      color: NEON_PINK,
      emissive: NEON_PINK,
      emissiveIntensity: 2,
    })
    for (let i = 0; i < 5; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), stringLightMat)
      bulb.position.set(-12 + i * 1.2, 3.2, 4.5 - Math.sin(i) * 0.3)
      this.scene.add(bulb)
      this.flickerMats.push({ mat: stringLightMat, base: 2, t: Math.random() * 2 })
    }
  }

  private buildCentralFountain() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3848, roughness: 0.55, metalness: 0.35 })
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3, 0.35, 20), stoneMat)
    pool.position.y = 0.18
    pool.receiveShadow = true
    this.scene.add(pool)

    const waterMat = new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    })
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.06, 20), waterMat)
    water.position.y = 0.38
    this.scene.add(water)
    this.flickerMats.push({ mat: waterMat, base: 0.35, t: Math.random() * 3 })

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 10), stoneMat)
    pillar.position.y = 1.4
    pillar.castShadow = true
    this.scene.add(pillar)

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 12),
      new THREE.MeshStandardMaterial({
        color: NEON_CYAN,
        emissive: NEON_CYAN,
        emissiveIntensity: 1.8,
        roughness: 0.2,
        metalness: 0.5,
      }),
    )
    orb.position.y = 2.6
    this.scene.add(orb)

    const point = new THREE.PointLight(NEON_CYAN, 12, 14, 1.6)
    point.position.set(0, 2.6, 0)
    this.scene.add(point)
  }

  private buildCourtyardProps() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.82, metalness: 0.08 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.8 })
    const barrelSpots: [number, number][] = [
      [8, -8], [12, 0], [-8, 10], [4, 12], [-12, -4],
    ]
    for (const [bx, bz] of barrelSpots) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.75, 10), woodMat)
      barrel.position.set(bx, 0.38, bz)
      barrel.castShadow = true
      this.scene.add(barrel)
    }

    for (let lp = 0; lp < 8; lp++) {
      const angle = (lp / 8) * Math.PI * 2
      const lx = Math.cos(angle) * (PLAZA_HALF - 3.5)
      const lz = Math.sin(angle) * (PLAZA_HALF - 3.5)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8), metalMat)
      pole.position.set(lx, 1.6, lz)
      pole.castShadow = true
      this.scene.add(pole)
      const lampColor = lp % 2 ? NEON_CYAN : NEON_PINK
      const lampMat = new THREE.MeshStandardMaterial({
        color: lampColor,
        emissive: lampColor,
        emissiveIntensity: 2.2,
      })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.4), lampMat)
      lamp.position.set(lx, 3.25, lz)
      this.scene.add(lamp)
      this.flickerMats.push({ mat: lampMat, base: 2.2, t: Math.random() * 4 })
    }
  }

  private buildCourtyardLighting() {
    const glowTex = this.makeGlowTexture()
    const spots: [number, number, number, number][] = [
      [0, 4, 0, NEON_CYAN],
      [-12, 3.5, -8, NEON_PINK],
      [12, 3.5, 8, NEON_YELLOW],
      [-8, 3.5, 10, NEON_ORANGE],
    ]
    for (const [x, y, z, color] of spots) {
      const light = new THREE.PointLight(color, 18, 20, 1.8)
      light.position.set(x, y, z)
      this.scene.add(light)
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 4),
        new THREE.MeshBasicMaterial({
          color,
          map: glowTex,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      glow.rotation.x = -Math.PI / 2
      glow.position.set(x, 0.04, z)
      this.scene.add(glow)
    }
  }

  private makeGlowTexture() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }

  private makeRain() {
    const count = 1300
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = THREE.MathUtils.randFloatSpread(PLAZA_SIZE + 8)
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(0.2, 20)
      positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(PLAZA_SIZE + 8)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0x9fc4ff,
      size: 0.05,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    return new THREE.Points(geo, mat)
  }

  // ── Speler ──────────────────────────────────────────────────────────────

  private buildUzi(metal: THREE.Material, gripMat: THREE.Material, neon: THREE.Material) {
    const uzi = new THREE.Group()

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.28), metal)
    receiver.position.set(0, 0, 0.02)
    uzi.add(receiver)

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10), metal)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.02, 0.28)
    uzi.add(barrel)
    const comp = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.04), metal)
    comp.position.set(0, 0.02, 0.38)
    uzi.add(comp)

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.14, 0.055), gripMat)
    mag.position.set(0, -0.1, -0.02)
    mag.rotation.x = 0.22
    uzi.add(mag)

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.05), gripMat)
    grip.position.set(0, -0.1, -0.1)
    grip.rotation.x = 0.35
    uzi.add(grip)

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.16), metal)
    stock.position.set(0, 0.01, -0.18)
    uzi.add(stock)
    const stockWireL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.12), metal)
    stockWireL.position.set(-0.018, -0.02, -0.14)
    stockWireL.rotation.z = 0.25
    uzi.add(stockWireL)
    const stockWireR = stockWireL.clone()
    stockWireR.position.x = 0.018
    stockWireR.rotation.z = -0.25
    uzi.add(stockWireR)

    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.22), metal)
    cover.position.set(0, 0.065, 0.02)
    uzi.add(cover)
    const charge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.03), metal)
    charge.position.set(0.03, 0.07, 0.06)
    uzi.add(charge)

    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.1), neon)
    cell.position.set(0, -0.01, 0.04)
    uzi.add(cell)

    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.04), gripMat)
    foregrip.position.set(0, -0.05, 0.14)
    uzi.add(foregrip)

    this.muzzle.position.set(0, 0.02, 0.42)
    uzi.add(this.muzzle)
    return uzi
  }

  private buildIsoPlayer() {
    const coatMat = new THREE.MeshStandardMaterial({
      color: 0x1a1824,
      roughness: 0.62,
      metalness: 0.28,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.5,
    })
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc8a88a, roughness: 0.72, metalness: 0.08 })
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.55, metalness: 0.35 })
    const metalGun = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.35, metalness: 0.9 })
    const gripGun = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.78, metalness: 0.12 })
    const neonGun = new THREE.MeshStandardMaterial({
      color: NEON_ORANGE,
      emissive: NEON_ORANGE,
      emissiveIntensity: 0.9,
      roughness: 0.35,
      metalness: 0.45,
    })

    // Trenchcoat torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.28), coatMat)
    torso.position.y = 1.08
    torso.castShadow = true
    const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.02), trimMat)
    lapelL.position.set(-0.14, 1.18, 0.15)
    const lapelR = lapelL.clone()
    lapelR.position.x = 0.14
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.3), metalGun)
    belt.position.set(0, 0.82, 0.02)
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), trimMat)
    buckle.position.set(0, 0.82, 0.17)

    // Head + cyber eye
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skinMat)
    head.position.y = 1.62
    head.castShadow = true
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.28), coatMat)
    hood.position.set(0, 1.76, -0.02)
    const eyeHuman = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), new THREE.MeshStandardMaterial({ color: 0x221818 }))
    eyeHuman.position.set(-0.06, 1.64, 0.13)
    const eyeCyber = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), trimMat)
    eyeCyber.position.set(0.06, 1.64, 0.13)
    const jawLine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), trimMat)
    jawLine.position.set(0.06, 1.56, 0.13)

    // Arms
    const buildArm = (side: number) => {
      const arm = new THREE.Group()
      arm.position.set(side * 0.32, 1.28, 0)
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), coatMat)
      upper.position.y = -0.16
      upper.castShadow = true
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), coatMat)
      fore.position.y = -0.42
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), skinMat)
      hand.position.y = -0.58
      arm.add(upper, fore, hand)
      return arm
    }
    const armL = buildArm(-1)
    const armR = buildArm(1)

    // Benen (groepen voor loop-animatie)
    const buildLeg = (leg: THREE.Group, side: number) => {
      leg.position.set(side * 0.12, 0.78, 0)
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.14), coatMat)
      thigh.position.y = -0.17
      thigh.castShadow = true
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), bootMat)
      shin.position.y = -0.5
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), bootMat)
      boot.position.set(0, -0.68, 0.04)
      leg.add(thigh, shin, boot)
    }
    buildLeg(this.legL, -1)
    buildLeg(this.legR, 1)

    // Wapen
    this.gun = this.buildUzi(metalGun, gripGun, neonGun)
    this.gun.scale.setScalar(1.15)
    this.gunHolder.position.set(0.34, 1.12, 0.22)
    this.gunHolder.rotation.set(-0.35, -0.15, 0.1)
    this.gunHolder.add(this.gun)
    this.muzzleLight = new THREE.PointLight(0xff8833, 0, 7, 2)
    this.gun.add(this.muzzleLight)
    this.muzzleLight.position.set(0, 0.02, 0.42)

    this.playerBody.add(
      torso, lapelL, lapelR, belt, buckle,
      head, hood, eyeHuman, eyeCyber, jawLine,
      armL, armR, this.legL, this.legR, this.gunHolder,
    )
    this.player.add(this.playerBody)
    this.player.position.set(0, 0, 10)
    this.scene.add(this.player)
  }

  // ── Vijanden ────────────────────────────────────────────────────────────

  private buildEnemies() {
    for (let i = 0; i < ENEMY_COUNT; i++) {
      const enemy = this.makeEnemy(i)
      this.respawnEnemy(enemy)
      this.enemies.push(enemy)
      this.scene.add(enemy.root)
    }
  }

  private makeEnemy(index: number): Enemy {
    const variant = index % 3
    const accentColors = [NEON_PINK, NEON_CYAN, NEON_YELLOW]
    const accent = accentColors[variant]

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x2a2830,
      roughness: 0.45,
      metalness: 0.72,
      transparent: true,
    })
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x3a3844,
      roughness: 0.38,
      metalness: 0.8,
      transparent: true,
    })
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      roughness: 0.3,
      metalness: 0.9,
      transparent: true,
    })
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff2222,
      emissiveIntensity: 2.8,
      transparent: true,
    })
    const coreMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.8,
      transparent: true,
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.55,
      metalness: 0.65,
      transparent: true,
    })

    const root = new THREE.Group()
    const scale = 0.95 + variant * 0.04

    // Pelvis
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, 0.16, 0.2), chassisMat)
    pelvis.position.y = 0.88
    pelvis.castShadow = true

    // Torso — layered plates
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38 * scale, 0.42, 0.22), panelMat)
    torso.position.y = 1.18
    torso.castShadow = true
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.22, 0.06), chassisMat)
    chestPlate.position.set(0, 1.22, 0.12)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), coreMat)
    core.position.set(0, 1.2, 0.16)

    // Head — angular robot skull
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.2, 0.2), panelMat)
    head.position.y = 1.58
    head.castShadow = true
    const skullBack = new THREE.Mesh(new THREE.BoxGeometry(0.18 * scale, 0.14, 0.08), darkMat)
    skullBack.position.set(0, 1.6, -0.1)
    const jawPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.05, 0.12), chassisMat)
    jawPlate.position.set(0, 1.48, 0.08)

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 0.045, 0.04), visorMat)
    visor.position.set(0, 1.6, 0.12)
    const sensorL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), coreMat)
    sensorL.position.set(-0.07, 1.54, 0.11)
    const sensorR = sensorL.clone()
    sensorR.position.x = 0.07

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), jointMat)
    antenna.position.set(0.08, 1.72, -0.04)
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), coreMat)
    antennaTip.position.set(0.08, 1.84, -0.04)

    // Shoulder pauldrons
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), panelMat)
    pauldronL.position.set(-0.26 * scale, 1.38, 0)
    const pauldronR = pauldronL.clone()
    pauldronR.position.x = 0.26 * scale

    // Arms
    const buildArm = (side: number) => {
      const arm = new THREE.Group()
      arm.position.set(side * 0.26 * scale, 1.32, 0)
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.1), chassisMat)
      upper.position.y = -0.13
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), jointMat)
      elbow.position.y = -0.28
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.24, 0.085), panelMat)
      fore.position.y = -0.42
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.06), darkMat)
      claw.position.set(0, -0.56, 0.02)
      for (let c = 0; c < 3; c++) {
        const digit = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.012), jointMat)
        digit.position.set(-0.02 + c * 0.02, -0.59, 0.05)
        arm.add(digit)
      }
      arm.add(upper, elbow, fore, claw)
      return arm
    }
    const armL = buildArm(-1)
    const armR = buildArm(1)

    // Legs
    const buildLeg = (side: number) => {
      const leg = new THREE.Group()
      leg.position.set(side * 0.1 * scale, 0.88, 0)
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), chassisMat)
      thigh.position.y = -0.15
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), jointMat)
      knee.position.y = -0.32
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), panelMat)
      shin.position.y = -0.46
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.2), darkMat)
      foot.position.set(0, -0.62, 0.04)
      const toeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.04), coreMat)
      toeGlow.position.set(0, -0.62, 0.14)
      leg.add(thigh, knee, shin, foot, toeGlow)
      return leg
    }
    const legL = buildLeg(-1)
    const legR = buildLeg(1)

    // Back exhaust / spine
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.08), darkMat)
    spine.position.set(0, 1.15, -0.14)
    const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.02), coreMat)
    ventL.position.set(-0.05, 1.22, -0.18)
    const ventR = ventL.clone()
    ventR.position.x = 0.05

    root.add(
      pelvis, torso, chestPlate, core, head, skullBack, jawPlate,
      visor, sensorL, sensorR, antenna, antennaTip,
      pauldronL, pauldronR, armL, armR, legL, legR, spine, ventL, ventR
    )

    const hitMeshes = [torso, head, chestPlate]
    for (const m of hitMeshes) m.userData.enemyIndex = index
    this.enemyHitMeshes.push(...hitMeshes)

    return {
      root,
      hitMeshes,
      mats: [chassisMat, panelMat, coreMat, darkMat],
      visorMat,
      hp: ENEMY_HP,
      state: 'alive',
      timer: 0,
      flash: 0,
      walkPhase: Math.random() * 10,
      fallDir: 1,
    }
  }

  private respawnEnemy(enemy: Enemy) {
    enemy.hp = ENEMY_HP
    enemy.state = 'alive'
    enemy.root.visible = true
    enemy.timer = 0
    enemy.flash = 0
    enemy.root.rotation.set(0, Math.random() * Math.PI * 2, 0)
    enemy.root.position.set(
      THREE.MathUtils.randFloatSpread(PLAYER_LIMIT_X * 1.7),
      0,
      THREE.MathUtils.randFloatSpread(PLAYER_LIMIT_Z * 1.8)
    )
    // Niet bovenop de speler spawnen
    if (enemy.root.position.distanceTo(this.player.position) < 8) {
      enemy.root.position.z += enemy.root.position.z > this.player.position.z ? 10 : -10
    }
    for (const m of [...enemy.mats, enemy.visorMat]) m.opacity = 1
    enemy.visorMat.emissiveIntensity = 2.8
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private bindEvents() {
    window.addEventListener('keydown', (e) => this.setKey(e.code, true))
    window.addEventListener('keyup', (e) => this.setKey(e.code, false))

    const canvas = this.renderer.domElement
    canvas.addEventListener('mousemove', (e) => {
      this.mouseScreen.x = e.clientX
      this.mouseScreen.y = e.clientY
      this.updateCrosshair()
    })
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.firing = true
    })
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false
    })
  }

  private updateCrosshair() {
    if (!this.crosshairEl) return
    this.crosshairEl.style.left = `${this.mouseScreen.x}px`
    this.crosshairEl.style.top = `${this.mouseScreen.y}px`
    this.crosshairEl.style.margin = '0'
    this.crosshairEl.style.transform = 'translate(-50%, -50%)'
  }

  private updateAimFromMouse() {
    const rect = this.renderer.domElement.getBoundingClientRect()
    _mouseNdc.x = ((this.mouseScreen.x - rect.left) / rect.width) * 2 - 1
    _mouseNdc.y = -((this.mouseScreen.y - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(_mouseNdc, this.camera)
    if (this.raycaster.ray.intersectPlane(_groundPlane, _aimHit)) {
      this.aimPoint.copy(_aimHit)
    }
  }

  private setKey(code: string, down: boolean) {
    if (code === 'KeyW') this.keys.w = down
    if (code === 'KeyA') this.keys.a = down
    if (code === 'KeyS') this.keys.s = down
    if (code === 'KeyD') this.keys.d = down
    if (code === 'ShiftLeft' || code === 'ShiftRight') this.keys.sprint = down
  }

  private onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const aspect = w / Math.max(h, 1)
    this.camera.left = (-ISO_FRUSTUM * aspect) / 2
    this.camera.right = (ISO_FRUSTUM * aspect) / 2
    this.camera.top = ISO_FRUSTUM / 2
    this.camera.bottom = -ISO_FRUSTUM / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  // ── Beweging & camera ───────────────────────────────────────────────────

  private updatePlayer(dt: number) {
    this.updateAimFromMouse()

    const wish = new THREE.Vector3()
    if (this.keys.w) wish.add(ISO_FORWARD)
    if (this.keys.s) wish.sub(ISO_FORWARD)
    if (this.keys.d) wish.add(ISO_RIGHT)
    if (this.keys.a) wish.sub(ISO_RIGHT)

    const maxSpeed = this.keys.sprint && this.keys.w ? SPRINT_SPEED : WALK_SPEED
    const hasInput = wish.lengthSq() > 0
    if (hasInput) wish.normalize().multiplyScalar(maxSpeed)

    const lambda = hasInput ? ACCEL : DECEL
    const blend = 1 - Math.exp(-lambda * dt)
    this.velocity.lerp(wish, blend)
    if (!hasInput && this.velocity.lengthSq() < 0.0004) this.velocity.set(0, 0, 0)

    this.player.position.addScaledVector(this.velocity, dt)
    this.player.position.x = THREE.MathUtils.clamp(
      this.player.position.x, -PLAYER_LIMIT_X, PLAYER_LIMIT_X
    )
    this.player.position.z = THREE.MathUtils.clamp(
      this.player.position.z, -PLAYER_LIMIT_Z, PLAYER_LIMIT_Z
    )

    const dx = this.aimPoint.x - this.player.position.x
    const dz = this.aimPoint.z - this.player.position.z
    if (dx * dx + dz * dz > 0.04) {
      this.aimYaw = Math.atan2(dx, dz)
      this.player.rotation.y = dampAngle(this.player.rotation.y, this.aimYaw, 18, dt)
    }

    const speed = this.velocity.length()
    const speedRatio = speed / SPRINT_SPEED
    const moving = speed > 0.12

    if (moving) {
      this.walkPhase += dt * (6 + speedRatio * 5)
      const swing = Math.sin(this.walkPhase) * 0.42 * Math.min(speedRatio * 2, 1)
      this.legL.rotation.x = swing
      this.legR.rotation.x = -swing
      this.playerBody.position.y = Math.abs(Math.sin(this.walkPhase * 2)) * 0.035 * Math.min(speedRatio * 2, 1)
    } else {
      this.legL.rotation.x = THREE.MathUtils.damp(this.legL.rotation.x, 0, 12, dt)
      this.legR.rotation.x = THREE.MathUtils.damp(this.legR.rotation.x, 0, 12, dt)
      this.playerBody.position.y = THREE.MathUtils.damp(this.playerBody.position.y, 0, 12, dt)
    }

    const localVel = this.velocity.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0), -this.player.rotation.y
    )
    const targetLeanZ = THREE.MathUtils.clamp(-localVel.x * 0.035, -0.12, 0.12)
    const targetLeanX = THREE.MathUtils.clamp(localVel.z * 0.028, -0.1, 0.1)
    this.playerBody.rotation.z = THREE.MathUtils.damp(this.playerBody.rotation.z, targetLeanZ, 10, dt)
    this.playerBody.rotation.x = THREE.MathUtils.damp(this.playerBody.rotation.x, targetLeanX, 10, dt)

    this.gunKick = Math.max(0, this.gunKick - dt * 6)
    this.gunHolder.rotation.x = THREE.MathUtils.damp(
      this.gunHolder.rotation.x,
      -0.35 - this.gunKick * 0.35,
      14,
      dt,
    )
    this.gun.rotation.x = -this.gunKick * 0.5
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 260)
  }

  private updateCamera(dt: number) {
    this.camFocus.x = THREE.MathUtils.damp(this.camFocus.x, this.player.position.x, ISO_FOLLOW, dt)
    this.camFocus.z = THREE.MathUtils.damp(this.camFocus.z, this.player.position.z, ISO_FOLLOW, dt)

    this.camera.position.set(
      this.camFocus.x + ISO_CAM_OFFSET.x,
      ISO_CAM_OFFSET.y,
      this.camFocus.z + ISO_CAM_OFFSET.z,
    )
    this.camera.lookAt(this.camFocus.x, 1.2, this.camFocus.z)
  }

  // ── Schieten ────────────────────────────────────────────────────────────

  private updateShooting(dt: number) {
    this.fireCooldown -= dt
    if (this.firing && this.fireCooldown <= 0) {
      this.fireCooldown = FIRE_INTERVAL
      this.shoot()
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]
      t.life -= dt
      t.mat.opacity = Math.max(t.life / 0.12, 0)
      if (t.life <= 0) {
        this.scene.remove(t.mesh)
        t.mesh.geometry.dispose()
        t.mat.dispose()
        this.tracers.splice(i, 1)
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]
      s.life -= dt
      const pos = s.points.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let p = 0; p < pos.count; p++) {
        pos.setXYZ(
          p,
          pos.getX(p) + s.vels[p * 3] * dt,
          pos.getY(p) + s.vels[p * 3 + 1] * dt,
          pos.getZ(p) + s.vels[p * 3 + 2] * dt
        )
        s.vels[p * 3 + 1] -= 9 * dt
      }
      pos.needsUpdate = true
      ;(s.points.material as THREE.PointsMaterial).opacity = Math.max(s.life / 0.35, 0)
      if (s.life <= 0) {
        this.scene.remove(s.points)
        s.points.geometry.dispose()
        ;(s.points.material as THREE.Material).dispose()
        this.sparks.splice(i, 1)
      }
    }
  }

  private getMuzzleWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.muzzle.parent) {
      this.muzzle.getWorldPosition(out)
      return out
    }
    out.copy(this.player.position)
    out.y += 1.35
    out.x += Math.sin(this.aimYaw) * 0.45
    out.z += Math.cos(this.aimYaw) * 0.45
    return out
  }

  private shoot() {
    const rect = this.renderer.domElement.getBoundingClientRect()
    _mouseNdc.x = ((this.mouseScreen.x - rect.left) / rect.width) * 2 - 1
    _mouseNdc.y = -((this.mouseScreen.y - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(_mouseNdc, this.camera)
    this.raycaster.far = GUN_RANGE
    const hits = this.raycaster.intersectObjects(
      [...this.enemyHitMeshes, ...this.worldColliders],
      false
    )

    const muzzlePos = this.getMuzzleWorldPosition()

    let endPoint: THREE.Vector3
    let hitEnemy: Enemy | null = null
    const firstHit = hits.find((h) => {
      const idx = h.object.userData.enemyIndex
      if (idx === undefined) return true
      return this.enemies[idx].state === 'alive'
    })
    if (firstHit) {
      endPoint = firstHit.point.clone()
      const idx = firstHit.object.userData.enemyIndex
      if (idx !== undefined) hitEnemy = this.enemies[idx]
    } else {
      endPoint = this.raycaster.ray.at(GUN_RANGE * 0.7, new THREE.Vector3())
    }

    if (!hitEnemy) {
      const blockDist = firstHit ? firstHit.distance : GUN_RANGE
      const toEnemy = new THREE.Vector3()
      let bestAngle = AIM_ASSIST_ANGLE
      for (const enemy of this.enemies) {
        if (enemy.state !== 'alive') continue
        toEnemy.copy(enemy.root.position)
        toEnemy.y = 1.15
        toEnemy.sub(this.raycaster.ray.origin)
        const dist = toEnemy.length()
        if (dist > blockDist + 0.5 || dist > GUN_RANGE) continue
        const angle = this.raycaster.ray.direction.angleTo(toEnemy.normalize())
        if (angle < bestAngle) {
          bestAngle = angle
          hitEnemy = enemy
          endPoint = enemy.root.position.clone()
          endPoint.y = 1.15
        }
      }
    }

    this.spawnTracer(muzzlePos, endPoint)
    this.spawnSparks(endPoint, hitEnemy ? 0xff5577 : 0x7dfcff)
    this.muzzleLight.intensity = 22
    this.gunKick = Math.min(this.gunKick + 0.55, 1)

    if (hitEnemy) {
      hitEnemy.hp -= 1
      hitEnemy.flash = 0.12
      this.flashHitmarker()
      if (hitEnemy.hp <= 0) {
        hitEnemy.state = 'dying'
        hitEnemy.timer = 0
        hitEnemy.fallDir = Math.random() > 0.5 ? 1 : -1
        this.kills += 1
        if (this.killsEl) this.killsEl.textContent = String(this.kills).padStart(2, '0')
      }
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const length = from.distanceTo(to)
    if (length < 0.4) return
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8ffbff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, length), mat)
    mesh.position.copy(from).add(to).multiplyScalar(0.5)
    mesh.lookAt(to)
    this.scene.add(mesh)
    this.tracers.push({ mesh, mat, life: 0.12 })
  }

  private spawnSparks(at: THREE.Vector3, color: number) {
    const count = 10
    const positions = new Float32Array(count * 3)
    const vels = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = at.x
      positions[i * 3 + 1] = at.y
      positions[i * 3 + 2] = at.z
      vels[i * 3] = THREE.MathUtils.randFloatSpread(6)
      vels[i * 3 + 1] = THREE.MathUtils.randFloat(1, 5)
      vels[i * 3 + 2] = THREE.MathUtils.randFloatSpread(6)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size: 0.07,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    this.scene.add(points)
    this.sparks.push({ points, vels, life: 0.35 })
  }

  private flashHitmarker() {
    if (!this.crosshairEl) return
    this.crosshairEl.classList.remove('hit')
    // reflow forceren zodat de animatie opnieuw afspeelt
    void this.crosshairEl.offsetWidth
    this.crosshairEl.classList.add('hit')
  }

  // ── Vijand-updates ──────────────────────────────────────────────────────

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (enemy.state === 'alive') {
        const toPlayer = this.player.position.clone().sub(enemy.root.position)
        toPlayer.y = 0
        const dist = toPlayer.length()

        if (dist < 26 && dist > 2.2) {
          toPlayer.normalize()
          enemy.root.position.addScaledVector(toPlayer, ENEMY_SPEED * dt)
          const targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
          enemy.root.rotation.y = dampAngle(enemy.root.rotation.y, targetYaw, 8, dt)
          enemy.walkPhase += dt * 7
          enemy.root.position.y = Math.abs(Math.sin(enemy.walkPhase)) * 0.05
        } else {
          enemy.root.position.y = THREE.MathUtils.damp(enemy.root.position.y, 0, 8, dt)
        }
        enemy.root.position.x = THREE.MathUtils.clamp(
          enemy.root.position.x, -PLAYER_LIMIT_X, PLAYER_LIMIT_X
        )
        enemy.root.position.z = THREE.MathUtils.clamp(
          enemy.root.position.z, -PLAYER_LIMIT_Z, PLAYER_LIMIT_Z
        )

        // Rode flits bij een raak schot
        enemy.flash = Math.max(0, enemy.flash - dt)
        const flashOn = enemy.flash > 0
        enemy.visorMat.emissiveIntensity = flashOn ? 6 : 2.8
        enemy.mats.forEach((m, i) => {
          if (i === 2) {
            m.emissiveIntensity = flashOn ? 3.5 : 1.8
            return
          }
          if (i === 3) return
          m.emissive.set(flashOn ? 0xff2244 : 0x000000)
          m.emissiveIntensity = flashOn ? 1.4 : 0
        })
      } else if (enemy.state === 'dying') {
        enemy.timer += dt
        const t = Math.min(enemy.timer / 0.55, 1)
        const ease = 1 - Math.pow(1 - t, 3)
        enemy.root.rotation.x = ease * -1.45 * enemy.fallDir
        enemy.root.position.y = -ease * 0.15
        const fade = Math.max(1 - enemy.timer / 0.9, 0)
        for (const m of [...enemy.mats, enemy.visorMat]) m.opacity = fade
        if (enemy.timer > 0.9) {
          enemy.state = 'dead'
          enemy.timer = 0
          enemy.root.visible = false
        }
      } else {
        enemy.timer += dt
        if (enemy.timer > ENEMY_RESPAWN) this.respawnEnemy(enemy)
      }
    }
  }

  // ── Sfeer-updates ───────────────────────────────────────────────────────

  private updateAtmosphere(dt: number, elapsed: number) {
    // Regen valt en wrapt terug omhoog
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute
    const spread = (PLAZA_SIZE + 8) / 2
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - 19 * dt
      if (y < 0) y += 20
      pos.setY(i, y)
      let x = pos.getX(i) + 2.4 * dt * Math.sin(i)
      if (x > spread) x -= spread * 2
      if (x < -spread) x += spread * 2
      pos.setX(i, x)
    }
    pos.needsUpdate = true

    // Neon-flikkering
    for (const f of this.flickerMats) {
      f.t -= dt
      if (f.t <= 0) {
        const drop = Math.random() < 0.22
        f.mat.emissiveIntensity = drop ? f.base * THREE.MathUtils.randFloat(0.1, 0.45) : f.base
        f.t = drop ? THREE.MathUtils.randFloat(0.04, 0.12) : THREE.MathUtils.randFloat(0.3, 2.4)
      }
    }

    this.holoRing.rotation.y = elapsed * 0.5
    this.holoRing.children[1].rotation.z = elapsed * 0.9
  }

  // ── Hoofdloop ───────────────────────────────────────────────────────────

  private animate = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const elapsed = this.clock.elapsedTime
    this.updatePlayer(dt)
    this.updateCamera(dt)
    this.updateShooting(dt)
    this.updateEnemies(dt)
    this.updateAtmosphere(dt, elapsed)
    this.composer.render()
    requestAnimationFrame(this.animate)
  }
}
