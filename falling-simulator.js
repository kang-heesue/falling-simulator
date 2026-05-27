import * as THREE from 'three';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

let scene, camera, renderer, orbitControls;
let physicsWorld;

let character = null;
const buildings = [];

let characterModel = null;
let mixer = null;
const clock = new THREE.Clock();

const actions = [];
let actionIndex = 0;

const loader = new FBXLoader();
loader.setPath('./assets/models/Timmy/');

// 시작 위치 기본값
const START_BUILDING_HEIGHT = 80;
const START_BUILDING_WIDTH = 25;

// GUI 파라미터
const params = {
  gravityPreset: '지구', // 중력
  airResistance: 0.1, // 공기 저항
  simulationActive: false,

  jump: function () {
    startJump();
  },
  respawn: function () {
    respawnCharacter();
  },
};

const GRAVITY_PRESETS = {
  무중력: 0,
  달: -1.62,
  화성: -3.71,
  지구: -9.81,
  목성: -24.79,
};

async function init() {
  initThree();
  await initPhysics();
  buildCity();
  initGUI();

  await loadAnimations();
  animate();
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd1e5);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.set(0, START_BUILDING_HEIGHT + 20, 50);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.target.set(0, START_BUILDING_HEIGHT, 0);

  orbitControls.enabled = true;

  const ambientLight = new THREE.AmbientLight(0x888888);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
  dirLight.position.set(100, 200, 50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  dirLight.shadow.camera.left = -100;
  dirLight.shadow.camera.right = 100;
  dirLight.shadow.camera.top = 100;
  dirLight.shadow.camera.bottom = -100;
  scene.add(dirLight);

  window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function initPhysics() {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: GRAVITY_PRESETS['지구'], z: 0 });
}

function buildCity() {
  // 바닥 생성
  const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x11111a,
    roughness: 0.8,
  });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const groundBody = physicsWorld.createRigidBody(groundBodyDesc);
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
    .setFriction(1.0)
    .setRestitution(0.2);
  physicsWorld.createCollider(groundColliderDesc, groundBody);

  // 시작 빌딩 생성
  const startBuildingGeom = new THREE.BoxGeometry(
    START_BUILDING_WIDTH,
    START_BUILDING_HEIGHT,
    START_BUILDING_WIDTH,
  );
  const startBuildingMat = new THREE.MeshStandardMaterial({
    color: 0x1f2430,
    roughness: 0.5,
    metalness: 0.3,
  });
  const startBuildingMesh = new THREE.Mesh(startBuildingGeom, startBuildingMat);
  startBuildingMesh.position.set(0, START_BUILDING_HEIGHT / 2, 0);
  startBuildingMesh.castShadow = true;
  startBuildingMesh.receiveShadow = true;
  scene.add(startBuildingMesh);

  const startBuildingBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    START_BUILDING_HEIGHT / 2,
    0,
  );
  const startBuildingBody = physicsWorld.createRigidBody(startBuildingBodyDesc);
  const startBuildingColliderDesc = RAPIER.ColliderDesc.cuboid(
    START_BUILDING_WIDTH / 2,
    START_BUILDING_HEIGHT / 2,
    START_BUILDING_WIDTH / 2,
  )
    .setFriction(0.6)
    .setRestitution(0.1);
  physicsWorld.createCollider(startBuildingColliderDesc, startBuildingBody);

  buildings.push({ mesh: startBuildingMesh, body: startBuildingBody });

  // 주변 빌딩 생성
  const buildingCount = 30;
  const colors = [0x252a36, 0x1c1d24, 0x2b303c, 0x141821, 0x333b4d];

  for (let i = 0; i < buildingCount; i++) {
    const w = 10 + Math.random() * 12;
    const h = 20 + Math.random() * 55;
    const d = 10 + Math.random() * 12;

    let posX = (Math.random() - 0.5) * 160;
    let posZ = (Math.random() - 0.5) * 160;

    if (
      Math.abs(posX) < START_BUILDING_WIDTH &&
      Math.abs(posZ) < START_BUILDING_WIDTH
    ) {
      posX += (posX >= 0 ? 1 : -1) * START_BUILDING_WIDTH;
      posZ += (posZ >= 0 ? 1 : -1) * START_BUILDING_WIDTH;
    }

    const posY = h / 2;

    const buildingGeom = new THREE.BoxGeometry(w, h, d);
    const buildingMat = new THREE.MeshStandardMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      roughness: 0.6,
      metalness: 0.2,
    });
    const buildingMesh = new THREE.Mesh(buildingGeom, buildingMat);
    buildingMesh.position.set(posX, posY, posZ);
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    scene.add(buildingMesh);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      posX,
      posY,
      posZ,
    );
    const body = physicsWorld.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
      .setFriction(0.6)
      .setRestitution(0.1);
    physicsWorld.createCollider(colliderDesc, body);

    buildings.push({ mesh: buildingMesh, body: body });
  }
}

