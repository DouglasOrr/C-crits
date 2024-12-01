import * as THREE from "three"
import { Vec2 } from "./common"
import * as Levels from "./game/levels"
import * as Menu from "./ui/menu"
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

class Game {
  private views: Views.View[]
  private loop: Loop.Loop
  private camera: THREE.OrthographicCamera
  private scene = new THREE.Scene()

  constructor(
    private page: Page.Page,
    private menu: Menu.Menu,
    private sim: Sim.Sim,
    private level: Levels.Level,
    textures: Textures
  ) {
    this.camera = new THREE.OrthographicCamera()
    this.camera.position.z = 100
    this.views = [
      new Views.MapView(sim.map, this.scene),
      new Views.BasesView(
        sim.bases,
        this.scene,
        textures.base,
        textures.base_n
      ),
      new Views.CritsView(sim.crits, this.scene, textures.crit),
      new Views.BulletsView(sim.bullets, this.scene, /*isHeal*/ false),
      new Views.BulletsView(sim.healBullets, this.scene, /*isHeal*/ true),
      new Views.UserSelectionView(
        sim.players,
        sim.crits,
        this.scene,
        textures.selection
      ),
      new Views.UserMarkerView(sim.players, this.scene),
    ]
    this.loop = new Loop.Loop(this.render.bind(this), [
      { update: sim.programUpdate.bind(sim), dt: Sim.S.dtProgram },
      { update: this.update.bind(this), dt: Sim.S.dt },
    ])
    page.updatePlayPause(!this.loop.running)
    page.events = this.onEvent.bind(this)
  }

  update(): void {
    this.sim.update()
    this.level.update()
    this.page.updateGameTime(this.sim.time)
    if (this.level.outcome !== null) {
      this.finish()
      const levelCls = this.level.constructor as any
      if (this.level.outcome === "victory") {
        window.localStorage.setItem(levelCls.Name, "true")
      }
      if (this.level.achievement === "victory") {
        window.localStorage.setItem(
          `${levelCls.Name}-${levelCls.Achievement.name}`,
          "true"
        )
      }
    }
  }

  render(dt: number): void {
    updateCamera(this.camera, this.page.sim, this.sim.map)
    for (const view of this.views) {
      view.update(dt)
    }
    this.page.render(this.scene, this.camera)
  }

  onEvent(event: Page.Event): void {
    if (event.name === "play") {
      this.loop.running = true
    } else if (event.name === "pause") {
      this.loop.running = false
    } else if (event.name === "quit") {
      this.finish()
    } else if (event.name === "upload") {
      this.sim.userLoadProgram(this.page.editor.value!)
      window.localStorage.setItem("program", this.page.editor.value!)
    } else if (event.name === "select-critter") {
      this.sim.userSelect(
        screenToWorld(this.page.renderer, this.camera, event.position!)
      )
    } else if (event.name === "set-marker") {
      this.sim.userSetMarker(
        screenToWorld(this.page.renderer, this.camera, event.position!)
      )
    }
  }

  finish(): void {
    this.loop.finish()
    this.page.events = () => {}
    this.views.forEach((view) => view.dispose())
    const levelCls = this.level.constructor as any
    const losses = [
      this.sim.players.losses[0],
      this.sim.players.losses[1],
      this.sim.players.losses.slice(2).reduce((a, b) => a + b),
    ]

    this.menu.gameOver(
      levelCls.Name,
      this.level.outcome === "victory",
      levelCls.Achievement,
      this.level.achievement === "victory",
      losses as [number, number, number]
    )
  }
}

async function loadLevel(
  page: Page.Page,
  playSound: (event: Sim.Event) => void,
  menu: Menu.Menu,
  textures: Textures,
  levelIndex: number
): Promise<Game> {
  menu.hide()
  const LevelType = Levels.Levels[levelIndex]
  const sim = new Sim.Sim(
    await Maps.load((LevelType as any).Map),
    Sim.listeners(playSound, page.updateDebug.bind(page))
  )
  page.clearInstructions()
  const level = new (LevelType as any)(sim, page)
  return new Game(page, menu, sim, level, textures)
}

async function load() {
  const page = new Page.Page()
  const playSound = await Sound.load()
  const textures = await loadTextures()
  page.editor.textarea.value = window.localStorage.getItem("program") ?? ""
  page.editor.update()
  const menu = new Menu.Menu(page)
  menu.onPlay = (level) => {
    loadLevel(page, playSound, menu, textures, level)
  }
  const params = new URLSearchParams(window.location.search)
  if (params.has("debug")) {
    Sim.enableDebugMode()
    page.enableFpsCounter()
  }
  const level = params.get("level")
  if (level !== null) {
    loadLevel(page, playSound, menu, textures, Levels.index(level))
  } else {
    menu.main()
  }
}

window.onload = () => {
  load()
}
