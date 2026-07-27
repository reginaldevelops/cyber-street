import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

// ── Tuning ────────────────────────────────────────────────────────────────
const WALK_SPEED = 5.4
const SPRINT_SPEED = 8.8
const ACCEL = 14 // hoe snel je op snelheid komt (hoger = directer)
const DECEL = 11 // hoe snel je afremt
const MOUSE_SENS = 0.0021
const PITCH_MIN = -0.5
const PITCH_MAX = 0.62

const CAM_DIST = 4.8
const CAM_HEIGHT = 2.4
const CAM_FOLLOW = 9 // smoothing van de camera-focus
const FOV_WALK = 62
const FOV_SPRINT = 70

const FIRE_INTERVAL = 0.115
const GUN_RANGE = 90
const AIM_ASSIST_ANGLE = 0.045 // rad — kleine snap zodat schieten arcade-achtig aanvoelt

const STREET_LENGTH = 72
const ROAD_WIDTH = 10
const SIDEWALK_W = 2.2
const HALF_ROAD = ROAD_WIDTH / 2
const PLAYER_LIMIT_X = HALF_ROAD + SIDEWALK_W - 0.6
const PLAYER_LIMIT_Z = STREET_LENGTH / 2 - 1.5

const ENEMY_COUNT = 5
const ENEMY_HP = 3
const ENEMY_SPEED = 2.6
const ENEMY_RESPAWN = 2.6

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_YELLOW = 0xffe14d

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

export class Game {
  private container: HTMLElement
  private hintEl: HTMLElement
  private killsEl: HTMLElement | null
  private crosshairEl: HTMLElement | null

