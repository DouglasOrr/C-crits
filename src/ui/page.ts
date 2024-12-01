import * as Crasm from "../game/crasm"
import * as Sim from "../game/sim"
import * as THREE from "three"
import { Vec2 } from "../common"

import { createEditor, languageMap, PrismEditor } from "prism-code-editor"
import { defaultCommands } from "prism-code-editor/commands"
import { languages } from "prism-code-editor/prism"

import "prism-code-editor/layout.css"
import "prism-code-editor/scrollbar.css"
import "prism-code-editor/themes/github-dark.css"

import {
  dom as faDom,
  library as faLibrary,
} from "@fortawesome/fontawesome-svg-core"
import {
  faClose,
  faPause,
  faPlay,
  faUpload,
  faStar,
} from "@fortawesome/free-solid-svg-icons"
import { faStar as faStarRegular } from "@fortawesome/free-regular-svg-icons"

languages.crasm = {
  comment: /;.*/,
  number: {
    pattern: /\b[\d.,]+/,
  },
  operator: {
    pattern: new RegExp(
      "\\b(?:" +
        Crasm.OpSpecs.map((s) => Crasm.Opcode[s.code].toLowerCase()).join("|") +
        ")\\b",
      "i"
    ),
  },
  keyword: {
    pattern: /null/,
  },
  function: {
    pattern: /@[\w-]+/,
  },
  string: {
    pattern: /\$[\w-]+/,
  },
}
languageMap.crasm = {
  comments: { line: ";" },
}

export type Event = {
  name: "play" | "pause" | "upload" | "quit" | "select-critter" | "set-marker"
  position?: Vec2
}

function formatValue(value: any): string {
  if (typeof value === "number") {
    return value.toFixed(Math.floor(value) === value ? 0 : 1)
  }
  if (Array.isArray(value)) {
    const s = `${value.map(formatValue).join(",")}`
    return s + (value.length <= 1 ? "," : "")
  }
  return String(value)
}

export class Page {
  // Main
  menu: HTMLElement
  sim: HTMLElement
  renderer: THREE.WebGLRenderer
  // Overlays
  gameTime: HTMLElement
  fpsCounter: HTMLElement
  dev: HTMLElement
  // Dev panel
  buttonPlayPause: HTMLElement
  buttonUpload: HTMLElement
  buttonQuit: HTMLElement
  inputSearch: HTMLInputElement
  searchResults: HTMLElement
  editor: PrismEditor
  output: HTMLElement
  debug: HTMLElement
  // Instructions
  instructions: HTMLElement
  // State
  events: (event: Event) => void = () => {}
  private frameCount: number = 0

