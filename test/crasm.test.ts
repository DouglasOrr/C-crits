import {
  Memory,
  parse,
  ParseError,
  parseLiteral,
  run,
  tokenise,
} from "../src/game/crasm"
import * as Maps from "../src/game/maps"

describe("tokenise", () => {
  it("should split a line into tokens", () => {
    expect(tokenise("MOV 12,50 $DST", 100)).toEqual([
      { t: "MOV", p: { line: 100, column: 0 } },
      { t: "12,50", p: { line: 100, column: 4 } },
      { t: "$DST", p: { line: 100, column: 10 } },
    ])
    expect(tokenise(" MOV 12,50  $DST ", 200)).toEqual([
      { t: "MOV", p: { line: 200, column: 1 } },
      { t: "12,50", p: { line: 200, column: 5 } },
      { t: "$DST", p: { line: 200, column: 12 } },
    ])
  })

  it("should strip comments", () => {
    expect(
      tokenise("MOV $SRC $DST; this comment", 100).map((t) => t.t)
    ).toEqual(["MOV", "$SRC", "$DST"])
  })

  it("should handle empty lines", () => {
    expect(tokenise("", 100)).toEqual([])
    expect(tokenise("   ", 100)).toEqual([])
    expect(tokenise(" ; only a comment", 100)).toEqual([])
  })
})

describe("parseLiteral", () => {
  const token = (t: string) => ({ t, p: { line: 100, column: 0 } })

  it("should parse labels, null, numbers", () => {
    expect(parseLiteral(token("@label"), [])).toEqual("@label")
    expect(parseLiteral(token("42"), [])).toEqual(42)
    expect(parseLiteral(token("null"), [])).toEqual(null)
  })

  it("should parse a comma-separated list of numbers", () => {
    expect(parseLiteral(token("12,34,56"), [])).toEqual([12, 34, 56])
    expect(parseLiteral(token("12,"), [])).toEqual([12])
    expect(parseLiteral(token(","), [])).toEqual([])
  })
})

describe("parse", () => {
  it("should report errors", () => {
    const badCode = [
      "@foo mov 1 $dst", // code after label
      "moo 1", // bad opcode
      "mov $a 1", // dest is literal
      "mov 1.0,a $tgt", // bad array literal
      "mov bad $dst", // bad literal
      "mov $src $dst $tgt", // too many args
    ]
    for (let badLine = 0; badLine < badCode.length; badLine++) {
      const code = badCode
        .map((line, i) => (i === badLine ? line : `; ${line}`))
        .join("\n")
      let success = false
      try {
        parse(code)
        success = true
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError)
        const error = e as ParseError
        expect(error.location.line).toBe(badLine)
        expect(error.show()).toContain(badCode[badLine])
      }
      expect(success).toBe(false)
    }
  })
})

describe("opcodes", () => {
  for (const { p, i, o } of [
    { p: "mov $a $b", i: { $a: 123 }, o: { $b: 123 } },
    { p: "add 10 20 $z", i: {}, o: { $z: 30 } },
    { p: "sub 5 20 $z", i: {}, o: { $z: -15 } },
    { p: "mul 3,4 2,4 $z", i: {}, o: { $z: [6, 16] } },
    { p: "div 9 6 $z", i: {}, o: { $z: 1.5 } },
    { p: "mod 9 6 $z", i: {}, o: { $z: 3 } },
    { p: "flor 12.7 $z", i: {}, o: { $z: 12 } },
    { p: "push 10 20 $z", i: {}, o: { $z: [10, 20] } },
    { p: "get 10,20 1 $z", i: {}, o: { $z: 20 } },
    { p: "vlen 3,4 $z", i: {}, o: { $z: 5 } },
    { p: "vdir 1,1 $z", i: {}, o: { $z: Math.PI / 4 } },
    { p: "unitv 0 $z", i: {}, o: { $z: [0, 1] } },
    { p: "jmp @n \n ret \n @n \n mov 42 $z", i: {}, o: { $z: 42 } },
    {
      p: "jez $a @n \n ret \n @n \n mov 42 $z", // taken
      i: { $a: null },
      o: { $z: 42 },
    },
    {
      p: "jnz $a @n \n mov 42 $z \n @n \n ret", // not taken
      i: { $a: 0 },
      o: { $z: 42 },
    },
    {
      p: "jlz $a @n \n ret \n @n \n mov 42 $z", // taken
      i: { $a: -1 },
      o: { $z: 42 },
    },
    {
      p: "jgz $a @n \n mov 42 $z \n @n \n ret", // not taken
      i: { $a: 0 },
      o: { $z: 42 },
    },
    { p: "mov 10 $z \n ret \n mov 20 $z", i: {}, o: { $z: 10 } },
    // Skip SEND and MAPL
  ]) {
    test(p?.replace("\n", "\\n"), () => {
      const program = parse(p)
      const memory = i as Memory
      run(program, memory, {} as Maps.Map, 100, null)
      for (const k of Object.keys(o)) {
        expect(memory[k]).toEqual((o as any)[k])
      }
    })
  }
})

test("parse--run", () => {
  const program = parse(`
    add 2,0 10,50 $tmp
    mov $tmp $dst
    ret
  `)
  const memory = {} as Memory
  run(program, memory, {} as Maps.Map, 100, null)
  expect(memory["$dst"]).toEqual([12, 50])
})
