import * as Sim from "../sim"

function formatValue(value: any): string {
  if (typeof value === "number") {
    return value.toFixed(Math.floor(value) === value ? 0 : 2)
  }
  if (Array.isArray(value)) {
    return (
      `${value.map(formatValue).join(",")}` + (value.length <= 1 ? "," : "")
    )
  }
  return String(value)
}

export class Page {
  // Main
  sim: HTMLElement
  // Overlays
  fpsCounter: HTMLElement
  outcome: HTMLElement
  // Dev panel
  buttonPlayPause: HTMLElement
  buttonUpload: HTMLElement
  buttonRestart: HTMLElement
  inputSearch: HTMLElement
  editor: HTMLTextAreaElement
  output: HTMLElement
  debug: HTMLElement

  constructor() {
    // Main
    this.sim = document.getElementById("col-sim")!
    // Overlays
    this.fpsCounter = document.getElementById("fps-counter")!
    this.outcome = document.getElementById("outcome")!
    // Dev panel
    this.buttonPlayPause = document.getElementById("button-play-pause")!
    this.buttonUpload = document.getElementById("button-upload")!
    this.buttonRestart = document.getElementById("button-restart")!
    this.inputSearch = document.getElementById("input-search")!
    this.editor = document.getElementById("editor")! as HTMLTextAreaElement
    this.output = document.getElementById("output")!
    this.debug = document.getElementById("debug")!

    // Listeners
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === ".") {
        this.buttonPlayPause.click()
      }
      if (event.ctrlKey && event.key === "Enter") {
        this.buttonUpload.click()
      }
    })
  }

  updateDebug(event: Sim.Event, data?: any): void {
    if (event === Sim.Event.ProgramError) {
      console.error(data)
      this.output.textContent = data.show()
      this.output.dataset.status = "error"
    }
    if (event === Sim.Event.ProgramLoad) {
      this.output.textContent = "Program loaded"
      this.output.dataset.status = "ok"
    }
    if (event === Sim.Event.ProgramDebug) {
      if (data === null) {
        this.debug.textContent = "No critter selected"
        this.debug.dataset.status = "none"
      } else {
        const error = document.createElement("div")
        if (data.error !== null) {
          error.textContent = data.error.message + "\n------"
          if (data.error.line !== undefined) {
            error.textContent = `L${data.error.line} ${error.textContent}`
          }
          this.debug.dataset.status = "error"
        } else {
          this.debug.dataset.status = "none"
        }
        const table = document.createElement("table")
        for (const key in data.mem) {
          const row = table.insertRow()
          row.insertCell().textContent = key
          row.insertCell().textContent = formatValue(data.mem[key])
        }
        this.debug.replaceChildren(error, table)
      }
    }
  }

  createFpsCounter(): { update: () => void } {
    let frameCount = 0
    setInterval(() => {
      this.fpsCounter.textContent = `${frameCount} fps`
      frameCount = 0
    }, 1000)
    return {
      update: () => {
        frameCount += 1
      },
    }
  }
}