  constructor() {
    // Main
    this.menu = document.getElementById("menu")!
    this.sim = document.getElementById("col-sim")!
    // Overlays
    this.gameTime = document.getElementById("overlay-time")!
    this.fpsCounter = document.getElementById("overlay-fps")!
    this.dev = document.getElementById("overlay-dev")!
    // Dev panel
    this.buttonPlayPause = document.getElementById("button-play-pause")!
    this.buttonUpload = document.getElementById("button-upload")!
    this.buttonQuit = document.getElementById("button-quit")!
    this.inputSearch = document.getElementById(
      "input-search"
    )! as HTMLInputElement
    this.searchResults = document.getElementById("search-results")!
    this.output = document.getElementById("output")!
    this.debug = document.getElementById("debug")!
    // Instructions
    this.instructions = document.getElementById("instructions")!

    // JS Libraries
    faLibrary.add(faPlay, faPause, faUpload, faClose, faStar, faStarRegular)
    faDom.watch()
    this.editor = createEditor(
      "#editor-container",
      { language: "crasm" },
      defaultCommands()
    )
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setClearColor(
      new THREE.Color(getComputedStyle(document.body).backgroundColor)
    )
    this.renderer.setSize(this.sim.offsetWidth, this.sim.offsetHeight)
    this.sim.appendChild(this.renderer.domElement)
    window.addEventListener("resize", () => {
      this.renderer.setSize(this.sim.offsetWidth, this.sim.offsetHeight)
    })

    // FPS
    setInterval(() => {
      this.fpsCounter.textContent = `${this.frameCount} fps`
      this.frameCount = 0
    }, 1000)

    // Listeners
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === ".") {
        this.buttonPlayPause.click()
      }
      if (event.ctrlKey && event.key === "Enter") {
        this.buttonUpload.click()
      }
      if (event.ctrlKey && event.key === "f") {
        this.inputSearch.focus()
        event.preventDefault()
      }
      if (event.ctrlKey && event.key.toLowerCase() === "q") {
        this.buttonQuit.click()
      }
    })
    // Forcibly override the prism editor handler for Ctrl+Enter and (Shift)+Tab
    this.editor.textarea.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey && event.key === "Enter") {
          this.buttonUpload.click()
          event.stopPropagation()
        }
        if (event.key === "Tab") {
          event.stopPropagation()
          event.preventDefault()
          // Manual tab order
          document
            .getElementById(
              event.shiftKey ? "input-search" : "button-play-pause"
            )
            ?.focus()
        }
      },
      { capture: true }
    )
    // For symmetry with editor:Tab
    this.buttonPlayPause.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && event.shiftKey) {
        this.editor.textarea.focus()
        event.preventDefault()
      }
    })

    const updateSearchResults = () => {
      const input = this.inputSearch
      const query = input.value.trim()
      const results = Crasm.searchDocs(query).slice(0, 6)

      this.searchResults.style.width = `${input.clientWidth}px`
      this.searchResults.style.top = `${input.offsetTop + input.offsetHeight}px`
      this.searchResults.style.left = `${input.offsetLeft}px`
      this.searchResults.replaceChildren(
        ...results.map((result) => {
          const spec = document.createElement("code")
          spec.textContent = result.spec
          const description = document.createElement("p")
          description.textContent = result.description
          const div = document.createElement("div")
          div.appendChild(spec)
          div.appendChild(description)
          return div
        })
      )
      this.searchResults.style.display = results.length > 0 ? "block" : "none"
    }
    this.inputSearch.addEventListener("focus", (e) => {
      this.searchResults.style.display = "block"
      updateSearchResults()
    })
    this.inputSearch.addEventListener("blur", (e) => {
      this.searchResults.style.display = "none"
    })
    this.inputSearch.addEventListener("input", (e) => {
      updateSearchResults()
    })

    // Events
    this.buttonPlayPause.addEventListener("click", () => {
      const status = this.buttonPlayPause.dataset.status as "play" | "pause"
      this.events({ name: status })
      this.updatePlayPause(status === "pause")
    })
    this.buttonUpload.addEventListener("click", () => {
      this.events({ name: "upload" })
    })
    this.buttonQuit.addEventListener("click", () => {
      this.events({ name: "quit" })
    })
    this.renderer.domElement.addEventListener(
      "contextmenu",
      (e: MouseEvent) => {
        if (!(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) {
          e.preventDefault()
          this.events({
            name: "set-marker",
            position: [e.clientX, e.clientY],
          })
        }
      }
    )
    this.renderer.domElement.addEventListener("click", (e: MouseEvent) => {
      this.events({
        name: "select-critter",
        position: [e.clientX, e.clientY],
      })
    })
  }

  enableFpsCounter(): void {
    this.fpsCounter.style.display = "inherit"
  }

  updateGameTime(time: number): void {
    if (this.gameTime) {
      const minutes = Math.floor(time / 60)
        .toString()
        .padStart(2, "0")
      const seconds = Math.floor(time % 60)
        .toString()
        .padStart(2, "0")
      this.gameTime.textContent = `${minutes}:${seconds}`
    }
  }

  updateDebug(event: Sim.Event, data?: any): void {
    if (event === Sim.Event.ProgramError) {
      console.error(data)
      if (data.unknownError !== undefined) {
        this.output.textContent = `Unknown error '${data.unknownError}'`
      } else {
        this.output.textContent = data.show()
      }
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
            error.textContent = `L${data.error.line + 1} ${error.textContent}`
          }
          this.debug.dataset.status = data.error.warning ? "warning" : "error"
        } else {
          this.debug.dataset.status = "none"
        }
        const table = document.createElement("div")
        table.classList.add("debug-table")
        const keys = Object.keys(data.mem)
        for (const key of keys) {
          const value = key === "$passwd" ? "<?>" : formatValue(data.mem[key])
          const cell = document.createElement("div")
          cell.classList.add("debug-cell")
          cell.textContent = `${key}: ${value}`
          table.append(cell)
        }
        this.debug.replaceChildren(error, table)
      }
    }
  }

  clearInstructions(): void {
    this.instructions.replaceChildren()
  }
  addInstruction(instruction: string): void {
    const li = document.createElement("li")
    li.innerHTML = instruction
    this.instructions.insertBefore(li, this.instructions.firstChild)
  }

  setDefaultProgram(program: string): void {
    if (this.editor.textarea.value === "") {
      this.editor.textarea.value = program
      this.editor.update()
    }
  }

  updatePlayPause(play: boolean) {
    const icon = this.buttonPlayPause.children[0].classList
    if (play) {
      this.buttonPlayPause.dataset.status = "play"
      icon.add("fa-play")
      icon.remove("fa-pause")
    } else {
      this.buttonPlayPause.dataset.status = "pause"
      icon.add("fa-pause")
      icon.remove("fa-play")
    }
  }

  showMenu(
    title: string,
    options: {
      name: string
      pre?: HTMLElement
      action?: (e: HTMLElement) => void
    }[],
    context?: { name: string; body: Node }
  ): void {
    this.menu.style.display = "block"
    this.menu.replaceChildren()

    if (context !== undefined) {
      this.menu.append(
        createMenuTitleSpan(title),
        `cat ${context.name}`,
        context.body
      )
      options = options.slice()
      options.unshift({ name: context.name, action: () => {} })
    }

    const eOptions = document.createElement("ul")
    eOptions.id = "menu-options"
    eOptions.append(
      ...options.map((option) => {
        const li = document.createElement("li")
        li.dataset.name = option.name
        if (option.pre !== undefined) {
          li.append(option.pre)
          li.append(" ")
        }
        li.appendChild(document.createTextNode(option.name))
        if (option.action !== undefined) {
          li.addEventListener("click", async () => {
            option.action!(li)
          })
        }
        return li
      })
    )
    this.menu.append(createMenuTitleSpan(title), "ls", eOptions)

    const command = document.createElement("div")
    const input = document.createElement("input")
    input.id = "menu-cmd"
    input.type = "text"
    input.spellcheck = false
    input.placeholder = "<cmd>"
    command.replaceChildren(createMenuTitleSpan(title), "./", input)
    input.addEventListener("keydown", (e) => {
      input.dataset.status = "ok"
      if (e.key === "Enter") {
        const matches = Array.from(eOptions.querySelectorAll("li")).filter(
          (node) =>
            node.dataset.name
              ?.toLowerCase()
              .startsWith(input.value.toLowerCase())
        )
        if (matches.length === 1) {
          matches[0].click()
          input.value = ""
        } else {
          input.dataset.status = "error"
        }
      }
    })
    this.menu.append(command)
    input.focus()
  }

  hideMenu(): void {
    this.menu.style.display = "none"
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera)
    this.frameCount += 1
  }
}

