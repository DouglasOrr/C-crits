// Definitions

export type Value = null | number | string | number[]
export type Memory = { [key: string]: Value }
export enum Opcode {
  MOV,
  ADD,
  SUB,
  MUL,
  DIV,
  RET,
}
const UnaryOp = [["register", "literal"], "register"]
const BinaryOp = [["register", "literal"], ["register", "literal"], "register"]
export const OpSpecs = new Map<string, (string | string[])[]>([
  ["MOV", UnaryOp],
  ["ADD", BinaryOp],
  ["SUB", BinaryOp],
  ["MUL", BinaryOp],
  ["DIV", BinaryOp],
  ["RET", []],
])
export type Arg = { register: string } | { literal: Value }
export type Op = { opcode: Opcode; args: Arg[]; line: number }
export type Program = { ops: Op[]; labels: { [key: string]: number } }

export function emptyProgram(): Program {
  return { ops: [], labels: {} }
}

// Execution

export function run(program: Program, memory: Memory): void {
  const s = new State(program, memory)
  for (const op of program.ops) {
    s.op = op
    switch (op.opcode) {
      case Opcode.MOV:
        store(s, load(s, op.args[0]), op.args[1])
        break
      case Opcode.ADD:
        store(s, opAdd(s, load(s, op.args[0]), load(s, op.args[1])), op.args[2])
        break
      case Opcode.SUB:
        store(s, opSub(s, load(s, op.args[0]), load(s, op.args[1])), op.args[2])
        break
      case Opcode.MUL:
        store(s, opMul(s, load(s, op.args[0]), load(s, op.args[1])), op.args[2])
        break
      case Opcode.DIV:
        store(s, opDiv(s, load(s, op.args[0]), load(s, op.args[1])), op.args[2])
        break
      case Opcode.RET:
        return
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

function opAdd(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a + b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) + (b[i] as number))
  }
  throw new RuntimeError(`Can't ADD ${a} ${b}`, s.op.line)
}

function opSub(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a - b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) - (b[i] as number))
  }
  throw new RuntimeError(`Can't SUB ${a} ${b}`, s.op.line)
}

function opMul(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a * b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) * (b[i] as number))
  }
  throw new RuntimeError(`Can't SUB ${a} ${b}`, s.op.line)
}

function opDiv(s: State, a: Value, b: Value): Value {
  if (typeof a === "number" && typeof b === "number") {
    return a / b
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((_, i) => (a[i] as number) / (b[i] as number))
  }
  throw new RuntimeError(`Can't SUB ${a} ${b}`, s.op.line)
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
    const spec = OpSpecs.get(opcodeKey)!
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
