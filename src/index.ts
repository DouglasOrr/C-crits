import * as THREE from "three";

window.onload = () => {
  console.log("hello from index.ts");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x0088ff });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
  scene.background = new THREE.Color(0xffffff);
  camera.position.z = 5;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(() => {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    camera.position.z += 0.01;
    renderer.render(scene, camera);
  });
};