function createMenuTitleSpan(title: string): HTMLElement {
  const e = document.createElement("span")
  e.classList.add("menu-title")
  e.textContent = `[${title}]$ `
  return e
}

export function createLevelStatus(
  completed: boolean,
  achieved: boolean
): HTMLElement {
  const e = document.createElement("span")
  e.classList.add("menu-option-preamble")
  const i0 = document.createElement("i")
  if (completed) {
    i0.classList.add("fa-solid", "fa-star")
  } else {
    i0.classList.add("fa-regular", "fa-star")
  }
  const i1 = document.createElement("i")
  if (achieved) {
    i1.classList.add("fa-solid", "fa-star")
  } else {
    i1.classList.add("fa-regular", "fa-star")
  }
  e.replaceChildren("[", i0, " ", i1, "]")
  return e
}

export function createReport(...text: string[]): HTMLElement {
  const report = document.createElement("div")
  report.classList.add("menu-context")
  const pre = document.createElement("pre")
  pre.textContent = text.join("\n\n")
  report.append(pre)
  return report
}

export function createLevelReport(
  level: string,
  completed: boolean,
  achievement: { name: string; description: string },
  achieved: boolean,
  lossses: [number, number, number]
): HTMLElement {
  const report = document.createElement("div")
  report.classList.add("menu-context")
  const pre = document.createElement("pre")

  const outcome = `# Outcome: ${completed ? "VICTORY!" : "Defeat."}`
  const targetLen = 25
  const bonus =
    `#   Bonus: ${achieved ? "YES!" : "NO. "}`.padEnd(targetLen) +
    ` ; ${achievement.name} (${achievement.description})`
  const losses =
    `#  Losses: ${lossses[0]} / ${lossses[1]} / ${lossses[2]}`.padEnd(
      targetLen
    ) + " ; friendly / enemy / neutral"

  pre.textContent = "#\n#\n" + [outcome, bonus, losses].join("\n#\n") + "\n#"
  report.replaceChildren(
    `### Battle report :: ${level} `,
    createLevelStatus(completed, achieved),
    pre
  )
  return report
}
