import * as THREE from "three"
import * as Maps from "./maps"
import * as Sim from "./sim"
import { Vec2 } from "./common"

const S = {
  // Palette
  light: new THREE.Color(0xeeeeee),
  dark: new THREE.Color(0x000000),
  primary: new THREE.Color(0x4090e8),
  secondary: new THREE.Color(0xf89080),

  // Params
  bulletLength: 0.3, // m
  bulletThickness: 0.15, // m
  critterSizeRatio: 1.3, // #
  selectionSizeRatio: 1.5, // #

  // Z Order
  zMap: 0.0,
  zSelection: 0.25,
  zBullets: 0.5,
  zBases: 0.75,
  zCritters: 1.0,
}

// Helpers

function playerColor(player: number): THREE.Color {
  switch (player) {
    case 0:
      return S.primary
    case 1:
      return S.secondary
    default:
      return S.light
  }
}

function bulletColor(isHeal: boolean): THREE.Color {
  return isHeal ? S.primary : S.secondary
}

interface View {
  update(dt: number): void
}

const hash2 = `
float hash2(float x, float y) {
    return mod((47.0 * x + 97.0 * y + 3.0 * x*y) / 11.0, 1.0);
}
`

// An InstancedBufferGeometry with "position" initialized to a 2D plane
class PlaneInstancedBufferGeometry extends THREE.InstancedBufferGeometry {
  constructor(size: Vec2, origin: Vec2, z: number) {
    super()
    const [dx, dy] = [size[0] / 2, size[1] / 2]
    const [ox, oy] = origin
    this.setIndex([0, 2, 1, 2, 3, 1])
    this.setAttribute(
      "position",
      new THREE.BufferAttribute(
        // prettier-ignore
        new Float32Array([
          ox - dx, oy + dy,
          ox + dx, oy + dy,
          ox - dx, oy - dy,
          ox + dx, oy - dy,
        ]),
        2
      )
    )
    // Set bounding sphere to avoid an error with 2D position
    this.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(ox, oy, z),
      Math.max(dx, dy)
    )
  }
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
attribute float fadeOut;
attribute float scale;

varying vec2 vUv;
varying float vFrame;
varying float vPlayer;
varying float vFadeOut;

void main() {
    vUv = uv;
    vFrame = frame;
    vPlayer = player;
    vFadeOut = fadeOut;
    vec2 p = scale * vec2(
        side * position.x * cos(angle) - position.y * sin(angle),
        side * position.x * sin(angle) + position.y * cos(angle)
    ) + offset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, ${S.zCritters}, 1);
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
    const R = S.critterSizeRatio * Sim.S.radius
    this.geometry = new PlaneInstancedBufferGeometry(
      [R, 2 * R],
      [R / 2, 0],
      S.zCritters
    )
    this.geometry.instanceCount = 0

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
      scale: new Float32Array(instances * 1).fill(1),
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
    const scale = this.geometry.getAttribute("scale")
    let index = 0
    this.crits.forEachIndex((i) => {
      offset.array.set(this.crits.position[i], 2 * index)
      offset.array.set(this.crits.position[i], 2 * index + 2)
      angle.array[index] = angle.array[index + 1] = -this.crits.angle[i]
      if (this.crits.speed[i] || this.crits.angularVelocity[i]) {
        const animationRate = 3
        frame.array[index] = frame.array[index + 1] =
          (frame.array[index] + dt * animationRate * this.nFrames) %
          this.nFrames
      }
      player.array[index] = player.array[index + 1] = this.crits.player[i]
      if (this.crits.health[i] > 0) {
        fadeOut.array[index] = fadeOut.array[index + 1] = 0
        scale.array[index] = scale.array[index + 1] = 1
      } else {
        if (this.crits.spawnTimer[i] > 0) {
          fadeOut.array[index] = fadeOut.array[index + 1] =
            1 - this.crits.spawnTimer[i] / Sim.S.critterSpawnTime
          scale.array[index] = scale.array[index + 1] = 1
        } else {
          fadeOut.array[index] = fadeOut.array[index + 1] =
            this.crits.deathTimer[i] / Sim.S.critterDeathTime
          scale.array[index] = scale.array[index + 1] =
            1 + this.crits.deathTimer[i] / Sim.S.critterDeathTime
        }
      }
      index += 2
    }, /*includeAnimating=*/ true)
    this.geometry.instanceCount = index
    offset.needsUpdate = true
    angle.needsUpdate = true
    frame.needsUpdate = true
    player.needsUpdate = true
    fadeOut.needsUpdate = true
    scale.needsUpdate = true
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
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, ${S.zBullets}, 1);
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
        color: { value: bulletColor(isHeal) },
      },
      vertexShader: bulletsVertexShader,
      fragmentShader: bulletsFragmentShader,
      transparent: true,
    })
    this.geometry = new PlaneInstancedBufferGeometry(
      [S.bulletThickness, S.bulletLength],
      [0, 0],
      S.zBullets
    )
    this.geometry.instanceCount = 0

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
uniform float dying;
attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
    vUv = uv;
    float scale = 1.0 + dying * (-2.5 + 6.0 * dying);
    gl_Position = projectionMatrix * modelViewMatrix
      * (vec4(scale, scale, 1, 1) * vec4(position, 1));
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
    bool visible = (dying == 0.0)
      || hash2(gl_FragCoord.x, gl_FragCoord.y) > dying*dying;
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
      mesh.position.set(bases.position[i][0], bases.position[i][1], S.zBases)
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

