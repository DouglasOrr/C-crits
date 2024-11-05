import { Vec2, Updateable } from "./common"
import { Memory } from "./crasm"

export const S = {
  radius: 3,
}

export class Crit implements Updateable {
  memory: Memory = {}
  constructor(public pos: Vec2, public angle: number) {}
  update(): void {}
}
