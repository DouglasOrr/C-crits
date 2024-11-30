import {
  Vec2,
  angleBetweenAngle,
  clamp,
  distance,
  isVec2,
  mostFrequent,
  v2Add,
  v2Equal,
  v2Floor,
} from "../common"
import * as Crasm from "./crasm"
import * as Maps from "./maps"

export const S = {
  dt: 1 / 200, // s
  dtProgram: 1 / 10, // s
  radius: 0.2, // m
  maxCritters: 1000, // #
  maxBullets: 1000, // #

  // Programming
  maxRuntimeErrors: 10, // #
  cycleLimit: 500, // #
  password: 42, // #

  // Movement
  speed: 4, // m/s
  waterSpeed: 0.4, // m/s
  rotationRate: 5, // rad/s
  directionMoveTolerance: Math.PI / 4, // rad
  avoidTolerance: 1.5, // # (multiplier)

  // Attack
  attackTime: 0.5, // s
  attackRange: 2.5, // m
  directionAttackTolerance: Math.PI / 16, // rad
  bulletSpeed: 4.5, // m/s
  explosionRadius: 0.6, // m
  damage: 10, // hp
  waterDamageMultiplier: 2, // #
  health: 100, // hp
  baseHealth: 700, // hp
  baseHealing: 10, // hp/s

  // Base
  defaultBaseCritters: 10, // #
  spawnTime: 3.5, // s
  spawnRingRatio: 1.5, // #
  healRange: 2.5, // m
  healRadius: 0.3, // m
  healTime: 0.25, // s
  healing: 5, // hp

  // Neutral base
  captureRange: 4, // m
  captureTime: 7, // s
  captureMultiple: 4, // #

  // Animations & UI
  critterSpawnTime: 0.5, // s
  critterDeathTime: 0.5, // s
  baseDeathTime: 4.0, // s
  selectionRadiusRatio: 2.0, // #
  markerDismissRadius: 0.25, // m
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
  ProgramDebug,
}
export type EventListener = (event: Event, data?: any) => void

