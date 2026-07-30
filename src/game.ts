import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { populateSceneAmbience, updateAmbience, makeGreenGridTexture, type AmbienceState } from './ambience'
import {
  buildGroundConcept,
  GROUND_CONCEPTS,
  conceptByKey,
  type GroundConceptId,
} from './groundConcepts.js'
import { buildCitySurround } from './citySurround.js'
import { loadHitemPlayer, updatePlayerAnimations } from './playerModel.js'
import { buildPlayerCharacter } from './playerCharacter.js'
import {
  buildSewerTunnel,
  clampSewerPosition,
  SEWER_ENTRANCE_X,
  SEWER_ENTRANCE_Z,
  SEWER_ENTER_RADIUS,
  SEWER_SPAWN,
} from './sewer.js'
import {
  applyNearestTextures,
  applyPixelResolution,
  createPixelQuantizePass,
  PIXEL_SCALE,
} from './pixelLook.js'
import {
  CITY_HALF,
  ISO_CAM_OFFSET as ISO_CAM_DIST,
  ISO_FRUSTUM,
  PLAZA_HALF,
  PLAZA_SIZE,
  PLAYER_BOUNDARY_INSET,
  ws,
} from './worldConfig.js'
// ── Tuning ────────────────────────────────────────────────────────────────
const WALK_SPEED = 5.6
const SPRINT_SPEED = 9.2
const ACCEL = 18
const DECEL = 16
/** How quickly the body turns to face move / aim (higher = snappier). */
const FACE_TURN = 14
const FACE_TURN_IDLE = 8
const MOVE_FACE_THRESHOLD = 0.35

const ISO_CAM_OFFSET = new THREE.Vector3(ISO_CAM_DIST, ISO_CAM_DIST, ISO_CAM_DIST)
const ISO_FOLLOW = 9
const ISO_FORWARD = new THREE.Vector3(-1, 0, -1).normalize()
const ISO_RIGHT = new THREE.Vector3(1, 0, -1).normalize()

const FIRE_INTERVAL = 0.115
const GUN_RANGE = 90
const AIM_ASSIST_ANGLE = 0.055

const PLAYER_LIMIT_X = CITY_HALF - PLAYER_BOUNDARY_INSET
const PLAYER_LIMIT_Z = CITY_HALF - PLAYER_BOUNDARY_INSET

const ENEMY_COUNT = 3
const ENEMY_HP = 3
const ENEMY_SPEED = 2.6
const ENEMY_RESPAWN = 2.6

