import * as THREE from "three"
import * as Crasm from "./crasm"
import * as Crits from "./crits"
import * as Views from "./views"

const S = {
  hwidth: 100,
}

function createFpsCounter(): () => void {
  const fpsCounter = document.getElementById("fps-counter")
  let frameCount = 0
  setInterval(() => {
    fpsCounter!.textContent = `${frameCount} fps`
    frameCount = 0
  }, 1000)
  return () => {
    frameCount += 1
  }
}

window.onload = () => {
  // World
  const crits = new Crits.Crits()
  for (let i = 0; i < 1000; i++) {
    crits.add(
      [
        S.hwidth * 2 * Math.random() - S.hwidth,
        S.hwidth * 2 * Math.random() - S.hwidth,
      ],
      2 * Math.PI * Math.random()
    )
  }
  // crits.add([0, 0], 0)
  // crits.add([10, -10], Math.PI / 4)

  // Rendering
  const container = document.getElementById("col-sim")!
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x808080)
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
  const critsView = new Views.CritsView(crits, scene)

  // Input
  const editor = document.getElementById("editor")! as HTMLTextAreaElement
  editor.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      crits.program = Crasm.parse(editor.value!)
    }
  })

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
    critsView.update(time - (animationTime ?? time))
    renderer.render(scene, camera)
    fpsCounter()
    animationTime = time
  })
}
