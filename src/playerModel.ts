import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { PlayerRig } from './playerCharacter.js'

/** Drop your Blender export here (rigged, anim optional). */
const RIGGED_MODEL_URL = '/models/hitem-player-rigged.glb'
const HITEM_MODEL_URL = '/models/Hitem3d-1785189324041.glb'
const LEGACY_PLAYER_URL = '/models/player.glb'

const RUN_FRONT_URL = '/models/running_front.glb'
const RUN_BACK_URL = '/models/running_back.glb'
const RUN_LEFT_URL = '/models/running_left.glb'
const RUN_RIGHT_URL = '/models/running_right.glb'

const TARGET_HEIGHT = 1.78

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _bonePos = new THREE.Vector3()

function playerModelUrl(): string {
  const q = new URLSearchParams(window.location.search).get('player')
  if (q === 'legacy') return LEGACY_PLAYER_URL
  if (q === 'hitem') return HITEM_MODEL_URL
  if (q === 'rigged') return RIGGED_MODEL_URL
  return RIGGED_MODEL_URL
}

function prepareMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (mesh instanceof THREE.SkinnedMesh && mesh.skeleton) mesh.skeleton.pose()
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const mat of mats) {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.envMapIntensity = 0.85
      if (mat.emissiveIntensity > 0) mat.emissiveIntensity *= 1.15
    }
  }
}

function findClip(clips: THREE.AnimationClip[], ...names: string[]) {
  for (const name of names) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()))
    if (hit) return hit
  }
  return null
}

/** Prefer the last clip — Mixamo merges often put the directional run last. */
function pickDirectionalClip(clips: THREE.AnimationClip[], label: string): THREE.AnimationClip | null {
  if (clips.length === 0) return null
  const clip = clips[clips.length - 1].clone()
  clip.name = label
  return clip
}

function boneBoundingBox(model: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  let any = false
  model.updateMatrixWorld(true)
  model.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      any = true
      obj.getWorldPosition(_bonePos)
      box.expandByPoint(_bonePos)
    }
  })
  if (!any) box.setFromObject(model)
  return box
}

function fitModelToGround(model: THREE.Object3D) {
  _box.copy(boneBoundingBox(model))
  if (_box.isEmpty()) _box.setFromObject(model)
  _box.getSize(_size)
  const scale = TARGET_HEIGHT / Math.max(_size.y, 0.001)
  model.scale.multiplyScalar(scale)
  model.updateMatrixWorld(true)
  _box.copy(boneBoundingBox(model))
  if (_box.isEmpty()) _box.setFromObject(model)
  model.position.y -= _box.min.y
}

function setupAnimations(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  if (clips.length === 0) {
    return {
      mixer: undefined,
      idleAction: null,
      walkAction: null,
      runAction: null,
      frontAction: null,
      backAction: null,
      leftAction: null,
      rightAction: null,
    }
  }

  const mixer = new THREE.AnimationMixer(model)
  const idleClip = findClip(clips, 'idle', 'tpose')
  const walkClip = findClip(clips, 'walk', 'walking')
  const frontClip = findClip(clips, 'run-front', 'front')
  const backClip = findClip(clips, 'run-back', 'back')
  const leftClip = findClip(clips, 'run-left', 'left')
  const rightClip = findClip(clips, 'run-right', 'right')
  const runClip =
    frontClip ?? findClip(clips, 'run', 'sprint')

  const idleAction = idleClip ? mixer.clipAction(idleClip) : null
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null
  const runAction = runClip ? mixer.clipAction(runClip) : null

  const frontAction = frontClip ? mixer.clipAction(frontClip) : null
  const backAction = backClip ? mixer.clipAction(backClip) : null
  const leftAction = leftClip ? mixer.clipAction(leftClip) : null
  const rightAction = rightClip ? mixer.clipAction(rightClip) : null

  for (const action of [idleAction, walkAction, runAction, frontAction, backAction, leftAction, rightAction]) {
    if (!action) continue
    action.loop = THREE.LoopRepeat
    action.enabled = true
    action.setEffectiveWeight(0)
  }

  if (frontAction) {
    frontAction.play()
    frontAction.setEffectiveWeight(1)
  } else if (idleAction) {
    idleAction.play()
    idleAction.setEffectiveWeight(1)
  } else if (walkAction) {
    walkAction.play()
    walkAction.setEffectiveWeight(1)
  } else if (runAction) {
    runAction.play()
    runAction.setEffectiveWeight(1)
  }

  return {
    mixer,
    idleAction,
    walkAction,
    runAction,
    frontAction,
    backAction,
    leftAction,
    rightAction,
  }
}

function loadGltf(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve({ scene: gltf.scene as THREE.Group, animations: gltf.animations }),
      undefined,
      reject,
    )
  })
}

