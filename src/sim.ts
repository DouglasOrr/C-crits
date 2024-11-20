import {
  Vec2,
  angleBetweenAngle,
  clamp,
  distance,
  isVec2,
  v2Add,
  v2Equal,
  v2Floor,
} from "./common"
import * as Crasm from "./crasm"
import * as Maps from "./maps"

export const S = {
  dt: 1 / 200, // s
  dtProgram: 1 / 10, // s
  radius: 0.25, // m
  maxCritters: 1000, // #
  maxBullets: 1000, // #
  maxRuntimeErrors: 10, // #
  cycleLimit: 100, // #

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

  // Neutral base
  captureRange: 3, // m
  captureTime: 7, // s
  captureMultiple: 4, // #

  // Animations
  critterSpawnTime: 0.5, // s
  critterDeathTime: 0.5, // s
  baseDeathTime: 4.0, // s
}

export enum Event {
  Attack,
  Heal,
  CritSpawn,
  CritDeath,
  BaseDeath,
  BaseCapture,
  ProgramLoad,
  ProgramError,
}
export type EventListener = (event: Event, data?: any) => void

export function listeners(...listeners: EventListener[]): EventListener {
  return (event: Event, data?: any) => {
    for (const listener of listeners) {
      listener(event, data)
    }
  }
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
  deathTimer: number[]
  captureProgress: number[]
  capturePlayer: number[]
  spawnRecharge: number[]
  healRecharge: number[]

  constructor(private level: Maps.Level, private listener: EventListener) {
    const n = level.map.basePosition.length
    this.position = level.map.basePosition.map((p) => v2Add(p, [0.5, 0.5]))
    this.direction = level.map.baseDirection.map((d) => (d * Math.PI) / 4)
    this.owner = Array.from({ length: n }, (_, i) => i)
    this.health = Array(n).fill(S.baseHealth)
    this.deathTimer = Array(n).fill(0)
    this.captureProgress = Array(n).fill(0)
    this.capturePlayer = Array.from({ length: n }, (_, i) => i)
    this.spawnRecharge = Array(n).fill(0)
    this.healRecharge = Array(n).fill(0)
  }

  get length(): number {
    return this.owner.length
  }

  forEachIndex(
    fn: (index: number) => void,
    includeDead: boolean = false
  ): void {
    for (let i = 0; i < this.owner.length; i++) {
      if (includeDead || this.health[i] > 0) {
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
        this.health[i] > 0 &&
        !Bases.isNeutralBase(i) &&
        v2Equal(v2Floor(p), v2Floor(this.position[i]))
      ) {
        this.health[i] = Math.max(this.health[i] - S.damage, 0)
        if (this.health[i] === 0) {
          this.listener(Event.BaseDeath)
        }
      }
    })
  }

  spawnCritter(base: number, crits: Crits, players: Players): void {
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
              Math.atan2(delta[0], delta[1]),
              players
            )
            return
          }
        }
      }
    }
  }

  // Update

  private respawn(base: number, crits: Crits, players: Players): void {
    this.spawnRecharge[base] -= S.dt
    if (this.spawnRecharge[base] <= 0) {
      const owner = this.owner[base]
      const count = crits.player.reduce((sum, p) => sum + +(p === owner), 0)
      const allowedCount = this.owner.reduce(
        (sum, p, i) => sum + this.level.maxCritters[i] * +(p === owner),
        0
      )
      if (count < allowedCount) {
        this.spawnCritter(base, crits, players)
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
        this.capturePlayer[base] = capturingPlayer
        this.listener(Event.BaseCapture)
      }
    }
  }

  die(base: number): void {
    if (this.health[base] === 0) {
      this.deathTimer[base] = Math.min(
        this.deathTimer[base] + S.dt,
        S.baseDeathTime
      )
    }
  }

  update(crits: Crits, healBullets: Bullets, players: Players): void {
    this.forEachIndex((i) => {
      this.respawn(i, crits, players)
      this.fireHealBullets(i, crits, healBullets)
      if (Bases.isNeutralBase(i)) {
        this.capture(i, crits)
      }
    })
    this.forEachIndex((i) => this.die(i), true)
  }
}

export class Players {
  nextId: number[]
  program: Crasm.Program[]
  errorsSinceLastLoad: number[]

