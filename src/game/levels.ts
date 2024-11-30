import * as AI from "./ai"
import * as Crasm from "./crasm"
import * as Sim from "./sim"
import * as Page from "../ui/page"
import { distance, Vec2 } from "../common"

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

function checkDistances(sim: Sim.Sim, target: Vec2, register: string): boolean {
  let correct = true
  sim.crits.forEachIndex((i) => {
    if (sim.crits.player[i] === 0) {
      correct =
        correct &&
        Math.abs(
          (sim.crits.memory[i] as any)[register] -
            distance(sim.crits.position[i], target)
        ) < 0.5
    }
  })
  return correct
}

function checkMaxDistanceBetweenCritters(sim: Sim.Sim, limit: number): boolean {
  let allClose = true
  sim.crits.forEachIndex((i) => {
    if (sim.crits.player[i] === 0) {
      sim.crits.forEachIndex((j) => {
        if (sim.crits.player[j] === 0) {
          allClose =
            allClose &&
            distance(sim.crits.position[i], sim.crits.position[j]) <= limit
        }
      })
    }
  })
  return allClose
}

function checkAtMarker(sim: Sim.Sim, limit: number): boolean {
  let atMarker = sim.players.userMarker !== null
  sim.crits.forEachIndex((i) => {
    if (sim.crits.player[i] === 0) {
      atMarker =
        atMarker &&
        distance(sim.players.userMarker!, sim.crits.position[i]) < limit
    }
  })
  return atMarker
}

// Levels

class Tutorial extends Level {
  static Name = "tutorial"
  static Map = "tutorial"
  static AchievementUniqueOps = 7
  static Achievement = {
    name: "isa-explorer",
    description: `used at least ${this.AchievementUniqueOps} unique opcodes`,
  }
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
    this.sim.players.program[0].ops.forEach((op) =>
      this.uniqueOps.add(op.opcode)
    )
    if (this.outcome === "victory") {
      this.achievement =
        this.uniqueOps.size >= Tutorial.AchievementUniqueOps
          ? "victory"
          : "defeat"
    }
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

class BreakingGround extends Level {
  static Name = "breaking-ground"
  static Map = "basic"
  private static AchivementMaxOps = 4
  static Achievement = {
    name: "code-golf",
    description: `longest program <= ${this.AchivementMaxOps} ops`,
  }
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
        this.longestProgram <= BreakingGround.AchivementMaxOps
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

class AdvancedTutorial extends Level {
  static Name = "advanced-crasm"
  static Map = "advtutorial"
  static AchievementUniqueOps = 12
  static Achievement = {
    name: "isa-expert",
    description: `used at least ${this.AchievementUniqueOps} unique opcodes`,
  }
  private uniqueOps = new Set<Crasm.Opcode>()

  init() {
    setAI(this.sim, AI.Defensive, AI.Defensive)
    setSpawn(this.sim, [
      { n: 15, max: 15 },
      { n: 5, max: 5 },
      { n: 20, max: 20 },
    ])
  }
  update() {
    this.outcome = domination(this.sim)
    this.sim.players.program[0].ops.forEach((op) =>
      this.uniqueOps.add(op.opcode)
    )
    if (this.outcome === "victory") {
      this.achievement =
        this.uniqueOps.size >= AdvancedTutorial.AchievementUniqueOps
          ? "victory"
          : "defeat"
    }
    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)

    if (t_("init", "welcome", /*delay*/ 1)) {
      print(
        "In this second (final) tutorial, we'll learn some of the advanced aspects of crasm."
      )
    }
    if (t_("welcome", "distance", /*delay*/ 3)) {
      print(
        "We often need to calculate distance from our position to something on the map." +
          " To calculate distance, you can use <code>sub</code> and <code>vlen</code>." +
          " Please calculate the <b>distance from <code>$pos</code> to <code>0,6</code>" +
          " and store it in <code>$d</code></b>."
      )
    }
    if (
      checkDistances(this.sim, [0, 6], "$d") &&
      t_("distance", "move-closest")
    ) {
      print(
        "Great! Now do the same for <code>12,6</code> (in <code>$d2</code>) and" +
          " <b>move to the closer of <code>0,6</code> and <code>12,6</code></b>" +
          " (hint: <code>sub</code>, <code>jlz</code>)."
      )
    }
    if (
      (critterReached(this.sim, [0, 6]) || critterReached(this.sim, [12, 6])) &&
      t_("move-closest", "vote-intro")
    ) {
      print(
        "Your critters should now be in two groups (don't worry if not)." +
          " Each critter runs its own program and makes its own decisions." +
          " To make a group decision, we can use <code>send</code>..."
      )
    }
    if (t_("vote-intro", "vote", /*delay*/ 4)) {
      print(
        "The <code>send</code> instruction sends a message to all critters." +
          " It takes a priority. But if all critters give the same priority, the majority vote is used." +
          " Try sending the closer of <code>0,6</code> and <code>12,6</code>, and <b>have all critters move" +
          " to the majority vote</b>."
      )
    }
    if (checkMaxDistanceBetweenCritters(this.sim, 5) && t_("vote", "mark")) {
      print(
        "Brill! One final trick - if you right click on the screen, you can set a marker." +
          " (Right click in the same place to remove it.)" +
          " Your critters can see that marker in <code>$mark</code>." +
          " Now </b>set a marker, and have your critters move to it</b>."
      )
    }
    // if (t_("init", "mark")) {
    //   print("fast-forward")
    // }
    if (checkAtMarker(this.sim, 5) && t_("mark", "done")) {
      print(
        "Well done! Now <b>destroy the enemy base</b>." +
          " (Hint: you probably want to avoid that neutral base that is stronger than you," +
          " e.g. use a marker. Also think about what your reinforcements are doing!)"
      )
    }
  }
}

class Rush extends Level {
  static Name = "rush"
  static Map = "rush"
  static AchievementTime = 90
  static Achievement = {
    name: "sudden-death",
    description: `win in under ${this.AchievementTime} seconds`,
  }

