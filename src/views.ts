import * as THREE from "three"
import * as Maps from "./maps"
import * as Sim from "./sim"

const Palette = {
  light: new THREE.Color(0xffffffff),
  dark: new THREE.Color(0xff000000),
  primary: new THREE.Color(0xff4040ff),
  secondary: new THREE.Color(0xffff0000),
}

const S = {
  bulletLength: 0.3, // m
  bulletThickness: 0.1, // m
  captureAnimationPeriod: 0.5, // s
}

function playerColor(player: number): THREE.Color {
  switch (player) {
    case 0:
      return Palette.primary
    case 1:
      return Palette.secondary
    default:
      return Palette.light
  }
}

interface View {
  update(dt: number): void
}

const hash2 = `
float hash2(float x, float y) {
    return mod((47.0 * x + 97.0 * y + 3.0 * x*y) / 11.0, 1.0);
}
`

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
attribute float fadeOut;

varying vec2 vUv;
varying float vFrame;
varying float vPlayer;
varying float vFadeOut;

void main() {
    vUv = uv;
    vFrame = frame;
    vPlayer = player;
    vFadeOut = fadeOut;
    vec2 p = vec2(
        side * position.x * cos(angle) - position.y * sin(angle),
        side * position.x * sin(angle) + position.y * cos(angle)
    ) + offset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1, 1);
}
`
const critsFragmentShader = `
precision highp float;

${hash2}

uniform sampler2D tex;
uniform int nFrames;
uniform vec3 playerColors[3];
varying vec2 vUv;
varying float vFrame;
varying float vPlayer;
varying float vFadeOut;

void main() {
    vec3 tint =
        (vPlayer == 0.0) ? playerColors[0] :
        (vPlayer == 1.0) ? playerColors[1] :
        playerColors[2];
    float u = (vUv[0] + floor(vFrame)) / float(nFrames);
    bool visible = (vFadeOut == 0.0) || hash2(gl_FragCoord.x, gl_FragCoord.y) > vFadeOut;
    gl_FragColor = vec4(tint, float(visible)) * texture2D(tex, vec2(u, vUv[1]));
}
`

export class CritsView implements View {
  private geometry: THREE.InstancedBufferGeometry
  private nFrames: number

  constructor(
    private crits: Sim.Crits,
    scene: THREE.Scene,
    texture: THREE.Texture
  ) {
    this.nFrames = 4
    const material = new THREE.RawShaderMaterial({
      uniforms: {
        tex: { value: texture },
        nFrames: { value: this.nFrames },
        playerColors: {
          value: [playerColor(0), playerColor(1), playerColor(2)],
        },
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
    const R = Sim.S.radius
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([0, R, /**/ R, R, /**/ 0, -R, /**/ R, -R]),
        2
      )
    )
    // Set bounding sphere to avoid an error with 2D position
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 1),
      R
    )

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
    const instances = 2 * Sim.S.maxCritters
    Object.entries({
      side: new Float32Array(instances * 1).map((_, i) =>
        i % 2 === 0 ? 1 : -1
      ),
      offset: new Float32Array(instances * 2),
      angle: new Float32Array(instances * 1),
      frame: new Float32Array(instances * 1),
      player: new Float32Array(instances * 1),
      fadeOut: new Float32Array(instances * 1),
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
    const fadeOut = this.geometry.getAttribute("fadeOut")
    let index = 0
    this.crits.forEachIndex((i) => {
      offset.array.set(this.crits.position[i], 2 * index)
      offset.array.set(this.crits.position[i], 2 * index + 2)
      angle.array[index] = angle.array[index + 1] = -this.crits.angle[i]
      if (this.crits.speed[i] || this.crits.angularVelocity[i]) {
        const animationRate = 3
        frame.array[index] =
          (frame.array[index] + dt * animationRate * this.nFrames) %
          this.nFrames
        frame.array[index + 1] =
          (frame.array[index + 1] + dt * animationRate * this.nFrames) %
          this.nFrames
      }
      player.array[index] = player.array[index + 1] = this.crits.player[i]
      fadeOut.array[index] = fadeOut.array[index + 1] =
        this.crits.health[i] > 0
          ? 0
          : this.crits.spawnTimer[i] > 0
          ? 1 - this.crits.spawnTimer[i] / Sim.S.critterSpawnTime
          : this.crits.deathTimer[i] / Sim.S.critterDeathTime
      index += 2
    }, /*includeAnimating=*/ true)
    this.geometry.instanceCount = index
    offset.needsUpdate = true
    angle.needsUpdate = true
    frame.needsUpdate = true
    player.needsUpdate = true
    fadeOut.needsUpdate = true
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

uniform vec3 color;

void main() {
    float fx = gl_FragCoord.x;
    float fy = gl_FragCoord.y;
    // A pretty rubbish hash!
    float a = float(mod(
      (47.0 *fx + 29.0 *fx*fx + 97.0 *fy + 53.0 * fy*fy + 67.0 *fx*fy) / 22.0,
      1.0) < 0.5);
    gl_FragColor = vec4(color, a);
}
`

