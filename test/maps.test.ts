import { fromImage, Tile, Map } from "../src/maps"
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
