// Definitions

export type Value = null | number | string | number[]
export type Memory = { [key: string]: Value }
export enum Opcode {
  // Arithmetic
  MOV,
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  RAND,
  // Arrays
  PUSH,
  GET,
  VLEN,
  VDIR,
  UNITV,
  // Control flow
  JMP,
  JEZ,
  JLZ,
  JGZ,
  RET,
}
const UnaryArithmetic = [["register", "literal"], "register"]
const BinaryArithmetic = [
  ["register", "literal"],
  ["register", "literal"],
  "register",
]
const UnaryControlFlow = [
  ["register", "literal"],
  ["register", "literal"],
]
export const OpSpecs = [
  // Arithmetic
  {
    code: Opcode.MOV,
    syntax: UnaryArithmetic,
    spec: "in $out",
    description: "copy the value (a register or literal) from in to $out",
  },
  {
    code: Opcode.ADD,
    syntax: BinaryArithmetic,
    spec: "a b $out",
    description: "add a to b (element-wise) and store in $out",
  },
  {
    code: Opcode.SUB,
    syntax: BinaryArithmetic,
    spec: "a b $out",
    description: "subtract b from a (element-wise) and store in $out",
  },
  {
    code: Opcode.MUL,
    syntax: BinaryArithmetic,
    spec: "a b $out",
    description: "multiply a with b (element-wise) and store in $out",
  },
  {
    code: Opcode.DIV,
    syntax: BinaryArithmetic,
    spec: "a b $out",
    description: "divide a by b (element-wise) and store in $out",
  },
  {
    code: Opcode.MOD,
    syntax: BinaryArithmetic,
    spec: "a b $out",
    description: "take the modulo of a by b (element-wise) and store in $out",
  },
  {
    code: Opcode.RAND,
    syntax: ["register"],
    spec: "$out",
    description: "store a random number between 0 and 1 in $out",
  },
  // Arrays
  {
    code: Opcode.PUSH,
    syntax: BinaryArithmetic,
    spec: "a0 a1 $out",
    description: "concatenate or append a1 to a0 and store in $out",
  },
  {
    code: Opcode.GET,
    syntax: BinaryArithmetic,
    spec: "array i $out",
    description: "get the value at index i from array and store in $out",
  },
  {
    code: Opcode.VLEN,
    syntax: UnaryArithmetic,
    spec: "array $out",
    description:
      "calculate the Euclidean vector length of array and store in $out",
  },
  {
    code: Opcode.VDIR,
    syntax: UnaryArithmetic,
    spec: "array $out",
    description:
      "calculate the vector direction in radians (0 = north, 1.57 = east) from array and store in $out",
  },
  {
    code: Opcode.UNITV,
    syntax: UnaryArithmetic,
    spec: "angle $out",
    description: "calculate the unit vector for angle and store in $out",
  },
  // Control flow
  {
    code: Opcode.JMP,
    syntax: [["register", "literal"]],
    spec: "@label",
    description: "jump to @label",
  },
  {
    code: Opcode.JEZ,
    syntax: UnaryControlFlow,
    spec: "value @label",
    description: "jump to @label if value == 0 or null",
  },
  {
    code: Opcode.JLZ,
    syntax: UnaryControlFlow,
    spec: "value @label",
    description: "jump to @label if value < 0",
  },
  {
    code: Opcode.JGZ,
    syntax: UnaryControlFlow,
    spec: "value @label",
    description: "jump to @label if value > 0",
  },
  {
    code: Opcode.RET,
    syntax: [],
    spec: "",
    description: "end execution of the program (for this update tick)",
  },
]
export const RegisterSpecs = [
  {
    name: "$state",
    spec: "@lab|null R/W",
    description: "entry point for the next update tick",
  },
  {
    name: "$dest",
    spec: "x,y|null R/W",
    description: "move towards the coordinates x,y",
  },
  {
    name: "$tgt",
    spec: "x,y|null R/W",
    description: "attack x,y if in range (note: takes precedence over $dest)",
  },
  {
    name: "$id",
    spec: "number R",
    description: "critter ID (unique, starting from 0)",
  },
  {
    name: "$pos",
    spec: "x,y R",
    description: "current position",
  },
  {
    name: "$hlth",
    spec: "number R",
    description: "current health",
  },
  {
    name: "$ne",
    spec: "x,y R",
    description: "nearest enemy critter position",
  },
  {
    name: "$hb",
    spec: "x,y R",
    description: "first (home) base position",
  },
  {
    name: "$eb",
    spec: "x,y R",
    description: "enemy base position (not neutral)",
  },
  {
    name: "$mark",
    spec: "x,y R",
    description: "user-controlled manual marker position",
  },
]
export type Arg = { register: string } | { literal: Value }
export type Op = { opcode: Opcode; args: Arg[]; line: number }
export type Program = { ops: Op[]; labels: { [key: string]: number } }

