import { fromImage, Tile, Map, findShortestPaths } from "../src/maps"
import { Image32, Vec2 } from "../src/common"

describe("fromImage", () => {
  it("handle land, water, bases", () => {
    const img: Image32 = {
      width: 2,
      height: 2,
      data: new Uint32Array([0x00000000, 0xffff0000, 0xff03f100, 0xff00f000]),
    }
    const expected: Map = {
      scale: 1,
      width: 2,
      height: 2,
      tiles: [Tile.Land, Tile.Land, Tile.Land, Tile.Water],
      basePosition: [
        [1, 0],
        [0, 0],
      ],
      baseDirection: [0, (Math.PI * 3) / 2],
    }
    expect(fromImage(img)).toEqual(expected)
  })
})

describe("findShortestPaths", () => {
  it("should find shortest paths in a simple map", () => {
    const map: Map = {
      scale: 1,
      width: 3,
      height: 3,
      // prettier-ignore
      tiles: [
        Tile.Land, Tile.Land, Tile.Land,
        Tile.Land, Tile.Water, Tile.Water,
        Tile.Land, Tile.Land, Tile.Land,
      ],
      basePosition: [],
      baseDirection: [],
    }
    const end: Vec2 = [1, 2]
    // prettier-ignore
    const expected = new Uint8Array([
      0, 7, 6,
      1, 255, 255,
      2, 255, 6,
    ])
    expect(findShortestPaths(map, end)).toEqual(expected)
  })
})