var DebugMode = false
export function enableDebugMode() {
  DebugMode = true
}

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
  // Static
  position: Vec2[]
  direction: number[]
  maxCritters: number[]
  // Dynamic
  owner: number[]
  health: number[]
  deathTimer: number[]
  captureProgress: number[]
  capturePlayer: number[]
  spawnRecharge: number[]
  healRecharge: number[]

  constructor(map: Maps.Map, private listener: EventListener) {
    const n = map.basePosition.length
    // Static
    this.position = map.basePosition.map((p) => v2Add(p, [0.5, 0.5]))
    this.direction = map.baseDirection.map((d) => (d * Math.PI) / 4)
    this.maxCritters = Array(n).fill(S.defaultBaseCritters)
    // Dynamic
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

  findNearestNeutralBase(position: Vec2, player: number): Vec2 | null {
    let nearestDistance = Infinity
    let nearest = null
    this.forEachIndex((i) => {
      if (Bases.isNeutralBase(i) && this.owner[i] !== player) {
        const d = distance(position, this.position[i])
        if (d < nearestDistance) {
          nearestDistance = d
          nearest = this.position[i]
        }
      }
    })
    return nearest
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

  spawnCritter(
    base: number,
    crits: Crits,
    players: Players,
    map: Maps.Map
  ): void {
    const basePosition = this.position[base]
    const cosA = Math.cos(this.direction[base])
    const sinA = Math.sin(this.direction[base])

    const R = S.spawnRingRatio * S.radius
    for (let radius = 0.5 + R; ; radius += 2 * R) {
      for (let offset = 0; offset <= 4 * radius; offset += R) {
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
          if (
            crits.collide(position) === null &&
            Maps.inBounds(position, map)
          ) {
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

  private respawn(
    base: number,
    crits: Crits,
    players: Players,
    map: Maps.Map
  ): void {
    this.spawnRecharge[base] -= S.dt
    if (this.spawnRecharge[base] <= 0) {
      const owner = this.owner[base]
      const count = crits.player.reduce((sum, p) => sum + +(p === owner), 0)
      const allowedCount = this.owner.reduce(
        (sum, p, i) => sum + this.maxCritters[i] * +(p === owner),
        0
      )
      if (count < allowedCount) {
        this.spawnCritter(base, crits, players, map)
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

  update(
    crits: Crits,
    healBullets: Bullets,
    players: Players,
    map: Maps.Map
  ): void {
    this.forEachIndex((i) => {
      this.health[i] = Math.min(
        this.health[i] + S.baseHealing * S.dt,
        S.baseHealth
      )
      this.respawn(i, crits, players, map)
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
  losses: number[]
  // Programs
  program: Crasm.Program[]
  commsIn: { [key: string]: Crasm.Value }[]
  commsOut: { [key: string]: { priority: number; values: Crasm.Value[] } }[]
  errorsSinceLastLoad: number[]
  // User control
  userProgram: string = ""
  userMarker: Vec2 | null = null
  userSelection: number | null = null
  userSelectionId: number | null = null

  constructor(n: number, private listener: EventListener) {
    this.nextId = Array(n).fill(0)
    this.losses = Array(n).fill(0)
    this.errorsSinceLastLoad = Array(n).fill(0)
    this.program = Array(n).fill(Crasm.emptyProgram())
    this.commsIn = Array.from({ length: n }, () => {
      return {}
    })
    this.commsOut = Array.from({ length: n }, () => {
      return {}
    })
  }

  get length(): number {
    return this.program.length
  }

  forEachIndex(fn: (index: number) => void): void {
    for (let i = 0; i < this.program.length; i++) {
      fn(i)
    }
  }

  userLoadProgram(program: string): void {
    try {
      this.userProgram = program
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

  userSetMarker(position: Vec2): void {
    if (
      this.userMarker !== null &&
      distance(this.userMarker, position) < S.markerDismissRadius
    ) {
      this.userMarker = null // dismiss
    } else {
      this.userMarker = position
    }
  }

  userSelect(position: Vec2, crits: Crits): void {
    this.userSelection = crits.selectAtPosition(
      position,
      /*player=*/ DebugMode ? undefined : 0
    )
    if (this.userSelection === null) {
      this.userSelectionId = null
      this.listener(Event.ProgramDebug, null)
    } else {
      this.userSelectionId = crits.id[this.userSelection]
      this.listener(Event.ProgramDebug, {
        mem: crits.memory[this.userSelection],
        error: crits.error[this.userSelection],
      })
    }
  }

  preProgramUpdate(): void {
    this.forEachIndex((i) => {
      this.commsIn[i] = {}
      for (const [key, v] of Object.entries(this.commsOut[i])) {
        this.commsIn[i][key] = mostFrequent(v.values)
      }
      this.commsOut[i] = {}
    })
  }

  programSend(
    i: number,
    key: string,
    priority: number,
    value: Crasm.Value
  ): void {
    const entry = this.commsOut[i][key]
    if (entry === undefined || entry.priority < priority) {
      this.commsOut[i][key] = { priority, values: [value] }
    } else if (entry.priority === priority) {
      entry.values.push(value)
    }
  }

  postProgramUpdate(crits: Crits): void {
    // Selection (debug)
    if (this.userSelection !== null) {
      if (this.userSelectionId !== crits.id[this.userSelection]) {
        this.userSelection = null
        this.userSelectionId = null
        this.listener(Event.ProgramDebug, null)
      } else {
        this.listener(Event.ProgramDebug, {
          mem: crits.memory[this.userSelection],
          error: crits.error[this.userSelection],
        })
      }
    }
    // Console reporting
    crits.forEachIndex((i) => {
      const error = crits.error[i]
      if (error !== null) {
        const player = crits.player[i]
        if (this.errorsSinceLastLoad[player]++ < S.maxRuntimeErrors) {
          let prefix = player === 0 ? "" : `Player #${player} `
          if (error.line !== undefined) {
            prefix = `${prefix}L${error.line + 1} `
          }
          console.error(
            `${prefix}Critter #${crits.id[i]} runtime error - ${error.message}`
          )
        }
      }
    })
  }
}

class Memory {
  // Outputs
  $state: string | null = null
  $dst: Vec2 | null = null
  $tgt: Vec2 | null = null
  // Special
  $passwd: number | null = null
  $pos_we: number = 0
  // Inputs
  $id: number = -1
  $pos: Vec2 = [0, 0]
  $time: number = 0
  $ne: Vec2 | null = null
  $nf: Vec2 | null = null
  $hb: Vec2 = [0, 0]
  $eb: Vec2 | null = null
  $nnb: Vec2 | null = null
  $mark: Vec2 | null = null
  $fcc: number = 0
  $hlth: number = 0
}

export type RuntimeError = { message: string; line?: number; warning: boolean }

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
  error: (RuntimeError | null)[] = Array(S.maxCritters).fill(null)

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

  clearMemory(player: number): void {
    this.forEachIndex((i) => {
      if (this.player[i] === player) {
        this.memory[i] = new Memory()
      }
    })
  }

  programUpdate(
    players: Players,
    bases: Bases,
    map: Maps.Map,
    time: number
  ): void {
    this.forEachIndex((i) => {
      const mem = this.memory[i]
      this.error[i] = null

      // 1. Prepare the input state
      Object.assign(mem, players.commsIn[this.player[i]])
      mem.$id = this.id[i]
      mem.$pos = [...this.position[i]]
      mem.$time = time
      mem.$hb = bases.position[this.player[i]]
      if (this.player[i] <= 1) {
        mem.$eb = bases.position[1 - this.player[i]]
        mem.$nnb = bases.findNearestNeutralBase(
          this.position[i],
          this.player[i]
        )
      }
      mem.$ne = this.findNearest(i, /*enemy=*/ true)
      mem.$nf = this.findNearest(i, /*enemy=*/ false)
      mem.$hlth = this.health[i]
      mem.$fcc = this.player.reduce(
        (sum, p) => sum + +(p === this.player[i]),
        0
      )
      if (this.player[i] === 0) {
        mem.$mark = players.userMarker === null ? null : [...players.userMarker]
      }

      // 2. Run the user program
      try {
        const outcome = Crasm.run(
          players.program[this.player[i]],
          mem as unknown as Crasm.Memory,
          map,
          S.cycleLimit,
          mem.$state
        )
        // 3. Take actions
        this.validatePassword(mem, i)
        if (this.error[i] === null) {
          this.runProgramActions(i, map)
          Object.entries(outcome.comms).forEach(([key, v]) => {
            players.programSend(this.player[i], key, v.priority, v.value)
          })
        }
        // comes last - so we still execute the actions if there's a timeout
        if (outcome.timeout) {
          this.setError(
            i,
            `Warning: reached ${S.cycleLimit}-cycle timeout`,
            /*line=*/ undefined,
            /*warning=*/ true
          )
        }
      } catch (e) {
        if (e instanceof Crasm.RuntimeError) {
          this.setError(i, e.message, e.line)
        } else {
          throw e
        }
      }
    })
  }

  private runProgramActions(i: number, map: Maps.Map) {
    const mem = this.memory[i]
    const readVec2 = (key: keyof Memory): Vec2 | null => {
      const value = mem[key]
      if (value === null) {
        return null
      }
      if (!isVec2(value)) {
        this.setError(i, `${key} should be null or x,y but got ${value}`)
        return null
      }
      if (!Maps.inBounds(value, map)) {
        this.setError(
          i,
          `${key} should be within the map [0 <= x < ${map.width}, 0 <= y < ${map.height}]` +
            ` but got ${value}`
        )
        return null
      }
      return value
    }
    this.destination[i] = readVec2("$dst")
    this.target[i] = readVec2("$tgt")
    const pos = readVec2("$pos")
    if (pos !== null && !v2Equal(this.position[i], pos)) {
      if (mem.$pos_we !== 0) {
        this.position[i] = pos
      } else {
        this.setError(i, "$pos is not Write Enabled")
      }
    }
  }

  private findNearest(i: number, enemy: boolean): Vec2 | null {
    let nearestDistance = Infinity
    let nearestPosition: Vec2 | null = null
    this.forEachIndex((j) => {
      const isEnemy = this.player[j] !== this.player[i]
      if (i !== j && isEnemy === enemy) {
        const d = distance(this.position[i], this.position[j])
        if (d < nearestDistance) {
          nearestDistance = d
          nearestPosition = this.position[j]
        }
      }
    })
    return nearestPosition === null ? null : [...nearestPosition]
  }

  private validatePassword(mem: Memory, i: number) {
    if (mem.$passwd !== S.password) {
      if (mem.$passwd === null) {
        // No attempt - no need to show an error
      } else if (
        typeof mem.$passwd !== "number" ||
        mem.$passwd < 10 ||
        mem.$passwd >= 100
      ) {
        this.setError(i, "Match /\\d\\d/ failed - bad password")
      } else {
        this.setError(i, "Bad password")
      }
      // If the password is wrong, lock $pos_we
      if (mem.$pos_we !== 0) {
        this.setError(i, "$pos_we is locked")
        mem.$pos_we = 0
      }
    }
  }

  private setError(
    i: number,
    message: string,
    line?: number,
    warning: boolean = false
  ): void {
    // Only report the first error
    if (this.error[i] === null) {
      this.error[i] = { message, line, warning }
    }
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
      this.error[i] = null
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

  explode(p: Vec2, map: Maps.Map, players: Players): void {
    this.forEachIndex((i) => {
      if (
        this.health[i] > 0 &&
        distance(this.position[i], p) < S.explosionRadius
      ) {
        const cell = v2Floor(this.position[i])
        const damage =
          S.damage *
          (map.tiles[cell[1] * map.width + cell[0]] === Maps.Tile.Water
            ? S.waterDamageMultiplier
            : 1)
        this.health[i] = Math.max(this.health[i] - damage, 0)
        if (this.health[i] === 0) {
          this.listener(Event.CritDeath)
          players.losses[this.player[i]]++
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

  selectAtPosition(position: Vec2, player?: number): number | null {
    let minDistance = S.selectionRadiusRatio * S.radius
    let minIndex = null
    for (let i = 0; i < this.position.length; ++i) {
      if (player === undefined || this.player[i] === player) {
        const d = distance(this.position[i], position)
        if (d < minDistance) {
          minDistance = d
          minIndex = i
        }
      }
    }
    return minIndex
  }

  // Update

  // Returns [speed, angularVelocity]
  private planMove(i: number, pathfinder: Maps.Pathfinder): [number, number] {
    const destination = this.destination[i]
    if (destination === null) {
      return [0, 0]
    }
    const position = this.position[i]
    const pathDirection = pathfinder.direction(position, destination)
    let targetAngle = pathDirection * (Math.PI / 4)
    if (pathDirection === Maps.NoDirection) {
      if (distance(position, destination) < S.radius) {
        return [0, 0]
      }
      targetAngle = Math.atan2(
        destination[0] - position[0],
        destination[1] - position[1]
      )
    }
    // How fast can we move?
    const tileXY = v2Floor(position)
    const tile =
      pathfinder.map.tiles[tileXY[1] * pathfinder.map.width + tileXY[0]]
    const moveSpeed = tile == Maps.Tile.Water ? S.waterSpeed : S.speed
    // Adjust the target angle based on local collisions
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
      if (this.error[i] === null || this.error[i]!.warning) {
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
  time: number = 0

  // Static state
  pathfinder: Maps.Pathfinder

  constructor(public map: Maps.Map, listener: EventListener) {
    this.crits = new Crits(listener)
    this.pathfinder = new Maps.Pathfinder(map)
    this.players = new Players(map.basePosition.length, listener)
    this.bases = new Bases(map, listener)
  }

  userWin(): boolean | null {
    if (
      this.bases.health[1] === 0 &&
      this.bases.deathTimer[1] >= S.baseDeathTime
    ) {
      return true
    }
    if (
      this.bases.health[0] === 0 &&
      this.bases.deathTimer[0] >= S.baseDeathTime
    ) {
      return false
    }
    return null
  }

  spawnCritters(base: number, n: number): void {
    for (let i = 0; i < n; ++i) {
      this.bases.spawnCritter(base, this.crits, this.players, this.map)
    }
  }

  userSetMarker(position: Vec2): void {
    this.players.userSetMarker(position)
  }

  userSelect(position: Vec2): void {
    this.players.userSelect(position, this.crits)
  }

  userLoadProgram(program: string): void {
    this.players.userLoadProgram(program)
    this.crits.clearMemory(0)
  }

  programUpdate(): void {
    this.players.preProgramUpdate()
    this.crits.programUpdate(this.players, this.bases, this.map, this.time)
    this.players.postProgramUpdate(this.crits)
  }

  update(): void {
    this.time += S.dt
    this.bullets.update((p: Vec2) => {
      this.bases.explode(p)
      this.crits.explode(p, this.map, this.players)
    })
    this.healBullets.update((p: Vec2) => this.crits.heal(p))
    this.crits.update(this.bullets, this.pathfinder)
    this.bases.update(this.crits, this.healBullets, this.players, this.map)
  }
}