  init() {
    setAI(this.sim, AI.StaticThenAttack, AI.Defensive)
    setSpawn(this.sim, [
      { n: 20, max: 20 },
      { n: 15, max: 30 },
      { n: 1, max: 10 },
      { n: 1, max: 10 },
      { n: 1, max: 10 },
      { n: 1, max: 10 },
    ])
  }
  update() {
    this.outcome = domination(this.sim)
    if (this.outcome === "victory") {
      this.achievement =
        this.sim.time < Rush.AchievementTime ? "victory" : "defeat"
    }
    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)

    if (t_("init", "welcome", /*delay*/ 1)) {
      print(
        "Your enemy is stronger than you. You'll need to be quick - " +
          "<b>destroy the enemy base</b> before they overwhelm you."
      )
    }
  }
}

class Survival extends Level {
  static Name = "survival"
  static Map = "survival"
  static SurvivalTime = 120
  static Achievement = {
    name: "untouchable",
    description: "your base didn't take damage",
  }
  private untouched = true

  init() {
    setAI(this.sim, AI.SurvivalWaves, AI.Defensive)
    setSpawn(this.sim, [
      { n: 15, max: 20 },
      { n: 20, max: 0 },
      { n: 1, max: 0 },
      { n: 0, max: 10 },
    ])
  }
  update() {
    if (this.sim.bases.health[0] < Sim.S.baseHealth) {
      this.untouched = false
    }
    this.outcome = domination(this.sim)
    if (this.sim.time > Survival.SurvivalTime) {
      this.outcome = "victory"
    }
    if (this.outcome === "victory") {
      this.achievement = this.untouched ? "victory" : "defeat"
    }
    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)

    if (t_("init", "wave1", /*delay*/ 1)) {
      print(
        "You're against overwhelming odds - but you just need to" +
          ` <b>survive for ${Survival.SurvivalTime} s</b>.` +
          " (Note: critters in water move slower and take double damage.)"
      )
    }
    if (this.sim.time > 50 && t_("wave1", "wave2")) {
      this.sim.spawnCritters(1, 15)
      this.sim.spawnCritters(2, 15)
    }
    if (this.sim.time > 85 && t_("wave2", "wave3")) {
      this.sim.spawnCritters(1, 20)
      this.sim.spawnCritters(2, 20)
    }
  }
}

class Madness extends Level {
  static Name = "madness"
  static Map = "madness"
  static Achievement = {
    name: "fire-and-forget",
    description: "upload once, no markers",
  }
  private fireAndForget = true
  private lastProgram: string = ""

  init() {
    setAI(this.sim, AI.MadnessAggressive, AI.Defensive)
    setSpawn(this.sim, [
      { n: 10, max: 30 },
      { n: 30, max: 30 },
      { n: 0, max: 15 },
      { n: 0, max: 15 },
      { n: 0, max: 15 },
      { n: 0, max: 15 },
      { n: 0, max: 15 },
    ])
  }
  update() {
    if (this.sim.players.userMarker !== null) {
      this.fireAndForget = false
    }
    if (
      this.fireAndForget &&
      this.lastProgram !== "" &&
      this.lastProgram !== this.sim.players.userProgram
    ) {
      this.fireAndForget = false
    } else {
      this.lastProgram = this.sim.players.userProgram
    }
    this.outcome = domination(this.sim)
    if (this.outcome === "victory") {
      this.achievement = this.fireAndForget ? "victory" : "defeat"
    }
    const print = this.page.addInstruction.bind(this.page)
    const t_ = this.transition.bind(this)

    if (t_("init", "welcome", /*delay*/ 1)) {
      print(
        "It's a dangerous map! Capture the neutrals as you wish," +
          " then <b>destroy the enemy base</b>."
      )
    }
  }
}

// Level index

export const Levels = [
  Tutorial,
  BreakingGround,
  AdvancedTutorial,
  Rush,
  Survival,
  Madness,
]

export function index(name: string): number {
  return Levels.findIndex((level) => level.Name === name)!
}
