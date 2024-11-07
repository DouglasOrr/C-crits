import * as THREE from "three"
import * as Crits from "./crits"

const critsVertexShader = `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec3 position;
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

  constructor(private crits: Crits.Crits, scene: THREE.Scene) {
    const texture = new THREE.TextureLoader().load("textures/crit_a4.png")
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

    const g = new THREE.PlaneGeometry(Crits.S.radius, 2 * Crits.S.radius)
    g.translate(Crits.S.radius / 2, 0, 0)
    this.geometry.setIndex(g.index)
    this.geometry.setAttribute("position", g.getAttribute("position"))
    this.geometry.setAttribute("uv", g.getAttribute("uv"))
    g.dispose()

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
