import * as THREE from "three"
import * as Crits from "./crits"
import * as Maps from "./maps"

export const S = {
  bulletLength: 0.3, // m
  bulletThickness: 0.1, // m
  playerColors: [0xff4040ff, 0xffff0000],
}

///////////////////////////////////////////////////////////////////////////////
// Crits

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
attribute float player;

varying vec2 vUv;
varying float vFrame;
varying float vPlayer;

void main() {
    vUv = uv;
    vFrame = frame;
    vPlayer = player;
    vec2 p = vec2(
        side * position.x * cos(angle) - position.y * sin(angle),
        side * position.x * sin(angle) + position.y * cos(angle)
    ) + offset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1, 1);
}
`
const critsFragmentShader = `
precision highp float;

uniform sampler2D tex;
uniform int nFrames;
varying vec2 vUv;
varying float vFrame;
varying float vPlayer;

void main() {
    vec4 tint = (vPlayer == 0.0) ? vec4(0.2, 0.2, 1, 1) : vec4(1, 0, 0, 1);
    float u = (vUv[0] + floor(vFrame)) / float(nFrames);
    gl_FragColor = tint * texture2D(tex, vec2(u, vUv[1]));
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
      player: new Float32Array(instances * 1),
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
    const offset = this.geometry.getAttribute("offset")
    const angle = this.geometry.getAttribute("angle")
    const frame = this.geometry.getAttribute("frame")
    const player = this.geometry.getAttribute("player")
    let index = 0
    this.crits.forEachIndex((i) => {
      offset.array.set(this.crits.position[i], 2 * index)
      offset.array.set(this.crits.position[i], 2 * index + 2)
      angle.array[index] = -this.crits.angle[i]
      angle.array[index + 1] = -this.crits.angle[i]
      if (this.crits.speed[i] || this.crits.angularVelocity[i]) {
        const animationRate = 3
        frame.array[index] =
          (frame.array[index] + dt * animationRate * this.nFrames) %
          this.nFrames
        frame.array[index + 1] =
          (frame.array[index + 1] + dt * animationRate * this.nFrames) %
          this.nFrames
      }
      player.array[index] = this.crits.player[i]
      player.array[index + 1] = this.crits.player[i]
      index += 2
    })
    this.geometry.instanceCount = index
    offset.needsUpdate = true
    angle.needsUpdate = true
    frame.needsUpdate = true
    player.needsUpdate = true
  }
}

///////////////////////////////////////////////////////////////////////////////
// Bullets

const bulletsVertexShader = `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec2 position;
attribute vec2 offset;
attribute float angle;

void main() {
    vec2 p = vec2(
        position.x * cos(angle) - position.y * sin(angle),
        position.x * sin(angle) + position.y * cos(angle)
    ) + offset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.5, 1);
}
`
const bulletsFragmentShader = `
precision highp float;

void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
}
`

export class BulletsView {
  private geometry: THREE.InstancedBufferGeometry

  constructor(private bullets: Crits.Bullets, scene: THREE.Scene) {
    const material = new THREE.RawShaderMaterial({
      vertexShader: bulletsVertexShader,
      fragmentShader: bulletsFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    })
    this.geometry = new THREE.InstancedBufferGeometry()
    this.geometry.instanceCount = 0

    // Buffer data
    this.geometry.setIndex([0, 2, 1, 2, 3, 1])
    const DY = S.bulletLength / 2
    const DX = S.bulletThickness / 2
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-DX, DY, /**/ DX, DY, /**/ -DX, -DY, /**/ DX, -DY]),
        2
      )
    )
    // Set bounding sphere to avoid an error with 2D position
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      Math.max(DX, DY)
    )

    // Instance data
    const instances = Crits.S.maxBullets
    Object.entries({
      offset: new Float32Array(instances * 2),
      angle: new Float32Array(instances * 1),
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
    const offset = this.geometry.getAttribute("offset")
    const angle = this.geometry.getAttribute("angle")
    this.geometry.instanceCount = 0
    this.bullets.forEachIndex((i) => {
      const velocity = this.bullets.velocity[i]
      offset.array.set(this.bullets.position[i], 2 * i)
      angle.array[i] = -Math.atan2(velocity[0], velocity[1])
      this.geometry.instanceCount++
    })
    offset.needsUpdate = true
    angle.needsUpdate = true
  }
}

///////////////////////////////////////////////////////////////////////////////
// Map

export class MapView {
  constructor(map: Maps.Map, scene: THREE.Scene, baseTexture: THREE.Texture) {
    for (let i = 0; i < map.tiles.length; i++) {
      const x = i % map.width
      const y = Math.floor(i / map.width)
      const geometry = new THREE.PlaneGeometry(1, 1)
      const material = new THREE.MeshBasicMaterial({
        color: (() => {
          switch (map.tiles[i]) {
            case Maps.Tile.Water:
              return 0xff4040ff
            case Maps.Tile.Land:
            case Maps.Tile.Base:
              return 0xffa0a0a0
          }
        })(),
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x + 0.5, y + 0.5, 0)
      scene.add(mesh)
    }

    for (let i = 0; i < map.basePosition.length; i++) {
      const geometry = new THREE.PlaneGeometry(1, 1)
      const material = new THREE.MeshBasicMaterial({
        map: baseTexture,
        transparent: true,
        color: S.playerColors[i],
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(
        map.basePosition[i][0] + 0.5,
        map.basePosition[i][1] + 0.5,
        1
      )
      scene.add(mesh)
    }
  }
  update(dt: number): void {
    // Nothing to do
  }
}
