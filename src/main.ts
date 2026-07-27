import * as THREE from 'three'

const MOVE_SPEED = 7
const MOUSE_SENS = 0.0022
const CAM_DIST = 5.5
const CAM_HEIGHT = 2.2
const STREET_LENGTH = 72
const ROAD_WIDTH = 10

type Keys = Record<'w' | 'a' | 's' | 'd', boolean>

export class Game {
  private container: HTMLElement
  private hintEl: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200)
  private clock = new THREE.Clock()
  private player = new THREE.Group()
  private aimYaw = 0
  private pointerLocked = false
  private keys: Keys = { w: false, a: false, s: false, d: false }

  constructor(container: HTMLElement, hintEl: HTMLElement) {
    this.container = container
    this.hintEl = hintEl

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(this.renderer.domElement)

    this.buildWorld()
    this.buildPlayer()
    this.bindEvents()
    this.onResize()
    window.addEventListener('resize', () => this.onResize())
    this.clock.start()
    this.animate()
  }

  private buildWorld() {
    this.scene.background = new THREE.Color(0x06040f)
    this.scene.fog = new THREE.FogExp2(0x120820, 0.028)

    const hemi = new THREE.HemisphereLight(0x4466aa, 0x110008, 0.35)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0x8899ff, 0.45)
    moon.position.set(-12, 24, -8)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 80
    moon.shadow.camera.left = -30
    moon.shadow.camera.right = 30
    moon.shadow.camera.top = 30
    moon.shadow.camera.bottom = -30
    this.scene.add(moon)

    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, STREET_LENGTH)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x141018,
      roughness: 0.92,
      metalness: 0.08,
    })
    const road = new THREE.Mesh(roadGeo, roadMat)
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    this.scene.add(road)

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xff00aa })
    for (let z = -STREET_LENGTH / 2 + 2; z < STREET_LENGTH / 2; z += 4) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.8), lineMat)
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.02, z)
      this.scene.add(stripe)
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1424,
      roughness: 0.85,
      metalness: 0.15,
    })

    const halfRoad = ROAD_WIDTH / 2
    const buildingDepth = 6
    const count = 8
    for (let i = 0; i < count; i++) {
      const z = THREE.MathUtils.lerp(
        -STREET_LENGTH / 2 + 4,
        STREET_LENGTH / 2 - 4,
        i / (count - 1)
      )
      const h = 4 + ((i * 17) % 5) * 1.4
      this.addBuilding(-halfRoad - buildingDepth / 2, z, buildingDepth, h, 5.5, wallMat, 0x00ffff)
      this.addBuilding(halfRoad + buildingDepth / 2, z, buildingDepth, h, 5.5, wallMat, 0xff00aa)
    }

    const neonA = new THREE.PointLight(0x00ffff, 12, 18, 2)
    neonA.position.set(-halfRoad - 1, 3.5, -8)
    this.scene.add(neonA)

    const neonB = new THREE.PointLight(0xff00aa, 12, 18, 2)
    neonB.position.set(halfRoad + 1, 3.5, 6)
    this.scene.add(neonB)

    const rain = this.makeRain()
    this.scene.add(rain)
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

    const neonMat = new THREE.MeshStandardMaterial({
      color: neonColor,
      emissive: neonColor,
      emissiveIntensity: 2.2,
      roughness: 0.4,
      metalness: 0.2,
    })
    const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.25, 0.12), neonMat)
    const faceX = x > 0 ? -1 : 1
    sign.position.set(x + faceX * (width / 2 + 0.08), height * 0.65, z)
    this.scene.add(sign)
  }

  private makeRain() {
    const count = 900
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = THREE.MathUtils.randFloatSpread(ROAD_WIDTH + 14)
      positions[i * 3 + 1] = THREE.MathUtils.randFloat(2, 18)
      positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(STREET_LENGTH + 10)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    return new THREE.Points(geo, mat)
  }

  private buildPlayer() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a3548,
      roughness: 0.55,
      metalness: 0.35,
    })
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x004466,
      emissiveIntensity: 0.8,
      roughness: 0.35,
      metalness: 0.5,
    })

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 6, 12), bodyMat)
    torso.position.y = 1.05
    torso.castShadow = true

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), bodyMat)
    head.position.y = 1.75
    head.castShadow = true

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.18), accentMat)
    visor.position.set(0, 1.76, 0.14)

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.55), accentMat)
    gun.position.set(0.28, 1.15, 0.35)
    gun.rotation.y = -0.15

    this.player.add(torso, head, visor, gun)
    this.player.position.set(0, 0, 0)
    this.scene.add(this.player)
  }

  private bindEvents() {
    window.addEventListener('keydown', (e) => this.setKey(e.code, true))
    window.addEventListener('keyup', (e) => this.setKey(e.code, false))
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.pointerLocked) {
        this.renderer.domElement.requestPointerLock()
      }
    })
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement
      this.hintEl.classList.toggle('hidden', this.pointerLocked)
    })
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return
      this.aimYaw -= e.movementX * MOUSE_SENS
    })
  }

  private setKey(code: string, down: boolean) {
    if (code === 'KeyW') this.keys.w = down
    if (code === 'KeyA') this.keys.a = down
    if (code === 'KeyS') this.keys.s = down
    if (code === 'KeyD') this.keys.d = down
  }

  private onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private update(dt: number) {
    const forward = new THREE.Vector3(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw))
    const right = new THREE.Vector3(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw))

    const move = new THREE.Vector3()
    if (this.keys.w) move.add(forward)
    if (this.keys.s) move.sub(forward)
    if (this.keys.d) move.add(right)
    if (this.keys.a) move.sub(right)

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt)
      this.player.position.add(move)
    }

    const limitX = ROAD_WIDTH / 2 - 0.8
    const limitZ = STREET_LENGTH / 2 - 1.5
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -limitX, limitX)
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -limitZ, limitZ)

    this.player.rotation.y = this.aimYaw

    const camTarget = this.player.position.clone()
    camTarget.y += 1.2
    const camOffset = new THREE.Vector3(
      -Math.sin(this.aimYaw) * CAM_DIST,
      CAM_HEIGHT,
      -Math.cos(this.aimYaw) * CAM_DIST
    )
    this.camera.position.copy(camTarget).add(camOffset)
    this.camera.lookAt(camTarget.x, camTarget.y + 0.2, camTarget.z)
  }

  private animate = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.update(dt)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this.animate)
  }
}
