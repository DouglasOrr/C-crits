import {
  Vec2,
  angleBetweenAngle,
  v2Floor,
  v2Add,
  clamp,
  distance,
} from "./common"
import * as Crasm from "./crasm"
import * as Maps from "./maps"

export const S = {
  dt: 1 / 200, // s
  radius: 0.25, // m
  maxCritters: 1000, // #
  maxBullets: 1000, // #
  // Movement
  speed: 4, // m/s
  waterSpeed: 0.4, // m/s
  rotationRate: 3, // rad/s
  directionMoveTolerance: Math.PI / 4, // rad
  avoidTolerance: 1.5, // # (multiplier)
  // Attack
  attackTime: 0.5, // s
  attackRange: 2, // m
  directionAttackTolerance: Math.PI / 16, // rad
  bulletSpeed: 8, // m/s
}

class Memory {
  $dest: Vec2 | null = null
  $tgt: Vec2 | null = null
}

export class Bullets {
  position: Vec2[] = []
  velocity: Vec2[] = []
  target: Vec2[] = []

  get length(): number {
    return this.position.length
  }

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < this.position.length; ++i) {
      fn(i)
    }
  }

  spawn(position: Vec2, target: Vec2): void {
    if (this.position.length >= S.maxBullets) {
      return
    }
    const dx = target[0] - position[0]
    const dy = target[1] - position[1]
    const length = Math.sqrt(dx * dx + dy * dy)
    this.position.push([...position])
    this.velocity.push([
      S.bulletSpeed * (dx / length),
      S.bulletSpeed * (dy / length),
    ])
    this.target.push([...target])
  }

  update(): void {
    for (let i = 0; i < this.position.length; ) {
      if (distance(this.position[i], this.target[i]) < S.bulletSpeed * S.dt) {
        // TODO - explode & cause damage
        this.position.splice(i, 1)
        this.velocity.splice(i, 1)
        this.target.splice(i, 1)
      } else {
        this.position[i][0] += this.velocity[i][0] * S.dt
        this.position[i][1] += this.velocity[i][1] * S.dt
        ++i
      }
    }
  }
}

export class Crits {
  // Per-critter
  player: number[] = []
  position: Vec2[] = []
  speed: number[] = []
  angle: number[] = []
  angularVelocity: number[] = []
  attackRecharge: number[] = []
  memory: Memory[] = []

  // Common
  programs: Crasm.Program[]
  map: Maps.Map
  pathfinder: Maps.Pathfinder
  bullets: Bullets = new Bullets()

  constructor(map: Maps.Map) {
    this.map = map
    this.pathfinder = new Maps.Pathfinder(map)
    this.programs = Array(this.map.basePosition.length).fill(
      Crasm.emptyProgram()
    )
  }

  get length(): number {
    return this.position.length
  }

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < this.position.length; ++i) {
      fn(i)
    }
  }

  private add(player: number, position: Vec2, angle: number): void {
    if (this.length >= S.maxCritters) {
      return
    }
    this.player.push(player)
    this.position.push(position)
    this.speed.push(0)
    this.angle.push(angle)
    this.angularVelocity.push(0)
    this.attackRecharge.push(0)
    this.memory.push(new Memory())
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
          if (this.collide(position) === null) {
            this.add(player, position, Math.atan2(delta[0], delta[1]))
            return
          }
        }
      }
    }
  }

  collide(
    position: Vec2,
    ignoreIndex: number | undefined = undefined
  ): number | null {
    // Exhaustive search for now
    for (let i = 0; i < this.position.length; ++i) {
      if (i !== ignoreIndex) {
        const dx = this.position[i][0] - position[0]
        const dy = this.position[i][1] - position[1]
        if (dx * dx + dy * dy < 4 * S.radius * S.radius) {
          return i
        }
      }
    }
    return null
  }

  // Returns [speed, angularVelocity]
  private planMove(i: number, dest: Vec2 | null): [number, number] {
    if (dest === null) {
      return [0, 0]
    }
    const position = this.position[i]
    const pathDirection = this.pathfinder.direction(position, dest)
    if (pathDirection === Maps.NoDirection) {
      return [0, 0]
    }
    // How fast can we move?
    const tileXY = v2Floor(position)
    const tile = this.map.tiles[tileXY[1] * this.map.width + tileXY[0]]
    const moveSpeed = tile == Maps.Tile.Water ? S.waterSpeed : S.speed
    // Adjust the target angle based on local collisions
    let targetAngle = pathDirection * (Math.PI / 4)
    const pathCollision = this.collide(
      [
        position[0] + S.dt * moveSpeed * Math.sin(targetAngle),
        position[1] + S.dt * moveSpeed * Math.cos(targetAngle),
      ],
      i
    )
    if (pathCollision !== null) {
      const oPosition = this.position[pathCollision]
      const oAngle = Math.atan2(
        oPosition[0] - position[0],
        oPosition[1] - position[1]
      )
      const avoidAngle = Math.asin(
        clamp(S.radius / distance(position, oPosition), -1, 1)
      )
      targetAngle =
        oAngle +
        Math.sign(angleBetweenAngle(oAngle, targetAngle)) *
          Math.min(S.avoidTolerance * 2 * avoidAngle, Math.PI)
    }
    // Rotate & advance
    const angleToTarget = angleBetweenAngle(this.angle[i], targetAngle)
    const speed =
      moveSpeed * +(Math.abs(angleToTarget) < S.directionMoveTolerance)
    const angularVelocity = clamp(
      angleToTarget / S.dt,
      -S.rotationRate,
      S.rotationRate
    )
    return [speed, angularVelocity]
  }

  private move(i: number): void {
    const [speed, angularVelocity] = this.planMove(i, this.memory[i].$dest)
    this.angularVelocity[i] = angularVelocity
    this.angle[i] += angularVelocity * S.dt
    const position = this.position[i]
    const newPosition: Vec2 = [
      position[0] + S.dt * speed * Math.sin(this.angle[i]),
      position[1] + S.dt * speed * Math.cos(this.angle[i]),
    ]
    if (this.collide(newPosition, i) === null) {
      this.position[i] = newPosition
      this.speed[i] = speed
    } else {
      this.speed[i] = 0
    }
  }

  private attack(i: number): void {
    const position = this.position[i]
    const target = this.memory[i].$tgt!

    // Rotate to face the target
    this.speed[i] = 0
    const targetAngle = Math.atan2(
      target[0] - position[0],
      target[1] - position[1]
    )
    const delta = angleBetweenAngle(this.angle[i], targetAngle)
    this.angularVelocity[i] = clamp(
      delta / S.dt,
      -S.rotationRate,
      S.rotationRate
    )
    this.angle[i] += this.angularVelocity[i] * S.dt

    // If recharged, fire
    if (
      this.attackRecharge[i] === 0 &&
      Math.abs(delta) < S.directionAttackTolerance
    ) {
      this.attackRecharge[i] = S.attackTime
      this.bullets.spawn(position, target)
    }
  }

  update(): void {
    this.bullets.update()

    this.forEachIndex((i) => {
      this.attackRecharge[i] = Math.max(this.attackRecharge[i] - S.dt, 0)

      // Control
      const mem = this.memory[i]
      Crasm.run(this.programs[this.player[i]], mem as unknown as Crasm.Memory)

      // Execution
      if (
        mem.$tgt !== null &&
        distance(this.position[i], mem.$tgt) < S.attackRange
      ) {
        this.attack(i)
      } else if (mem.$dest !== null) {
        this.move(i)
      } else {
        this.speed[i] = 0
        this.angularVelocity[i] = 0
      }
    })
  }
}