export class BulletsView implements View {
  private geometry: THREE.InstancedBufferGeometry

  constructor(
    private bullets: Sim.Bullets,
    scene: THREE.Scene,
    isHeal: boolean
  ) {
    const material = new THREE.RawShaderMaterial({
      uniforms: {
        color: {
          value: new THREE.Color(isHeal ? Palette.primary : Palette.secondary),
        },
      },
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
      new THREE.Vector3(0, 0, 0.5),
      Math.max(DX, DY)
    )

    // Instance data
    const instances = Sim.S.maxBullets
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
    let index = 0
    this.bullets.forEachIndex((i) => {
      offset.array.set(this.bullets.position[i], 2 * index)
      const velocity = this.bullets.velocity[i]
      angle.array[index] = -Math.atan2(velocity[0], velocity[1])
      index++
    })
    this.geometry.instanceCount = index
    offset.needsUpdate = true
    angle.needsUpdate = true
  }
}

///////////////////////////////////////////////////////////////////////////////
// Bases

const basesVertexShader = `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
}
`
const basesFragmentShader = `
precision highp float;

${hash2}

uniform float dying;
uniform vec3 color;
uniform sampler2D tex;
varying vec2 vUv;

void main() {
    bool visible = (dying == 0.0) || hash2(gl_FragCoord.x, gl_FragCoord.y) > dying;
    gl_FragColor = vec4(color, float(visible)) * texture2D(tex, vUv);
}
`

export class BasesView implements View {
  materials: THREE.ShaderMaterial[] = []
  flashTau: number[] = []

  constructor(
    private bases: Sim.Bases,
    scene: THREE.Scene,
    playerBaseTexture: THREE.Texture,
    neutralBaseTexture: THREE.Texture
  ) {
    for (let i = 0; i < bases.length; i++) {
      const material = new THREE.RawShaderMaterial({
        uniforms: {
          color: { value: playerColor(i) },
          dying: { value: 0 },
          tex: {
            value: Sim.Bases.isNeutralBase(i)
              ? neutralBaseTexture
              : playerBaseTexture,
          },
        },
        vertexShader: basesVertexShader,
        fragmentShader: basesFragmentShader,
        transparent: true,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
      mesh.position.set(bases.position[i][0], bases.position[i][1], 1)
      scene.add(mesh)
      this.materials.push(material)
      this.flashTau.push(0)
    }
  }

  update(dt: number): void {
    this.bases.forEachIndex((i) => {
      const baseColor = playerColor(this.bases.owner[i])
      const uColor = this.materials[i].uniforms.color
      if (this.bases.health[i] === 0) {
        // Exploding
        this.materials[i].uniforms.dying.value =
          this.bases.deathTimer[i] / Sim.S.baseDeathTime
        uColor.value = baseColor
      } else {
        // Possibly flashing
        const alpha = Sim.Bases.isNeutralBase(i)
          ? this.bases.captureProgress[i] / Sim.S.captureTime
          : 1 - this.bases.health[i] / Sim.S.baseHealth
        const flashColor = Sim.Bases.isNeutralBase(i)
          ? playerColor(this.bases.capturePlayer[i])
          : playerColor(1 - this.bases.owner[i])

        if (alpha === 0) {
          this.flashTau[i] = 0
          uColor.value = baseColor
        } else {
          const [minPeriod, maxPeriod] = [1 / 16, 1.0]
          const period = maxPeriod + Math.sqrt(alpha) * (minPeriod - maxPeriod)
          this.flashTau[i] = (this.flashTau[i] + dt) % period
          uColor.value =
            this.flashTau[i] < 0.5 * period ? baseColor : flashColor
        }
      }
    }, /*includeDead=*/ true)
  }
}

///////////////////////////////////////////////////////////////////////////////
// Map

export class MapView implements View {
  constructor(map: Maps.Map, scene: THREE.Scene) {
    for (let i = 0; i < map.tiles.length; i++) {
      const x = i % map.width
      const y = Math.floor(i / map.width)
      const geometry = new THREE.PlaneGeometry(1, 1)
      const material = new THREE.MeshBasicMaterial({
        color: (() => {
          switch (map.tiles[i]) {
            case Maps.Tile.Water:
              return Palette.primary
            case Maps.Tile.Land:
            case Maps.Tile.Base:
              return Palette.light
          }
        })(),
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x + 0.5, y + 0.5, 0)
      scene.add(mesh)
    }
  }
  update(dt: number): void {
    // Nothing to do
  }
}
