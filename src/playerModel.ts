import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { PlayerRig } from './playerCharacter.js'

/** Drop your Blender export here (rigged, anim optional). */
const RIGGED_MODEL_URL = '/models/hitem-player-rigged.glb'
const HITEM_MODEL_URL = '/models/Hitem3d-1785189324041.glb'
const LEGACY_PLAYER_URL = '/models/player.glb'
const TARGET_HEIGHT = 1.78

const _box = new THREE.Box3()

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

function fitModelToGround(model: THREE.Object3D) {
  _box.setFromObject(model)
  const size = _box.getSize(new THREE.Vector3())
  const scale = TARGET_HEIGHT / Math.max(size.y, 0.001)
  model.scale.setScalar(scale)
  model.updateMatrixWorld(true)
  _box.setFromObject(model)
  model.position.y -= _box.min.y
}

function setupAnimations(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  if (clips.length === 0) {
    return { mixer: undefined, idleAction: null, walkAction: null, runAction: null }
  }

  const mixer = new THREE.AnimationMixer(model)
  const idleClip = findClip(clips, 'idle', 'tpose')
  const walkClip = findClip(clips, 'walk', 'walking')
  const runClip = findClip(clips, 'run', 'sprint')

  const idleAction = idleClip ? mixer.clipAction(idleClip) : null
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null
  const runAction = runClip ? mixer.clipAction(runClip) : null

  if (idleAction) {
    idleAction.loop = THREE.LoopRepeat
    idleAction.play()
  } else if (walkAction) {
    walkAction.play()
  }

  return { mixer, idleAction, walkAction, runAction }
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

  const gun = new THREE.Group()
  gun.visible = false
  const gunHolder = new THREE.Group()
  gunHolder.visible = false
  gunHolder.add(gun)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 1.2, 0.4)
  gun.add(muzzle)
  const muzzleLight = new THREE.PointLight(0xff8833, 0, 7, 2)
  gun.add(muzzleLight)
  body.add(gunHolder)

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
      scene.traverse((o) => { if ((o as THREE.Bone).isBone) bones++ })
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

/** Crossfade locomotion clips. Negative timeScale = calm backpedal. */
export function updatePlayerAnimations(
  rig: Pick<PlayerRig, 'mixer' | 'idleAction' | 'walkAction' | 'runAction'>,
  dt: number,
  moving: boolean,
  sprint: boolean,
  speedRatio = 1,
  backpedaling = false,
) {
  if (rig.mixer) rig.mixer.update(dt)
  if (!rig.walkAction && !rig.idleAction) return

  const target = moving
    ? sprint && rig.runAction && !backpedaling
      ? rig.runAction
      : rig.walkAction ?? rig.idleAction
    : rig.idleAction ?? rig.walkAction

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
