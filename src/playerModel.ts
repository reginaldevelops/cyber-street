import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { PlayerRig } from './playerCharacter.js'

const HITEM_MODEL_URL = '/models/Hitem3d-1785189324041.glb'
const TARGET_HEIGHT = 1.78

const _box = new THREE.Box3()

function prepareMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true
  mesh.receiveShadow = true
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const mat of mats) {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.envMapIntensity = 0.85
      if (mat.emissiveIntensity > 0) {
        mat.emissiveIntensity *= 1.15
      }
    }
  }
}

/** Load Hitem3D GLB and fit for isometric plaza player (~1.78m, feet on ground). */
export function loadHitemPlayer(): Promise<PlayerRig> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.load(
      HITEM_MODEL_URL,
      (gltf) => {
        const model = gltf.scene
        model.name = 'hitem-player'

        _box.setFromObject(model)
        const size = _box.getSize(new THREE.Vector3())
        const scale = TARGET_HEIGHT / Math.max(size.y, 0.001)
        model.scale.setScalar(scale)
        model.updateMatrixWorld(true)

        _box.setFromObject(model)
        model.position.y -= _box.min.y

        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) prepareMesh(obj)
        })

        const root = new THREE.Group()
        root.name = 'player-root'

        const body = new THREE.Group()
        body.name = 'player-body'
        body.add(model)

        const legL = new THREE.Group()
        const legR = new THREE.Group()
        body.add(legL, legR)

        // Hidden gun rig — keeps combat code working if re-enabled
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

        root.add(body)
        resolve({ root, body, legL, legR, gun, gunHolder, muzzle, muzzleLight, visorMat })
      },
      undefined,
      reject,
    )
  })
}