function findBone(model: THREE.Object3D, ...names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  const lower = names.map((n) => n.toLowerCase())
  model.traverse((obj) => {
    if (found) return
    const n = obj.name.toLowerCase()
    if (lower.some((want) => n === want || n.endsWith(want) || n.includes(want))) {
      found = obj
    }
  })
  return found
}

function attachGunToHand(body: THREE.Group, model: THREE.Object3D, gunHolder: THREE.Group) {
  const hand =
    findBone(model, 'mixamorigrighthand', 'righthand', 'hand_r', 'hand.r') ??
    findBone(model, 'mixamorigrightforearm', 'rightforearm')
  if (!hand) {
    body.add(gunHolder)
    gunHolder.position.set(0.28, 1.05, 0.22)
    gunHolder.rotation.set(-0.35, -0.1, 0.1)
    return
  }
  hand.add(gunHolder)
  gunHolder.position.set(0.02, 0.08, 0.12)
  gunHolder.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
  gunHolder.scale.setScalar(1)
}

function buildProceduralGun(): {
  gun: THREE.Group
  gunHolder: THREE.Group
  muzzle: THREE.Object3D
  muzzleLight: THREE.PointLight
} {
  const gun = new THREE.Group()
  gun.name = 'gadget'
  const metal = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    roughness: 0.3,
    metalness: 0.85,
    flatShading: true,
  })
  const neon = new THREE.MeshStandardMaterial({
    color: 0xff6a2a,
    emissive: 0xff6a2a,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.35,
    flatShading: true,
  })
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.28), metal)
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), metal)
  barrel.position.set(0, 0.02, 0.22)
  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), neon)
  glowStrip.position.set(0.06, 0.06, 0.12)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.02, 0.36)
  gun.add(receiver, barrel, glowStrip, muzzle)

  const gunHolder = new THREE.Group()
  gunHolder.visible = false
  gunHolder.add(gun)

  const muzzleLight = new THREE.PointLight(0xff8833, 0, 7, 2)
  muzzleLight.position.copy(muzzle.position)
  gun.add(muzzleLight)

  return { gun, gunHolder, muzzle, muzzleLight }
}

function buildRigFromScene(model: THREE.Object3D, animations: THREE.AnimationClip[]): PlayerRig {
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) prepareMesh(obj)
  })

  let hasSkeleton = false
  model.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh) hasSkeleton = true
  })

  const root = new THREE.Group()
  root.name = 'player-root'

  const body = new THREE.Group()
  body.name = 'player-body'
  body.add(model)

  const legL = new THREE.Group()
  const legR = new THREE.Group()
  const armL = new THREE.Group()
  const armR = new THREE.Group()
  body.add(legL, legR, armL, armR)

  const { gun, gunHolder, muzzle, muzzleLight } = buildProceduralGun()
  attachGunToHand(body, model, gunHolder)

  let visorMat = new THREE.MeshStandardMaterial({ color: 0x00f6ff, emissive: 0x00f6ff, emissiveIntensity: 1 })
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0.05) {
          visorMat = mat
        }
      }
    }
  })

  const anim = setupAnimations(model, animations)
  root.add(body)

  return {
    root,
    body,
    legL,
    legR,
    armL,
    armR,
    gun,
    gunHolder,
    muzzle,
    muzzleLight,
    visorMat,
    hasSkeleton,
    ...anim,
  }
}

/** Load Mixamo directional runner (front mesh + back/left/right clips). */
export async function loadDirectionalRunner(): Promise<PlayerRig> {
  const [front, back, left, right] = await Promise.all([
    loadGltf(RUN_FRONT_URL),
    loadGltf(RUN_BACK_URL),
    loadGltf(RUN_LEFT_URL),
    loadGltf(RUN_RIGHT_URL),
  ])

  const scene = front.scene
  scene.name = 'player-model'

  const clips: THREE.AnimationClip[] = []
  const frontClip = pickDirectionalClip(front.animations, 'run-front')
  const backClip = pickDirectionalClip(back.animations, 'run-back')
  const leftClip = pickDirectionalClip(left.animations, 'run-left')
  const rightClip = pickDirectionalClip(right.animations, 'run-right')
  if (frontClip) clips.push(frontClip)
  if (backClip) clips.push(backClip)
  if (leftClip) clips.push(leftClip)
  if (rightClip) clips.push(rightClip)

  // Pose with first frame so bone bbox is meaningful before fit
  if (frontClip) {
    const tmpMixer = new THREE.AnimationMixer(scene)
    const a = tmpMixer.clipAction(frontClip)
    a.play()
    tmpMixer.update(0.05)
    scene.updateMatrixWorld(true)
    tmpMixer.stopAllAction()
    tmpMixer.uncacheRoot(scene)
  }

  fitModelToGround(scene)

  let bones = 0
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones++
  })
  console.info('[player] directional runner loaded', {
    clips: clips.map((c) => c.name),
    bones,
  })

  return buildRigFromScene(scene, clips)
}