// GUI 초기화
function initGUI() {
  const gui = new GUI();
  gui.title('Falling Simulator Controls');

  const actionFolder = gui.addFolder('Actions');
  actionFolder.add(params, 'jump').name('낙하 🪂');
  actionFolder.add(params, 'respawn').name('캐릭터 리스폰 🔄');
  actionFolder.open();

  const envFolder = gui.addFolder('Physics Constants');
  envFolder
    .add(params, 'gravityPreset', Object.keys(GRAVITY_PRESETS))
    .name('중력')
    .onChange((value) => {
      const gravityVal = GRAVITY_PRESETS[value];
      physicsWorld.gravity = { x: 0, y: gravityVal, z: 0 };
    });
  envFolder
    .add(params, 'airResistance', 0.0, 5.0, 0.05)
    .name('공기저항')
    .onChange((value) => {
      if (character && character.body) {
        character.body.setLinearDamping(value);
      }
    });
}

// FBX 파일 로딩(12-load-fbx-anim.js)
function loadFBX(filename) {
  return new Promise((resolve, reject) => {
    loader.load(
      filename,
      (object) => resolve(object),
      undefined,
      (error) => reject(error),
    );
  });
}

async function loadAnimations() {
  try {
    const firstObject = await loadFBX('Idle+Skin.fbx');
    characterModel = firstObject;

    characterModel.scale.set(0.05, 0.05, 0.05);

    mixer = new THREE.AnimationMixer(characterModel);

    const firstAction = mixer.clipAction(characterModel.animations[0]);
    actions.push(firstAction);

    firstAction.play();
    actionIndex = 0;

    characterModel.traverse((child) => {
      if (child.isMesh) {
        child.material.transparent = false;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const secondObject = await loadFBX('Falling.fbx');
    const secondAction = mixer.clipAction(secondObject.animations[0]);
    actions.push(secondAction);

    const thirdObject = await loadFBX('Falling.fbx');
    const thirdAction = mixer.clipAction(thirdObject.animations[0]);
    actions.push(thirdAction);

    respawnCharacter();
  } catch (error) {
    console.error('Error loading animations:', error);
  }
}

function respawnCharacter() {
  params.simulationActive = false;

  if (!characterModel) return;

  if (character) {
    scene.remove(character.mesh);
    physicsWorld.removeRigidBody(character.body);
    character = null;
  }

  actions.forEach((action) => action.stop());
  actions[0].play();
  actionIndex = 0;

  // 시작 빌딩 옥상에 캐릭터 배치
  const posX = 0;
  const posY = START_BUILDING_HEIGHT;
  const posZ = 0;

  characterModel.position.set(posX, posY, posZ);
  characterModel.rotation.set(0, 0, 0);
  scene.add(characterModel);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(posX, posY + 1.2, posZ)
    .setLinearDamping(params.airResistance)
    .setAngularDamping(0.8);
  const body = physicsWorld.createRigidBody(bodyDesc);

  const halfHeight = 0.6;
  const radius = 0.6;
  const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
    .setFriction(0.5)
    .setRestitution(0.3);
  physicsWorld.createCollider(colliderDesc, body);

  character = { mesh: characterModel, body };

  orbitControls.target.set(0, START_BUILDING_HEIGHT, 0);
  camera.position.set(0, START_BUILDING_HEIGHT + 10, 30);
  orbitControls.update();
}

function startJump() {
  if (!character || params.simulationActive) return;

  params.simulationActive = true;

  actions[actionIndex].stop();
  actions[1].fadeIn(0.2);
  actions[1].play();
  actionIndex = 1;

  character.body.setLinvel({ x: 6.0, y: 8.0, z: 6.0 }, true);

  character.body.setAngvel({ x: 0.8, y: 0.0, z: -0.4 }, true);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);

  if (params.simulationActive) {
    physicsWorld.step();
  }

  if (character) {
    const pos = character.body.translation();
    const rot = character.body.rotation();

    character.mesh.position.set(pos.x, pos.y - 1.2, pos.z);
    character.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    const targetCamPos = new THREE.Vector3(pos.x, pos.y + 10, pos.z + 25);
    camera.position.lerp(targetCamPos, 0.05);
    orbitControls.target.copy(meshPosition());
  }

  orbitControls.update();
  renderer.render(scene, camera);
}

function meshPosition() {
  if (character) {
    const pos = character.body.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }
  return new THREE.Vector3(0, START_BUILDING_HEIGHT, 0);
}

init().catch((error) => {
  console.error('Falling Simulator initialization failed:', error);
});

animate();
