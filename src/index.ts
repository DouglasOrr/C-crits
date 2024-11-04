import * as THREE from "three"
import { Updateable } from "./common"
import * as Crits from "./crits"

const S = {
  hwidth: 100,
}

class CritView implements Updateable {
  private sprite: THREE.Sprite
  constructor(
    private crit: Crits.Crit,
    texture: THREE.Texture,
    scene: THREE.Scene
  ) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }))
    this.sprite.scale.set(2 * Crits.S.radius, 2 * Crits.S.radius, 1)
    scene.add(this.sprite)
    this.update()
  }
  update(): void {
    this.sprite.position.set(this.crit.pos[0], this.crit.pos[1], 0)
    this.sprite.material.rotation = -this.crit.angle
  }
}

window.onload = () => {
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

  const critTexture = new THREE.TextureLoader().load("textures/crit.png")
  const crits = [
    new Crits.Crit([0, 0], 0),
    new Crits.Crit([10, -10], Math.PI / 4),
  ]
  const views = crits.map((crit) => new CritView(crit, critTexture, scene))

  renderer.setAnimationLoop(() => {
    crits.forEach((crit) => crit.update())
    views.forEach((view) => view.update())
    renderer.render(scene, camera)
  })
}
