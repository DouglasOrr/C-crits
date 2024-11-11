import { Vec2, angleBetweenAngle, v2Floor } from "./common"
import * as Crasm from "./crasm"
import * as Maps from "./maps"

export const S = {
  dt: 1 / 200, // s
  radius: 0.4, // m
  speed: 4, // m/s
  waterSpeed: 0.4, // m/s
  rotationRate: 2, // rad/s
  destOffsetRadius: 1, // m
  maxCritters: 1000, // #
}

export class Crits {
  // Per-critter
  position: Vec2[] = []
  angle: number[] = []
  speed: number[] = []
  angularVelocity: number[] = []
  memory: Crasm.Memory[] = []
  // Common
  program: Crasm.Program = Crasm.emptyProgram()
  map: Maps.Map
  pathfinder: Maps.Pathfinder

  constructor(map: Maps.Map) {
    this.map = map
    this.pathfinder = new Maps.Pathfinder(map)
  }

  add(position: Vec2, angle: number) {
    this.position.push(position)
    this.angle.push(angle)
    this.speed.push(0)
    this.angularVelocity.push(0)
    this.memory.push({})
  }

  update(): void {
    this.forEachIndex((i) => {
      Crasm.run(this.program, this.memory[i])

      if (this.memory[i]["$dest"]) {
        const position = this.position[i]
        const pathDirection = this.pathfinder.direction(
          position,
          this.memory[i]["$dest"] as Vec2
        )
        if (pathDirection !== Maps.NoDirection) {
          const tileXY = v2Floor(position)
          const tile = this.map.tiles[tileXY[1] * this.map.width + tileXY[0]]
          this.speed[i] = tile == Maps.Tile.Water ? S.waterSpeed : S.speed

          const targetAngle = pathDirection * (Math.PI / 4)
          const delta = angleBetweenAngle(this.angle[i], targetAngle)
          if (Math.abs(delta) < S.dt * S.rotationRate) {
            // Finish rotation and move
            this.angularVelocity[i] = delta / S.dt
            this.angle[i] = targetAngle
            position[0] += Math.sin(this.angle[i]) * S.dt * this.speed[i]
            position[1] += Math.cos(this.angle[i]) * S.dt * this.speed[i]
          } else {
            // Rotate before moving
            this.angularVelocity[i] = Math.sign(delta) * S.rotationRate
            this.angle[i] += this.angularVelocity[i] * S.dt
          }
        } else {
          this.speed[i] = 0
          this.angularVelocity[i] = 0
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
