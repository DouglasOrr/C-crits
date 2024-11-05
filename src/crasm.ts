// Types

export type Value = null | number | string | number[]
export type Memory = { [key: string]: Value }
export enum Opcode {
  MOV,
  RET,
}
export type Arg = { register: string } | { literal: Value }
export type Op = { opcode: Opcode; args: Arg[]; line: number }
export type Program = { ops: Op[]; labels: { [key: string]: number } }

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

export function emptyProgram(): Program {
  return { ops: [], labels: {} }
}

export function tokenise(line: string): string[] {
  const withoutComments = (line.match(/^([^;]+)/) ?? [""])[0]
  return withoutComments.match(/([^ ]+)/g) ?? []
}

export function parseLiteral(token: string): Value {
  if (token.startsWith("@")) {
    return token
  }
  if (token.includes(",")) {
    return token
      .split(",")
      .filter((s) => s !== "")
      .map(Number)
  }
  return Number(token)
}

export function parse(source: string): Program {
  const lines = source.split("\n")
  const ops: Op[] = []
  const labels: { [key: string]: number } = {}
  for (let line = 0; line < lines.length; ++line) {
    const tokens = tokenise(lines[line])
    if (tokens.length == 0) {
    } else if (tokens[0].startsWith("@")) {
      labels[tokens[0]] = ops.length
    } else {
      const opcode = Opcode[tokens[0].toUpperCase() as keyof typeof Opcode]
      const args = tokens.slice(1).map((t) => {
        if (t.startsWith("$")) {
          return { register: t }
        } else {
          return { literal: parseLiteral(t) }
        }
      })
      ops.push({ opcode, args, line })
    }
  }
  return { ops, labels }
}