export function emptyProgram(): Program {
  return { ops: [], labels: {} }
}

// Execution

export function run(
  program: Program,
  memory: Memory,
  cycleLimit: number,
  startLabel: string | null
): void {
  const s = new State(program, memory)
  let cycleCount = 0
  if (startLabel !== null && program.labels[startLabel] !== undefined) {
    s.pc = program.labels[startLabel]
  }
  while (s.pc < program.ops.length && cycleCount < cycleLimit) {
    cycleCount += 1
    s.op = program.ops[s.pc]
    switch (s.op.opcode) {
      // Arithmetic
      case Opcode.MOV:
        runUnary(s, (_, a) => a)
        break
      case Opcode.ADD:
        runBinary(s, exprAdd)
        break
      case Opcode.SUB:
        runBinary(s, exprSub)
        break
      case Opcode.MUL:
        runBinary(s, exprMul)
        break
      case Opcode.DIV:
        runBinary(s, exprDiv)
        break
      case Opcode.MOD:
        runBinary(s, exprMod)
        break
      case Opcode.RAND:
        store(s, Math.random(), s.op.args[0])
        s.pc += 1
        break
      // Arrays
      case Opcode.PUSH:
        runBinary(s, exprPush)
        break
      case Opcode.GET:
        runBinary(s, exprGet)
        break
      case Opcode.VLEN:
        runUnary(s, exprVLen)
        break
      case Opcode.VDIR:
        runUnary(s, exprVDir)
        break
      case Opcode.UNITV:
        runUnary(s, exprUnitV)
        break
      // Control flow
      case Opcode.JMP:
        s.pc = jumpTarget(s, s.op.args[0])
        break
      case Opcode.JEZ:
        runConditionalJump(s, exprEZ)
        break
      case Opcode.JLZ:
        runConditionalJump(s, exprLZ)
        break
      case Opcode.JGZ:
        runConditionalJump(s, exprGZ)
        break
      case Opcode.RET:
        s.pc = program.ops.length
        break
      default:
        throw new AssertionError()
    }
  }
}

export class RuntimeError extends Error {
  constructor(message: string, public line: number) {
    super(message)
  }
}

export class AssertionError extends Error {}

class State {
  pc: number = 0
  op: Op = { opcode: Opcode.RET, args: [], line: -1 }

  constructor(public program: Program, public memory: Memory) {}
}

function load(s: State, arg: Arg): Value {
  if ("register" in arg) {
    return s.memory[arg.register]
  }
  if ("literal" in arg) {
    return arg.literal
  }
  throw new AssertionError()
}

function store(s: State, value: Value, dest: Arg): void {
  if ("register" in dest) {
    s.memory[dest.register] = value
  } else {
    throw new AssertionError()
  }
}

function jumpTarget(s: State, arg: Arg): number {
  const value = load(s, arg)
  if (typeof value === "string") {
    const line = s.program.labels[value]
    if (line === undefined || line === null) {
      throw new RuntimeError(`Unknown label ${value}`, s.op.line)
    }
    return line
  } else {
    throw new RuntimeError(
      `Can't ${Opcode[s.op.opcode]} to ${value}`,
      s.op.line
    )
  }
}

function runUnary(s: State, impl: (s: State, a: Value) => Value): void {
  store(s, impl(s, load(s, s.op.args[0])), s.op.args[1])
  s.pc += 1
}

function runBinary(
  s: State,
  impl: (s: State, a: Value, b: Value) => Value
): void {
  store(s, impl(s, load(s, s.op.args[0]), load(s, s.op.args[1])), s.op.args[2])
  s.pc += 1
}

function runConditionalJump(
  s: State,
  test: (s: State, a: Value) => boolean
): void {
  if (test(s, load(s, s.op.args[0]))) {
    s.pc = jumpTarget(s, s.op.args[1])
  } else {
    s.pc += 1
  }
}

// Arithmetic

