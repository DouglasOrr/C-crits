import {
  Memory,
  parse,
  ParseError,
  parseLiteral,
  run,
  tokenise,
} from "../src/crasm"

describe("tokenise", () => {
  it("should split a line into tokens", () => {
    expect(tokenise("MOV 12,50 $DEST", 100)).toEqual([
      { t: "MOV", p: { line: 100, column: 0 } },
      { t: "12,50", p: { line: 100, column: 4 } },
      { t: "$DEST", p: { line: 100, column: 10 } },
    ])
    expect(tokenise(" MOV 12,50  $DEST ", 200)).toEqual([
      { t: "MOV", p: { line: 200, column: 1 } },
      { t: "12,50", p: { line: 200, column: 5 } },
      { t: "$DEST", p: { line: 200, column: 12 } },
    ])
  })

  it("should strip comments", () => {
    expect(
      tokenise("MOV $SRC $DEST; this comment", 100).map((t) => t.t)
    ).toEqual(["MOV", "$SRC", "$DEST"])
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
      "@foo mov 1 $dest", // code after label
      "moo 1", // bad opcode
      "mov $a 1", // dest is literal
      "mov 1.0,a $tgt", // bad array literal
      "mov bad $dest", // bad literal
      "mov $src $dest $tgt", // too many args
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

test("parse--run", () => {
  const program = parse(`
    add 2,0 10,50 $tmp
    mov $tmp $dest
    ret
  `)
  const memory = {} as Memory
  run(program, memory, 100)
  expect(memory["$dest"]).toEqual([12, 50])
})
