import { Image32 } from "../common"
import * as AI from "./ai"
import * as Crasm from "./crasm"
import * as Maps from "./maps"

export type Level = {
  map: Maps.Map
  initialCritters: number[]
  maxCritters: number[]
  program: Crasm.Program[]
}

export const Levels = [
  {
    name: "0-standard",
    map: "standard",
    initialCritters: [10, 10, 1, 1],
    maxCritters: [20, 20, 5, 5],
    program: ["Defensive", "Defensive", "Defensive"],
  },
  {
    name: "1-crossing",
    map: "crossing",
    initialCritters: [20, 20],
    maxCritters: [50, 50],
    program: ["Defensive"],
  },
]

async function loadImage(src: string): Promise<Image32> {
  const img = new Image()
  img.src = src
  await img.decode()
  const ctx = document.createElement("canvas").getContext("2d")!
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, img.width, img.height)
  const uint32Array = new Uint32Array(imageData.data.buffer)
  return {
    width: img.width,
    height: img.height,
    data: uint32Array,
  }
}

export async function load(name: string): Promise<Level> {
  const data = Levels.find((level) => level.name === name)!
  const map = Maps.fromImage(await loadImage(`maps/${data["map"]}.png`))
  const program = data["program"].map((key: string | null) =>
    key === null
      ? Crasm.emptyProgram()
      : Crasm.parse(AI[key as keyof typeof AI])
  )
  return {
    map,
    initialCritters: data.initialCritters,
    maxCritters: data.maxCritters,
    program,
  }
}
