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
    this.renderer.toneMappingExposure = 0.95
    container.appendChild(this.renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.1

    this.setupPost()
    this.buildWorld()
    this.buildPlayer()
    this.buildEnemies()
    this.bindEvents()
    this.onResize()
    window.addEventListener('resize', () => this.onResize())
    this.clock.start()
    this.animate()
    ;(window as unknown as { __game: Game }).__game = this
  }

  private setupPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.72)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  // ── Wereld ──────────────────────────────────────────────────────────────

  private buildWorld() {
    this.scene.background = new THREE.Color(0x05030d)
    this.scene.fog = new THREE.FogExp2(0x0d0618, 0.026)

    const hemi = new THREE.HemisphereLight(0x3a5bbf, 0x14020c, 0.5)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0x8fa0ff, 0.5)
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

    // Natte weg — laag ruw + env-reflectie geeft de "regen op asfalt" look
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0a0810,
      roughness: 0.42,
      metalness: 0.45,
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
      color: 0x16121f,
      roughness: 0.6,
      metalness: 0.25,
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

    // Gebouwen
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x191225,
      roughness: 0.82,
      metalness: 0.18,
    })
    const buildingDepth = 6
    const buildingX = HALF_ROAD + SIDEWALK_W + buildingDepth / 2
    const count = 8
    for (let i = 0; i < count; i++) {
      const z = THREE.MathUtils.lerp(
        -STREET_LENGTH / 2 + 4,
        STREET_LENGTH / 2 - 4,
        i / (count - 1)
      )
      const h = 5 + ((i * 17) % 5) * 1.7
      this.addBuilding(-buildingX, z, buildingDepth, h, 6, wallMat, i % 2 ? NEON_CYAN : NEON_YELLOW)
      this.addBuilding(buildingX, z, buildingDepth, h + 1.2, 6, wallMat, i % 2 ? NEON_PINK : NEON_CYAN)
    }

    // Straatverlichting (neon points)
    const lights: [number, number, number][] = [
      [-HALF_ROAD - 1, 3.6, -12],
      [HALF_ROAD + 1, 3.6, 8],
      [-HALF_ROAD - 1, 3.6, 20],
      [HALF_ROAD + 1, 3.6, -26],
    ]
    const glowTex = this.makeGlowTexture()
    lights.forEach(([x, y, z], i) => {
      const color = i % 2 ? NEON_PINK : NEON_CYAN
      const light = new THREE.PointLight(color, 14, 20, 2)
      light.position.set(x, y, z)
      this.scene.add(light)

      // Nep natte-straat reflectie onder elke lamp
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

  private addBuilding(
    x: number,
    z: number,
    depth: number,
    height: number,
    width: number,
    wallMat: THREE.Material,
    neonColor: number
  ) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat)
    body.position.set(x, height / 2, z)
    body.castShadow = true
    body.receiveShadow = true
    this.scene.add(body)
    this.worldColliders.push(body)

    const faceX = x > 0 ? -1 : 1
    const faceWorldX = x + faceX * (width / 2 + 0.08)

    // Neon uithangbord
    const neonMat = new THREE.MeshStandardMaterial({
      color: neonColor,
      emissive: neonColor,
      emissiveIntensity: 2.6,
      roughness: 0.4,
      metalness: 0.2,
    })
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, depth * 0.62), neonMat)
    sign.position.set(faceWorldX, height * 0.68, z)
    this.scene.add(sign)
    this.flickerMats.push({ mat: neonMat, base: 2.6, t: Math.random() * 6 })

    // Verlichte raampjes op de straatkant
    const windowGeo = new THREE.PlaneGeometry(0.42, 0.3)
    const rows = Math.max(2, Math.floor(height / 1.6))
    const cols = 4
    const windowMesh = new THREE.InstancedMesh(
      windowGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      rows * cols
    )
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const palette = [0x37e0ff, 0xff5aad, 0xffd76b, 0x9a86ff]
    let idx = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dummy.position.set(
          faceWorldX + faceX * 0.02,
          1.2 + r * 1.5,
          z - depth / 2 + 0.9 + c * ((depth - 1.8) / (cols - 1))
        )
        dummy.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2
        dummy.updateMatrix()
        windowMesh.setMatrixAt(idx, dummy.matrix)
        const lit = Math.random() > 0.35
        color.set(lit ? palette[Math.floor(Math.random() * palette.length)] : 0x080810)
        if (lit) color.multiplyScalar(0.55 + Math.random() * 0.45)
        windowMesh.setColorAt(idx, color)
        idx++
      }
    }
    this.scene.add(windowMesh)
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

  private buildPlayer() {
    const coatMat = new THREE.MeshStandardMaterial({
      color: 0x1c2438,
      roughness: 0.5,
      metalness: 0.4,
    })
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x2e3950,
      roughness: 0.55,
      metalness: 0.3,
    })
    const cyanGlow = new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.4,
    })
    const pinkGlow = new THREE.MeshStandardMaterial({
      color: NEON_PINK,
      emissive: NEON_PINK,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.4,
    })

    // Torso + lange mafia-jas
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.62, 6, 12), coatMat)
    torso.position.y = 1.12
    torso.castShadow = true

    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.65, 10), coatMat)
    coat.position.y = 0.62
    coat.castShadow = true

    // Neon strip over de rug
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.04), pinkGlow)
    spine.position.set(0, 1.12, -0.33)

    // Hoofd + visor
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16), skinMat)
    head.position.y = 1.78
    head.castShadow = true
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.16), cyanGlow)
    visor.position.set(0, 1.8, 0.15)

    // Schouderstukken
    const shoulderGeo = new THREE.BoxGeometry(0.2, 0.12, 0.26)
    const shoulderL = new THREE.Mesh(shoulderGeo, skinMat)
    shoulderL.position.set(-0.42, 1.48, 0)
    const shoulderR = shoulderL.clone()
    shoulderR.position.x = 0.42
    const padL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.28), cyanGlow)
    padL.position.set(-0.42, 1.56, 0)
    const padR = padL.clone()
    padR.position.x = 0.42

    // Benen (zwaaien tijdens lopen)
    const legGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18)
    legGeo.translate(0, -0.31, 0)
    this.legL = new THREE.Group()
    this.legL.position.set(-0.16, 0.66, 0)
    this.legL.add(new THREE.Mesh(legGeo, skinMat))
    this.legR = new THREE.Group()
    this.legR.position.set(0.16, 0.66, 0)
    this.legR.add(new THREE.Mesh(legGeo, skinMat))
    this.legL.children[0].castShadow = true
    this.legR.children[0].castShadow = true

    // Armen — rechts richt het wapen, links ondersteunt
    const armGeo = new THREE.BoxGeometry(0.11, 0.5, 0.13)
    armGeo.translate(0, -0.25, 0)
    this.armR = new THREE.Group()
    this.armR.position.set(0.42, 1.42, 0.05)
    this.armR.rotation.x = -Math.PI / 2.25
    this.armR.add(new THREE.Mesh(armGeo, coatMat))
    this.armL = new THREE.Group()
    this.armL.position.set(-0.42, 1.42, 0.05)
    this.armL.rotation.x = -Math.PI / 2.5
    this.armL.rotation.z = -0.5
    this.armL.add(new THREE.Mesh(armGeo, coatMat))

    // SMG
    this.gun = new THREE.Group()
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 0.35, metalness: 0.75 })
    )
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.3, metalness: 0.85 })
    )
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.03, 0.34)
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.2), cyanGlow)
    cell.position.set(0, -0.02, 0.02)
    this.gun.add(gunBody, barrel, cell)
    this.gun.position.set(0.3, 1.28, 0.42)
    this.muzzle.position.set(0, 0.03, 0.48)
    this.gun.add(this.muzzle)

    this.muzzleLight = new THREE.PointLight(0x9fefff, 0, 7, 2)
    this.muzzleLight.position.set(0.3, 1.3, 0.6)

    this.playerBody.add(
      torso, coat, spine, head, visor,
      shoulderL, shoulderR, padL, padR,
      this.legL, this.legR, this.armL, this.armR,
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
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x261326,
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
    })
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff2222,
      emissiveIntensity: 2.8,
      transparent: true,
    })
    const finMat = new THREE.MeshStandardMaterial({
      color: NEON_PINK,
      emissive: NEON_PINK,
      emissiveIntensity: 2.2,
      transparent: true,
    })

    const root = new THREE.Group()
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.66, 6, 12), bodyMat)
    torso.position.y = 1.08
    torso.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), bodyMat)
    head.position.y = 1.74
    head.castShadow = true
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.16), visorMat)
    visor.position.set(0, 1.76, 0.16)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.3), finMat)
    fin.position.set(0, 1.98, -0.02)

    root.add(torso, head, visor, fin)

    const hitMeshes = [torso, head]
    for (const m of hitMeshes) m.userData.enemyIndex = index
    this.enemyHitMeshes.push(...hitMeshes)

    return {
      root,
      hitMeshes,
      mats: [bodyMat, finMat],
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
    enemy.visorMat.emissiveIntensity = 2
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
    if (this.keys.d) wish.add(right)
    if (this.keys.a) wish.sub(right)

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

    // Wapen volgt de pitch een beetje + recoil-herstel
    this.gunKick = Math.max(0, this.gunKick - dt * 6)
    this.gun.rotation.x = -this.aimPitch * 0.55 - this.gunKick * 0.7
    this.gun.position.z = 0.42 - this.gunKick * 0.1
    this.armR.rotation.x = -Math.PI / 2.25 - this.aimPitch * 0.5 - this.gunKick * 0.5
    this.armL.rotation.x = -Math.PI / 2.5 - this.aimPitch * 0.5

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
        enemy.visorMat.emissiveIntensity = flashOn ? 6 : 2
        for (const m of enemy.mats) {
          m.emissive.set(flashOn ? 0xff2244 : 0x000000)
          m.emissiveIntensity = flashOn ? 1.4 : 1.6
        }
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