const mapVertexShader = `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec2 position;
attribute vec2 offset;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(position + offset, ${S.zMap}, 1);
}
`
const mapFragmentShader = `
precision highp float;

uniform vec3 colors[3];
uniform float thresholds[2];
uniform float params[5];      // [x, y, xy, xx, yy]

// Note: I bet this shader is expensive!
void main() {
    float x = gl_FragCoord.x;
    float y = gl_FragCoord.y;

    float hash = mod(
      mod(params[0] * x + params[1] * y, 1.0)
      + mod(params[2] * x*y, 1.0) + mod(params[3] * x*x, 1.0) + mod(params[4] * y*y, 1.0),
      1.0);

    vec3 color =
      float(hash < thresholds[0]) * colors[0]
      + float(thresholds[0] <= hash && hash < thresholds[1]) * colors[1]
      + float(thresholds[1] <= hash) * colors[2];
    gl_FragColor = vec4(color, 1);
}
`

export class MapView implements View {
  static createMaterial(
    colors: THREE.Color[],
    thresholds: number[],
    params: number[]
  ): THREE.ShaderMaterial {
    return new THREE.RawShaderMaterial({
      uniforms: {
        colors: { value: colors },
        thresholds: { value: thresholds },
        params: { value: params },
      },
      vertexShader: mapVertexShader,
      fragmentShader: mapFragmentShader,
      transparent: true,
    })
  }

  constructor(map: Maps.Map, scene: THREE.Scene) {
    const waterXY: Vec2[] = []
    const landXY: Vec2[] = []
    for (let i = 0; i < map.tiles.length; i++) {
      const x = (i % map.width) + 0.5
      const y = Math.floor(i / map.width) + 0.5
      ;(map.tiles[i] === Maps.Tile.Water ? waterXY : landXY).push([x, y])
    }

    function createTiles(xys: Vec2[], material: THREE.ShaderMaterial) {
      const geometry = new PlaneInstancedBufferGeometry([1, 1], [0, 0], S.zMap)
      geometry.instanceCount = xys.length
      const a = new Float32Array(xys.length * 2)
      for (let i = 0; i < xys.length; i++) {
        a.set(xys[i], 2 * i)
      }
      geometry.setAttribute("offset", new THREE.InstancedBufferAttribute(a, 2))
      scene.add(new THREE.Mesh(geometry, material))
    }
    createTiles(
      waterXY,
      MapView.createMaterial(
        [S.primary, S.dark, S.light],
        [0.85, 0.95, 1.0],
        [1 / 9, 1 / 19, 1 / 11, 1 / 3, 1 / 3]
      )
    )
    createTiles(
      landXY,
      MapView.createMaterial(
        [S.light, S.secondary, S.primary],
        [0.98, 0.99, 1.0],
        [1 / 2477, 1 / 3407, 1 / 17, 1 / 256, 1 / 256]
      )
    )
  }
  update(dt: number): void {
    // Nothing to do
  }
}

///////////////////////////////////////////////////////////////////////////////
// Selection

export class UserSelectionView implements View {
  private mesh: THREE.Mesh

  constructor(
    private players: Sim.Players,
    private crits: Sim.Crits,
    scene: THREE.Scene,
    texture: THREE.Texture
  ) {
    const size = S.selectionSizeRatio * 2 * Sim.S.radius
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: S.secondary,
        map: texture,
        transparent: true,
      })
    )
    this.mesh.visible = false
    scene.add(this.mesh)
  }

  update(dt: number): void {
    const idx = this.players.userSelection
    if (idx !== null && this.crits.id[idx] === this.players.userSelectionId) {
      const position = this.crits.position[idx]
      this.mesh.position.set(position[0], position[1], S.zSelection)
      this.mesh.visible = true
    } else {
      this.mesh.visible = false
    }
  }
}
