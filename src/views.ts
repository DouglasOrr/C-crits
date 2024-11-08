import * as THREE from "three"
import * as Crits from "./crits"
import * as Maps from "./maps"

const critsVertexShader = `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec2 position;
attribute vec2 uv;
attribute float side;
attribute vec2 offset;
attribute float angle;
attribute float frame;

varying vec2 vUv;
varying float vFrame;

void main() {
    vUv = uv;
    vFrame = frame;
    vec2 p = vec2(
        side * position.x * cos(angle) - position.y * sin(angle),
        side * position.x * sin(angle) + position.y * cos(angle)
    ) + offset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0, 1);
}
`
const critsFragmentShader = `
precision highp float;

uniform sampler2D tex;
uniform int nFrames;
varying vec2 vUv;
varying float vFrame;

void main() {
    float u = (vUv[0] + floor(vFrame)) / float(nFrames);
    gl_FragColor = texture2D(tex, vec2(u, vUv[1]));
}
`

export class CritsView {
  private geometry: THREE.InstancedBufferGeometry
  private nFrames: number

  constructor(
    private crits: Crits.Crits,
    scene: THREE.Scene,
    texture: THREE.Texture
  ) {
    this.nFrames = 4
    const material = new THREE.RawShaderMaterial({
      uniforms: {
        tex: { value: texture },
        nFrames: { value: this.nFrames },
      },
      vertexShader: critsVertexShader,
      fragmentShader: critsFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    })
    this.geometry = new THREE.InstancedBufferGeometry()
    this.geometry.instanceCount = 0

    // Buffer data
    this.geometry.setIndex([0, 2, 1, 2, 3, 1])
    const R = Crits.S.radius
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([0, R, /**/ R, R, /**/ 0, -R, /**/ R, -R]),
        2
      )
    )
    // Set bounding sphere to avoid an error with 2D position
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R)

    // Shrink the u-coordinate to avoid spritesheet artifacts
    const uMax = 1 - this.nFrames / texture.image.width
    this.geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array([0, 1, /**/ uMax, 1, /**/ 0, 0, /**/ uMax, 0]),
        2
      )
    )

    // Instance data
    const instances = 2 * Crits.S.maxCritters
    Object.entries({
      side: new Float32Array(instances * 1).map((_, i) =>
        i % 2 === 0 ? 1 : -1
      ),
      offset: new Float32Array(instances * 2),
      angle: new Float32Array(instances * 1),
      frame: new Float32Array(instances * 1),
    }).forEach(([name, a]) => {
      const attribute = new THREE.InstancedBufferAttribute(
        a,
        a.length / instances
      )
      attribute.setUsage(THREE.DynamicDrawUsage)
      this.geometry.setAttribute(name, attribute)
    })

    scene.add(new THREE.Mesh(this.geometry, material))
  }

  update(dt: number): void {
    this.geometry.instanceCount = 2 * this.crits.length
    const offset = this.geometry.getAttribute("offset")
    const angle = this.geometry.getAttribute("angle")
    const frame = this.geometry.getAttribute("frame")
    this.crits.forEachIndex((i) => {
      offset.array.set(this.crits.position[i], 4 * i)
      offset.array.set(this.crits.position[i], 4 * i + 2)
      angle.array[2 * i] = -this.crits.angle[i]
      angle.array[2 * i + 1] = -this.crits.angle[i]
      if (this.crits.speed[i] || this.crits.angularVelocity[i]) {
        const animationRate = 3
        frame.array[2 * i] =
          (frame.array[2 * i] + dt * animationRate * this.nFrames) %
          this.nFrames
        frame.array[2 * i + 1] =
          (frame.array[2 * i + 1] + dt * animationRate * this.nFrames) %
          this.nFrames
      }
    })
    offset.needsUpdate = true
    angle.needsUpdate = true
    frame.needsUpdate = true
  }
}

export class MapView {
  constructor(map: Maps.Map, scene: THREE.Scene) {
    for (let i = 0; i < map.tiles.length; i++) {
      const x = i % map.width
      const y = Math.floor(i / map.width)
      const geometry = new THREE.PlaneGeometry(map.scale, map.scale)
      const material = new THREE.MeshBasicMaterial({
        color: map.tiles[i] === Maps.Tile.Water ? 0xff0000ff : 0xff808080,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set((x + 0.5) * map.scale, (y + 0.5) * map.scale, 0)
      scene.add(mesh)
    }
  }
  update(dt: number): void {
    // Nothing to do
  }
}
