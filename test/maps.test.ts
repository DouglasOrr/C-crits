import { Image32, Vec2 } from "../src/common"
import { findShortestPaths, fromImage, Map, Tile } from "../src/game/maps"

describe("fromImage", () => {
  it("handle land, water, bases", () => {
    const img: Image32 = {
      width: 2,
      height: 2,
      data: new Uint32Array([0x00000000, 0xffff0000, 0xff03f100, 0xff00f000]),
    }
    const expected: Map = {
      width: 2,
      height: 2,
      tiles: [Tile.Base, Tile.Base, Tile.Land, Tile.Water],
      basePosition: [
        [1, 0],
        [0, 0],
      ],
      baseDirection: [0, 6],
    }
    expect(fromImage(img)).toEqual(expected)
  })
})

describe("findShortestPaths", () => {
  it("should find shortest paths in a simple map", () => {
    const map: Map = {
      width: 4,
      height: 3,
      // prettier-ignore
      tiles: [
        Tile.Land, Tile.Land, Tile.Land, Tile.Land,
        Tile.Land, Tile.Land, Tile.Water, Tile.Water,
        Tile.Land, Tile.Land, Tile.Land, Tile.Land,
      ],
      basePosition: [],
      baseDirection: [],
    }
    const end: Vec2 = [2, 2]
    // prettier-ignore
    const expected = new Uint8Array([ // note mirrored-y
      1, 0, 6, 6,
      1, 0, 0, 0,
      2, 2, 255, 6,
    ])
    expect(findShortestPaths(map, end)).toEqual(expected)
  })
})