  constructor(n: number, private listener: EventListener) {
    this.nextId = Array(n).fill(0)
    this.errorsSinceLastLoad = Array(n).fill(0)
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

  loadProgram(program: string): void {
    try {
      this.program[0] = Crasm.parse(program)
      this.listener(Event.ProgramLoad)
      this.errorsSinceLastLoad[0] = 0
    } catch (error) {
      if (error instanceof Crasm.ParseError) {
        this.listener(Event.ProgramError, error)
      } else {
        throw error
      }
    }
  }

  runtimeError(
    player: number,
    critId: number,
    message: string,
    line?: number
  ): void {
    if (this.errorsSinceLastLoad[player]++ < S.maxRuntimeErrors) {
      let prefix = player === 0 ? "" : `Player #${player} `
      if (line !== undefined) {
        prefix = `${prefix}L${line} `
      }
      console.error(`${prefix}Critter #${critId} runtime error - ${message}`)
    }
  }
}

class Memory {
  // Inputs
  $id: number = -1
  $pos: Vec2 = [0, 0]
  // Outputs
  $dest: Vec2 | null = null
  $tgt: Vec2 | null = null
  $state: string | null = null
}

// Crits indices "slots" have the following states:
//   player == -1                              : empty slot
//   player >= 0, health > 0                   : alive
//   player >= 0, health == 0, spawnTimer > 0  : spawning
//   player >= 0, health == 0, spawnTimer == 0 : dying
export class Crits {
  // Identity
  id: number[] = Array(S.maxCritters).fill(-1)
  player: number[] = Array(S.maxCritters).fill(-1)
  // State
  position: Vec2[] = Array.from({ length: S.maxCritters }, () => [0, 0])
  speed: number[] = Array(S.maxCritters).fill(0)
  angle: number[] = Array(S.maxCritters).fill(0)
  angularVelocity: number[] = Array(S.maxCritters).fill(0)
  attackRecharge: number[] = Array(S.maxCritters).fill(0)
  health: number[] = Array(S.maxCritters).fill(0)
  spawnTimer: number[] = Array(S.maxCritters).fill(0)
  deathTimer: number[] = Array(S.maxCritters).fill(0)
  // Control
  memory: Memory[] = Array.from({ length: S.maxCritters }, () => new Memory())
  destination: (Vec2 | null)[] = Array(S.maxCritters).fill(null)
  target: (Vec2 | null)[] = Array(S.maxCritters).fill(null)

  constructor(private listener: EventListener) {}

  // Only selects living critters
  forEachIndex(
    fn: (index: number) => void,
    includeAnimating: boolean = false
  ): void {
    for (let i = 0; i < S.maxCritters; ++i) {
      if (includeAnimating || this.health[i] > 0) {
        fn(i)
      }
    }
  }

  // Program

  programUpdate(players: Players, map: Maps.Map): void {
    this.forEachIndex((i) => {
      const mem = this.memory[i]

      // 1. Prepare the input state
      mem.$id = this.id[i]
      mem.$pos = [...this.position[i]]

      // 2. Run the user program
      try {
        Crasm.run(
          players.program[this.player[i]],
          mem as unknown as Crasm.Memory,
          S.cycleLimit,
          mem.$state
        )
      } catch (e) {
        if (e instanceof Crasm.RuntimeError) {
          players.runtimeError(this.player[i], this.id[i], e.message, e.line)
        } else {
          throw e
        }
      }

      // 3. Copy output memory to command state
      const readVec2 = (mem: Memory, key: keyof Memory): Vec2 | null => {
        const value = mem[key]
        if (value === null) {
          return null
        }
        if (!isVec2(value)) {
          players.runtimeError(
            this.player[i],
            this.id[i],
            `${key} should be null or x,y but got ${value}`
          )
          return null
        }
        if (!Maps.inBounds(value, map)) {
          players.runtimeError(
            this.player[i],
            this.id[i],
            `${key} should be within the map [0 <= x < ${map.width}, 0 <= y < ${map.height}] but got ${value}`
          )
          return null
        }
        return value
      }
      this.destination[i] = readVec2(mem, "$dest")
      this.target[i] = readVec2(mem, "$tgt")
    })
  }

  // General

  spawn(player: number, position: Vec2, angle: number, players: Players): void {
    const i = this.player.indexOf(-1)
    if (i !== -1) {
      this.id[i] = players.nextId[player]++
      this.player[i] = player
      this.position[i][0] = position[0]
      this.position[i][1] = position[1]
      this.speed[i] = 0
      this.angle[i] = angle
      this.angularVelocity[i] = 0
      this.attackRecharge[i] = 0
      this.health[i] = 0
      this.spawnTimer[i] = S.dt
      this.deathTimer[i] = 0
      this.memory[i] = new Memory()
      this.destination[i] = null
      this.target[i] = null
      this.listener(Event.CritSpawn)
    }
  }