function exprAdd(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a + b
  }
  // TODO broadcasting?
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) + (b[i] as number))
  }
  throw new RuntimeError(`Can't ADD ${a} ${b}`, s.op.line)
}

function exprSub(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a - b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) - (b[i] as number))
  }
  throw new RuntimeError(`Can't SUB ${a} ${b}`, s.op.line)
}

function exprMul(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a * b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) * (b[i] as number))
  }
  throw new RuntimeError(`Can't MUL ${a} ${b}`, s.op.line)
}

function exprDiv(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a / b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) / (b[i] as number))
  }
  throw new RuntimeError(`Can't DIV ${a} ${b}`, s.op.line)
}

function exprMod(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a % b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) % (b[i] as number))
  }
  throw new RuntimeError(`Can't MOD ${a} ${b}`, s.op.line)
}

// Array

function exprPush(s: State, a: Value, b: Value): Value {
  let aa: number[]
  if (Array.isArray(a)) {
    aa = a
  } else if (typeof a === "number") {
    aa = [a]
  } else {
    throw new RuntimeError(
      `Can't PUSH ${a}, expected array or number`,
      s.op.line
    )
  }
  let bb: number[]
  if (Array.isArray(b)) {
    bb = b
  } else if (typeof b === "number") {
    bb = [b]
  } else {
    throw new RuntimeError(
      `Can't PUSH ${b}, expected array or number`,
      s.op.line
    )
  }
  return [...aa, ...bb]
}

function exprGet(s: State, array: Value, idx: Value): Value {
  if (!Array.isArray(array)) {
    throw new RuntimeError(`GET expected array, got ${array}`, s.op.line)
  }
  if (typeof idx !== "number") {
    throw new RuntimeError(
      `GET expected index to be a number, got ${idx}`,
      s.op.line
    )
  }
  if (idx < 0 || idx >= array.length) {
    throw new RuntimeError(`Index ${idx} out of bounds`, s.op.line)
  }
  return array[idx]
}

function exprVLen(s: State, array: Value): Value {
  if (!Array.isArray(array)) {
    throw new RuntimeError(`VLEN expected array, got ${array}`, s.op.line)
  }
  return array.reduce((acc, x) => acc + x * x, 0) ** 0.5
}

function exprVDir(s: State, array: Value): Value {
  if (!Array.isArray(array) || array.length !== 2) {
    throw new RuntimeError(
      `VDIR expected array of length 2, got ${array}`,
      s.op.line
    )
  }
  return Math.atan2(array[0], array[1])
}

function exprUnitV(s: State, direction: Value): Value {
  if (typeof direction !== "number") {
    throw new RuntimeError(`UNITV expected number, got ${direction}`, s.op.line)
  }
  return [Math.sin(direction), Math.cos(direction)]
}

// Control flow

function exprEZ(s: State, a: Value): boolean {
  if (a === null) {
    return true
  }
  if (typeof a === "number") {
    return a === 0
  }
  if (Array.isArray(a)) {
    return a.every((x) => x === 0)
  }
  throw new RuntimeError(`Can't compare ${a} to 0`, s.op.line)
}

function exprLZ(s: State, a: Value): boolean {
  if (typeof a === "number") {
    return a < 0
  }
  throw new RuntimeError(`Can't compare ${a} to 0`, s.op.line)
}

function exprGZ(s: State, a: Value): boolean {
  if (typeof a === "number") {
    return a > 0
  }
  throw new RuntimeError(`Can't compare ${a} to 0`, s.op.line)
}

// Parsing

export type SourceLocation = { line: number; column: number }
export type Token = { t: string; p: SourceLocation }

export class ParseError extends Error {
  constructor(
    message: string,
    public location: SourceLocation,
    public source: string[]
  ) {
    super(message)
  }

  show(): string {
    const lines = [
      `L${this.location.line} ${this.message}`,
      `| ${this.source[this.location.line]}`,
      `| ${" ".repeat(this.location.column)}^`,
    ]
    return lines.join("\n")
  }
}

export function tokenise(line: string, lineNumber: number): Token[] {
  const withoutComments = (line.match(/^([^;]+)/) ?? [""])[0]
  const matches = withoutComments.matchAll(/([^ ]+)/g)
  return Array.from(matches, (m) => ({
    t: m[0],
    p: { line: lineNumber, column: m.index },
  }))
}

