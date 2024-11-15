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
  bulletSpeed: 3, // m/s
  explosionRadius: 0.6, // m
  damage: 10, // hp
  health: 100, // hp
  baseHealth: 1000, // hp

  // Base
  spawnTime: 2, // s
  healRange: 3, // m
  healRadius: 0.3, // m
  healTime: 0.25, // s
  healing: 10, // hp
  captureRange: 2.5, // m
  captureTime: 7, // s
  captureMultiple: 4, // #
}

class Memory {
  $dest: Vec2 | null = null
  $tgt: Vec2 | null = null
}

// Bullets can be for damage or healing!
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

export class Bases {
  position: Vec2[]
  owner: number[]
  health: number[]
  captureProgress: number[]
  capturePlayer: number[]
  spawnRecharge: number[]
  healRecharge: number[]

  constructor(baseCoordinates: Vec2[]) {
    const n = baseCoordinates.length
    this.position = baseCoordinates.map((p) => v2Add(p, [0.5, 0.5]))
    this.owner = Array.from({ length: n }, (_, i) => i)
    this.health = Array(n).fill(S.baseHealth)
    this.captureProgress = Array(n).fill(0)
    this.capturePlayer = Array.from({ length: n }, (_, i) => i)
    this.spawnRecharge = Array(n).fill(0)
    this.healRecharge = Array(n).fill(0)
  }

  get length(): number {
    return this.owner.length
  }
}

export class Players {
  program: Crasm.Program[]

  constructor(n: number) {
    this.program = Array(n).fill(Crasm.emptyProgram())
  }