  collide(
    position: Vec2,
    ignoreIndex: number | undefined = undefined
  ): number | null {
    // Exhaustive search for now
    for (let i = 0; i < this.position.length; ++i) {
      // Allow collisions with dying critters
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
      if (
        this.health[i] > 0 &&
        distance(this.position[i], p) < S.explosionRadius
      ) {
        this.health[i] = Math.max(this.health[i] - S.damage, 0)
        if (this.health[i] === 0) {
          this.listener(Event.CritDeath)
        }
      }
    })
  }

  heal(p: Vec2): void {
    this.forEachIndex((i) => {
      if (
        this.health[i] < S.health &&
        distance(this.position[i], p) < S.healRadius
      ) {
        this.health[i] = Math.min(this.health[i] + S.healing, S.health)
        this.listener(Event.Heal)
      }
    })
  }

  // Update

  // Returns [speed, angularVelocity]
  private planMove(i: number, pathfinder: Maps.Pathfinder): [number, number] {
    if (this.destination[i] === null) {
      return [0, 0]
    }
    const position = this.position[i]
    const pathDirection = pathfinder.direction(position, this.destination[i])
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
    const [speed, angularVelocity] = this.planMove(i, pathfinder)

    // Execute the move
    this.angularVelocity[i] = angularVelocity
    this.angle[i] += angularVelocity * S.dt
    const position = this.position[i]
    const newPosition: Vec2 = [
      position[0] + S.dt * speed * Math.sin(this.angle[i]),
      position[1] + S.dt * speed * Math.cos(this.angle[i]),
    ]
    if (
      this.collide(newPosition, i) === null &&
      Maps.inBounds(newPosition, pathfinder.map)
    ) {
      this.position[i] = newPosition
      this.speed[i] = speed
    } else {
      this.speed[i] = 0
    }
  }

  private attack(i: number, bullets: Bullets): void {
    const position = this.position[i]
    const target = this.target[i]!

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
        this.listener(Event.Attack)
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

  animate(i: number): void {
    if (this.health[i] === 0) {
      this.speed[i] = 0
      this.angularVelocity[i] = 0
      if (this.spawnTimer[i] > 0) {
        this.spawnTimer[i] = Math.min(
          this.spawnTimer[i] + S.dt,
          S.critterSpawnTime
        )
        if (this.spawnTimer[i] === S.critterSpawnTime) {
          this.health[i] = S.health
          this.spawnTimer[i] = 0
        }
      } else {
        this.deathTimer[i] = Math.min(
          this.deathTimer[i] + S.dt,
          S.critterDeathTime
        )
        if (this.deathTimer[i] === S.critterDeathTime) {
          this.player[i] = -1 // now an empty slot
        }
      }
    }
  }

  update(bullets: Bullets, pathfinder: Maps.Pathfinder): void {
    this.forEachIndex((i) => {
      this.attackRecharge[i] = Math.max(this.attackRecharge[i] - S.dt, 0)
      if (
        this.target[i] !== null &&
        distance(this.position[i], this.target[i]) < S.attackRange
      ) {
        this.attack(i, bullets)
      } else if (this.destination[i] !== null) {
        this.move(i, pathfinder)
      } else {
        this.speed[i] = 0
        this.angularVelocity[i] = 0
      }
    })
    // Animations
    this.forEachIndex((i) => this.animate(i), /*includeAnimating=*/ true)
  }
}

export class Sim {
  // Dynamic state
  crits: Crits
  players: Players
  bases: Bases
  bullets: Bullets = new Bullets()
  healBullets: Bullets = new Bullets()

  // Static state
  level: Maps.Level
  pathfinder: Maps.Pathfinder
  playerWin: boolean | null = null

  constructor(level: Maps.Level, listener: EventListener) {
    this.crits = new Crits(listener)
    this.level = level
    this.pathfinder = new Maps.Pathfinder(level.map)
    this.players = new Players(level.initialCritters.length, listener)
    this.bases = new Bases(level, listener)
    for (const [player, count] of level.initialCritters.entries()) {
      for (let i = 0; i < count; ++i) {
        this.bases.spawnCritter(player, this.crits, this.players)
      }
    }
  }

  private updateWinner(): void {
    if (this.playerWin === null) {
      this.bases.forEachIndex((i) => {
        if (
          this.bases.health[i] === 0 &&
          this.bases.deathTimer[i] >= S.baseDeathTime
        ) {
          this.playerWin = this.bases.owner[i] === 1
        }
      }, true)
    }
  }

  programUpdate(): void {
    this.crits.programUpdate(this.players, this.level.map)
  }

  update(): void {
    this.bullets.update((p: Vec2) => {
      this.bases.explode(p)
      this.crits.explode(p)
    })
    this.healBullets.update((p: Vec2) => this.crits.heal(p))
    this.crits.update(this.bullets, this.pathfinder)
    this.bases.update(this.crits, this.healBullets, this.players)
    this.updateWinner()
  }
}
