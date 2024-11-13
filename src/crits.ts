import {
  Vec2,
  angleBetweenAngle,
  v2Floor,
  v2Add,
  clamp,
  distance,
  v2Equal,
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
  explosionRadius: 0.6, // m
  health: 100, // hp
  damage: 10, // hp
  baseHealth: 1000, // hp
}

class Memory {
  $dest: Vec2 | null = null
  $tgt: Vec2 | null = null
}

export class Bullets {
  alive: boolean[] = Array(S.maxBullets).fill(false)
  position: Vec2[] = Array.from({ length: S.maxBullets }, () => [0, 0])
  velocity: Vec2[] = Array.from({ length: S.maxBullets }, () => [0, 0])
  target: Vec2[] = Array.from({ length: S.maxBullets }, () => [0, 0])

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < S.maxBullets; ++i) {
      if (this.alive[i]) {
        fn(i)
      }
    }
  }

  spawn(position: Vec2, target: Vec2): void {
    const i = this.alive.indexOf(false)
    if (i !== -1) {
      const dx = target[0] - position[0]
      const dy = target[1] - position[1]
      const length = Math.sqrt(dx * dx + dy * dy)
      this.alive[i] = true
      this.position[i][0] = position[0]
      this.position[i][1] = position[1]
      this.velocity[i][0] = S.bulletSpeed * (dx / length)
      this.velocity[i][1] = S.bulletSpeed * (dy / length)
      this.target[i][0] = target[0]
      this.target[i][1] = target[1]
    }
  }

  update(onExplosion: (a: Vec2) => void): void {
    this.forEachIndex((i) => {
      if (distance(this.position[i], this.target[i]) < S.bulletSpeed * S.dt) {
        onExplosion(this.target[i])
        this.alive[i] = false
      } else {
        this.position[i][0] += this.velocity[i][0] * S.dt
        this.position[i][1] += this.velocity[i][1] * S.dt
      }
    })
  }
}

export class Crits {
  // Per-critter
  player: number[] = Array(S.maxCritters).fill(-1)
  position: Vec2[] = Array.from({ length: S.maxCritters }, () => [0, 0])
  speed: number[] = Array(S.maxCritters).fill(0)
  angle: number[] = Array(S.maxCritters).fill(0)
  angularVelocity: number[] = Array(S.maxCritters).fill(0)
  attackRecharge: number[] = Array(S.maxCritters).fill(0)
  health: number[] = Array(S.maxCritters).fill(0)
  memory: Memory[] = Array.from({ length: S.maxCritters }, () => new Memory())

  // Common
  programs: Crasm.Program[]
  baseHealth: number[]
  map: Maps.Map
  pathfinder: Maps.Pathfinder
  bullets: Bullets = new Bullets()
  playerWin: boolean | null = null

  constructor(map: Maps.Map) {
    this.map = map
    this.pathfinder = new Maps.Pathfinder(map)
    this.programs = Array(this.map.basePosition.length).fill(
      Crasm.emptyProgram()
    )
    this.baseHealth = Array(this.map.basePosition.length).fill(S.baseHealth)
  }

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < S.maxCritters; ++i) {
      if (this.player[i] !== -1) {
        fn(i)
      }
    }
  }

  private add(player: number, position: Vec2, angle: number): void {
    const i = this.player.indexOf(-1)
    if (i !== -1) {
      this.player[i] = player
      this.position[i][0] = position[0]
      this.position[i][1] = position[1]
      this.speed[i] = 0
      this.angle[i] = angle
      this.angularVelocity[i] = 0
      this.attackRecharge[i] = 0
      this.health[i] = S.health
      this.memory[i] = new Memory()
    }
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
      if (this.player[i] !== -1 && i !== ignoreIndex) {
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

  private explode(p: Vec2) {
    const cell = v2Floor(p)
    for (let i = 0; i < this.map.basePosition.length; i++) {
      if (v2Equal(cell, this.map.basePosition[i])) {
        this.baseHealth[i] -= S.damage
        if (this.playerWin === null && this.baseHealth[i] <= 0) {
          this.playerWin = i ? true : false
        }
      }
    }
    this.forEachIndex((i) => {
      if (distance(this.position[i], p) < S.explosionRadius) {
        this.health[i] -= S.damage
        if (this.health[i] <= 0) {
          this.player[i] = -1
        }
      }
    })
  }

  update(): void {
    this.bullets.update((p: Vec2) => this.explode(p))

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
