// Definitions

export type Value = null | number | string | number[]
export type Memory = { [key: string]: Value }
export enum Opcode {
  MOV,
  RET,
}
export const OpSpecs = new Map<string, (string | string[])[]>([
  ["MOV", [["register", "literal"], "register"]],
  ["RET", []],
])
export type Arg = { register: string } | { literal: Value }
export type Op = { opcode: Opcode; args: Arg[]; line: number }
export type Program = { ops: Op[]; labels: { [key: string]: number } }

export function emptyProgram(): Program {
  return { ops: [], labels: {} }
}

// Execution

function load(memory: Memory, arg: Arg): Value {
  if ("register" in arg) {
    return memory[arg.register]
  }
  if ("literal" in arg) {
    return arg.literal
  }
  throw new Error(`Unexpected arg: ${arg}`)
}

function destRegister(arg: Arg): string {
  if ("register" in arg) {
    return arg.register
  }
  throw new Error(`Expected destination to be a register: ${arg}`)
}

export function run(program: Program, memory: Memory): void {
  for (const op of program.ops) {
    switch (op.opcode) {
      case Opcode.MOV:
        memory[destRegister(op.args[1])] = load(memory, op.args[0])
        break
      case Opcode.RET:
        return
    }
  }
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
