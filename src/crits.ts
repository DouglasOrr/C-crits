import {
  Vec2,
  distanceBetween,
  angleBetween,
  angleBetweenAngle,
  randn,
  v2Equal,
  v2Add,
} from "./common"
import * as Crasm from "./crasm"

export const S = {
  dt: 1 / 200, // s
  radius: 1.5, // m
  velocity: 20, // m/s
  rotationRate: 2, // rad/s
  destOffsetRadius: 5, // m
  maxCritters: 1000, // #
}

function sampleDisc(radius: number): Vec2 {
  // Sample from a 3-sphere and project onto a 2-ball
  const x = randn(), y = randn(), z = randn(), w = randn() // prettier-ignore
  const r = Math.hypot(x, y, z, w)
  return [(x / r) * radius, (y / r) * radius]
}

export class Crits {
  // Per-critter
  position: Vec2[] = []
  angle: number[] = []
  speed: number[] = []
  angularVelocity: number[] = []
  memory: Crasm.Memory[] = []
  // (randomness)
  lastDest: Vec2[] = []
  destOffset: Vec2[] = []
  // Common
  program: Crasm.Program = Crasm.emptyProgram()

  add(position: Vec2, angle: number) {
    this.position.push(position)
    this.angle.push(angle)
    this.speed.push(0)
    this.angularVelocity.push(0)
    this.memory.push({})
    this.lastDest.push(position)
    this.destOffset.push([0, 0])
  }

  update(): void {
    this.forEachIndex((i) => {
      Crasm.run(this.program, this.memory[i])

      if (this.memory[i]["$dest"]) {
        const trueDest = this.memory[i]["$dest"] as Vec2
        if (!v2Equal(this.lastDest[i], trueDest)) {
          this.lastDest[i] = trueDest
          this.destOffset[i] = sampleDisc(S.destOffsetRadius)
        }
        const dest = v2Add(trueDest, this.destOffset[i])
        const position = this.position[i]
        const targetDistance = distanceBetween(position, dest)
        const targetAngle = angleBetween(position, dest)
        const delta = angleBetweenAngle(this.angle[i], targetAngle)
        const maxRotation = S.dt * S.rotationRate
        const maxMovement = S.dt * S.velocity
        if (targetDistance < maxMovement) {
          position[0] = dest[0]
          position[1] = dest[1]
          this.speed[i] = targetDistance / S.dt
          this.angularVelocity[i] = 0
        } else if (Math.abs(delta) < maxRotation) {
          this.angle[i] = targetAngle
          position[0] += Math.sin(targetAngle) * maxMovement
          position[1] += Math.cos(targetAngle) * maxMovement
          this.speed[i] = S.velocity
          this.angularVelocity[i] = delta / S.dt
        } else {
          this.angle[i] += Math.sign(delta) * maxRotation
          this.speed[i] = 0
          this.angularVelocity[i] = S.rotationRate
        }
      }
    })
  }

  get length(): number {
    return this.position.length
  }

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < this.position.length; ++i) {
      fn(i)
    }
  }
}
