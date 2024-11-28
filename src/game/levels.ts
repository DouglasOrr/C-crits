import * as AI from "./ai"
import * as Crasm from "./crasm"
import * as Sim from "./sim"
import * as Page from "../ui/page"
import { distance } from "../common"

// Utilities for common level operations

type State = { name: string; time: number }
export type Outcome = "victory" | "defeat" | null

export abstract class Level {
  state: State = { name: "init", time: 0 }
  outcome: Outcome = null
  achievement: Outcome = null

  constructor(protected sim: Sim.Sim, protected page: Page.Page) {
    this.init()
  }
  abstract init(): void
  abstract update(): void
  transition(from: string, to: string, delay: number = 0): boolean {
    if (this.state.name === from && this.sim.time > this.state.time + delay) {
      this.state = { name: to, time: this.sim.time }
      return true
    }
    return false
  }
}

function setAI(
  sim: Sim.Sim,
  enemyProgram: string,
  neutralProgram: string = ""
): void {
  sim.players.program[1] = Crasm.parse(enemyProgram)
  for (let i = 2; i < sim.players.program.length; i++) {
    sim.players.program[i] = Crasm.parse(neutralProgram)
  }
}

function setSpawn(sim: Sim.Sim, bases: { n: number; max: number }[]): void {
  if (bases.length !== sim.bases.length) {
    throw new Error("Bad base count")
  }
  for (let i = 0; i < bases.length; i++) {
    sim.bases.maxCritters[i] = bases[i].max
    sim.spawnCritters(i, bases[i].n)
  }
}

function domination(sim: Sim.Sim): Outcome {
  const userWin = sim.userWin()
  if (userWin === null) {
    return null
  }
  return userWin ? "victory" : "defeat"
}

function critterReached(sim: Sim.Sim, position: [number, number]): boolean {
  let reached = false
  sim.crits.forEachIndex((i) => {
    reached =
      reached ||
      (sim.crits.player[i] === 0 &&
        distance(sim.crits.position[i], position) < 1.5)
  })
  return reached
}

function registerContains(
  sim: Sim.Sim,
  register: string,
  value: number
): boolean {
  let contains = false
  sim.crits.forEachIndex((i) => {
    contains =
      contains ||
      (sim.crits.player[i] === 0 &&
        (sim.crits.memory[i] as any)[register] === value)
  })
  return contains
}

function enemyCount(sim: Sim.Sim): number {
  let count = 0
  sim.crits.forEachIndex((i) => {
    count = count + +(sim.crits.player[i] === 1)
  })
  return count
}

// Levels

class L0_Tutorial extends Level {
  static Name = "0-tutorial"
  static Map = "tutorial"
  static AchievementUniqueOps = 7
  static Achievement = `isa-explorer (used at least ${this.AchievementUniqueOps} unique opcodes)`
  private uniqueOps = new Set<Crasm.Opcode>()

  init() {
    setAI(this.sim, ["mov 12,12 $dst", "mov $ne $tgt"].join("\n"))
    setSpawn(this.sim, [
      { n: 1, max: 1 },
      { n: 0, max: 0 },
      { n: 0, max: 0 },
    ])
  }
  update() {
    this.outcome = domination(this.sim)
    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)
    this.sim.players.program[0].ops.forEach((op) =>
      this.uniqueOps.add(op.opcode)
    )
    if (this.outcome === "victory") {
      this.achievement =
        this.uniqueOps.size >= L0_Tutorial.AchievementUniqueOps
          ? "victory"
          : "defeat"
    }