/** Combat / aiming on — mouse faces, LMB shoots. */
const COMBAT_ENABLED = true
/** Master mute — no menu/game music. */
const AUDIO_ENABLED = false

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
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private gun!: THREE.Group
  private gunHolder = new THREE.Group()
  private muzzle = new THREE.Object3D()
  private muzzleLight!: THREE.PointLight
  private playerVisorMat!: THREE.MeshStandardMaterial
  private playerMixer?: THREE.AnimationMixer
  private playerIdleAction?: THREE.AnimationAction | null
  private playerWalkAction?: THREE.AnimationAction | null
  private playerRunAction?: THREE.AnimationAction | null
  private playerHasSkeleton = false
  private walkPhase = 0

  private velocity = new THREE.Vector3()
  private gunKick = 0
  private aimYaw = 0
  /** Body facing — follows move dir so locomotion never moonwalks. */
  private faceYaw = 0
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
  private ambience!: AmbienceState
  private centralHub!: THREE.Group
  private groundGroup!: THREE.Group
  private groundConcept: GroundConceptId = 'grate-deep'
  private groundCollider!: THREE.Mesh
  private glowTexture!: THREE.CanvasTexture
  private conceptPanelEl: HTMLElement | null
  private bgMusic = new Audio('/audio/neon-alley.mp3')
  private menuMusicPlaying = false
  private playing = false
  private startScreenEl: HTMLElement | null
  private audioHintEl: HTMLElement | null
  private sewerPromptEl: HTMLElement | null
  private exitSewerBtn: HTMLButtonElement | null
  private inSewer = false
  private sewerCooldown = 0
  private sewerTunnel: THREE.Group | null = null
  private surfaceObjects: THREE.Object3D[] = []
  private surfaceLights: THREE.Light[] = []
  private surfaceReturnPos = new THREE.Vector3(SEWER_ENTRANCE_X, 0, SEWER_ENTRANCE_Z + 3.2)
  private savedBg = new THREE.Color()
  private savedFogColor = new THREE.Color()
  private savedFogDensity = 0.0055

  private menuCamAngle = 0

  constructor(container: HTMLElement, hintEl: HTMLElement) {
    this.container = container
    this.hintEl = hintEl
    this.killsEl = document.getElementById('kills')
    this.crosshairEl = document.getElementById('crosshair')
    this.conceptPanelEl = document.getElementById('concept-panel')
    this.startScreenEl = document.getElementById('start-screen')
    this.audioHintEl = document.getElementById('start-audio-hint')
    this.sewerPromptEl = document.getElementById('sewer-prompt')
    this.exitSewerBtn = document.getElementById('exit-sewer-btn') as HTMLButtonElement | null
    if (!COMBAT_ENABLED) {
      this.crosshairEl?.classList.add('hidden')
      document.getElementById('scoreboard')?.classList.add('hidden')
    }

    this.exitSewerBtn?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.exitSewer()
    })

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.BasicShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.style.imageRendering = 'pixelated'
    container.appendChild(this.renderer.domElement)

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1)
    this.camera = new THREE.OrthographicCamera(
      (-ISO_FRUSTUM * aspect) / 2,
      (ISO_FRUSTUM * aspect) / 2,
      ISO_FRUSTUM / 2,
      -ISO_FRUSTUM / 2,
      0.1,
      600,
    )

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.55

    this.setupPost()
    this.setupMusic()
    this.setupStartScreen()
    this.buildWorld()
    this.buildIsoPlayer()
    if (COMBAT_ENABLED) this.buildEnemies()
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

  private setupMusic() {
    this.bgMusic.loop = true
    this.bgMusic.volume = AUDIO_ENABLED ? 0.42 : 0
    this.bgMusic.muted = !AUDIO_ENABLED
    this.bgMusic.preload = AUDIO_ENABLED ? 'auto' : 'none'
  }

  private setupStartScreen() {
    const playBtn = document.getElementById('play-btn')
    if (!playBtn || !this.startScreenEl) return

    document.body.classList.add('menu-mode')

    const unlockMenuMusic = () => {
      if (!AUDIO_ENABLED || this.menuMusicPlaying || this.playing) return
      this.bgMusic.play().then(() => {
        this.menuMusicPlaying = true
        this.audioHintEl?.classList.add('hidden')
      }).catch(() => {
        this.audioHintEl?.classList.remove('hidden')
      })
    }

    if (AUDIO_ENABLED) {
      this.startScreenEl.addEventListener('click', unlockMenuMusic)
    }
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.enterGame()
    })

    if (AUDIO_ENABLED) {
      this.bgMusic.play().then(() => {
        this.menuMusicPlaying = true
        this.audioHintEl?.classList.add('hidden')
      }).catch(() => {
        this.audioHintEl?.classList.remove('hidden')
      })
    } else {
      this.audioHintEl?.classList.add('hidden')
    }
  }

  private enterGame() {
    if (this.playing) return
    this.playing = true

    if (AUDIO_ENABLED) {
      this.bgMusic.pause()
      this.bgMusic.currentTime = 0
    }
    this.menuMusicPlaying = false

    this.startScreenEl?.classList.add('hidden')
    document.body.classList.remove('menu-mode')
    this.player.visible = true
    this.gunHolder.visible = COMBAT_ENABLED
    this.gun.visible = COMBAT_ENABLED
    this.hintEl.classList.remove('hidden')
    this.conceptPanelEl?.classList.remove('hidden')
    if (COMBAT_ENABLED) {
      this.crosshairEl?.classList.remove('hidden')
      this.hintEl.innerHTML =
        '<b>WASD</b> lopen · <b>Shift</b> sprint · <b>Muis</b> mikken · <b>LMB</b> schieten'
    }
  }

  private setupPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // Daytime: lighter bloom so neon accents stay readable without night glow
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.14, 0.45, 0.92)
    this.composer.addPass(this.bloom)
    this.composer.addPass(createPixelQuantizePass())
    this.composer.addPass(new OutputPass())
  }

  // ── Wereld ──────────────────────────────────────────────────────────────

  private buildWorld() {
    // Daytime, slightly muted — still clear day, not night
    this.scene.background = new THREE.Color(0x6a9ac8)
    this.scene.fog = new THREE.FogExp2(0x8aabcc, 0.0055)

    this.scene.add(new THREE.AmbientLight(0xffefe0, 0.48))

    const hemi = new THREE.HemisphereLight(0xb8d4f0, 0x9a8868, 0.92)
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xffecd0, 1.05)
    sun.position.set(22, 38, 14)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 160
    sun.shadow.camera.left = -72
    sun.shadow.camera.right = 72
    sun.shadow.camera.top = 72
    sun.shadow.camera.bottom = -72
    sun.shadow.bias = -0.0008
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0xa0bce8, 0.32)
    fill.position.set(-16, 18, -12)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffe0b8, 0.14)
    rim.position.set(6, 8, -20)
    this.scene.add(rim)

    this.buildPlazaFloor(this.groundConcept)
    this.buildCentralHub()

    buildCitySurround({
      scene: this.scene,
      flickerMats: this.flickerMats,
      colliders: this.worldColliders,
    })

    // No rain during clear daytime
    this.rain = this.makeRain()
    this.rain.visible = false

    this.ambience = populateSceneAmbience(this.scene, this.flickerMats)
    applyNearestTextures(this.scene)

    // Underground sewer pocket (hidden until entered)
    this.sewerTunnel = buildSewerTunnel({
      scene: this.scene,
      flickerMats: this.flickerMats,
      colliders: this.worldColliders,
    })

    // Snapshot surface objects/lights so we can hide them in the sewer
    for (const child of [...this.scene.children]) {
      if (child === this.sewerTunnel) continue
      if ((child as THREE.Light).isLight) {
        this.surfaceLights.push(child as THREE.Light)
        continue
      }
      this.surfaceObjects.push(child)
    }
  }

  private addPuddleDecal(x: number, z: number, radius: number, color: number, intensity = 0.12) {
    const glowTex = this.makeGlowTexture()
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4250,
      emissive: color,
      emissiveIntensity: intensity,
      emissiveMap: glowTex,
      transparent: true,
      opacity: 0.45,
      roughness: 0.18,
      metalness: 0.75,
      depthWrite: false,
    })
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat)
    puddle.rotation.x = -Math.PI / 2
    puddle.position.set(x, 0.025, z)
    this.scene.add(puddle)
    this.flickerMats.push({ mat, base: intensity, t: Math.random() * 3 })
  }

  private buildPlazaFloor(concept: GroundConceptId) {
    this.glowTexture = this.makeGlowTexture()
    this.groundGroup = buildGroundConcept(concept, {
      scene: this.scene,
      flickerMats: this.flickerMats,
      colliders: this.worldColliders,
      glowTexture: this.glowTexture,
    })
    this.scene.add(this.groundGroup)
    this.groundCollider = this.worldColliders[this.worldColliders.length - 1]
    this.groundConcept = concept
    this.updateConceptPanel()
  }

  private switchGroundConcept(concept: GroundConceptId) {
    if (concept === this.groundConcept) return

    this.scene.remove(this.groundGroup)
    this.groundGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })

    const idx = this.worldColliders.indexOf(this.groundCollider)
    if (idx >= 0) this.worldColliders.splice(idx, 1)

    this.buildPlazaFloor(concept)
    applyNearestTextures(this.groundGroup)
  }

  private updateConceptPanel() {
    if (!this.conceptPanelEl) return
    const meta = GROUND_CONCEPTS.find((c) => c.id === this.groundConcept)!
    this.conceptPanelEl.innerHTML = `
      <div class="concept-title">${meta.agent}: ${meta.name}</div>
      <div class="concept-tag">${meta.tagline}</div>
      <div class="concept-pitch">${meta.pitch}</div>
      <div class="concept-keys">Druk <b>1–4</b> · vergelijk grate-verbeteringen</div>
    `
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

  /** Rustig middelpunt — fontein + één holo-ring. */
  private buildCentralHub() {
    this.centralHub = new THREE.Group()
    this.holoRing = new THREE.Group()

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3848, roughness: 0.42, metalness: 0.78 })

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 0.2, 12), metalMat)
    pedestal.position.y = 0.1
    pedestal.receiveShadow = true
    this.centralHub.add(pedestal)

    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.15, metalness: 0.85 }),
    )
    basin.position.y = 0.24
    this.centralHub.add(basin)

    const ringMat = new THREE.MeshBasicMaterial({
      color: NEON_CYAN,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.05, 8, 48), ringMat)
    ring.position.y = 2.4
    ring.rotation.x = Math.PI / 3
    this.holoRing.add(ring)
    this.centralHub.add(this.holoRing)

    this.scene.add(this.centralHub)
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
    const count = 2200
    const rainSpan = CITY_HALF * 2 + 16
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = THREE.MathUtils.randFloatSpread(rainSpan)
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(0.2, ws(20))
      positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(rainSpan)
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

  private buildIsoPlayer() {
    // Voxel street-runner matches tiled/pixel world; GLB via ?player=rigged
    const useGlb = new URLSearchParams(window.location.search).get('player') === 'rigged'
      || new URLSearchParams(window.location.search).get('player') === 'hitem'
      || new URLSearchParams(window.location.search).get('player') === 'legacy'

    if (!useGlb) {
      const rig = buildPlayerCharacter(NEON_CYAN, NEON_PINK, NEON_ORANGE)
      this.player = rig.root
      this.playerBody = rig.body
      this.legL = rig.legL
      this.legR = rig.legR
      this.armL = rig.armL
      this.armR = rig.armR
      this.gun = rig.gun
      this.gunHolder = rig.gunHolder
      this.muzzle = rig.muzzle
      this.muzzleLight = rig.muzzleLight
      this.playerVisorMat = rig.visorMat
      this.playerHasSkeleton = false
      this.player.position.set(0, 0, ws(10))
      this.player.visible = false
      this.scene.add(this.player)
      this.flickerMats.push({ mat: this.playerVisorMat, base: this.playerVisorMat.emissiveIntensity, t: Math.random() * 2 })
      if (COMBAT_ENABLED) {
        this.gunHolder.visible = true
        this.gun.visible = true
      }
      return
    }

    this.player = new THREE.Group()
    this.playerBody = new THREE.Group()
    this.legL = new THREE.Group()
    this.legR = new THREE.Group()
    this.armL = new THREE.Group()
    this.armR = new THREE.Group()
    this.gun = new THREE.Group()
    this.gunHolder = new THREE.Group()
    this.muzzle = new THREE.Object3D()
    this.muzzleLight = new THREE.PointLight(0xff8833, 0, 7, 2)
    this.playerVisorMat = new THREE.MeshStandardMaterial({ color: 0x00f6ff, emissive: 0x00f6ff, emissiveIntensity: 1 })

    this.player.add(this.playerBody)
    this.player.position.set(0, 0, ws(10))
    this.player.visible = false
    this.scene.add(this.player)

    void this.loadHitemPlayerModel()
  }

  private async loadHitemPlayerModel() {
    try {
      const rig = await loadHitemPlayer()
      this.player.remove(this.playerBody)
      this.player = rig.root
      this.playerBody = rig.body
      this.legL = rig.legL
      this.legR = rig.legR
      this.armL = rig.armL
      this.armR = rig.armR
      this.gun = rig.gun
      this.gunHolder = rig.gunHolder
      this.muzzle = rig.muzzle
      this.muzzleLight = rig.muzzleLight
      this.playerVisorMat = rig.visorMat
      this.playerMixer = rig.mixer
      this.playerIdleAction = rig.idleAction
      this.playerWalkAction = rig.walkAction
      this.playerRunAction = rig.runAction
      this.playerHasSkeleton = rig.hasSkeleton

      this.player.position.set(0, 0, ws(10))
      this.player.visible = this.playing
      this.scene.add(this.player)
      if (COMBAT_ENABLED) {
        this.gunHolder.visible = true
        this.gun.visible = true
      }

      if (rig.mixer) {
        console.info('[player] animation clips ready — walk/idle will play when moving')
      } else if (rig.hasSkeleton) {
        console.info('[player] rigged model loaded (no animation clips yet — static pose + bob)')
      }

      if (this.playerVisorMat.emissiveIntensity > 0) {
        this.flickerMats.push({ mat: this.playerVisorMat, base: this.playerVisorMat.emissiveIntensity, t: Math.random() * 2 })
      }
    } catch (err) {
      console.error('Failed to load Hitem3D player model', err)
    }
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
    const gridTex = makeGreenGridTexture()
    const visorMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      emissive: 0x22ff66,
      emissiveMap: gridTex,
      emissiveIntensity: 2.6,
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

    const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.2 * scale, 0.14 * scale), visorMat)
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
    window.addEventListener('keydown', (e) => {
      if (!this.playing) return
      if (e.code.startsWith('Digit')) {
        const concept = conceptByKey(e.code.replace('Digit', ''))
        if (concept) this.switchGroundConcept(concept)
      }
      this.setKey(e.code, true)
    })
    window.addEventListener('keyup', (e) => {
      if (!this.playing) return
      this.setKey(e.code, false)
    })

    const canvas = this.renderer.domElement
    canvas.addEventListener('mousemove', (e) => {
      if (!this.playing) return
      this.mouseScreen.x = e.clientX
      this.mouseScreen.y = e.clientY
      this.updateCrosshair()
    })
    canvas.addEventListener('mousedown', (e) => {
      if (!this.playing) return
      if (COMBAT_ENABLED && e.button === 0) this.firing = true
    })
    document.addEventListener('mouseup', (e) => {
      if (!this.playing || !COMBAT_ENABLED) return
      if (e.button === 0) this.firing = false
    })
  }

  private updateCrosshair() {
    if (!COMBAT_ENABLED || !this.crosshairEl) return
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
    applyPixelResolution(this.renderer, this.composer, w, h, PIXEL_SCALE)
  }

  // ── Beweging & camera ───────────────────────────────────────────────────

  private updatePlayer(dt: number) {
    if (!this.playing) {
      this.velocity.set(0, 0, 0)
      return
    }

    this.updateAimFromMouse()

    // Camera-relative WASD (isometric standard)
    const wish = new THREE.Vector3()
    if (this.keys.w) wish.add(ISO_FORWARD)
    if (this.keys.s) wish.sub(ISO_FORWARD)
    if (this.keys.d) wish.add(ISO_RIGHT)
    if (this.keys.a) wish.sub(ISO_RIGHT)

    const hasInput = wish.lengthSq() > 0
    // Sprint in any move direction (not only W) — Diablo / Hades style
    const maxSpeed = this.keys.sprint && hasInput ? SPRINT_SPEED : WALK_SPEED
    if (hasInput) wish.normalize().multiplyScalar(maxSpeed)

    const lambda = hasInput ? ACCEL : DECEL
    const blend = 1 - Math.exp(-lambda * dt)
    this.velocity.lerp(wish, blend)
    if (!hasInput && this.velocity.lengthSq() < 0.0004) this.velocity.set(0, 0, 0)

    this.player.position.addScaledVector(this.velocity, dt)
    if (this.inSewer) {
      clampSewerPosition(this.player.position)
    } else {
      this.player.position.x = THREE.MathUtils.clamp(
        this.player.position.x, -PLAYER_LIMIT_X, PLAYER_LIMIT_X
      )
      this.player.position.z = THREE.MathUtils.clamp(
        this.player.position.z, -PLAYER_LIMIT_Z, PLAYER_LIMIT_Z
      )
    }

    this.sewerCooldown = Math.max(0, this.sewerCooldown - dt)
    this.updateSewerProximity()

    // Aim yaw always tracks mouse — body faces aim (twin-stick / shooter style)
    const dx = this.aimPoint.x - this.player.position.x
    const dz = this.aimPoint.z - this.player.position.z
    if (dx * dx + dz * dz > 0.04) {
      this.aimYaw = Math.atan2(dx, dz)
    }

    const speed = this.velocity.length()
    const moving = speed > MOVE_FACE_THRESHOLD
    const speedRatio = THREE.MathUtils.clamp(speed / SPRINT_SPEED, 0, 1)

    // Always face the mouse / aim point
    this.faceYaw = dampAngle(this.faceYaw, this.aimYaw, FACE_TURN, dt)
    this.player.rotation.y = this.faceYaw

    // Local velocity relative to facing: +Z = forward, -Z = backpedal
    const localVel = this.velocity.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0), -this.faceYaw
    )
    const forwardDot = localVel.z
    const backpedaling = moving && forwardDot < -0.08
    // Calm backpedal — cap speed while walking backward facing the mouse
    if (backpedaling) {
      const cap = WALK_SPEED * 0.62
      if (this.velocity.length() > cap) this.velocity.setLength(cap)
    }

    updatePlayerAnimations(
      {
        mixer: this.playerMixer,
        idleAction: this.playerIdleAction,
        walkAction: this.playerWalkAction,
        runAction: this.playerRunAction,
      },
      dt,
      moving,
      this.keys.sprint && hasInput && !backpedaling,
      speedRatio,
      backpedaling,
    )

    if (this.playerMixer) {
      // GLB clips drive locomotion (timeScale flipped when backpedaling)
    } else if (moving) {
      // Procedural walk: reverse swing when moving backward while facing mouse
      const cadence = backpedaling ? 5.5 + speedRatio * 3.5 : 7.5 + speedRatio * 6.5
      this.walkPhase += dt * cadence
      const amp = (backpedaling ? 0.32 : 0.48) * Math.min(speedRatio * 1.8, 1)
      const dir = backpedaling ? -1 : 1
      const swing = Math.sin(this.walkPhase) * amp * dir
      this.legL.rotation.x = swing
      this.legR.rotation.x = -swing
      // Keep gun arm steadier; free arm counters legs
      this.armL.rotation.x = -swing * (COMBAT_ENABLED ? 0.25 : 0.55)
      this.armR.rotation.x = swing * (COMBAT_ENABLED ? 0.12 : 0.55)
      this.playerBody.position.y =
        Math.abs(Math.sin(this.walkPhase * 2)) * (backpedaling ? 0.02 : 0.04) * Math.min(speedRatio * 1.6, 1)
    } else {
      this.legL.rotation.x = THREE.MathUtils.damp(this.legL.rotation.x, 0, 14, dt)
      this.legR.rotation.x = THREE.MathUtils.damp(this.legR.rotation.x, 0, 14, dt)
      this.armL.rotation.x = THREE.MathUtils.damp(this.armL.rotation.x, 0, 14, dt)
      this.armR.rotation.x = THREE.MathUtils.damp(this.armR.rotation.x, 0, 14, dt)
      this.playerBody.position.y = THREE.MathUtils.damp(this.playerBody.position.y, 0, 14, dt)
    }

    // Lean into strafe / accel relative to facing
    const targetLeanZ = THREE.MathUtils.clamp(-localVel.x * 0.03, -0.1, 0.1)
    const targetLeanX = THREE.MathUtils.clamp(localVel.z * 0.022, -0.08, 0.08)
    this.playerBody.rotation.z = THREE.MathUtils.damp(this.playerBody.rotation.z, targetLeanZ, 12, dt)
    this.playerBody.rotation.x = THREE.MathUtils.damp(this.playerBody.rotation.x, targetLeanX, 12, dt)

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

  private updateSewerProximity() {
    if (!this.playing || this.inSewer) {
      this.sewerPromptEl?.classList.add('hidden')
      return
    }
    const dx = this.player.position.x - SEWER_ENTRANCE_X
    const dz = this.player.position.z - SEWER_ENTRANCE_Z
    const dist = Math.hypot(dx, dz)
    const near = dist < SEWER_ENTER_RADIUS + 2.2
    this.sewerPromptEl?.classList.toggle('hidden', !near)
    if (dist < SEWER_ENTER_RADIUS && this.sewerCooldown <= 0) {
      this.enterSewer()
    }
  }

  private enterSewer() {
    if (this.inSewer || !this.sewerTunnel) return
    this.inSewer = true
    this.sewerCooldown = 1.2
    this.velocity.set(0, 0, 0)
    this.surfaceReturnPos.set(SEWER_ENTRANCE_X + 0.2, 0, SEWER_ENTRANCE_Z + 3.4)
    this.player.position.copy(SEWER_SPAWN)
    this.faceYaw = Math.PI / 2
    this.player.rotation.y = this.faceYaw
    this.camFocus.copy(this.player.position)

    for (const obj of this.surfaceObjects) obj.visible = false
    for (const light of this.surfaceLights) light.visible = false
    this.sewerTunnel.visible = true

    if (this.scene.background instanceof THREE.Color) this.savedBg.copy(this.scene.background)
    this.scene.background = new THREE.Color(0x0a1210)
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.savedFogColor.copy(this.scene.fog.color)
      this.savedFogDensity = this.scene.fog.density
      this.scene.fog.color.set(0x0c1a14)
      this.scene.fog.density = 0.028
    }

    document.body.classList.add('sewer-mode')
    this.exitSewerBtn?.classList.remove('hidden')
    this.sewerPromptEl?.classList.add('hidden')
    this.conceptPanelEl?.classList.add('hidden')
    this.hintEl.textContent = 'Sewer tunnels · WASD lopen · Exit sewer via knop bovenin'
    this.hintEl.classList.remove('hidden')
  }

  private exitSewer() {
    if (!this.inSewer) return
    this.inSewer = false
    this.sewerCooldown = 1.5
    this.velocity.set(0, 0, 0)
    this.player.position.copy(this.surfaceReturnPos)
    this.faceYaw = 0
    this.player.rotation.y = this.faceYaw
    this.camFocus.copy(this.player.position)

    if (this.sewerTunnel) this.sewerTunnel.visible = false
    for (const obj of this.surfaceObjects) obj.visible = true
    for (const light of this.surfaceLights) light.visible = true
    // Player must stay visible
    this.player.visible = true

    this.scene.background = this.savedBg.clone()
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.savedFogColor)
      this.scene.fog.density = this.savedFogDensity
    }

    document.body.classList.remove('sewer-mode')
    this.exitSewerBtn?.classList.add('hidden')
    this.conceptPanelEl?.classList.remove('hidden')
    this.hintEl.innerHTML =
      '<b>WASD</b> lopen · <b>Shift</b> sprint · <b>Muis</b> mikken · <b>LMB</b> schieten'
  }

  private updateCamera(dt: number) {
    if (!this.playing) {
      this.menuCamAngle += dt * 0.1
      const orbit = 10
      this.camFocus.set(
        Math.sin(this.menuCamAngle) * orbit,
        0,
        Math.cos(this.menuCamAngle) * orbit,
      )
      const pull = 1.22
      this.camera.position.set(
        this.camFocus.x + ISO_CAM_OFFSET.x * pull,
        ISO_CAM_OFFSET.y * pull,
        this.camFocus.z + ISO_CAM_OFFSET.z * pull,
      )
      this.camera.lookAt(0, 1.4, 0)
      return
    }

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
    // Regen alleen als zichtbaar (nacht/regen-modus)
    if (this.rain.visible) {
      const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute
      const spread = CITY_HALF
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
    }

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

    updateAmbience(this.ambience, dt, elapsed)
  }

  // ── Hoofdloop ───────────────────────────────────────────────────────────

  private animate = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const elapsed = this.clock.elapsedTime
    this.updatePlayer(dt)
    this.updateCamera(dt)
    if (COMBAT_ENABLED) {
      this.updateShooting(dt)
      this.updateEnemies(dt)
    }
    this.updateAtmosphere(dt, elapsed)
    this.composer.render()
    requestAnimationFrame(this.animate)
  }
}
