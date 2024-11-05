export type Vec2 = [number, number]

export function v2Equal(a: Vec2, b: Vec2): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

export function v2Add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]]
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function angleBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1])
}

export function angleBetweenAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function randn(): number {
  const a = 1 - Math.random()
  const b = Math.random()
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)
}