export function parseLiteral(token: Token, source: string[]): Value {
  if (token.t.startsWith("@")) {
    return token.t
  }
  if (token.t.includes(",")) {
    // A lot of extra code to track the position of the subToken
    const array = []
    let pos = -1
    while (pos < token.t.length) {
      let nextPos = token.t.indexOf(",", pos + 1)
      nextPos = nextPos === -1 ? token.t.length : nextPos
      const subToken = token.t.slice(pos + 1, nextPos)
      if (subToken !== "") {
        const value = Number(subToken)
        if (isNaN(value)) {
          throw new ParseError(
            `Unexpected array element '${subToken}'`,
            { line: token.p.line, column: token.p.column + pos + 1 },
            source
          )
        }
        array.push(value)
      }
      pos = nextPos
    }
    return array
  }
  if (token.t === "null") {
    return null
  }
  const number = Number(token.t)
  if (isNaN(number)) {
    throw new ParseError(`Unexpected literal '${token.t}'`, token.p, source)
  }
  return number
}

function parseLine(source: string[], line: number, program: Program): void {
  const opToSpec = new Map(
    OpSpecs.map((s: { code: Opcode; syntax: any }) => [
      Opcode[s.code],
      s.syntax,
    ])
  )
  const tokens = tokenise(source[line], line)
  if (tokens.length == 0) {
    // skip empty lines
  } else if (tokens[0].t.startsWith("@")) {
    program.labels[tokens[0].t] = program.ops.length
    if (tokens.length >= 2) {
      throw new ParseError(`Unexpected code after @label`, tokens[1].p, source)
    }
  } else {
    const opcodeKey = tokens[0].t.toUpperCase()
    if (!(opcodeKey in Opcode)) {
      throw new ParseError(
        `Bad instruction '${tokens[0].t}'`,
        tokens[0].p,
        source
      )
    }
    const opcode = Opcode[opcodeKey as keyof typeof Opcode]
    const args = tokens.slice(1).map((token) => {
      if (token.t.startsWith("$")) {
        return { register: token.t }
      } else {
        return { literal: parseLiteral(token, source) }
      }
    })
    const spec = opToSpec.get(opcodeKey)!
    if (spec.length !== args.length) {
      throw new ParseError(
        `${Opcode[opcode]} expects ${spec.length} arguments, got ${args.length}`,
        tokens[0].p,
        source
      )
    }
    for (let i = 0; i < spec.length; ++i) {
      const argType = Object.keys(args[i])[0]
      if (
        argType !== spec[i] &&
        !(Array.isArray(spec[i]) && spec[i].includes(argType))
      ) {
        throw new ParseError(
          `${Opcode[opcode]} argument ${i + 1} should be a ${
            spec[i]
          }, got ${argType}`,
          tokens[i + 1].p,
          source
        )
      }
    }
    program.ops.push({ opcode, args, line })
  }
}

export function parse(source: string): Program {
  const program = emptyProgram()
  const lines = source.split("\n")
  for (let line = 0; line < lines.length; ++line) {
    parseLine(lines, line, program)
  }
  return program
}

// Documentation

export type SearchResult = { spec: string; description: string }

export function searchDocs(query: string): SearchResult[] {
  query = query.toLowerCase()
  const results: SearchResult[] = []
  const added = new Set<string>()
  // Exact match on opcodes
  for (const s of OpSpecs) {
    if (Opcode[s.code].toLowerCase().startsWith(query)) {
      results.push({
        spec: `${Opcode[s.code]} ${s.spec}`,
        description: s.description,
      })
      added.add(Opcode[s.code])
    }
  }
  // Exact match on registers
  for (const s of RegisterSpecs) {
    if (s.name.startsWith(query) || s.name.replace("$", "").startsWith(query)) {
      results.push({
        spec: `${s.name} ${s.spec}`,
        description: s.description,
      })
      added.add(s.name)
    }
  }
  // Fall back to searching descriptions
  if (results.length < 3 && query.length >= 3) {
    for (const s of OpSpecs) {
      if (
        s.description.toLowerCase().includes(query) &&
        !added.has(Opcode[s.code])
      ) {
        results.push({
          spec: `${Opcode[s.code]} ${s.spec}`,
          description: s.description,
        })
        added.add(Opcode[s.code])
      }
    }
    for (const s of RegisterSpecs) {
      if (s.description.toLowerCase().includes(query) && !added.has(s.name)) {
        results.push({
          spec: `${s.name} ${s.spec}`,
          description: s.description,
        })
        added.add(s.name)
      }
    }
  }
  return results
}
