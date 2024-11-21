import * as THREE from "three"
import { Image32 } from "./common"
import * as Maps from "./maps"
import * as Sim from "./sim"
import * as Views from "./views"
import * as Sound from "./sound"

class Page {
  // Main
  sim: HTMLElement
  // Overlays
  fpsCounter: HTMLElement
  outcome: HTMLElement
  // Dev panel
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
    this.editor = document.getElementById("editor")! as HTMLTextAreaElement
    this.output = document.getElementById("output")!
    this.debug = document.getElementById("debug")!
  }
}

function createFpsCounter(page: Page): { update: () => void } {
  let frameCount = 0
  setInterval(() => {
    page.fpsCounter.textContent = `${frameCount} fps`
    frameCount = 0
  }, 1000)
  return {
    update: () => {
      frameCount += 1
    },
  }
}

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

async function loadTexture(src: string): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(src, (texture) => {
      texture.minFilter = THREE.NearestFilter
      resolve(texture)
    })
  })
}

async function loadLevel(name: string): Promise<Maps.Level> {
  const response = await fetch(`levels/${name}.json`)
  const data = await response.json()
  data["map"] = Maps.fromImage(await loadImage(`maps/${data["map"]}.png`))
  return data as Maps.Level
}

function updateCamera(
  camera: THREE.OrthographicCamera,
  sim: HTMLElement,
  map: Maps.Map
) {
  const scale = Math.min(
    sim.offsetWidth / map.width,
    sim.offsetHeight / map.height
  )
  const padWidth = (sim.offsetWidth / scale - map.width) / 2
  const padHeight = (sim.offsetHeight / scale - map.height) / 2
  camera.left = -padWidth
  camera.right = map.width + padWidth
  camera.bottom = -padHeight
  camera.top = map.height + padHeight
  camera.updateProjectionMatrix()
}

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

async function load(page: Page) {
  // World
  const playOnEvent = await Sound.load()
  const level = await loadLevel("level_0")
  const sim = new Sim.Sim(
    level,
    Sim.listeners(playOnEvent, (event: Sim.Event, data?: any) => {
      if (event === Sim.Event.ProgramError) {
        console.error(data)
        page.output.textContent = data.show()
        page.output.dataset.status = "error"
      }
      if (event === Sim.Event.ProgramLoad) {
        page.output.textContent = "Program loaded"
        page.output.dataset.status = "ok"
      }
      if (event === Sim.Event.ProgramDebug) {
        if (data === null) {
          page.debug.textContent = "No critter selected"
          page.debug.dataset.status = "none"
        } else {
          const error = document.createElement("div")
          if (data.error !== null) {
            error.textContent = data.error.message + "\n------"
            if (data.error.line !== undefined) {
              error.textContent = `L${data.error.line} ${error.textContent}`
            }
            page.debug.dataset.status = "error"
          } else {
            page.debug.dataset.status = "none"
          }
          const table = document.createElement("table")
          for (const key in data.mem) {
            const row = table.insertRow()
            row.insertCell().textContent = key
            row.insertCell().textContent = formatValue(data.mem[key])
          }
          page.debug.replaceChildren(error, table)
        }
      }
    })
  )

  // Input
  page.editor.value = window.localStorage.getItem("program") ?? ""
  page.editor.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      sim.userLoadProgram(page.editor.value!)
      window.localStorage.setItem("program", page.editor.value!)
    }
  })

  // Rendering
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
  page.sim.appendChild(renderer.domElement)

  const camera = new THREE.OrthographicCamera()
  camera.position.z = 100
  updateCamera(camera, page.sim, level.map)
  window.addEventListener("resize", () => {
    renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
    updateCamera(camera, page.sim, level.map)
  })

  renderer.domElement.addEventListener("click", (e: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect()
    const position = new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      ((rect.top - e.clientY) / rect.height) * 2 + 1,
      0
    ).unproject(camera)
    sim.userSelect([position.x, position.y])
  })

  const scene = new THREE.Scene()
  const views = [
    new Views.MapView(level.map, scene),
    new Views.BasesView(
      sim.bases,
      scene,
      await loadTexture("textures/base.png"),
      await loadTexture("textures/base_n.png")
    ),
    new Views.CritsView(
      sim.crits,
      scene,
      await loadTexture("textures/crit.png")
    ),
    new Views.BulletsView(sim.bullets, scene, /*isHeal*/ false),
    new Views.BulletsView(sim.healBullets, scene, /*isHeal*/ true),
    new Views.UserSelectionView(
      sim.players,
      sim.crits,
      scene,
      await loadTexture("textures/selection.png")
    ),
  ]

  // Render and physics loop
  let programUpdateTime: number | undefined = undefined
  let updateTime: number | undefined = undefined
  let animationTime: number | undefined = undefined
  const fpsCounter = createFpsCounter(page)
  renderer.setAnimationLoop((time: number) => {
    time /= 1000
    if (updateTime === undefined || programUpdateTime === undefined) {
      programUpdateTime = updateTime = Sim.S.dt * Math.floor(time / Sim.S.dt)
    } else {
      while (programUpdateTime < time) {
        sim.programUpdate()
        programUpdateTime += Sim.S.dtProgram
      }
      while (updateTime < time) {
        sim.update()
        updateTime += Sim.S.dt
      }
    }
    const dt = time - (animationTime ?? time)
    for (const view of views) {
      view.update(dt)
    }
    renderer.render(scene, camera)
    fpsCounter.update()
    if (sim.playerWin !== null) {
      page.outcome.textContent = sim.playerWin ? "You win!" : "You lose!"
    }
    animationTime = time
  })
}

window.onload = () => {
  load(new Page())
}
