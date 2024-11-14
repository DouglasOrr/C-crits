import * as THREE from "three"
import { Image32 } from "./common"
import * as Crasm from "./crasm"
import * as Crits from "./crits"
import * as Maps from "./maps"
import * as Views from "./views"

class Page {
  sim: HTMLElement
  editor: HTMLTextAreaElement
  fpsCounter: HTMLElement
  outcome: HTMLElement

  constructor() {
    this.sim = document.getElementById("col-sim")!
    this.editor = document.getElementById("editor")! as HTMLTextAreaElement
    this.fpsCounter = document.getElementById("fps-counter")!
    this.outcome = document.getElementById("outcome")!
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

async function load(page: Page) {
  // World
  const level = await loadLevel("level_0")
  const crits = new Crits.Crits(level)

  // Input
  page.editor.value = window.localStorage.getItem("program") ?? ""
  page.editor.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      crits.programs[0] = Crasm.parse(page.editor.value!)
      window.localStorage.setItem("program", page.editor.value!)
    }
  })

  // Rendering
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
  page.sim.appendChild(renderer.domElement)

  const camera = new THREE.OrthographicCamera()
  camera.position.z = 100
  updateCamera(camera, page.sim, level.map)
  window.addEventListener("resize", () => {
    renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
    updateCamera(camera, page.sim, level.map)
  })

  const scene = new THREE.Scene()
  const bulletsView = new Views.BulletsView(crits.bullets, scene)
  const critsView = new Views.CritsView(
    crits,
    scene,
    await loadTexture("textures/crit_a4.png")
  )
  const mapView = new Views.MapView(
    level.map,
    scene,
    await loadTexture("textures/base.png")
  )

  // Render and physics loop
  let updateTime: number | undefined = undefined
  let animationTime: number | undefined = undefined
  const fpsCounter = createFpsCounter(page)
  renderer.setAnimationLoop((time: number) => {
    time /= 1000
    if (updateTime === undefined) {
      updateTime = Crits.S.dt * Math.floor(time / Crits.S.dt)
    } else {
      while (updateTime < time) {
        crits.update()
        updateTime += Crits.S.dt
      }
    }
    const dt = time - (animationTime ?? time)
    bulletsView.update(dt)
    critsView.update(dt)
    mapView.update(dt)
    renderer.render(scene, camera)
    fpsCounter.update()
    if (crits.playerWin !== null) {
      page.outcome.textContent = crits.playerWin ? "You win!" : "You lose!"
    }
    animationTime = time
  })
}

window.onload = () => {
  load(new Page())
}