  private renderer: THREE.WebGLRenderer
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV_WALK, 1, 0.1, 220)
  private clock = new THREE.Clock()

  // Speler
  private player = new THREE.Group()
  private playerBody = new THREE.Group() // bob + lean
  private legL!: THREE.Group
  private legR!: THREE.Group
  private armL!: THREE.Group
  private armR!: THREE.Group
  private gun!: THREE.Group
  private muzzle = new THREE.Object3D()
  private muzzleLight!: THREE.PointLight

  private velocity = new THREE.Vector3()
  private walkPhase = 0
  private gunKick = 0

  // Camera / input
  private aimYaw = 0
  private aimPitch = 0.14
  private camFocus = new THREE.Vector3(0, 0, 0)
  private pointerLocked = false
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

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.28

    this.setupPost()
    this.buildWorld()
    this.buildPlayer()
    this.buildEnemies()
    this.bindEvents()
    this.onResize()
    // Camera meteen achter speler — voorkomt verkeerde looprichting in frame 1
    this.camFocus.copy(this.player.position)
    this.updateCamera(0)
    window.addEventListener('resize', () => this.onResize())
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
    this.scene.fog = new THREE.FogExp2(0x221636, 0.014)

    this.scene.add(new THREE.AmbientLight(0x665577, 0.42))

    const hemi = new THREE.HemisphereLight(0x8aadff, 0x281018, 0.82)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0xb8c4ff, 0.78)
    moon.position.set(-14, 26, -10)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 90
    moon.shadow.camera.left = -34
    moon.shadow.camera.right = 34
    moon.shadow.camera.top = 34
    moon.shadow.camera.bottom = -34
    this.scene.add(moon)

    const fill = new THREE.DirectionalLight(0xff88cc, 0.22)
    fill.position.set(8, 10, 14)
    this.scene.add(fill)

    // Natte weg — iets lichter zodat neon reflecties zichtbaar blijven
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x18141f,
      roughness: 0.38,
      metalness: 0.42,
    })
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, STREET_LENGTH), roadMat)
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    this.scene.add(road)
    this.worldColliders.push(road)

    // Middenstrepen
    const lineMat = new THREE.MeshStandardMaterial({
      color: NEON_PINK,
      emissive: NEON_PINK,
      emissiveIntensity: 1.4,
    })
    for (let z = -STREET_LENGTH / 2 + 2; z < STREET_LENGTH / 2; z += 4) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.8), lineMat)
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.02, z)
      this.scene.add(stripe)
    }

    // Stoepen met neon-stoepranden
    const walkMat = new THREE.MeshStandardMaterial({
      color: 0x221c2a,
      roughness: 0.55,
      metalness: 0.22,
    })
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(
        new THREE.BoxGeometry(SIDEWALK_W, 0.14, STREET_LENGTH),
        walkMat
      )
      walk.position.set(side * (HALF_ROAD + SIDEWALK_W / 2), 0.07, 0)
      walk.receiveShadow = true
      this.scene.add(walk)

      const curbColor = side < 0 ? NEON_CYAN : NEON_PINK
      const curbMat = new THREE.MeshStandardMaterial({
        color: curbColor,
        emissive: curbColor,
        emissiveIntensity: 2.4,
      })
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, STREET_LENGTH), curbMat)
      curb.position.set(side * HALF_ROAD, 0.14, 0)
      this.scene.add(curb)
      this.flickerMats.push({ mat: curbMat, base: 2.4, t: Math.random() * 5 })
    }

    // Gebouwen — variatie per blok
    const buildingX = HALF_ROAD + SIDEWALK_W + 3
    const count = 8
    for (let i = 0; i < count; i++) {
      const z = THREE.MathUtils.lerp(
        -STREET_LENGTH / 2 + 4,
        STREET_LENGTH / 2 - 4,
        i / (count - 1)
      )
      this.addDetailedBuilding(-buildingX, z, -1, i)
      this.addDetailedBuilding(buildingX, z, 1, i + 17)
    }

    this.addStreetProps()

    const glowTex = this.makeGlowTexture()

    // Straatverlichting (neon points)
    const lights: [number, number, number][] = [
      [-HALF_ROAD - 1, 3.6, -12],
      [HALF_ROAD + 1, 3.6, 8],
      [-HALF_ROAD - 1, 3.6, 20],
      [HALF_ROAD + 1, 3.6, -26],
    ]
    lights.forEach(([x, y, z], i) => {
      const color = i % 2 ? NEON_PINK : NEON_CYAN
      const light = new THREE.PointLight(color, 20, 24, 1.8)
      light.position.set(x, y, z)
      this.scene.add(light)

      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 9),
        new THREE.MeshBasicMaterial({
          color,
          map: glowTex,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      glow.rotation.x = -Math.PI / 2
      glow.position.set(x * 0.82, 0.03, z)
      this.scene.add(glow)
    })

    // Zachte neon "zon" aan het einde van de straat
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(72, 72),
      new THREE.MeshBasicMaterial({
        color: 0xff3d7e,
        map: glowTex,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    )
    sun.position.set(0, 10, -STREET_LENGTH / 2 - 36)
    this.scene.add(sun)

    // Skyline-silhouetten in de verte
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x0a0616 })
    for (let i = 0; i < 14; i++) {
      const w = 4 + Math.random() * 6
      const h = 10 + Math.random() * 22
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skyMat)
      const side = i % 2 ? 1 : -1
      tower.position.set(
        side * (12 + Math.random() * 20),
        h / 2,
        -STREET_LENGTH / 2 - 14 - Math.random() * 22
      )
      this.scene.add(tower)
    }

    // Draaiende hologram-ring boven de straat
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
    this.holoRing.position.set(0, 8.5, -18)
    this.scene.add(this.holoRing)

    this.rain = this.makeRain()
    this.scene.add(this.rain)
  }

  private addDetailedBuilding(x: number, z: number, side: number, seed: number) {
    const rng = (n: number) => {
      const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453
      return v - Math.floor(v)
    }

    const variant = seed % 4
    const height = 5.2 + (seed % 5) * 1.55 + (variant === 3 ? 2.2 : 0)
    const width = 5.2 + (variant === 1 ? 1.4 : 0) + rng(1) * 0.8
    const depth = 5 + (variant === 2 ? 1.8 : 0) + rng(2) * 0.6
    const wallHue = 0x2a2436 + Math.floor(rng(3) * 0x050508)
    const accentColors = [NEON_CYAN, NEON_PINK, NEON_YELLOW, 0x9a86ff]
    const neonColor = accentColors[seed % accentColors.length]

    const wallMat = new THREE.MeshStandardMaterial({
      color: wallHue,
      roughness: 0.72 + rng(4) * 0.12,
      metalness: 0.14 + rng(5) * 0.1,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x3a3448,
      roughness: 0.55,
      metalness: 0.35,
    })
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x4a5058,
      roughness: 0.35,
      metalness: 0.75,
    })

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat)
    body.position.set(x, height / 2, z)
    body.castShadow = true
    body.receiveShadow = true
    this.scene.add(body)
    this.worldColliders.push(body)

    // Dakrand + rand details
    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.1, depth + 0.12), trimMat)
    roofTrim.position.set(x, height + 0.04, z)
    this.scene.add(roofTrim)

    const faceX = side > 0 ? -1 : 1
    const faceWorldX = x + faceX * (width / 2 + 0.06)

    // Ground floor plint (donkerder)
    const plinthH = variant === 1 ? 1.35 : 0.85
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.04, plinthH, depth + 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1a1622, roughness: 0.85, metalness: 0.1 })
    )
    plinth.position.set(x, plinthH / 2, z)
    plinth.receiveShadow = true
    this.scene.add(plinth)

    // Neon uithangbord — per variant anders
    const neonMat = new THREE.MeshStandardMaterial({
      color: neonColor,
      emissive: neonColor,
      emissiveIntensity: 2.4,
      roughness: 0.35,
      metalness: 0.25,
    })
    if (variant === 1) {
      // Winkel: groot horizontaal bord
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, depth * 0.75), neonMat)
      sign.position.set(faceWorldX, plinthH + 0.55, z)
      this.scene.add(sign)
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.04, depth * 0.82),
        new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.8, metalness: 0.1 })
      )
      awning.position.set(faceWorldX + faceX * 0.18, plinthH + 0.95, z)
      this.scene.add(awning)
    } else if (variant === 2) {
      // Industrieel: verticale neon strip
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.08, height * 0.55, 0.14), neonMat)
      sign.position.set(faceWorldX, height * 0.52, z)
      this.scene.add(sign)
      // Buizen langs gevel
      for (let p = 0; p < 3; p++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height * 0.7, 6), metalMat)
        pipe.position.set(faceWorldX + faceX * 0.04, height * 0.45, z - depth / 2 + 1 + p * (depth - 2) / 2)
        this.scene.add(pipe)
      }
    } else {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, depth * 0.55), neonMat)
      sign.position.set(faceWorldX, height * 0.62 + rng(6) * 0.4, z)
      this.scene.add(sign)
    }
    this.flickerMats.push({ mat: neonMat, base: 2.4, t: rng(7) * 6 })

    // Balkons / vensterbanken (tower & standard)
    if (variant === 0 || variant === 3) {
      const rows = Math.floor(height / 2.2)
      for (let r = 1; r < rows; r++) {
        if (rng(10 + r) > 0.45) continue
        const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, depth * 0.35), trimMat)
        ledge.position.set(faceWorldX, 1.4 + r * 2, z + (rng(11 + r) - 0.5) * depth * 0.25)
        this.scene.add(ledge)
      }
    }

    // Ramen op straatkant
    const windowGeo = new THREE.PlaneGeometry(0.38, 0.28)
    const rows = Math.max(2, Math.floor((height - plinthH) / 1.45))
    const cols = variant === 1 ? 5 : 4
    const windowMesh = new THREE.InstancedMesh(
      windowGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      rows * cols
    )
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const palette = [0x37e0ff, 0xff5aad, 0xffd76b, 0x9a86ff, 0xaaffcc]
    let idx = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dummy.position.set(
          faceWorldX + faceX * 0.02,
          plinthH + 0.55 + r * 1.45,
          z - depth / 2 + 0.85 + c * ((depth - 1.7) / (cols - 1))
        )
        dummy.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2
        dummy.updateMatrix()
        windowMesh.setMatrixAt(idx, dummy.matrix)
        const lit = rng(20 + idx) > 0.32
        color.set(lit ? palette[Math.floor(rng(21 + idx) * palette.length)] : 0x18141f)
        if (lit) color.multiplyScalar(0.75 + rng(22 + idx) * 0.45)
        windowMesh.setColorAt(idx, color)
        idx++
      }
    }
    this.scene.add(windowMesh)

    // Dak-antenne / airco units
    if (variant === 2 || variant === 3 || rng(8) > 0.5) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.45), metalMat)
      ac.position.set(x + (rng(9) - 0.5) * width * 0.5, height + 0.18, z + (rng(12) - 0.5) * depth * 0.4)
      this.scene.add(ac)
    }
    if (rng(13) > 0.55) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), metalMat)
      antenna.position.set(x + (rng(14) - 0.5) * width * 0.35, height + 0.65, z)
      this.scene.add(antenna)
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshStandardMaterial({ color: neonColor, emissive: neonColor, emissiveIntensity: 2 })
      )
      tip.position.set(antenna.position.x, height + 1.28, z)
      this.scene.add(tip)
    }
  }

  private addStreetProps() {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x3a4048,
      roughness: 0.4,
      metalness: 0.8,
    })
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x2a2228, roughness: 0.85, metalness: 0.1 })
    const dumpMat = new THREE.MeshStandardMaterial({ color: 0x1a3a32, roughness: 0.6, metalness: 0.35 })

    const propSpots: [number, number][] = [
      [-HALF_ROAD - 0.5, -18], [HALF_ROAD + 0.5, -6], [-HALF_ROAD - 0.5, 10],
      [HALF_ROAD + 0.5, 22], [-HALF_ROAD - 0.5, -30], [HALF_ROAD + 0.5, 16],
    ]
    propSpots.forEach(([px, pz], i) => {
      if (i % 3 === 0) {
        const dumpster = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.55), dumpMat)
        dumpster.position.set(px, 0.38, pz)
        dumpster.castShadow = true
        this.scene.add(dumpster)
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.57), metalMat)
        lid.position.set(px, 0.72, pz)
        this.scene.add(lid)
      } else if (i % 3 === 1) {
        for (let c = 0; c < 2 + (i % 2); c++) {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), crateMat)
          crate.position.set(px + c * 0.5 - 0.25, 0.28 + c * 0.02, pz + (c % 2) * 0.15)
          crate.rotation.y = c * 0.4
          crate.castShadow = true
          this.scene.add(crate)
        }
      } else {
        // Stoom/rooster op stoep
        const grate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.35), metalMat)
        grate.position.set(px, 0.17, pz)
        this.scene.add(grate)
      }
    })

    // Neon lantaarnpalen
    for (let lz = -STREET_LENGTH / 2 + 8; lz < STREET_LENGTH / 2; lz += 14) {
      for (const sx of [-HALF_ROAD - SIDEWALK_W * 0.5, HALF_ROAD + SIDEWALK_W * 0.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 8), metalMat)
        pole.position.set(sx, 1.5, lz)
        pole.castShadow = true
        this.scene.add(pole)
        const lampColor = lz % 28 < 14 ? NEON_CYAN : NEON_PINK
        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.08, 0.35),
          new THREE.MeshStandardMaterial({
            color: lampColor,
            emissive: lampColor,
            emissiveIntensity: 2,
          })
        )
        lamp.position.set(sx, 2.85, lz)
        this.scene.add(lamp)
      }
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
      positions[i * 3] = THREE.MathUtils.randFloatSpread(ROAD_WIDTH + 18)
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(0.2, 20)
      positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(STREET_LENGTH + 12)
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

  private buildPlayer() {
    const skin = new THREE.MeshStandardMaterial({
      color: 0xc9a088,
      roughness: 0.62,
      metalness: 0.08,
    })
    const skinDark = new THREE.MeshStandardMaterial({
      color: 0x9a7560,
      roughness: 0.65,
      metalness: 0.06,
    })
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x120818,
      roughness: 0.85,
      metalness: 0.1,
    })
    const jacketMat = new THREE.MeshStandardMaterial({
      color: 0x1a1522,
      roughness: 0.52,
      metalness: 0.38,
    })
    const jacketInner = new THREE.MeshStandardMaterial({
      color: 0x0e0a12,
      roughness: 0.75,
      metalness: 0.12,
    })
    const jacketTrim = new THREE.MeshStandardMaterial({
      color: NEON_PINK,
      emissive: NEON_PINK,
      emissiveIntensity: 1.15,
      roughness: 0.35,
      metalness: 0.3,
    })
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x14101a,
      roughness: 0.7,
      metalness: 0.15,
    })
    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x0a080e,
      roughness: 0.45,
      metalness: 0.5,
    })
    const cyberMat = new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 1.8,
      roughness: 0.25,
      metalness: 0.55,
    })
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x66eeff,
      emissive: 0x2288aa,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.6,
      transparent: true,
      opacity: 0.92,
    })
    const metalGun = new THREE.MeshStandardMaterial({
      color: 0x2a2e36,
      roughness: 0.28,
      metalness: 0.88,
    })
    const gripGun = new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      roughness: 0.75,
      metalness: 0.15,
    })
    const neonGun = new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.4,
    })
    const leather = new THREE.MeshStandardMaterial({
      color: 0x2a1820,
      roughness: 0.55,
      metalness: 0.25,
    })

    // ── Hoofd ──
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 8), skin)
    neck.position.y = 1.52
    neck.castShadow = true

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), skin)
    head.position.y = 1.72
    head.scale.set(1, 1.08, 1)
    head.castShadow = true

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), skinDark)
    jaw.position.set(0, 1.64, 0.04)
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skinDark)
    chin.position.set(0, 1.6, 0.07)
    chin.scale.set(1.1, 0.7, 0.9)

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.04), skin)
    earL.position.set(-0.13, 1.73, 0)
    const earR = earL.clone()
    earR.position.x = 0.13

    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.03), skinDark)
    browL.position.set(-0.05, 1.78, 0.11)
    browL.rotation.z = 0.12
    const browR = browL.clone()
    browR.position.x = 0.05
    browR.rotation.z = -0.12

    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      hairMat
    )
    hairTop.position.y = 1.78
    hairTop.scale.set(1, 0.75, 1.05)
    const hairStreak = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.02), cyberMat)
    hairStreak.position.set(0.07, 1.8, 0.02)
    const hairTail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), hairMat)
    hairTail.position.set(0, 1.62, -0.1)

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.1), visorMat)
    visor.position.set(0, 1.74, 0.12)
    const visorBridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.04), metalGun)
    visorBridge.position.set(0, 1.74, 0.1)
    const visorSideL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.08), metalGun)
    visorSideL.position.set(-0.13, 1.74, 0.1)
    const visorSideR = visorSideL.clone()
    visorSideR.position.x = 0.13

    const neckImplant = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.03), cyberMat)
    neckImplant.position.set(0, 1.5, -0.07)
    const neckCable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), metalGun)
    neckCable.rotation.x = Math.PI / 2
    neckCable.position.set(0.04, 1.48, -0.1)

    // ── Torso ──
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.38, 6, 12), skin)
    chest.position.y = 1.22
    chest.castShadow = true

    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.16), jacketMat)
    shoulderL.position.set(-0.22, 1.44, 0)
    const shoulderR = shoulderL.clone()
    shoulderR.position.x = 0.22
    const epauletteL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.14), leather)
    epauletteL.position.set(-0.22, 1.49, 0)
    const epauletteR = epauletteL.clone()
    epauletteR.position.x = 0.22

    // Lange mafia/cyberpunk trenchcoat
    const coatUpper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.26), jacketMat)
    coatUpper.position.set(0, 1.28, 0)
    coatUpper.castShadow = true

    const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.02), jacketInner)
    lapelL.position.set(-0.1, 1.38, 0.14)
    lapelL.rotation.z = 0.35
    lapelL.rotation.x = -0.15
    const lapelR = lapelL.clone()
    lapelR.position.x = 0.1
    lapelR.rotation.z = -0.35

    const coatBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.06), jacketMat)
    coatBack.position.set(0, 0.82, -0.14)
    const coatPanelL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.02, 0.22), jacketMat)
    coatPanelL.position.set(-0.22, 0.84, 0.02)
    const coatPanelR = coatPanelL.clone()
    coatPanelR.position.x = 0.22
    const coatFrontL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.95, 0.04), jacketMat)
    coatFrontL.position.set(-0.12, 0.86, 0.13)
    const coatFrontR = coatFrontL.clone()
    coatFrontR.position.x = 0.12

    // Jas splitst achteraan + lange punten
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.04), jacketMat)
    tailL.position.set(-0.1, 0.38, -0.1)
    tailL.rotation.x = 0.08
    const tailR = tailL.clone()
    tailR.position.x = 0.1
    tailR.rotation.x = 0.06

    const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.95, 0.02), jacketTrim)
    trimL.position.set(-0.23, 0.88, 0.14)
    const trimR = trimL.clone()
    trimR.position.x = 0.23
    const trimBack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.02), cyberMat)
    trimBack.position.set(0, 0.95, -0.17)

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.26), jacketMat)
    collar.position.set(0, 1.46, -0.02)
    const collarInner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.22), jacketInner)
    collarInner.position.set(0, 1.44, 0)

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.24), leather)
    belt.position.set(0, 0.9, 0.02)
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.035), cyberMat)
    buckle.position.set(0, 0.9, 0.14)
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.05), leather)
    pouch.position.set(0.16, 0.86, 0.1)
    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), leather)
    holster.position.set(-0.17, 0.78, 0.06)
    const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), cyberMat)
    knifeHandle.position.set(-0.17, 0.88, 0.1)

    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.03), metalGun)
    radio.position.set(0.2, 1.42, -0.05)
    const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4), metalGun)
    radioAnt.position.set(0.2, 1.48, -0.05)

    // ── Benen ──
    const thighGeo = new THREE.BoxGeometry(0.13, 0.34, 0.14)
    thighGeo.translate(0, -0.17, 0)
    const shinGeo = new THREE.BoxGeometry(0.11, 0.32, 0.12)
    shinGeo.translate(0, -0.16, 0)

    this.legL = new THREE.Group()
    this.legL.position.set(-0.11, 0.9, 0)
    const thighL = new THREE.Mesh(thighGeo, pantsMat)
    const kneePadL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), metalGun)
    kneePadL.position.set(0, -0.38, 0.04)
    const shinL = new THREE.Mesh(shinGeo, pantsMat)
    shinL.position.y = -0.34
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), bootMat)
    bootL.position.set(0, -0.62, 0.04)
    const soleL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.24), cyberMat)
    soleL.position.set(0, -0.67, 0.04)
    const laceL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), leather)
    laceL.position.set(0, -0.58, 0.14)
    this.legL.add(thighL, kneePadL, shinL, bootL, soleL, laceL)

    this.legR = new THREE.Group()
    this.legR.position.set(0.11, 0.9, 0)
    const thighR = new THREE.Mesh(thighGeo, pantsMat)
    const kneePadR = kneePadL.clone()
    kneePadR.position.set(0, -0.38, 0.04)
    const shinR = new THREE.Mesh(shinGeo, pantsMat)
    shinR.position.y = -0.34
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), bootMat)
    bootR.position.set(0, -0.62, 0.04)
    const soleR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.24), cyberMat)
    soleR.position.set(0, -0.67, 0.04)
    const laceR = laceL.clone()
    laceR.position.set(0, -0.58, 0.14)
    this.legR.add(thighR, kneePadR, shinR, bootR, soleR, laceR)
    for (const leg of [this.legL, this.legR]) {
      for (const c of leg.children) (c as THREE.Mesh).castShadow = true
    }

    // ── Armen + handen ──
    const upperArmGeo = new THREE.BoxGeometry(0.1, 0.28, 0.11)
    upperArmGeo.translate(0, -0.14, 0)
    const foreArmGeo = new THREE.BoxGeometry(0.085, 0.24, 0.095)
    foreArmGeo.translate(0, -0.12, 0)
    const sleeveGeo = new THREE.BoxGeometry(0.095, 0.26, 0.105)
    sleeveGeo.translate(0, -0.13, 0)

    this.armR = new THREE.Group()
    this.armR.position.set(0.28, 1.38, 0.04)
    const upperR = new THREE.Mesh(upperArmGeo, jacketMat)
    const sleeveR = new THREE.Mesh(sleeveGeo, jacketMat)
    sleeveR.position.y = -0.28
    const foreR = new THREE.Mesh(foreArmGeo, skin)
    foreR.position.y = -0.28
    const cuffR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.11), jacketTrim)
    cuffR.position.set(0, -0.5, 0)
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.08), skinDark)
    handR.position.set(0, -0.54, 0.02)
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.035, 0.015), skinDark)
      finger.position.set(-0.02 + f * 0.013, -0.57, 0.05)
      this.armR.add(finger)
    }
    this.armR.add(upperR, sleeveR, foreR, cuffR, handR)

    this.armL = new THREE.Group()
    this.armL.position.set(-0.22, 1.34, 0.18)
    const upperL = new THREE.Mesh(upperArmGeo, jacketMat)
    const sleeveL = new THREE.Mesh(sleeveGeo, jacketMat)
    sleeveL.position.y = -0.28
    const foreL = new THREE.Mesh(foreArmGeo, skin)
    foreL.position.y = -0.28
    const cyberForeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.1), metalGun)
    cyberForeL.position.set(0, -0.18, 0)
    const cyberLineL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), cyberMat)
    cyberLineL.position.set(0, -0.18, 0.05)
    const cuffL = cuffR.clone()
    cuffL.position.set(0, -0.5, 0)
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.08), skinDark)
    handL.position.set(0, -0.54, 0.04)
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.035, 0.015), skinDark)
      finger.position.set(-0.02 + f * 0.013, -0.57, 0.06)
      this.armL.add(finger)
    }
    this.armL.add(upperL, sleeveL, foreL, cyberForeL, cyberLineL, cuffL, handL)

    for (const arm of [this.armR, this.armL]) {
      for (const c of arm.children) (c as THREE.Mesh).castShadow = true
    }

    this.armR.rotation.x = -1.15
    this.armR.rotation.z = -0.08
    this.armL.rotation.x = -1.05
    this.armL.rotation.z = 0.35
    this.armL.rotation.y = 0.15

    this.gun = this.buildUzi(metalGun, gripGun, neonGun)
    this.gun.position.set(0.1, 1.22, 0.38)
    this.gun.rotation.y = -0.04

    this.muzzleLight = new THREE.PointLight(0x9fefff, 0, 7, 2)
    this.muzzleLight.position.set(0.1, 1.24, 0.72)

    this.playerBody.add(
      neck, head, jaw, chin, earL, earR, browL, browR,
      hairTop, hairStreak, hairTail, visor, visorBridge, visorSideL, visorSideR,
      neckImplant, neckCable,
      chest, shoulderL, shoulderR, epauletteL, epauletteR,
      coatUpper, lapelL, lapelR, coatBack, coatPanelL, coatPanelR,
      coatFrontL, coatFrontR, tailL, tailR, trimL, trimR, trimBack,
      collar, collarInner, belt, buckle, pouch, holster, knifeHandle, radio, radioAnt,
      this.legL, this.legR, this.armR, this.armL,
      this.gun, this.muzzleLight
    )
    this.player.add(this.playerBody)
    this.player.position.set(0, 0, 6)
    this.scene.add(this.player)
    this.camFocus.copy(this.player.position)
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

    this.renderer.domElement.addEventListener('click', () => {
      if (!this.pointerLocked) this.renderer.domElement.requestPointerLock()
    })
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement
      this.hintEl.classList.toggle('hidden', this.pointerLocked)
      if (!this.pointerLocked) this.firing = false
    })
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return
      this.aimYaw -= e.movementX * MOUSE_SENS
      this.aimPitch = THREE.MathUtils.clamp(
        this.aimPitch + e.movementY * MOUSE_SENS,
        PITCH_MIN,
        PITCH_MAX
      )
    })
    document.addEventListener('mousedown', (e) => {
      if (this.pointerLocked && e.button === 0) this.firing = true
    })
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false
    })
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
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  // ── Beweging & camera ───────────────────────────────────────────────────

  private updatePlayer(dt: number) {
    const forward = new THREE.Vector3(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw))
    const right = new THREE.Vector3(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw))

    const wish = new THREE.Vector3()
    if (this.keys.w) wish.add(forward)
    if (this.keys.s) wish.sub(forward)
    if (this.keys.a) wish.add(right)
    if (this.keys.d) wish.sub(right)

    const maxSpeed = this.keys.sprint && this.keys.w ? SPRINT_SPEED : WALK_SPEED
    const hasInput = wish.lengthSq() > 0
    if (hasInput) wish.normalize().multiplyScalar(maxSpeed)

    // Soepel accelereren/afremmen — geen abrupt starten of stoppen
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

    // Lichaam draait vloeiend mee met de aim-richting
    this.player.rotation.y = dampAngle(this.player.rotation.y, this.aimYaw, 16, dt)

    const speed = this.velocity.length()
    const speedRatio = speed / SPRINT_SPEED

    // Loopcyclus: benen zwaaien, lichte body-bob
    this.walkPhase += speed * dt * 2.4
    const swing = Math.sin(this.walkPhase) * Math.min(speedRatio * 1.6, 0.85)
    this.legL.rotation.x = swing
    this.legR.rotation.x = -swing
    this.playerBody.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.055 * Math.min(speedRatio * 2, 1)

    // In de bocht/strafe leunen — voelt vloeiend en dynamisch
    const localVel = this.velocity.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0), -this.player.rotation.y
    )
    const targetLeanZ = THREE.MathUtils.clamp(-localVel.x * 0.035, -0.16, 0.16)
    const targetLeanX = THREE.MathUtils.clamp(localVel.z * 0.028, -0.14, 0.14)
    this.playerBody.rotation.z = THREE.MathUtils.damp(this.playerBody.rotation.z, targetLeanZ, 10, dt)
    this.playerBody.rotation.x = THREE.MathUtils.damp(this.playerBody.rotation.x, targetLeanX, 10, dt)

    // Wapen + armen volgen pitch / recoil (tweehands Uzi)
    this.gunKick = Math.max(0, this.gunKick - dt * 6)
    const pitchAim = this.aimPitch * 0.45 + this.gunKick * 0.45
    this.armR.rotation.x = -1.15 - pitchAim
    this.armL.rotation.x = -1.05 - this.aimPitch * 0.38 - this.gunKick * 0.25
    this.gun.rotation.x = -this.aimPitch * 0.52 - this.gunKick * 0.68
    this.gun.position.z = 0.38 - this.gunKick * 0.09

    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 260)
  }

  private updateCamera(dt: number) {
    // Focuspunt loopt de speler soepel achterna
    this.camFocus.x = THREE.MathUtils.damp(this.camFocus.x, this.player.position.x, CAM_FOLLOW, dt)
    this.camFocus.z = THREE.MathUtils.damp(this.camFocus.z, this.player.position.z, CAM_FOLLOW, dt)

    const cosP = Math.cos(this.aimPitch)
    const desired = new THREE.Vector3(
      this.camFocus.x - Math.sin(this.aimYaw) * CAM_DIST * cosP,
      CAM_HEIGHT + Math.sin(this.aimPitch) * CAM_DIST * 0.9,
      this.camFocus.z - Math.cos(this.aimYaw) * CAM_DIST * cosP
    )

    // Camera niet door gebouwen laten clippen
    const focusPoint = new THREE.Vector3(this.camFocus.x, 1.6, this.camFocus.z)
    const toCam = desired.clone().sub(focusPoint)
    const dist = toCam.length()
    this.raycaster.set(focusPoint, toCam.clone().normalize())
    this.raycaster.far = dist
    const blocked = this.raycaster.intersectObjects(this.worldColliders, false)
    if (blocked.length > 0) {
      desired.copy(focusPoint).addScaledVector(toCam.normalize(), Math.max(blocked[0].distance - 0.3, 1.2))
    }
    this.camera.position.copy(desired)

    // Kijk iets vóór de speler in de aim-richting: GTA-gevoel
    const lookAhead = new THREE.Vector3(
      Math.sin(this.aimYaw) * 2 * cosP,
      1.5 - Math.sin(this.aimPitch) * 2.4,
      Math.cos(this.aimYaw) * 2 * cosP
    )
    this.camera.lookAt(
      this.camFocus.x + lookAhead.x,
      lookAhead.y,
      this.camFocus.z + lookAhead.z
    )

    // Sprint = subtiel wijdere FOV
    const targetFov = this.keys.sprint && this.keys.w && this.velocity.length() > 4
      ? FOV_SPRINT
      : FOV_WALK
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt)
    this.camera.updateProjectionMatrix()
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

  private shoot() {
    // Richten door het midden van het scherm (crosshair)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
    this.raycaster.far = GUN_RANGE
    const hits = this.raycaster.intersectObjects(
      [...this.enemyHitMeshes, ...this.worldColliders],
      false
    )

    const muzzlePos = new THREE.Vector3()
    this.muzzle.getWorldPosition(muzzlePos)

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

    // Aim-assist: net naast een vijand mikken telt alsnog, zolang er
    // niets dichterbij in de baan van het schot zit.
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
    const spreadX = (ROAD_WIDTH + 18) / 2
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - 19 * dt
      if (y < 0) y += 20
      pos.setY(i, y)
      let x = pos.getX(i) + 2.4 * dt * Math.sin(i)
      if (x > spreadX) x -= spreadX * 2
      if (x < -spreadX) x += spreadX * 2
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
