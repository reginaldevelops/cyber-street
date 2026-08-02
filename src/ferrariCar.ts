import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { DINER_SIZE, DINER_X, DINER_Z } from './plazaDiner.js'

const FERRARI_URL = '/models/ferrari.glb'
const DRACO_PATH = '/draco/gltf/'

/** Target car length (~street-parked sports car). */
const TARGET_LENGTH = 4.35

let _draco: DRACOLoader | null = null

function dracoLoader() {
  if (!_draco) {
    _draco = new DRACOLoader()
    _draco.setDecoderPath(DRACO_PATH)
  }
  return _draco
}

function prepareCarMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const mat of mats) {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.envMapIntensity = 1.1
      mat.roughness = Math.min(mat.roughness ?? 0.4, 0.45)
      mat.metalness = Math.max(mat.metalness ?? 0.6, 0.55)
    }
  }
}

/**
 * Park the earth-online Ferrari in a diner EV stall (nose toward chargers).
 * Asset: https://github.com/duolahypercho/earth-online/blob/main/public/assets/ferrari.glb
 */
export async function loadParkedFerrari(
  scene: THREE.Scene,
  colliders?: THREE.Mesh[],
): Promise<THREE.Group | null> {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader())

  try {
    const gltf = await loader.loadAsync(FERRARI_URL)
    const model = gltf.scene
    model.name = 'ferrari-glb'

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const length = Math.max(size.x, size.z)
    const scale = TARGET_LENGTH / Math.max(length, 0.001)
    model.scale.setScalar(scale)

    // Recompute after scale; sit tires on asphalt (~0.13 diner pad)
    box.setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.z -= center.z
    model.position.y -= box.min.y

    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) prepareCarMesh(obj)
    })

    const root = new THREE.Group()
    root.name = 'parked-ferrari'
    root.add(model)

    // Diner lot is at (DINER_X, DINER_Z); EV stall #1 (second from left), nose to chargers (−Z local)
    const half = DINER_SIZE / 2
    const buildD = 6.2
    const buildZ = -half + buildD / 2 + 0.55
    const parkZ0 = buildZ + buildD / 2 + 1.1
    const spotW = 2.4
    const spotCount = 4
    const spotsSpan = spotCount * spotW
    const stall = 1
    const localX = -spotsSpan / 2 + spotW / 2 + stall * spotW
    const localZ = parkZ0 + 1.85

    root.position.set(DINER_X + localX, 0.13, DINER_Z + localZ)
    // Model long axis is Z; face toward diner building (local −Z → world −Z with yaw 0)
    root.rotation.y = Math.PI

    if (colliders) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(TARGET_LENGTH * 0.42, 1.15, TARGET_LENGTH * 0.95),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      col.position.set(0, 0.58, 0)
      root.add(col)
      colliders.push(col)
    }

    scene.add(root)
    console.info('[city] parked Ferrari at diner EV stall')
    return root
  } catch (err) {
    console.error('Failed to load Ferrari GLB', err)
    return null
  }
}
