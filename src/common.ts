export type Vec2 = [number, number]

export function v2Equal(a: Vec2, b: Vec2): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

export function v2Add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]]
}

export function v2Floor(a: Vec2): Vec2 {
  return [Math.floor(a[0]), Math.floor(a[1])]
}

export function v2SampleDisc(radius: number): Vec2 {
  // Sample from a 3-sphere and project onto a 2-ball
  const x = randn(), y = randn(), z = randn(), w = randn() // prettier-ignore
  const r = Math.hypot(x, y, z, w)
  return [(x / r) * radius, (y / r) * radius]
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

export function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x))
}

export function randn(): number {
  const a = 1 - Math.random()
  const b = Math.random()
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)
}

export type Image32 = { width: number; height: number; data: Uint32Array }
