import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/** Internal render is 1/PIXEL_SCALE of the screen, then upscaled. 1 = full res (mild look). */
export const PIXEL_SCALE = 1

/** Soft posterize — high levels keep color fidelity, low dither. */
export const PixelQuantizeShader = {
  name: 'PixelQuantizeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    levels: { value: 72.0 },
    dither: { value: 0.008 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float levels;
    uniform float dither;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float n = (hash(gl_FragCoord.xy) - 0.5) * dither;
      vec3 c = color.rgb + n;
      c = floor(c * levels + 0.5) / levels;
      gl_FragColor = vec4(c, color.a);
    }
  `,
}

export function createPixelQuantizePass() {
  return new ShaderPass(PixelQuantizeShader)
}

/** Snap texture filters to nearest for a chunkier look on signs/decals. */
export function applyNearestTextures(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (!mat || typeof mat !== 'object') continue
      const std = mat as THREE.MeshStandardMaterial
      for (const key of ['map', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'normalMap'] as const) {
        const tex = std[key] as THREE.Texture | null | undefined
        if (!tex) continue
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
        tex.generateMipmaps = false
        tex.needsUpdate = true
      }
    }
  })
}

/** Size renderer + composer for pixel scale; CSS stretches with nearest sampling. */
export function applyPixelResolution(
  renderer: THREE.WebGLRenderer,
  composer: { setSize: (w: number, h: number) => void },
  cssW: number,
  cssH: number,
  scale = PIXEL_SCALE,
) {
  const rw = Math.max(160, Math.floor(cssW / scale))
  const rh = Math.max(90, Math.floor(cssH / scale))
  renderer.setSize(rw, rh, false)
  composer.setSize(rw, rh)
  const canvas = renderer.domElement
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  canvas.style.imageRendering = 'auto'
}
