import { Image32, v2Equal, v2Floor, Vec2 } from "./common"

export type Level = {
  map: Map
  initialCritters: number[]
  maxCritters: number[]
}

export enum Tile {
  Land,
  Water,
  Base,
}

export type Map = {
  width: number
  height: number
  tiles: Tile[] // (height * width)
  basePosition: Vec2[] // nBases
  baseDirection: number[] // nBases
}

export const Directions: Vec2[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
]
export const NoDirection = 255

export function inBounds(p: Vec2, map: Map): boolean {
  return 0 <= p[0] && p[0] < map.width && 0 <= p[1] && p[1] < map.height
}

export function fromImage(img: Image32): Map {
  const tiles = new Array(img.width * img.height).fill(Tile.Land)
  const basePosition: Vec2[] = []
  const baseDirection: number[] = []
  for (let i = 0; i < img.data.length; i++) {
    const x = i % img.width
    const y = img.height - 1 - Math.floor(i / img.width)
    const px = img.data[i]
    if (px === 0xffff0000) {
      tiles[y * img.width + x] = Tile.Water
    }
    // Note: bitwise ops are signed, >>> 0 casts to unsigned
    else if ((px & 0xff00f000) >>> 0 === 0xff00f000) {
      const index = (px & 0x00000f00) >>> 8
      const direction = 2 * ((px & 0x000f0000) >>> 16)
      basePosition[index] = [x, y]
      baseDirection[index] = direction
      tiles[y * img.width + x] = Tile.Base
    }
  }
  // Check we never missed a base
  for (let i = 0; i < basePosition.length; i++) {
    if (basePosition[i] === undefined) {
      throw new Error(
        `Base ${i} not found (${basePosition.length} bases total)`
      )
    }
  }
  return {
    width: img.width,
    height: img.height,
    tiles: tiles,
    basePosition: basePosition,
    baseDirection: baseDirection,
  }
}

// A binary heap priority queue, with a mapping from id to index
// and a decreaseCost method, for sake of Dijsktra's algorithm
class Queue {
  private ids: Uint32Array
  private costs: Float32Array
  private idToIndex: Int32Array
  private _length: number = 0

  constructor(n: number) {
    this.ids = new Uint32Array(n)
    this.costs = new Float32Array(n)
    this.idToIndex = new Int32Array(n).fill(-1)
  }

  get length(): number {
    return this._length
  }
  contains(id: number): boolean {
    return this.idToIndex[id] !== -1
  }
  getCost(id: number): number {
    return this.costs[this.idToIndex[id]]
  }
  push(id: any, cost: number): void {
    this.ids[this._length] = id
    this.costs[this._length] = cost
    this.idToIndex[id] = this._length
    this._length++
    this.decreaseCost(id, cost)
  }
  private swap(i0: number, i1: number): void {
    this.idToIndex[this.ids[i0]] = i1
    this.idToIndex[this.ids[i1]] = i0
    ;[this.costs[i0], this.costs[i1]] = [this.costs[i1], this.costs[i0]]
    ;[this.ids[i0], this.ids[i1]] = [this.ids[i1], this.ids[i0]]
  }
  decreaseCost(id: number, cost: number): void {
    let index = this.idToIndex[id]
    this.costs[index] = cost
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.costs[parent] <= this.costs[index]) {
        break
      }
      this.swap(parent, index)
      index = parent
    }
  }
  pop(): [number, number] {
    if (this._length === 0) {
      throw new Error("Queue is empty")
    }
    const [result, resultCost] = [this.ids[0], this.costs[0]]
    this._length--
    this.idToIndex[this.ids[0]] = -1
    this.ids[0] = this.ids[this._length]
    this.costs[0] = this.costs[this._length]
    this.idToIndex[this.ids[0]] = 0

    let index = 0
    while (true) {
      const left = 2 * index + 1
      const right = 2 * index + 2
      if (left >= this._length) {
        break
      }
      const smaller =
        this._length <= right || this.costs[left] < this.costs[right]
          ? left
          : right
      if (this.costs[smaller] < this.costs[index]) {
        this.swap(index, smaller)
        index = smaller
      } else {
        break
      }
    }
    return [result, resultCost]
  }
}

// Return a mapping from index to direction, for all-points shortest path to start
// The direction is in PI/4 increments, 0 is up, 1 is up-right, etc (see `Directions`).
// The `end` tile is marked with 255.
export function findShortestPaths(map: Map, end: Vec2): Uint8Array {
  const paths = new Uint8Array(map.width * map.height).fill(NoDirection)
  const queue = new Queue(map.width * map.height)
  queue.push(end[1] * map.width + end[0], 0)
  const visited: boolean[] = new Array(map.width * map.height).fill(false)
  while (queue.length > 0) {
    const [index, cost] = queue.pop()
    const x = index % map.width
    const y = Math.floor(index / map.width)
    visited[index] = true
    Directions.map(([dx, dy], d) => {
      const nextX = x - dx
      const nextY = y - dy
      const nextIndex = nextY * map.width + nextX
      if (0 <= nextX && nextX < map.width && 0 <= nextY && nextY < map.height) {
        // Avoid moving into or taking diagonal shortcuts through non-land
        const isSlow =
          map.tiles[nextIndex] !== Tile.Land ||
          map.tiles[y * map.width + x - dx] !== Tile.Land ||
          map.tiles[(y - dy) * map.width + x] !== Tile.Land
        const nextCost =
          cost + Math.sqrt(Math.abs(dx) + Math.abs(dy)) + 1000 * +isSlow
        if (queue.contains(nextIndex)) {
          if (nextCost < queue.getCost(nextIndex)) {
            queue.decreaseCost(nextIndex, nextCost)
            paths[nextIndex] = d
          }
        } else if (!visited[nextIndex]) {
          queue.push(nextIndex, nextCost)
          paths[nextIndex] = d
        }
      }
    })
  }
  return paths
}

// Lazily compute and cache shortest paths to all points
export class Pathfinder {
  private endToPaths: Uint8Array[]

  constructor(public map: Map) {
    this.endToPaths = new Array(map.width * map.height).fill(null)
  }

  direction(start: Vec2, end: Vec2): number {
    start = v2Floor(start)
    end = v2Floor(end)
    if (v2Equal(start, end)) {
      return NoDirection
    }
    const startIndex = start[1] * this.map.width + start[0]
    const endIndex = end[1] * this.map.width + end[0]
    let paths = this.endToPaths[endIndex]
    if (paths === null) {
      paths = this.endToPaths[endIndex] = findShortestPaths(this.map, end)
    }
    return paths[startIndex]
  }
}
