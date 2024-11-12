import { Vec2, angleBetweenAngle, v2Floor, v2Add } from "./common"
import * as Crasm from "./crasm"
import * as Maps from "./maps"

export const S = {
  dt: 1 / 200, // s
  radius: 0.25, // m
  speed: 4, // m/s
  waterSpeed: 0.4, // m/s
  rotationRate: 2, // rad/s
  maxCritters: 1000, // #
}

export class Crits {
  // Per-critter
  player: number[] = []
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

  spawn(player: number): void {
    const base = v2Add(this.map.basePosition[player], [0.5, 0.5])
    const baseDirection = (this.map.baseDirection[player] * Math.PI) / 4
    const cosA = Math.cos(baseDirection)
    const sinA = Math.sin(baseDirection)

    for (let radius = 0.5 + S.radius; ; radius += 2 * S.radius) {
      for (let offset = 0; offset <= 4 * radius; offset += S.radius) {
        for (let sign = -1; sign <= 1; sign += 2) {
          const d0: Vec2 = [
            sign * Math.min(radius, offset, 4 * radius - offset),
            Math.max(-radius, Math.min(radius, 2 * radius - offset)),
          ]
          const delta: Vec2 = [
            d0[0] * cosA + d0[1] * sinA,
            d0[0] * -sinA + d0[1] * cosA,
          ]
          const position = v2Add(base, delta)
          if (!this.collide(position)) {
            this.add(player, position, Math.atan2(delta[0], delta[1]))
            return
          }
        }
      }
    }
  }

  private add(player: number, position: Vec2, angle: number): void {
    this.player.push(player)
    this.position.push(position)
    this.angle.push(angle)
    this.speed.push(0)
    this.angularVelocity.push(0)
    this.memory.push({})
  }

  collide(position: Vec2): boolean {
    // Exhaustive search for now
    for (let i = 0; i < this.position.length; ++i) {
      const dx = this.position[i][0] - position[0]
      const dy = this.position[i][1] - position[1]
      if (dx * dx + dy * dy < 4 * S.radius * S.radius) {
        return true
      }
    }
    return false
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
