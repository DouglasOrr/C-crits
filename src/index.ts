import * as THREE from "three"
import { Image32 } from "./common"
import * as Maps from "./maps"
import * as Sim from "./sim"
import * as Views from "./ui/views"
import * as Sound from "./ui/sound"
import * as Page from "./ui/page"

import "@fortawesome/fontawesome-free/js/fontawesome"
import "@fortawesome/fontawesome-free/js/solid"

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

async function load() {
  // First load
  const page = new Page.Page()
  const playSound = await Sound.load()
  const textures = await loadTextures()
  page.editor.value = window.localStorage.getItem("program") ?? ""
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
  ]

  // Render and physics loop
  let running = false
  let programUpdateTime: number | undefined = undefined
  let updateTime: number | undefined = undefined
  let animationTime: number | undefined = undefined
  const fpsCounter = page.createFpsCounter()
  renderer.setAnimationLoop((time: number) => {
    time /= 1000
    if (
      !running ||
      updateTime === undefined ||
      programUpdateTime === undefined
    ) {
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

  // Input
  window.addEventListener("resize", () => {
    updateCamera(camera, page.sim, level.map)
  })
  page.buttonPlayPause.addEventListener("click", () => {
    running = !running
    const icon = page.buttonPlayPause.children[0].classList
    if (running) {
      sim.userLoadProgram(page.editor.value!)
      icon.remove("fa-play")
      icon.add("fa-pause")
    } else {
      icon.add("fa-play")
      icon.remove("fa-pause")
    }
  })
  page.buttonUpload.addEventListener("click", () => {
    sim.userLoadProgram(page.editor.value!)
    window.localStorage.setItem("program", page.editor.value!)
  })
  page.buttonRestart.addEventListener("click", () => {
    window.location.reload()
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
}

window.onload = () => {
  load()
}
