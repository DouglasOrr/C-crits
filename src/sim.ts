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
  baseHealth: 2500, // hp

  // Base
  spawnTime: 2, // s
  healRange: 3, // m
  healRadius: 0.3, // m
  healTime: 0.25, // s
  healing: 10, // hp
  captureRange: 3, // m
  captureTime: 7, // s
  captureMultiple: 4, // #
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
  direction: number[]
  owner: number[]
  health: number[]
  captureProgress: number[]
  capturePlayer: number[]
  spawnRecharge: number[]
  healRecharge: number[]

  constructor(private level: Maps.Level) {
    const n = level.map.basePosition.length
    this.position = level.map.basePosition.map((p) => v2Add(p, [0.5, 0.5]))
    this.direction = level.map.baseDirection.map((d) => (d * Math.PI) / 4)
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

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < this.owner.length; i++) {
      if (this.health[i] > 0) {
        fn(i)
      }
    }
  }

  static isNeutralBase(index: number): boolean {
    return index >= 2
  }

  explode(p: Vec2) {
    this.forEachIndex((i) => {
      if (
        !Bases.isNeutralBase(i) &&
        v2Equal(v2Floor(p), v2Floor(this.position[i]))
      ) {
        this.health[i] -= S.damage
      }
    })
  }

  spawnCritter(base: number, crits: Crits): void {
    const basePosition = this.position[base]
    const cosA = Math.cos(this.direction[base])
    const sinA = Math.sin(this.direction[base])

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
          if (crits.collide(position) === null) {
            crits.spawn(
              this.owner[base],
              position,
              Math.atan2(delta[0], delta[1])
            )
            return
          }
        }
      }
    }
  }

  // Update

  private respawn(base: number, crits: Crits): void {
    this.spawnRecharge[base] -= S.dt
    if (this.spawnRecharge[base] <= 0) {
      const owner = this.owner[base]
      const count = crits.player.reduce((sum, p) => sum + +(p === owner), 0)
      const allowedCount = this.owner.reduce(
        (sum, p, i) => sum + this.level.maxCritters[i] * +(p === owner),
        0
      )
      if (count < allowedCount) {
        this.spawnCritter(base, crits)
        this.spawnRecharge[base] = S.spawnTime
      }
    }
  }

  private fireHealBullets(
    base: number,
    crits: Crits,
    healBullets: Bullets
  ): void {
    this.healRecharge[base] -= S.dt
    if (this.healRecharge[base] <= 0) {
      // Choose the closest friendly critter that isn't 100% health
      let healTargetIndex = -1
      let healTargetDistance = Infinity
      crits.forEachIndex((i) => {
        if (
          crits.player[i] === this.owner[base] &&
          crits.health[i] < S.health
        ) {
          const d = distance(this.position[base], crits.position[i])
          if (d < Math.min(healTargetDistance, S.healRange)) {
            healTargetIndex = i
            healTargetDistance = d
          }
        }
      })
      if (healTargetIndex !== -1) {
        this.healRecharge[base] = S.healTime
        healBullets.spawn(this.position[base], crits.position[healTargetIndex])
      }
    }
  }

  private capture(base: number, crits: Crits): void {
    // Count nearby critters
    const counts = Array(this.length).fill(0)
    crits.forEachIndex((i) => {
      if (distance(crits.position[i], this.position[base]) < S.captureRange) {
        counts[crits.player[i]]++
      }
    })

    // Work out who (if anyone) is capturing
    const owner = this.owner[base]
    let capturingPlayer = owner
    if (
      counts[0] > counts[1] &&
      counts[0] >= S.captureMultiple * counts[owner]
    ) {
      capturingPlayer = 0
    } else if (
      counts[1] > counts[0] &&
      counts[1] >= S.captureMultiple * counts[owner]
    ) {
      capturingPlayer = 1
    }

    // Update the capture progress
    if (
      capturingPlayer === owner ||
      this.capturePlayer[base] !== capturingPlayer
    ) {
      // Decay the capture statistic
      this.captureProgress[base] = Math.max(
        this.captureProgress[base] - S.dt,
        0
      )
      if (this.captureProgress[base] === 0) {
        this.capturePlayer[base] = capturingPlayer
      }
    } else {
      // Increase the capture statistic
      this.captureProgress[base] += S.dt
      if (this.captureProgress[base] >= S.captureTime) {
        this.owner[base] = capturingPlayer
        this.captureProgress[base] = 0
        this.capturePlayer[base] = -1
      }
    }
  }

  update(crits: Crits, healBullets: Bullets): void {
    this.forEachIndex((i) => {
      this.respawn(i, crits)
      this.fireHealBullets(i, crits, healBullets)
      if (Bases.isNeutralBase(i)) {
        this.capture(i, crits)
      }
    })
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

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < this.program.length; i++) {
      fn(i)
    }
  }
}

