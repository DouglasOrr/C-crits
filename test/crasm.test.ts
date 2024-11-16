import { Memory, parse, parseLiteral, run, tokenise } from "../src/crasm"

describe("tokenise", () => {
  it("should split a line into tokens", () => {
    expect(tokenise("MOV 12,50 $DEST")).toEqual(["MOV", "12,50", "$DEST"])
    expect(tokenise(" MOV 12,50  $DEST ")).toEqual(["MOV", "12,50", "$DEST"])
  })

  it("should strip comments", () => {
    expect(tokenise("MOV $SRC $DEST; this comment")).toEqual([
      "MOV",
      "$SRC",
      "$DEST",
    ])
  })

  it("should handle empty lines", () => {
    expect(tokenise("")).toEqual([])
    expect(tokenise("   ")).toEqual([])
    expect(tokenise(" ; only a comment")).toEqual([])
  })
})

describe("parseLiteral", () => {
  it("should parse labels", () => {
    expect(parseLiteral("@label")).toEqual("@label")
  })

  it("should parse a single number", () => {
    expect(parseLiteral("42")).toEqual(42)
  })

  it("should parse a comma-separated list of numbers", () => {
    expect(parseLiteral("12,34,56")).toEqual([12, 34, 56])
    expect(parseLiteral("12,")).toEqual([12])
    expect(parseLiteral(",")).toEqual([])
  })
})

test("parse--run", () => {
  const program = parse(`
    mov 12,50 $tmp
    mov $tmp $dest
    ret
  `)
  const memory = {} as Memory
  run(program, memory)
  expect(memory["$dest"]).toEqual([12, 50])
})
