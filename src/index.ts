import * as THREE from "three";

const S = {
  hwidth: 100,
};

window.onload = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -S.hwidth,
    S.hwidth,
    S.hwidth / aspect,
    -S.hwidth / aspect
  );
  camera.position.z = 10;

  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  window.addEventListener("resize", () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.top = S.hwidth / aspect;
    camera.bottom = -S.hwidth / aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const map = new THREE.TextureLoader().load("textures/crit.png");
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: map }));
  scene.add(sprite);
  sprite.scale.set(5, 5, 1);

  renderer.setAnimationLoop(() => {
    sprite.position.x += 1 / 60;
    sprite.position.y += 1 / 60;
    renderer.render(scene, camera);
  });
};
