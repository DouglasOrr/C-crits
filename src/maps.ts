import { Image32, Vec2 } from "./common"

export enum Tile {
  Land,
  Water,
}

export type Map = {
  scale: number
  width: number
  height: number
  tiles: Tile[] // (height * width)
  basePosition: Vec2[] // nBases
  baseDirection: number[] // nBases
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
    // Bitwise ops are signed, >>> 0 casts to unsigned
    if ((px & 0xff00f000) >>> 0 === 0xff00f000) {
      const index = (px & 0x00000f00) >>> 8
      const direction = (((px & 0x000f0000) >>> 16) * Math.PI) / 2
      basePosition[index] = [x, y]
      baseDirection[index] = direction
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
    scale: 1,
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
  ids: number[] = []
  costs: number[] = []
  id_to_index: (number | undefined)[] = []

  push(id: any, cost: number): void {
    this.ids.push(id)
    this.costs.push(cost)
    this.id_to_index[id] = this.ids.length - 1
    this.decreaseCost(this.ids.length - 1, cost)
  }
  swap(i0: number, i1: number): void {
    this.id_to_index[this.ids[i0]] = i1
    this.id_to_index[this.ids[i1]] = i0
    ;[this.costs[i0], this.costs[i1]] = [this.costs[i1], this.costs[i0]]
    ;[this.ids[i0], this.ids[i1]] = [this.ids[i1], this.ids[i0]]
  }
  contains(id: number): boolean {
    return this.id_to_index[id] !== undefined
  }
  getCost(id: number): number {
    return this.costs[this.id_to_index[id]!]
  }
  decreaseCost(id: number, cost: number): void {
    let index = this.id_to_index[id]!
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
    if (this.ids.length === 0) {
      throw new Error("Queue is empty")
    }
    const [result, resultCost] = [this.ids[0], this.costs[0]]
    if (this.ids.length === 1) {
      this.id_to_index[this.ids[0]] = undefined
      this.ids.pop()
      this.costs.pop()
      return [result, resultCost]
    }
    this.id_to_index[this.ids[0]] = undefined
    this.ids[0] = this.ids.pop()!
    this.costs[0] = this.costs.pop()!
    this.id_to_index[this.ids[0]] = 0

    let index = 0
    while (true) {
      const left = 2 * index + 1
      const right = 2 * index + 2
      if (left >= this.ids.length) {
        break
      }
      const smaller =
        this.costs.length <= right || this.costs[left] < this.costs[right]
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
// The direction is in PI/4 increments, 0 is up, 1 is up-right, etc.
// Unreachable & `end` tiles are marked with 255.
export function findShortestPaths(map: Map, end: Vec2): Uint8Array {
  const paths = new Uint8Array(map.width * map.height).fill(255)
  const queue = new Queue()
  queue.push(end[1] * map.width + end[0], 0)
  const visited: boolean[] = new Array(map.width * map.height).fill(false)
  while (queue.ids.length > 0) {
    const [index, cost] = queue.pop()
    visited[index] = true
    for (let [d, dx, dy] of [
      [0, 0, -1],
      [1, -1, -1],
      [2, -1, 0],
      [3, -1, 1],
      [4, 0, 1],
      [5, 1, 1],
      [6, 1, 0],
      [7, 1, -1],
    ]) {
      const x = (index % map.width) + dx
      const y = Math.floor(index / map.width) + dy
      const nextIndex = y * map.width + x
      if (
        0 <= x &&
        x < map.width &&
        0 <= y &&
        y < map.height &&
        map.tiles[nextIndex] !== Tile.Water
      ) {
        const nextCost = cost + Math.sqrt(Math.abs(dx) + Math.abs(dy))
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
    }
  }
  return paths
}
