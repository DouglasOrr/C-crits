import * as THREE from "three"
import { Image32, Vec2 } from "./common"
import * as AI from "./game/ai"
import * as Crasm from "./game/crasm"
import * as Maps from "./game/maps"
import * as Sim from "./game/sim"
import * as Loop from "./ui/loop"
import * as Page from "./ui/page"
import * as Sound from "./ui/sound"
import * as Views from "./ui/views"

type Textures = {
  base: THREE.Texture
  base_n: THREE.Texture
  crit: THREE.Texture
  selection: THREE.Texture
}
async function loadTextures(): Promise<Textures> {
  async function load(name: string): Promise<THREE.Texture> {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(`textures/${name}.png`, (texture) => {
        texture.minFilter = THREE.NearestFilter
        resolve(texture)
      })
    })
  }
  return {
    base: await load("base"),
    base_n: await load("base_n"),
    crit: await load("crit"),
    selection: await load("selection"),
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

async function loadLevel(name: string): Promise<Maps.Level> {
  const response = await fetch(`levels/${name}.json`)
  const data = await response.json()
  data["map"] = Maps.fromImage(await loadImage(`maps/${data["map"]}.png`))
  data["program"] = data["program"].map((program: string | null) =>
    program === null
      ? Crasm.emptyProgram()
      : Crasm.parse(AI[program as keyof typeof AI])
  )
  return data as Maps.Level
}

function screenToWorld(
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera,
  z: Vec2
): Vec2 {
  const rect = renderer.domElement.getBoundingClientRect()
  const position = new THREE.Vector3(
    ((z[0] - rect.left) / rect.width) * 2 - 1,
    ((rect.top - z[1]) / rect.height) * 2 + 1,
    0
  ).unproject(camera)
  return [position.x, position.y]
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

async function load() {
  // First load
  const page = new Page.Page()
  const playSound = await Sound.load()
  const textures = await loadTextures()
  page.editor.textarea.value = window.localStorage.getItem("program") ?? ""
  page.editor.update()
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setClearColor(
    new THREE.Color(getComputedStyle(document.body).backgroundColor)
  )
  renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
  page.sim.appendChild(renderer.domElement)
  window.addEventListener("resize", () => {
    renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
  })

  // World
  const level = await loadLevel("level_0")
  const sim = new Sim.Sim(
    level,
    Sim.listeners(playSound, page.updateDebug.bind(page))
  )

  // Scene
  const camera = new THREE.OrthographicCamera()
  camera.position.z = 100
  updateCamera(camera, page.sim, level.map)
  const scene = new THREE.Scene()
  const views = [
    new Views.MapView(level.map, scene),
    new Views.BasesView(sim.bases, scene, textures.base, textures.base_n),
    new Views.CritsView(sim.crits, scene, textures.crit),
    new Views.BulletsView(sim.bullets, scene, /*isHeal*/ false),
    new Views.BulletsView(sim.healBullets, scene, /*isHeal*/ true),
    new Views.UserSelectionView(
      sim.players,
      sim.crits,
      scene,
      textures.selection
    ),
    new Views.UserMarkerView(sim.players, scene),
  ]

  const fpsCounter = page.createFpsCounter()
  const loop = new Loop.Loop(
    (dt) => {
      for (const view of views) {
        view.update(dt)
      }
      renderer.render(scene, camera)
      fpsCounter.update()
      if (sim.playerWin !== null) {
        page.outcome.textContent = sim.playerWin ? "You win!" : "You lose!"
      }
    },
    [
      { update: sim.programUpdate.bind(sim), dt: Sim.S.dtProgram },
      { update: sim.update.bind(sim), dt: Sim.S.dt },
    ]
  )

  // Input
  window.addEventListener("resize", () => {
    updateCamera(camera, page.sim, level.map)
  })
  function updatePlayIcon() {
    const icon = page.buttonPlayPause.children[0].classList
    if (loop.running) {
      icon.remove("fa-play")
      icon.add("fa-pause")
    } else {
      icon.add("fa-play")
      icon.remove("fa-pause")
    }
  }
  updatePlayIcon()
  page.buttonPlayPause.addEventListener("click", () => {
    loop.toggleRunning()
    if (loop.running) {
      sim.userLoadProgram(page.editor.value!)
    }
    updatePlayIcon()
  })
  page.buttonUpload.addEventListener("click", () => {
    sim.userLoadProgram(page.editor.value!)
    window.localStorage.setItem("program", page.editor.value!)
  })
  page.buttonRestart.addEventListener("click", () => {
    window.location.reload()
  })
  renderer.domElement.addEventListener("contextmenu", (e: MouseEvent) => {
    if (!(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) {
      e.preventDefault()
      sim.userSetMarker(screenToWorld(renderer, camera, [e.clientX, e.clientY]))
    }
  })
  renderer.domElement.addEventListener("click", (e: MouseEvent) => {
    sim.userSelect(screenToWorld(renderer, camera, [e.clientX, e.clientY]))
  })
}

window.onload = () => {
  load()
}
