import * as Crasm from "../game/crasm"
import * as Sim from "../game/sim"

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
  faPause,
  faPlay,
  faClose,
  faUpload,
} from "@fortawesome/free-solid-svg-icons"

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
  // Memu
  menu: HTMLElement
  menuOptions: HTMLElement
  menuCmd: HTMLInputElement
  menuTitle: NodeListOf<HTMLElement>
  // Main
  sim: HTMLElement
  // Overlays
  fpsCounter: HTMLElement
  dev: HTMLElement
  // Dev panel
  buttonPlayPause: HTMLElement
  buttonUpload: HTMLElement
  buttonQuit: HTMLElement
  inputSearch: HTMLElement
  searchResults: HTMLElement
  editor: PrismEditor
  output: HTMLElement
  debug: HTMLElement
  private frameCount: number = 0

  constructor() {
    // Menu
    this.menu = document.getElementById("menu")!
    this.menuOptions = document.getElementById("menu-options")!
    this.menuCmd = document.getElementById("menu-cmd")! as HTMLInputElement
    this.menuTitle = document.querySelectorAll(".menu-title")
    // Main
    this.sim = document.getElementById("col-sim")!
    // Overlays
    this.fpsCounter = document.getElementById("overlay-fps")!
    this.dev = document.getElementById("overlay-dev")!
    // Dev panel
    this.buttonPlayPause = document.getElementById("button-play-pause")!
    this.buttonUpload = document.getElementById("button-upload")!
    this.buttonQuit = document.getElementById("button-quit")!
    this.inputSearch = document.getElementById("input-search")!
    this.searchResults = document.getElementById("search-results")!
    this.output = document.getElementById("output")!
    this.debug = document.getElementById("debug")!

    // Rich things
    faLibrary.add(faPlay, faPause, faUpload, faClose)
    faDom.watch()
    this.editor = createEditor(
      "#editor-container",
      { language: "crasm" },
      defaultCommands()
    )

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
    })
    // forcibly override the prism editor handler for Ctrl+Enter and (Shift)+Tab
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

    this.inputSearch.addEventListener("focus", (e) => {
      this.searchResults.style.display = "block"
    })
    this.inputSearch.addEventListener("blur", (e) => {
      this.searchResults.style.display = "none"
    })

    this.inputSearch.addEventListener("input", (e) => {
      const input = e.target as HTMLInputElement
      const query = input.value.trim()
      const results = query === "" ? [] : Crasm.searchDocs(query).slice(0, 6)

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
    })

    // Turn typing commands into menu clicks
    this.menuCmd.addEventListener("keydown", (e) => {
      this.menuCmd.dataset.status = "ok"
      if (e.key === "Enter") {
        for (const node of this.menuOptions.querySelectorAll("li")) {
          if (
            node.textContent?.toLowerCase() === this.menuCmd.value.toLowerCase()
          ) {
            node.click()
            return
          }
        }
        this.menuCmd.dataset.status = "error"
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
            error.textContent = `L${data.error.line + 1} ${error.textContent}`
          }
          this.debug.dataset.status = data.error.warning ? "warning" : "error"
        } else {
          this.debug.dataset.status = "none"
        }
        const table = document.createElement("table")
        const keys = Object.keys(data.mem)
        const nRows = Math.ceil(keys.length / 2)
        for (let i = 0; i < nRows; ++i) {
          const row = table.insertRow()
          for (const j of [0, nRows]) {
            if (i + j < keys.length) {
              const key = keys[i + j]
              const value =
                key === "$passwd" ? "<?>" : formatValue(data.mem[key])
              row.insertCell().textContent = key
              const v = row.insertCell()
              v.textContent = value
              if (j === 0) {
                v.style.borderRight = "1px solid #666"
              }
            }
          }
        }
        this.debug.replaceChildren(error, table)
      }
    }
  }

  showMenu(
    title: string,
    options: { name: string; action: (e: HTMLElement) => void }[]
  ): void {
    this.menu.style.display = "block"
    this.menuTitle.forEach((node) => {
      node.textContent = title
    })
    this.menuOptions.replaceChildren(
      ...options.map((option) => {
        const li = document.createElement("li")
        li.textContent = option.name
        li.addEventListener("click", async () => {
          option.action(li)
        })
        return li
      })
    )
    this.menuCmd.value = ""
    this.menuCmd.focus()
  }

  hideMenu(): void {
    this.menu.style.display = "none"
  }

  onFrame() {
    this.frameCount += 1
  }
}
