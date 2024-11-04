import { Vec2, Updateable } from "./common"

export const S = {
  radius: 3,
}

export class Crit implements Updateable {
  constructor(public pos: Vec2, public angle: number) {}
  update(): void {}
}
