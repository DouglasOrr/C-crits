export const S = {
  minFps: 30, // 1/s
  timeSlowingLambda: 1.0, // #
}

export type PhysicsLoop = { update: () => void; dt: number }

export class Loop {
  running: boolean = true
  count: number = 0
  lastUpdate?: number // ms
  physicsTime: number[]
  timeSlowing: number = 1

  constructor(
    private render: (dt: number) => void,
    private physics: PhysicsLoop[]
  ) {
    this.physicsTime = physics.map(() => 0)
    requestAnimationFrame(this.loop.bind(this))
  }

  private loop(time: DOMHighResTimeStamp) {
    time /= 1000
    if (this.lastUpdate === undefined || !this.running) {
      this.lastUpdate = time
    }
    const dt = time - this.lastUpdate
    // Slow down the physics to prevent queueing up updates
    this.timeSlowing = Math.max(
      1,
      this.timeSlowing * Math.pow(2, S.timeSlowingLambda * (dt - 1 / S.minFps))
    )
    const physicsDt = dt / this.timeSlowing

    // Updates
    this.render(dt)
    this.physics.forEach((physics, i) => {
      this.physicsTime[i] += physicsDt
      while (this.physicsTime[i] >= physics.dt) {
        physics.update()
        this.physicsTime[i] -= physics.dt
      }
    })

    // Re-schedule loop
    this.lastUpdate = time
    requestAnimationFrame(this.loop.bind(this))
  }

  toggleRunning() {
    this.running = !this.running
  }
}
