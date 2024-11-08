import * as THREE from "three"
import { Image32 } from "./common"
import * as Crasm from "./crasm"
import * as Crits from "./crits"
import * as Maps from "./maps"
import * as Views from "./views"

function createFpsCounter(): { update: () => void } {
  const fpsCounter = document.getElementById("fps-counter")
  let frameCount = 0
  setInterval(() => {
    fpsCounter!.textContent = `${frameCount} fps`
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

function updateCamera(
  camera: THREE.OrthographicCamera,
  sim: HTMLElement,
  map: Maps.Map
) {
  const mapWidth = map.width * map.scale
  const mapHeight = map.height * map.scale
  const scale = Math.min(
    sim.offsetWidth / mapWidth,
    sim.offsetHeight / mapHeight
  )
  const padWidth = (sim.offsetWidth / scale - mapWidth) / 2
  const padHeight = (sim.offsetHeight / scale - mapHeight) / 2
  camera.left = -padWidth
  camera.right = mapWidth + padWidth
  camera.bottom = -padHeight
  camera.top = mapHeight + padHeight
  camera.updateProjectionMatrix()
}

async function load(page: { sim: HTMLElement; editor: HTMLTextAreaElement }) {
  // World
  const crits = new Crits.Crits()
  const map = Maps.fromImage(await loadImage("maps/map_0.png"))
  for (let i = 0; i < map.basePosition.length; i++) {
    const p = map.basePosition[i]
    crits.add(
      [(p[0] + 0.5) * map.scale, (p[1] + 0.5) * map.scale],
      map.baseDirection[i]
    )
  }

  // Input
  page.editor.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      crits.program = Crasm.parse(page.editor.value!)
    }
  })

  // Rendering
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
  page.sim.appendChild(renderer.domElement)

  const camera = new THREE.OrthographicCamera()
  camera.position.z = 1
  updateCamera(camera, page.sim, map)
  window.addEventListener("resize", () => {
    renderer.setSize(page.sim.offsetWidth, page.sim.offsetHeight)
    updateCamera(camera, page.sim, map)
  })

  const scene = new THREE.Scene()
  const critsView = new Views.CritsView(
    crits,
    scene,
    await loadTexture("textures/crit_a4.png")
  )
  const mapView = new Views.MapView(map, scene)

  // Render and physics loop
  let updateTime: number | undefined = undefined
  let animationTime: number | undefined = undefined
  const fpsCounter = createFpsCounter()
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
    critsView.update(dt)
    mapView.update(dt)
    renderer.render(scene, camera)
    fpsCounter.update()
    animationTime = time
  })
}

window.onload = () => {
  load({
    sim: document.getElementById("col-sim")!,
    editor: document.getElementById("editor")! as HTMLTextAreaElement,
  })
}