/** Load rigged GLB — works with or without animation clips. */
export async function loadHitemPlayer(): Promise<PlayerRig> {
  const primary = playerModelUrl()
  const fallbacks = [RIGGED_MODEL_URL, HITEM_MODEL_URL, LEGACY_PLAYER_URL].filter(
    (u, i, arr) => u === primary || arr.indexOf(u) === arr.lastIndexOf(u),
  )
  const urls = [primary, ...fallbacks.filter((u) => u !== primary)]

  let lastErr: unknown
  for (const url of urls) {
    try {
      const { scene, animations } = await loadGltf(url)
      scene.name = 'player-model'
      fitModelToGround(scene)
      let bones = 0
      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone) bones++
      })
      console.info(`[player] loaded ${url}`, {
        animations: animations.map((a) => a.name),
        bones,
      })
      return buildRigFromScene(scene, animations)
    } catch (err) {
      lastErr = err
      console.warn(`[player] failed ${url}`, err)
    }
  }
  throw lastErr ?? new Error('No player model could be loaded')
}

export type LocomotionDir = 'idle' | 'front' | 'back' | 'left' | 'right'

/** Pick run direction from local velocity (+Z forward, +X right). */
export function locomotionFromLocalVelocity(
  localVel: THREE.Vector3,
  moving: boolean,
  threshold = 0.08,
): LocomotionDir {
  if (!moving) return 'idle'
  const ax = Math.abs(localVel.x)
  const az = Math.abs(localVel.z)
  if (ax < threshold && az < threshold) return 'idle'
  if (az >= ax) return localVel.z >= 0 ? 'front' : 'back'
  return localVel.x >= 0 ? 'right' : 'left'
}

/** Crossfade locomotion clips. Supports directional Mixamo runs or idle/walk/run. */
export function updatePlayerAnimations(
  rig: Pick<
    PlayerRig,
    | 'mixer'
    | 'idleAction'
    | 'walkAction'
    | 'runAction'
    | 'frontAction'
    | 'backAction'
    | 'leftAction'
    | 'rightAction'
  >,
  dt: number,
  moving: boolean,
  sprint: boolean,
  speedRatio = 1,
  backpedaling = false,
  dir: LocomotionDir = 'idle',
) {
  if (rig.mixer) rig.mixer.update(dt)

  const hasDirectional = !!(rig.frontAction || rig.backAction || rig.leftAction || rig.rightAction)
  if (hasDirectional) {
    updateDirectionalAnimations(rig, dt, moving, speedRatio, dir)
    return
  }

  if (!rig.walkAction && !rig.idleAction) return

  const target = moving
    ? sprint && rig.runAction && !backpedaling
      ? rig.runAction
      : (rig.walkAction ?? rig.idleAction)
    : (rig.idleAction ?? rig.walkAction)

  if (!target) return

  const all = [rig.idleAction, rig.walkAction, rig.runAction].filter(Boolean) as THREE.AnimationAction[]
  for (const action of all) {
    if (action === target) {
      action.enabled = true
      let cadence =
        action === rig.runAction ? 1.1 + speedRatio * 0.15 : 0.85 + speedRatio * 0.45
      if (backpedaling) cadence = -(0.7 + speedRatio * 0.25)
      action.setEffectiveTimeScale(moving ? cadence : 1)
      action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), 1, 10, dt))
      if (!action.isRunning()) action.play()
    } else {
      action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), 0, 10, dt))
    }
  }
}

function updateDirectionalAnimations(
  rig: Pick<
    PlayerRig,
    'frontAction' | 'backAction' | 'leftAction' | 'rightAction' | 'idleAction'
  >,
  dt: number,
  moving: boolean,
  speedRatio: number,
  dir: LocomotionDir,
) {
  const byDir: Record<Exclude<LocomotionDir, 'idle'>, THREE.AnimationAction | null | undefined> = {
    front: rig.frontAction,
    back: rig.backAction,
    left: rig.leftAction,
    right: rig.rightAction,
  }

  let target: THREE.AnimationAction | null | undefined
  if (moving && dir !== 'idle') {
    target = byDir[dir] ?? rig.frontAction
  } else {
    // Hold front pose as idle (no dedicated idle clip)
    target = rig.frontAction ?? Object.values(byDir).find(Boolean)
  }

  if (!target) return

  const all = [
    rig.frontAction,
    rig.backAction,
    rig.leftAction,
    rig.rightAction,
    rig.idleAction,
  ].filter(Boolean) as THREE.AnimationAction[]

  const cadence = moving ? 0.95 + speedRatio * 0.35 : 0

  for (const action of all) {
    if (action === target) {
      action.enabled = true
      if (moving) {
        action.paused = false
        action.setEffectiveTimeScale(cadence)
      } else {
        // Freeze near a calm frame for idle
        action.paused = true
        action.time = 0
        action.setEffectiveTimeScale(0)
      }
      action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), 1, 12, dt))
      if (!action.isRunning()) action.play()
    } else {
      action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), 0, 12, dt))
    }
  }
}