    if (t_("init", "welcome", /*delay*/ 1)) {
      print(
        "Welcome to c-crits! In this tutorial, we'll learn how to control your critters" +
          " using the crasm programming language."
      )
    }
    if (t_("welcome", "upload", /*delay*/ 3)) {
      const program = `mov 8,2 $dst`
      this.page.setDefaultProgram(program)
      print(
        `Upload the program <code>${program}</code> to order your critter to the cell 8,2.` +
          ` Use Ctrl+Enter or click the <i class="fas fa-upload"></i> button.`
      )
    }
    if (critterReached(this.sim, [8, 2]) && t_("upload", "move-explain")) {
      print(
        "Great job! That program is a single instruction <code>mov 8,2 $dst</code>, which" +
          " copies the array <code>8,2</code> into the register" +
          " <code>$dst</code>."
      )
    }
    if (t_("move-explain", "move-tweak", /*delay*/ 8)) {
      print(
        "You can learn about the op <code>mov</code> and register" +
          " <code>$dst</code> by searching in the <a href='#input-search'>top-right corner</a>." +
          " Try changing the program to move to another location. When you're ready, <b>move to 4,12</b>."
      )
    }
    if (critterReached(this.sim, [4, 12]) && t_("move-tweak", "debug")) {
      print(
        "You can debug your program by left-clicking on a critter. <b>Click to debug</b> your critter."
      )
    }
    if (this.sim.players.userSelection !== null && t_("debug", "maths")) {
      print(
        "In the debug panel, you see many predefined registers - inputs and outputs for your program." +
          " Now change to program to <b>calculate $y = 6 * 7</b> (hint: search 'multiply', the result" +
          " goes in user-defined register <code>$y</code>)."
      )
    }
    if (registerContains(this.sim, "$y", 42) && t_("maths", "capture")) {
      print(
        "Now we'll capture a neutral base. The base position is stored in <code>$nnb</code>." +
          " Set <code>$dst</code> to <code>$nnb</code> to move to the base and capture it."
      )
    }
    // if (this.state.name == "init") {
    //   print("fast-forward...")
    //   this.state = { name: "capture", time: this.sim.time }
    // }
    if (this.sim.bases.owner[2] === 0 && t_("capture", "attack")) {
      setSpawn(this.sim, [
        { n: 1, max: 4 },
        { n: 1, max: 1 },
        { n: 1, max: 4 },
      ])
      print(
        "You've captured the base! Captured bases spawn critters & increase their limit." +
          " Now if I tell you that <code>$ne</code> (R) contains the nearest enemy" +
          " and <code>$tgt</code> (R/W) attacks a position, if in range, please" +
          " <b>move to and attack the enemy critter</b>."
      )
    }
    if (
      enemyCount(this.sim) === 0 &&
      t_("attack", "destroy-base", /*delay*/ 8)
    ) {
      print(
        "Great! But it looks like the game will go on forever. To finish things, we need" +
          " to learn about control flow. The <code>jez $x @label</code> instruction jumps" +
          " to <code>@label</code> if <code>$x</code> is zero or null. Use " +
          " <code>jez $ne @attack-base</code>, and write some code after <code>@attack-base</code>" +
          " to <b>attack and destroy the enemy base</b>. (Hint: use <a href='#input-search'>search</a>" +
          " to learn about <code>ret</code> and to find out which register holds the enemy base position)."
      )
    }
  }
}

class L1_BreakingGround extends Level {
  static Name = "1-breaking-ground"
  static Map = "basic"
  private static AchivementMaxOps = 4
  static Achievement = `code-golf (longest program <= ${this.AchivementMaxOps} ops)`
  private longestProgram: number = 0

  init() {
    setAI(this.sim, AI.Defensive, AI.Defensive)
    setSpawn(this.sim, [
      { n: 15, max: 15 },
      { n: 15, max: 15 },
      { n: 5, max: 5 },
    ])
  }
  update() {
    this.longestProgram = Math.max(
      this.longestProgram,
      this.sim.players.program[0].ops.length
    )
    this.outcome = domination(this.sim)
    if (this.outcome === "victory") {
      this.achievement =
        this.longestProgram <= L1_BreakingGround.AchivementMaxOps
          ? "victory"
          : "defeat"
    }

    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)

    if (t_("init", "welcome", /*delay*/ 1)) {
      print(
        "Your first solo challenge. It's simple - <b>destroy the enemy base</b>! Good luck."
      )
    }
  }
}

// Level index

export const Levels = [L0_Tutorial, L1_BreakingGround]

export function get(name: string): typeof Level {
  return Levels.find((level) => level.Name === name)!
}
