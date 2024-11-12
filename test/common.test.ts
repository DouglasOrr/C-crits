import {
  angleBetween,
  angleBetweenAngle,
  clamp,
  distanceBetween,
  v2Add,
  v2Equal,
} from "../src/common"

const PI = Math.PI

describe("distanceBetween", () => {
  it("should calculate the distance between two points", () => {
    expect(distanceBetween([1, -1], [4, -5])).toBeCloseTo(5)
  })
})

describe("angleBetween", () => {
  it("should calculate the bearing angle between two points", () => {
    expect(angleBetween([0, 0], [1, 1])).toBeCloseTo(PI / 4)
    expect(angleBetween([0, 0], [0, 1])).toBeCloseTo(0)
    expect(angleBetween([0, 0], [1, 0])).toBeCloseTo(PI / 2)
    expect(angleBetween([0, 0], [0, -1])).toBeCloseTo(PI)
    expect(angleBetween([0, 0], [-1, 0])).toBeCloseTo(-PI / 2)
  })
})

describe("angleBetweenAngle", () => {
  it("should calculate the smallest angle between two angles", () => {
    expect(angleBetweenAngle(0, Math.PI)).toBeCloseTo(PI)
    expect(angleBetweenAngle(0, -Math.PI)).toBeCloseTo(-PI)
    expect(angleBetweenAngle(Math.PI, -Math.PI)).toBeCloseTo(0)
    expect(angleBetweenAngle(Math.PI - 0.1, -Math.PI + 0.2)).toBeCloseTo(0.3)
    expect(angleBetweenAngle(-Math.PI + 0.2, Math.PI - 0.1)).toBeCloseTo(-0.3)
  })
})

describe("clamp", () => {
  it("should clamp a value within the given range", () => {
    expect(clamp(5, -1, 10)).toBe(5)
    expect(clamp(-2, -1, 10)).toBe(-1)
    expect(clamp(20, -1, 10)).toBe(10)
  })
})

describe("v2Equal,v2Add", () => {
  it("should behave like vector values", () => {
    expect(v2Equal(v2Add([10, 20], [5, -6]), [15, 14])).toBe(true)
    expect(v2Equal(v2Add([0, 0], [1, 2]), [1, 2.1])).toBe(false)
  })
})
