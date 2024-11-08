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
