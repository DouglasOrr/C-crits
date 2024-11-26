import * as AI from "./ai"
import * as Crasm from "./crasm"
import * as Sim from "./sim"
import * as Page from "../ui/page"
import { distance } from "../common"

// Utilities for common level operations

type State = { name: string; time: number }
type Outcome = "victory" | "defeat" | null

export abstract class Level {
  state: State = { name: "init", time: 0 }
  outcome: Outcome = null

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

  init() {
    setAI(this.sim, AI.Static)
    setSpawn(this.sim, [
      { n: 1, max: 1 },
      { n: 0, max: 0 },
    ])
  }
  update() {
    this.outcome = domination(this.sim)
    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)

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
          " Try changing the program to move to another location. When you're ready, move to <b>4,12</b>."
      )
    }
    if (critterReached(this.sim, [4, 12]) && t_("move-tweak", "debug")) {
      print(
        "You can debug your program by left-clicking on a critter. Try this now."
      )
    }
    if (this.sim.players.userSelection !== null && t_("debug", "maths")) {
      print(
        "In the debug panel, you see many predefined registers - inputs and outputs for your program." +
          " Try to change to program to calculate 6 * 7 (hint: search 'multiply') and store the result" +
          " in the user-defined register <code>$y</code>."
      )
    }
    if (registerContains(this.sim, "$y", 42) && t_("maths", "attack")) {
      print(
        "Fab! There's one more critical output register to learn about." +
          " Copy <code>$ne</code> to <code>$tgt</code> to attack the nearest enemy," +
          " if in range. Try moving to <b>15,12</b> and attack the nearest enemy."
      )
      setSpawn(this.sim, [
        { n: 4, max: 5 },
        { n: 1, max: 0 },
      ])
    }
    if (
      enemyCount(this.sim) === 0 &&
      t_("attack", "destroy-base", /*delay*/ 1)
    ) {
      print(
        "Great stuff! Now attack the enemy base. Use debug and search to find the register containing" +
          " the base position."
      )
    }
  }
}

class L1_Simple extends Level {
  static Name = "1-breaking-ground"
  static Map = "standard"

  init() {
    setAI(this.sim, AI.Defensive, AI.Defensive)
    setSpawn(this.sim, [
      { n: 10, max: 20 },
      { n: 10, max: 20 },
      { n: 1, max: 5 },
      { n: 1, max: 5 },
    ])
  }
  update() {
    this.outcome = domination(this.sim)
  }
}

// Level index

export const Levels = [L0_Tutorial, L1_Simple]

export function get(name: string): typeof Level {
  return Levels.find((level) => level.Name === name)!
}
