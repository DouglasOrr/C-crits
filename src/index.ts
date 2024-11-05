import * as THREE from "three"
import * as Crasm from "./crasm"
import * as Crits from "./crits"

const S = {
  hwidth: 100,
}

class CritsView {
  sprites: THREE.Sprite[]

  constructor(private crits: Crits.Crits, scene: THREE.Scene) {
    const texture = new THREE.TextureLoader().load("textures/crit.png")
    this.sprites = []
    crits.forEachIndex(() => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture })
      )
      sprite.scale.set(2 * Crits.S.radius, 2 * Crits.S.radius, 1)
      scene.add(sprite)
      this.sprites.push(sprite)
    })
    this.update()
  }

  update(): void {
    this.crits.forEachIndex((i) => {
      const pos = this.crits.position[i]
      this.sprites[i].position.set(pos[0], pos[1], 0)
      this.sprites[i].material.rotation = -this.crits.angle[i]
    })
  }
}

window.onload = () => {
  // World
  const crits = new Crits.Crits()
  crits.add([0, 0], 0)
  crits.add([10, -10], Math.PI / 4)

  // Rendering
  const container = document.getElementById("col-sim")!
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  const aspect = container.offsetWidth / container.offsetHeight
  const camera = new THREE.OrthographicCamera(
    -S.hwidth,
    S.hwidth,
    S.hwidth / aspect,
    -S.hwidth / aspect
  )
  camera.position.z = 10
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(container.offsetWidth, container.offsetHeight)
  container.appendChild(renderer.domElement)
  window.addEventListener("resize", () => {
    const aspect = container.offsetWidth / container.offsetHeight
    camera.top = S.hwidth / aspect
    camera.bottom = -S.hwidth / aspect
    camera.updateProjectionMatrix()
    renderer.setSize(container.offsetWidth, container.offsetHeight)
  })
  const critsView = new CritsView(crits, scene)

  // Input
  const editor = document.getElementById("editor")! as HTMLTextAreaElement
  editor.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      crits.program = Crasm.parse(editor.value!)
    }
  })

  // Render and physics loop
  let lastTime: number | undefined = undefined
  renderer.setAnimationLoop((time: DOMHighResTimeStamp) => {
    while (lastTime !== undefined && lastTime < time) {
      crits.update()
      lastTime += 1000 * Crits.S.dt
    }
    lastTime = time
    critsView.update()
    renderer.render(scene, camera)
  })
}