class Memory {
  $dest: Vec2 | null = null
  $tgt: Vec2 | null = null
}

export class Crits {
  player: number[] = Array(S.maxCritters).fill(-1)
  position: Vec2[] = Array.from({ length: S.maxCritters }, () => [0, 0])
  speed: number[] = Array(S.maxCritters).fill(0)
  angle: number[] = Array(S.maxCritters).fill(0)
  angularVelocity: number[] = Array(S.maxCritters).fill(0)
  attackRecharge: number[] = Array(S.maxCritters).fill(0)
  health: number[] = Array(S.maxCritters).fill(0)
  memory: Memory[] = Array.from({ length: S.maxCritters }, () => new Memory())

  // Only selects living critters
  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < S.maxCritters; ++i) {
      if (this.player[i] !== -1) {
        fn(i)
      }
    }
  }

  // General

  spawn(player: number, position: Vec2, angle: number): void {
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

  explode(p: Vec2) {
    this.forEachIndex((i) => {
      if (distance(this.position[i], p) < S.explosionRadius) {
        this.health[i] -= S.damage
        if (this.health[i] <= 0) {
          this.player[i] = -1
        }
      }
    })
  }

  heal(p: Vec2): void {
    this.forEachIndex((i) => {
      if (distance(this.position[i], p) < S.healRadius) {
        this.health[i] = Math.min(this.health[i] + S.healing, S.health)
      }
    })
  }

  // Update

  // Returns [speed, angularVelocity]
  private planMove(
    i: number,
    dest: Vec2 | null,
    pathfinder: Maps.Pathfinder
  ): [number, number] {
    if (dest === null) {
      return [0, 0]
    }
    const position = this.position[i]
    const pathDirection = pathfinder.direction(position, dest)
    if (pathDirection === Maps.NoDirection) {
      return [0, 0]
    }
    // How fast can we move?
    const tileXY = v2Floor(position)
    const tile =
      pathfinder.map.tiles[tileXY[1] * pathfinder.map.width + tileXY[0]]
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

  private move(i: number, pathfinder: Maps.Pathfinder): void {
    const [speed, angularVelocity] = this.planMove(
      i,
      this.memory[i].$dest,
      pathfinder
    )

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

  private attack(i: number, bullets: Bullets): void {
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
        bullets.spawn(position, target)
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

  update(
    bullets: Bullets,
    players: Players,
    pathfinder: Maps.Pathfinder
  ): void {
    this.forEachIndex((i) => {
      this.attackRecharge[i] = Math.max(this.attackRecharge[i] - S.dt, 0)

      // Control
      const mem = this.memory[i]
      Crasm.run(players.program[this.player[i]], mem as unknown as Crasm.Memory)

      // Execution
      if (
        mem.$tgt !== null &&
        distance(this.position[i], mem.$tgt) < S.attackRange
      ) {
        this.attack(i, bullets)
      } else if (mem.$dest !== null) {
        this.move(i, pathfinder)
      } else {
        this.speed[i] = 0
        this.angularVelocity[i] = 0
      }
    })
  }
}

export class Sim {
  // Dynamic state
  crits: Crits = new Crits()
  players: Players
  bases: Bases
  bullets: Bullets = new Bullets()
  healBullets: Bullets = new Bullets()

  // Static state
  level: Maps.Level
  pathfinder: Maps.Pathfinder
  playerWin: boolean | null = null

  constructor(level: Maps.Level) {
    this.level = level
    this.pathfinder = new Maps.Pathfinder(level.map)
    this.players = new Players(level.initialCritters.length)
    this.bases = new Bases(level)
    for (const [player, count] of level.initialCritters.entries()) {
      for (let i = 0; i < count; ++i) {
        this.bases.spawnCritter(player, this.crits)
      }
    }
  }

  private updateWinner(): void {
    if (this.playerWin === null) {
      if (this.bases.health[1] <= 0) {
        this.playerWin = true
      } else if (this.bases.health[0] <= 0) {
        this.playerWin = false
      }
    }
  }

  update(): void {
    this.bullets.update((p: Vec2) => {
      this.bases.explode(p)
      this.crits.explode(p)
    })
    this.healBullets.update((p: Vec2) => this.crits.heal(p))
    this.crits.update(this.bullets, this.players, this.pathfinder)
    this.bases.update(this.crits, this.healBullets)
    this.updateWinner()
  }
}