  get length(): number {
    return this.program.length
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

  // Other entities
  players: Players
  bases: Bases
  bullets: Bullets = new Bullets()
  healBullets: Bullets = new Bullets()

  // Common state
  level: Maps.Level
  pathfinder: Maps.Pathfinder
  playerWin: boolean | null = null

  constructor(level: Maps.Level) {
    this.level = level
    this.pathfinder = new Maps.Pathfinder(level.map)
    this.players = new Players(level.initialCritters.length)
    this.bases = new Bases(level.map.basePosition)
    for (const [player, count] of level.initialCritters.entries()) {
      for (let i = 0; i < count; ++i) {
        this.spawn(player, player)
      }
    }
  }

  // General

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < S.maxCritters; ++i) {
      if (this.player[i] !== -1) {
        fn(i)
      }
    }
  }

  forEachPlayer(fn: (index: number) => void): void {
    for (let i = 0; i < this.players.length; i++) {
      fn(i)
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

  private spawn(base: number, player: number): void {
    const basePosition = this.bases.position[base]
    const baseDirection = (this.level.map.baseDirection[base] * Math.PI) / 4
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
          const position = v2Add(basePosition, delta)
          if (this.collide(position) === null) {
            this.add(player, position, Math.atan2(delta[0], delta[1]))
            return
          }
        }
      }
    }
  }

  // Critters

  private collide(
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
    const tile =
      this.level.map.tiles[tileXY[1] * this.level.map.width + tileXY[0]]
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

    // Execute the move
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
    if (Math.abs(delta) < S.directionAttackTolerance) {
      this.angularVelocity[i] = 0
      this.angle[i] = targetAngle

      // If recharged, fire
      if (this.attackRecharge[i] === 0) {
        this.attackRecharge[i] = S.attackTime
        this.bullets.spawn(position, target)
      }
    } else {
      this.angularVelocity[i] = clamp(
        delta / S.dt,
        -S.rotationRate,
        S.rotationRate
      )
      this.angle[i] += this.angularVelocity[i] * S.dt
    }
  }

  // Particles

  private explode(p: Vec2) {
    this.forEachPlayer((i) => {
      // Only damage players 0 (player) and 1 (enemy)
      if (i <= 1 && v2Equal(v2Floor(p), this.level.map.basePosition[i])) {
        this.bases.health[i] -= S.damage
        if (this.playerWin === null && this.bases.healRecharge[i] <= 0) {
          this.playerWin = i ? true : false
        }
      }
    })
    this.forEachIndex((i) => {
      if (distance(this.position[i], p) < S.explosionRadius) {
        this.health[i] -= S.damage
        if (this.health[i] <= 0) {
          this.player[i] = -1
        }
      }
    })
  }

  private heal(p: Vec2): void {
    this.forEachIndex((i) => {
      if (distance(this.position[i], p) < S.healRadius) {
        this.health[i] = Math.min(this.health[i] + S.healing, S.health)
      }
    })
  }

  // Bases

  private respawn(base: number): void {
    this.bases.spawnRecharge[base] -= S.dt
    if (this.bases.spawnRecharge[base] <= 0) {
      const owner = this.bases.owner[base]
      const count = this.player.reduce((sum, p) => sum + +(p === owner), 0)
      const allowedCount = this.bases.owner.reduce(
        (sum, p, i) => sum + this.level.maxCritters[i] * +(p === owner),
        0
      )
      if (count < allowedCount) {
        this.spawn(base, owner)
        this.bases.spawnRecharge[base] = S.spawnTime
      }
    }
  }

  private fireHealBullets(base: number): void {
    this.bases.healRecharge[base] -= S.dt
    if (this.bases.healRecharge[base] <= 0) {
      const basePosition = v2Add(this.level.map.basePosition[base], [0.5, 0.5])
      // Choose the closest friendly critter that isn't 100% health
      const owner = this.bases.owner[base]
      let healTargetIndex = -1
      let healTargetDistance = Infinity
      this.forEachIndex((i) => {
        if (this.player[i] === owner && this.health[i] < S.health) {
          const d = distance(basePosition, this.position[i])
          if (d < Math.min(healTargetDistance, S.healRange)) {
            healTargetIndex = i
            healTargetDistance = d
          }
        }
      })
      if (healTargetIndex !== -1) {
        this.bases.healRecharge[base] = S.healTime
        this.healBullets.spawn(basePosition, this.position[healTargetIndex])
      }
    }
  }

  private capture(base: number): void {
    const counts = Array(this.bases.length).fill(0)
    const basePosition = this.level.map.basePosition[base]
    this.forEachIndex((i) => {
      if (distance(this.position[i], basePosition) < S.captureRange) {
        counts[this.player[i]]++
      }
    })
    // Work out who (if anyone) is capturing
    const owner = this.bases.owner[base]
    let capturingPlayer = owner
    if (
      counts[0] > counts[1] &&
      counts[0] > S.captureMultiple * counts[owner]
    ) {
      capturingPlayer = 0
    } else if (
      counts[1] > counts[0] &&
      counts[1] > S.captureMultiple * counts[owner]
    ) {
      capturingPlayer = 1
    }

    if (
      capturingPlayer === owner ||
      this.bases.capturePlayer[base] !== capturingPlayer
    ) {
      // Decay the capture statistic
      this.bases.captureProgress[base] = Math.max(
        this.bases.captureProgress[base] - S.dt,
        0
      )
      if (this.bases.captureProgress[base] === 0) {
        this.bases.capturePlayer[base] = capturingPlayer
      }
    } else {
      // Increase the capture statistic
      this.bases.captureProgress[base] += S.dt
      if (this.bases.captureProgress[base] >= S.captureTime) {
        this.bases.owner[base] = capturingPlayer
        this.bases.captureProgress[base] = 0
        this.bases.capturePlayer[base] = -1
      }
    }
  }

  // Top-level

  update(): void {
    // Update particles
    this.bullets.update((p: Vec2) => this.explode(p))
    this.healBullets.update((p: Vec2) => this.heal(p))

    // Update critters
    this.forEachIndex((i) => {
      this.attackRecharge[i] = Math.max(this.attackRecharge[i] - S.dt, 0)

      // Control
      const mem = this.memory[i]
      Crasm.run(
        this.players.program[this.player[i]],
        mem as unknown as Crasm.Memory
      )

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

    // Update bases
    this.forEachPlayer((i) => {
      this.respawn(i)
      this.fireHealBullets(i)
      if (2 <= i) {
        this.capture(i)
      }
    })
  }
}
