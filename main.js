import * as THREE from 'three';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, orbitControls;
let physicsWorld;

let character = null;

// 맵 및 환경 관리를 위한 전역 변수
let targetBuildingMesh = null;
let targetBuildingCollider = null;
let targetBuildingBody = null;
let buildingTexture = null;
let seaNormalTexture = null;

let groundMesh = null;
let groundBody = null;
let seaMesh = null;

// 지면 텍스처 및 재질 관리를 위한 전역 변수
let groundMaterial = null;
let cityTileTexture = null;
let moonTexture = null;
let marsTexture = null;
let jupiterTexture = null;
let skyTexture = null;
let spaceTexture = null;

// 입수 메커니즘 변수
let waterEntryVelocity = 0;   // 입수 순간의 하강 속도 (y 속도)
let targetMaxDepth = 0;       // 충격량에 따라 도달할 최대 잠수 깊이 목표
let entryTime = 0;            // 입수 시점의 시간 

// 트램펄린 관련 전역 변수 및 제어 파라미터
let trampolineMesh = null;
let trampolineBody = null;
let trampolineCollider = null;

const trampolineParams = {
  x: 0,
  y: 2,
  z: 0,
  radius: 30
};

const gltfLoader = new GLTFLoader();
const backgroundBuildings = [];
const buildingModelTypes = [
  'building-a',
  'building-b',
  'building-c',
  'building-d',
  'building-e',
  'building-f',
  'building-g',
  'building-h',
  'building-i',
  'building-j',
  'building-k',
  'building-l',
  'building-m',
  'building-n',
  'building-skyscraper-a',
  'building-skyscraper-b',
  'building-skyscraper-c',
  'building-skyscraper-d',
  'building-skyscraper-e',
];

let characterModel = null;
let mixer = null;
const clock = new THREE.Clock();

// 캐릭터 상태 변수
let isFalling = false;
let isDead = false;
let isRecovering = false;
let hasFallen = false;
let inWater = false;

// 낙하산 전역 변수
let parachuteMesh = null;
let isParachuteDeployed = false;

// 고정 물리 타임스텝 변수
const timeStep = 1 / 60;
let physicsAccumulator = 0;

const lastVelocity = new THREE.Vector3();
const currentVelocity = new THREE.Vector3();
let maxFallSpeed = 0;
let lastImpulseValue = 0;

const tempQuat = new THREE.Quaternion();
const upAxis = new THREE.Vector3(0, 1, 0);
let targetRotationAngle = 0;
let currentRotationAngle = 0;

const actions = [];
let actionIndex = 0;

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

// 공중 제어력(Air Control) 계수 설정
const AIR_CONTROL_FACTOR = 0.35;

const uiDisplay = document.createElement('div');
uiDisplay.style.position = 'absolute';
uiDisplay.style.top = '15px';
uiDisplay.style.left = '15px';
uiDisplay.style.padding = '12px';
uiDisplay.style.background = 'rgba(0,0,0,0.85)';
uiDisplay.style.color = '#fff';
uiDisplay.style.fontFamily = 'monospace';
uiDisplay.style.borderRadius = '5px';
uiDisplay.style.zIndex = '999';
uiDisplay.innerHTML = '💥 마지막 충격량: 0 N·s<br> 상태: 대기 중';
document.body.appendChild(uiDisplay);

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (isDead || isRecovering) return;

  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      keys.forward = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.backward = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = true;
      break;
    case 'Space':
      if (!isFalling && !inWater) {
        startJump();
      } else if (
        params.tool === '낙하산(Parachute)' &&
        !isParachuteDeployed &&
        !isDead &&
        !isRecovering &&
        !inWater
      ) {
        deployParachute();
      }
      break;
  }
  if (!params.simulationActive && (keys.forward || keys.backward || keys.left || keys.right)) {
    params.simulationActive = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      keys.forward = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.backward = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = false;
      break;
  }
});

const loader = new FBXLoader();
const START_BUILDING_WIDTH = 25;

const params = {
  mapType: '도시(City)',
  buildingHeight: 80,
  gravityPreset: '지구',
  tool: '없음(None)',
  simulationActive: false,
  characterMass: 70,
  dieThreshold: 2500,
  jump: function () {
    startJump();
  },
  respawn: function () {
    respawnCharacter();
  },
};

const GRAVITY_PRESETS = { 무중력: 0, 달: -1.62, 화성: -3.71, 지구: -9.81, 목성: -24.79 };

async function init() {
  try {
    initThree();
    await initPhysics();
    buildMap();
    initParachute();
    initGUI();
    await loadAnimations();
  } catch (error) {
    console.error(error);
  }
}

function initThree() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xff9e80, 10, 2000);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 200000);
  camera.position.set(0, params.buildingHeight + 40, 140);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  document.body.appendChild(renderer.domElement);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.target.set(0, params.buildingHeight, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const hemiLight = new THREE.HemisphereLight(0x6c4d85, 0xff8a69, 0.8);
  hemiLight.position.set(0, 500, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffedd6, 1.5);
  dirLight.position.set(1200, 300, -50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 400000;
  const d = 500;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  initPanoramaSkybox();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function initPanoramaSkybox() {
  const textureLoader = new THREE.TextureLoader();
  skyTexture = textureLoader.load('./assets/textures/skybox/sky_12_2k.jpg', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (params.gravityPreset !== '달') {
      scene.background = texture;
      scene.environment = texture;
    }
  });
  spaceTexture = textureLoader.load('./assets/textures/skybox/space.jpg', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (params.gravityPreset === '달') {
      scene.background = texture;
      scene.environment = texture;
    }
  });
}

function createParachuteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  const segments = 16;
  const segmentWidth = canvas.width / segments;
  for (let i = 0; i < segments; i++) {
    context.fillStyle = i % 2 === 0 ? '#e74c3c' : '#f0f0f0';
    context.fillRect(i * segmentWidth, 0, segmentWidth, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function initParachute() {
  parachuteMesh = new THREE.Group();

  const PARACHUTE_SCALE = 40;
  const CANOPY_RADIUS = 3.5;
  const CANOPY_HEIGHT = 7.0;
  const STRING_ATTACH_Y = 1.8;

  parachuteMesh.scale.set(PARACHUTE_SCALE, PARACHUTE_SCALE, PARACHUTE_SCALE);
  const parachuteTex = createParachuteTexture();
  const canopyGeo = new THREE.SphereGeometry(CANOPY_RADIUS, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopyMat = new THREE.MeshStandardMaterial({
    map: parachuteTex,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = CANOPY_HEIGHT;
  canopy.castShadow = true;
  parachuteMesh.add(canopy);

  const lineMat = new THREE.LineBasicMaterial({ color: 0xcccccc });
  const stringCount = 16;
  for (let i = 0; i < stringCount; i++) {
    const angle = (i / stringCount) * Math.PI * 2;
    const x = Math.cos(angle) * CANOPY_RADIUS;
    const z = Math.sin(angle) * CANOPY_RADIUS;
    const points = [
      new THREE.Vector3(x, CANOPY_HEIGHT, z),
      new THREE.Vector3(0, STRING_ATTACH_Y, 0),
    ];
    parachuteMesh.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
  }
}

function deployParachute() {
  isParachuteDeployed = true;
  if (character && character.mesh) character.mesh.add(parachuteMesh);
  uiDisplay.innerHTML = '🪂 낙하산 전개! (안전 감속 중...)';
}

function removeParachute() {
  isParachuteDeployed = false;
  if (character && character.mesh && parachuteMesh) character.mesh.remove(parachuteMesh);
}

// 도구 상태 변경 처리 핸들러 (트램펄린 자원 할당 및 물리화)
function handleToolChange(currentTool) {
  removeTrampoline();

  if (currentTool === '트램펄린(Trampoline)') {
    const group = new THREE.Group();
    
    // 외곽 프레임 (동적 반지름 반영)
    const frameGeo = new THREE.TorusGeometry(trampolineParams.radius, 1.2, 16, 100);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8, roughness: 0.2 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.rotation.x = Math.PI / 2;
    group.add(frame);

    // 내부 탄성 매트
    const matGeo = new THREE.CylinderGeometry(trampolineParams.radius - 1, trampolineParams.radius - 1, 0.2, 32);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
    const mat = new THREE.Mesh(matGeo, matMat);
    mat.position.y = 0.1;
    mat.receiveShadow = true;
    group.add(mat);

    group.position.set(trampolineParams.x, trampolineParams.y, trampolineParams.z); 
    scene.add(group);
    trampolineMesh = group;

    // Rapier 물리 고정 바디 및 실린더 콜라이더 등록 (탄성 복원 계수 부여)
    trampolineBody = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(trampolineParams.x, trampolineParams.y, trampolineParams.z)
    );
    
    const trampolineColliderDesc = RAPIER.ColliderDesc.cylinder(0.25, trampolineParams.radius)
      .setRestitution(1.15) 
      .setFriction(0.8);
      
    trampolineCollider = physicsWorld.createCollider(trampolineColliderDesc, trampolineBody);
  }
}

// 실시간 슬라이더 조작 시 메쉬와 물리 엔진 바디 위치 동기화
function updateTrampolineTransform() {
  if (trampolineMesh) {
    trampolineMesh.position.set(trampolineParams.x, trampolineParams.y, trampolineParams.z);
  }
  if (trampolineBody) {
    trampolineBody.setTranslation({ x: trampolineParams.x, y: trampolineParams.y, z: trampolineParams.z }, true);
  }
}

// 메모리 릭(Leak) 방지를 포함한 안전한 트램펄린 제거 함수
function removeTrampoline() {
  if (trampolineMesh) {
    trampolineMesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      }
    });
    scene.remove(trampolineMesh); 
    trampolineMesh = null; 
  }
  if (trampolineCollider && physicsWorld) { physicsWorld.removeCollider(trampolineCollider, false); trampolineCollider = null; }
  if (trampolineBody && physicsWorld) { physicsWorld.removeRigidBody(trampolineBody); trampolineBody = null; }
}

async function initPhysics() {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: GRAVITY_PRESETS['지구'], z: 0 });
}

function spawnBackgroundSkyscraper(modelType, x, z, targetHeight) {
  gltfLoader.load(`./assets/models/city/${modelType}.glb`, (gltf) => {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    gltf.scene.position.set(-center.x, -box.min.y, -center.z);

    const container = new THREE.Group();
    container.add(gltf.scene);

    const width = 25 + Math.random() * 15;
    container.scale.set(width / size.x, targetHeight / size.y, width / size.z);
    container.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
    container.position.set(x, 0, z);

    container.visible = params.mapType === '도시(City)' && params.gravityPreset === '지구';
    scene.add(container);
    backgroundBuildings.push(container);

    if (Math.random() < 0.35) {
      const detailTypes = [
        'detail-parasol-a',
        'detail-parasol-b',
        'detail-awning',
        'detail-awning-wide',
        'detail-overhang',
        'detail-overhang-wide',
      ];
      const randomDetail = detailTypes[Math.floor(Math.random() * detailTypes.length)];
      const offset = width / 2 + 5 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      const dx = x + Math.cos(angle) * offset;
      const dz = z + Math.sin(angle) * offset;
    }
  });
}

function buildMap() {
  const textureLoader = new THREE.TextureLoader();

  cityTileTexture = textureLoader.load('./assets/textures/floor/city_tile.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2500, 2500);
  });

  moonTexture = textureLoader.load('./assets/textures/floor/moon.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1000, 1000);
  });

  marsTexture = textureLoader.load('./assets/textures/floor/mars.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1000, 1000);
  });

  jupiterTexture = textureLoader.load('./assets/textures/floor/jupiter.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1000, 1000);
  });

  groundMaterial = new THREE.MeshStandardMaterial({
    map:
      params.gravityPreset === '달'
        ? moonTexture
        : params.gravityPreset === '화성'
          ? marsTexture
          : params.gravityPreset === '목성'
            ? jupiterTexture
            : cityTileTexture,
    roughness: 0.5,
    metalness: 0.2,
  });

  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000), groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  groundBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -50.0, 0)
  );
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(25000, 50.0, 25000)
    .setRestitution(0.05)
    .setFriction(0.9);
  physicsWorld.createCollider(groundColliderDesc, groundBody);

  const cellSize = 100,
    halfRange = 1500;
  const cols = Math.floor((halfRange * 2) / cellSize),
    rows = Math.floor((halfRange * 2) / cellSize);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = -halfRange + c * cellSize + cellSize / 2;
      const baseZ = -halfRange + r * cellSize + cellSize / 2;

      if (baseZ >= -100) continue;

      const spawnProbability = 0.65;
      if (Math.random() > spawnProbability) continue;

      const bx = baseX + (Math.random() - 0.5) * 20;
      const bz = baseZ + (Math.random() - 0.5) * 20;
      const randomModel = buildingModelTypes[Math.floor(Math.random() * buildingModelTypes.length)];
      const randomHeight = 30 + Math.random() * 85;

      spawnBackgroundSkyscraper(randomModel, bx, bz, randomHeight);
    }
  }

  const seaMat = new THREE.MeshPhysicalMaterial({
    color: 0x003344,
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.7,
    ior: 1.33,
    transparent: true,
    opacity: 0.95,
  });
  seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000), seaMat);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.y = 0.5;
  seaMesh.receiveShadow = true;
  seaMesh.visible = false;
  scene.add(seaMesh);

  buildingTexture = textureLoader.load('./assets/textures/building_window.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, params.buildingHeight / 10);
  });
  const startBuildingMesh = new THREE.Mesh(
    new THREE.BoxGeometry(START_BUILDING_WIDTH, params.buildingHeight, START_BUILDING_WIDTH),
    new THREE.MeshStandardMaterial({ map: buildingTexture, roughness: 0.15, metalness: 0.55 })
  );
  startBuildingMesh.position.set(0, params.buildingHeight / 2, 0);
  startBuildingMesh.castShadow = startBuildingMesh.receiveShadow = true;
  scene.add(startBuildingMesh);
  targetBuildingMesh = startBuildingMesh;

  targetBuildingBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, params.buildingHeight / 2, 0)
  );
  targetBuildingCollider = physicsWorld.createCollider(
    RAPIER.ColliderDesc.cuboid(
      START_BUILDING_WIDTH / 2,
      params.buildingHeight / 2,
      START_BUILDING_WIDTH / 2
    )
      .setRestitution(0.1)
      .setFriction(0.6),
    targetBuildingBody
  );
}

function updateBuildingHeight(newHeight) {
  if (!targetBuildingMesh || !physicsWorld) return;
  const safeHeight = newHeight <= 0 ? 0.1 : newHeight;

  targetBuildingMesh.geometry.dispose();
  targetBuildingMesh.geometry = new THREE.BoxGeometry(
    START_BUILDING_WIDTH,
    safeHeight,
    START_BUILDING_WIDTH
  );
  targetBuildingMesh.position.set(0, safeHeight / 2, 0);

  if (buildingTexture) {
    buildingTexture.repeat.set(2, safeHeight / 10);
    buildingTexture.needsUpdate = true;
  }

  if (targetBuildingCollider) physicsWorld.removeCollider(targetBuildingCollider, false);
  if (targetBuildingBody) physicsWorld.removeRigidBody(targetBuildingBody);

  targetBuildingBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, safeHeight / 2, 0)
  );
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    START_BUILDING_WIDTH / 2,
    safeHeight / 2,
    START_BUILDING_WIDTH / 2
  )
    .setRestitution(0.1)
    .setFriction(0.6);
  targetBuildingCollider = physicsWorld.createCollider(colliderDesc, targetBuildingBody);

  respawnCharacter();
}

function initGUI() {
  const gui = new GUI();
  gui.title('시뮬레이터 조작 설정');

  gui
    .add(params, 'mapType', ['도시(City)', '바다(Sea)'])
    .name('🗺️ 맵 선택')
    .onChange((v) => {
      const isCity = v === '도시(City)';
      groundMesh.visible = isCity;
      seaMesh.visible = !isCity;

      backgroundBuildings.forEach((b) => {
        if (b) b.visible = isCity && params.gravityPreset === '지구';
      });

      // 바다 모드일 때 투이지면(Ground Body) 충돌 박스를 낮추어 캐릭터가 중간에 걸리지 않도록 수정
      if (groundBody) {
        groundBody.setTranslation({ x: 0, y: isCity ? -50.0 : -500.0, z: 0 }, true);
      }

      if (document.activeElement) document.activeElement.blur();
      respawnCharacter();
    });

  gui
    .add(params, 'buildingHeight', 0, 828, 10)
    .name('🏢 빌딩 높이 (m)')
    .onChange((v) => updateBuildingHeight(v));
  gui.add(params, 'characterMass', 10, 200, 5).name('⚖️ 캐릭터 질량 (kg)');
  gui.add(params, 'dieThreshold', 500, 5000, 100).name('💥 사망 임계 충격량');

  const folder = gui.addFolder('행동 제어');
  folder.add(params, 'jump').name('낙하 시작 🪂');
  folder.add(params, 'respawn').name('리스폰 🔄');

  gui
    .add(params, 'tool', ['없음(None)', '낙하산(Parachute)', '트램펄린(Trampoline)'])
    .name('🎒 장착 도구')
    .onChange((v) => {
      handleToolChange(v);
      if (document.activeElement) document.activeElement.blur();
    });

  // 트램펄린 좌표 및 변형 슬라이더 조작 전용 GUI 폴더 세그먼트 연동
  const folderTramp = gui.addFolder('트램펄린 설정 (실시간)');
  folderTramp.add(trampolineParams, 'x', -50, 50, 1).name('위치 X').onChange(updateTrampolineTransform);
  folderTramp.add(trampolineParams, 'y', 0, 30, 0.5).name('위치 Y').onChange(updateTrampolineTransform);
  folderTramp.add(trampolineParams, 'z', -50, 50, 1).name('위치 Z').onChange(updateTrampolineTransform);
  folderTramp.add(trampolineParams, 'radius', 5, 50, 1).name('반경 (Radius)').onChange(() => {
    if (params.tool === '트램펄린(Trampoline)') handleToolChange('트램펄린(Trampoline)');
  });
  folderTramp.close();

  gui
    .add(params, 'gravityPreset', Object.keys(GRAVITY_PRESETS))
    .name('🪐 중력 환경')
    .onChange((v) => {
      physicsWorld.gravity = { x: 0, y: GRAVITY_PRESETS[v], z: 0 };
      if (params.mapType === '도시(City)') {
        const showBuildings = v === '지구';
        backgroundBuildings.forEach((b) => {
          if (b) b.visible = showBuildings;
        });

        if (v === '달') {
          if (groundMaterial) groundMaterial.map = moonTexture;
          if (spaceTexture) {
            scene.background = spaceTexture;
            scene.environment = spaceTexture;
          }
          if (scene.fog) {
            scene.fog.color.setHex(0x000000);
            scene.fog.near = 10;
            scene.fog.far = 3000;
          }
        } else if (v === '화성') {
          if (groundMaterial) groundMaterial.map = marsTexture;
          if (spaceTexture) {
            scene.background = spaceTexture;
            scene.environment = spaceTexture;
          }
          if (scene.fog) {
            scene.fog.color.setHex(0x191a16);
            scene.fog.near = 10;
            scene.fog.far = 5000;
          }
        } else if (v === '목성') {
          if (groundMaterial) groundMaterial.map = jupiterTexture;
          if (spaceTexture) {
            scene.background = spaceTexture;
            scene.environment = spaceTexture;
          }
          if (scene.fog) {
            scene.fog.color.setHex(0x191a16);
            scene.fog.near = 10;
            scene.fog.far = 5000;
          }
        } else {
          if (groundMaterial) groundMaterial.map = cityTileTexture;
          if (skyTexture) {
            scene.background = skyTexture;
            scene.environment = skyTexture;
          }
          if (scene.fog) {
            scene.fog.color.setHex(0xff9e80);
          }
        }

        if (groundMaterial) groundMaterial.needsUpdate = true;
        setTimeout(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
        }, 50);
      }
    });
}

function loadFBX(filename) {
  return new Promise((resolve, reject) => {
    loader.load(
      filename,
      (obj) => resolve(obj),
      undefined,
      (err) => reject(err)
    );
  });
}

async function loadAnimations() {
  try {
    loader.setPath('./assets/models/Timmy/');
    const idleObj = await loadFBX('Idle+Skin.fbx');
    characterModel = idleObj;
    characterModel.scale.set(0.05, 0.05, 0.05);
    mixer = new THREE.AnimationMixer(characterModel);

    actions[0] = mixer.clipAction(characterModel.animations[0]);
    actions[0].name = 'Idle';
    actions[0].play();
    characterModel.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = c.receiveShadow = true;
      }
    });

    try {
      const fallObj = await loadFBX('Falling.fbx');
      actions[1] = mixer.clipAction(fallObj.animations[0], characterModel);
      actions[1].name = 'Falling';
    } catch (e) {}

    try {
      const walkObj = await loadFBX('Walking.fbx');
      const walkClip = walkObj.animations[0];
      walkClip.tracks = walkClip.tracks.filter((track) => !track.name.includes('position'));
      actions[2] = mixer.clipAction(walkClip, characterModel);
      actions[2].name = 'Walking';
    } catch (e) {}

    try {
      const dieObj = await loadFBX('fall_die.fbx');
      actions[3] = mixer.clipAction(dieObj.animations[0], characterModel);
      actions[3].name = 'FallDie';
      actions[3].setLoop(THREE.LoopOnce);
      actions[3].clampWhenFinished = true;
    } catch (e) {}

    try {
      const liveObj = await loadFBX('fall_live.fbx');
      actions[4] = mixer.clipAction(liveObj.animations[0], characterModel);
      actions[4].name = 'FallLive';
      actions[4].setLoop(THREE.LoopOnce, 1);
      actions[4].clampWhenFinished = true;
    } catch (e) {}

    try {
      const waterStandObj = await loadFBX('waterstand.fbx');
      const waterClip = waterStandObj.animations[0];
      waterClip.tracks = waterClip.tracks.filter((track) => !track.name.includes('position'));
      actions[5] = mixer.clipAction(waterClip, characterModel);
      actions[5].name = 'WaterStand';
    } catch (e) {
      console.warn('waterstand.fbx 로드 실패');
    }

    try {
      const swimObj = await loadFBX('Swimming.fbx');
      const swimClip = swimObj.animations[0];
      swimClip.tracks = swimClip.tracks.filter((track) => !track.name.includes('position'));
      actions[6] = mixer.clipAction(swimClip, characterModel);
      actions[6].name = 'Swimming';
    } catch (e) {
      console.warn('swimming.fbx 로드 실패');
    }

    mixer.addEventListener('finished', (e) => {
      if (e.action === actions[4] && !isDead) {
        isRecovering = false;

        const finalImpulse = Math.max(
          lastImpulseValue,
          Math.abs(lastVelocity.y) * params.characterMass
        );

        uiDisplay.innerHTML = `💥 마지막 충격량: ${finalImpulse.toFixed(1)} N·s<br>상태: 회복 완료 (지상 이동 가능)`;
        actions[4].stop();

        if (actions[0]) {
          actions[0].reset().fadeIn(0.15).play();
          actionIndex = 0;
        }
      }
    });
  } catch (error) {
    console.error('모델 스킨 로드 실패:', error);
  } finally {
    respawnCharacter();
    hideLoadingScreen();
  }
}

function respawnCharacter() {
  params.simulationActive = false;
  isFalling = false;
  isDead = false;
  isRecovering = false;
  hasFallen = false;
  inWater = false;
  maxFallSpeed = 0;
  keys.forward = keys.backward = keys.left = keys.right = false;
  uiDisplay.innerHTML = '💥 마지막 충격량: 0 N·s<br> 상태: 대기 중';

  removeParachute();
  handleToolChange(params.tool); // 리스폰 시 트램펄린 포함 현재 도구 정합성 유지

  if (character) {
    scene.remove(character.mesh);
    if (character.body) physicsWorld.removeRigidBody(character.body);
  }
  if (!characterModel) return;

  actions.forEach((a) => {
    if (a) a.stop();
  });
  if (actions[0]) {
    actions[0].reset().play();
    actionIndex = 0;
  }

  characterModel.position.set(0, params.buildingHeight, 0);
  currentRotationAngle = targetRotationAngle = 0;
  characterModel.rotation.set(0, 0, 0);
  scene.add(characterModel);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, params.buildingHeight + 1.2, 0)
    .setCcdEnabled(true)
    .enabledRotations(false, true, false);
  const body = physicsWorld.createRigidBody(bodyDesc);
  const characterColliderDesc = RAPIER.ColliderDesc.capsule(0.6, 0.6)
    .setFriction(0.5)
    .setRestitution(0.0);
  physicsWorld.createCollider(characterColliderDesc, body);

  character = { mesh: characterModel, body };
  lastVelocity.set(0, 0, 0);

  orbitControls.target.set(0, params.buildingHeight, 0);
  camera.position.set(0, params.buildingHeight + 15, 45);
  orbitControls.update();
  setTimeout(() => {
    if (document.activeElement) {
      document.activeElement.blur();
    }
  }, 50);
}

function startJump() {
  if (!character || isFalling || isDead || isRecovering || hasFallen) return;
  params.simulationActive = true;
  isFalling = true;
  hasFallen = true;

  if (actions[actionIndex]) actions[actionIndex].stop();
  if (actions[1]) {
    actions[1].reset().play();
    actionIndex = 1;
  }

  const jumpSpeed = 16.0;
  const vx = Math.sin(currentRotationAngle) * jumpSpeed;
  const vz = Math.cos(currentRotationAngle) * jumpSpeed;

  character.body.setLinvel({ x: vx, y: 7.5, z: vz }, true);
  setTimeout(() => {
    if (document.activeElement) {
      document.activeElement.blur();
    }
  }, 50);
}

function handleImpact(impulseValue) {
  if (isDead || isRecovering) return;
  removeParachute();

  isFalling = false;
  const finalImpulse = Math.max(impulseValue, Math.abs(lastVelocity.y) * params.characterMass);

  character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  character.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

  if (finalImpulse >= params.dieThreshold) {
    isDead = true;
    uiDisplay.innerHTML = `💥 마지막 충격량: <span style="color:#ff5555;font-weight:bold;">${finalImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (콘크리트 충돌)</span>`;
    if (actions[actionIndex]) actions[actionIndex].stop();
    if (actions[3]) {
      actions[3].reset().play();
      actionIndex = 3;
    }
  } else {
    isRecovering = true;
    uiDisplay.innerHTML = `💥 마지막 충격량: <span style="color:#55ff55;font-weight:bold;">${finalImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#55ff55;font-weight:bold;">생존 (부상 복구 중...)</span>`;
    if (actions[actionIndex]) actions[actionIndex].stop();

    if (actions[4]) {
      actions[4].reset();
      actions[4].setLoop(THREE.LoopOnce, 1);
      actions[4].clampWhenFinished = true;
      actions[4].play();
      actionIndex = 4;
    } else {
      isRecovering = false;
      if (actions[0]) {
        actions[0].reset().play();
        actionIndex = 0;
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (mixer) mixer.update(dt);

  if (params.simulationActive && physicsWorld) {
    physicsAccumulator += dt;

    if (character && isFalling) {
      const v = character.body.linvel();
      lastVelocity.set(v.x, v.y, v.z);

      if (isParachuteDeployed) {
        const safeSpeed = -4.0;
        if (v.y < safeSpeed) {
          character.body.setLinvel(
            { x: v.x * 0.98, y: v.y * 0.9 + safeSpeed * 0.1, z: v.z * 0.98 },
            true
          );
        }
        maxFallSpeed = Math.abs(character.body.linvel().y);
      } else {
        const currentSpeedY = Math.abs(v.y);
        if (currentSpeedY > maxFallSpeed) {
          maxFallSpeed = currentSpeedY;
        }
      }
    }

    while (physicsAccumulator >= timeStep) {
      physicsWorld.step();
      physicsAccumulator -= timeStep;
    }

    if (character && isFalling && !isDead && !isRecovering) {
      const v = character.body.linvel();
      currentVelocity.set(v.x, v.y, v.z);
      const pos = character.body.translation();
      const isSea = params.mapType === '바다(Sea)';

      if (!isSea) {
        // 실시간 트램펄린 Y 좌표 매칭 기반 다중 바운싱 충격 감쇄 처리 로직
        const trampY = trampolineParams.y;
        if (params.tool === '트램펄린(Trampoline)' && pos.y > (trampY - 0.2) && pos.y < (trampY + 3.0)) {
          
          // 낙하 중 매트를 디디며 위 방향으로 리바운드 된 정밀 타이밍 캐치
          if (currentVelocity.y > 0.5 && lastVelocity.y < -1.0) {
            const impactVelocity = Math.abs(lastVelocity.y);
            const realPhysicsImpulse = params.characterMass * impactVelocity;
            
            // 실제 천막 및 스프링 탄성 제어로 충격 완화 (15% 수준 감쇄 흡수)
            const mitigatedImpulse = realPhysicsImpulse * 0.15; 
            lastImpulseValue = mitigatedImpulse;
            maxFallSpeed = 0; 

            // 완화 충격량이 임계치를 초과할 시 스프링/천막 파손 사망 판정
            if (mitigatedImpulse >= params.dieThreshold) {
              isDead = true;
              uiDisplay.innerHTML = `💥 트램펄린 파손! 임계 초과: <span style="color:#ff5555;font-weight:bold;">${mitigatedImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (초고도 직격 충돌)</span>`;
              if (actions[actionIndex]) actions[actionIndex].stop();
              if (actions[3]) { actions[3].reset().play(); actionIndex = 3; }
              character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            } 
            // 안전 규격 속도(초속 4m) 이하 진입 시 최종 착지 처리
            else if (impactVelocity < 4.0) {
              isFalling = false;
              hasFallen = false;
              character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
              uiDisplay.innerHTML = `✅ 안전 안착 성공! (최종 충격량: ${mitigatedImpulse.toFixed(1)} N·s)<br>상태: 트램펄린 위 대기`;
              if (actions[actionIndex]) actions[actionIndex].stop();
              if (actions[0]) { actions[0].reset().fadeIn(0.15).play(); actionIndex = 0; }
            } 
            // 감쇄 진동 주기 왕복 상승구간 애니메이션 가동
            else {
              uiDisplay.innerHTML = `🚀 감쇄 리바운드 탄성 감속 중! (완화 충격량: ${mitigatedImpulse.toFixed(1)} N·s)<br>상태: 공중 재상승 (진동 하강속도: ${impactVelocity.toFixed(1)} m/s)`;
              if (actions[actionIndex]) actions[actionIndex].stop();
              if (actions[1]) { actions[1].reset().play(); actionIndex = 1; }
              isFalling = true;
            }
          }
        } else {
          // 대지 표면 하드 임팩트 충돌 판정 레이어
          const isPhysicsImpact = lastVelocity.y < -2.0 && currentVelocity.y >= lastVelocity.y * -0.2;
          const isAbsoluteGroundImpact = pos.y <= 1.21;
          if (isPhysicsImpact || isAbsoluteGroundImpact) {
            const collisionVelocity = Math.max(Math.abs(lastVelocity.y), maxFallSpeed);
            const realPhysicsImpulse = params.characterMass * collisionVelocity;
            lastImpulseValue = realPhysicsImpulse;
            handleImpact(realPhysicsImpulse);
          }
        }
      } else {
        // 바다(Sea) 입수 및 유체 역학 프로젝션 처리
        if (pos.y <= 1.2 && !inWater) {
          inWater = true;
          isFalling = false;
          removeParachute();

          const collisionVelocity = Math.max(Math.abs(lastVelocity.y), maxFallSpeed);
          const realPhysicsImpulse = params.characterMass * collisionVelocity * 0.4;
          lastImpulseValue = realPhysicsImpulse;

          // 질량과 입수속도를 기반으로 한 정밀 최대 가라앉음 깊이 지표 산출
          targetMaxDepth = (params.characterMass * collisionVelocity) / 350;

          if (realPhysicsImpulse >= params.dieThreshold) {
            isDead = true;
            uiDisplay.innerHTML = `💥 수면 충돌량: <span style="color:#ff5555;font-weight:bold;">${realPhysicsImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (수면 타격)</span>`;
            if (actions[actionIndex]) actions[actionIndex].stop();
            if (actions[3]) {
              actions[3].reset().play();
              actionIndex = 3;
            }
          } else {
            uiDisplay.innerHTML = `💦 퐁당! 입수 성공 (충격량: ${realPhysicsImpulse.toFixed(1)} N·s)<br>상태: 수면 하강 중... (예상 최대 깊이: -${targetMaxDepth.toFixed(1)}m)`;
            if (actions[actionIndex]) actions[actionIndex].stop();
            if (actions[5]) {
              actions[5].reset().fadeIn(0.2).play();
              actionIndex = 5;
            } else if (actions[0]) {
              actions[0].reset().fadeIn(0.2).play();
              actionIndex = 0;
            }
          }
        }
      }
    }

    if (inWater && !isDead && character) {
      const v = character.body.linvel();
      const pos = character.body.translation();

      const targetWaterLevel = 0.4;
      const depth = targetWaterLevel - pos.y;

      const buoyancy = depth > 0 ? depth * 25.0 : -5.0;

      character.body.setLinvel(
        {
          x: v.x * 0.98,
          y: v.y * 0.99 + buoyancy * dt,
          z: v.z * 0.98,
        },
        true
      );
    } else if (inWater && isDead && character) {
      const v = character.body.linvel();
      character.body.setLinvel({ x: v.x * 0.95, y: -0.5, z: v.z * 0.95 }, true);
    }
  }

  if (character) {
    const pos = character.body.translation();
    const rot = character.body.rotation();
    const currentVel = character.body.linvel();

    let moveX = 0,
      moveZ = 0;
    if (keys.forward) moveZ -= 1;
    if (keys.backward) moveZ += 1;
    if (keys.left) moveX -= 1;
    if (keys.right) moveX += 1;

    if (
      params.simulationActive &&
      !isFalling &&
      !hasFallen &&
      !inWater &&
      pos.y < params.buildingHeight - 0.5
    ) {
      isFalling = true;
      hasFallen = true;
      character.body.setLinvel({ x: currentVel.x, y: currentVel.y, z: currentVel.z }, true);
      if (actions[actionIndex]) actions[actionIndex].stop();
      if (actions[1]) {
        actions[1].reset().play();
        actionIndex = 1;
      }
    }

    if (params.simulationActive && physicsWorld && !isDead && !isRecovering) {
      if (moveX !== 0 || moveZ !== 0) {
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        moveX /= len;
        moveZ /= len;

        targetRotationAngle = Math.atan2(moveX, moveZ);
        let diff = targetRotationAngle - currentRotationAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));

        // 방향 전환 보정
        currentRotationAngle += diff * 10.0 * dt;

        tempQuat.setFromAxisAngle(upAxis, currentRotationAngle);
        character.body.setRotation(
          { x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w },
          true
        );

        if (inWater) {
          const swimSpeed = 3.0;
          const currentV = character.body.linvel();

          const targetX = moveX * swimSpeed;
          const targetZ = moveZ * swimSpeed;
          character.body.setLinvel(
            {
              x: THREE.MathUtils.lerp(currentV.x, targetX, 0.05),
              y: currentV.y,
              z: THREE.MathUtils.lerp(currentV.z, targetZ, 0.05),
            },
            true
          );

          if (actionIndex !== 6 && actions[6]) {
            if (actions[actionIndex]) actions[actionIndex].fadeOut(0.2);
            actions[6].reset().fadeIn(0.2).play();
            actionIndex = 6;
          }
        } else if (!isFalling) {
          const moveSpeed = 10.0;
          character.body.setLinvel(
            { x: moveX * moveSpeed, y: currentVel.y, z: moveZ * moveSpeed },
            true
          );

          if (actionIndex !== 2 && actions[2]) {
            if (actions[actionIndex]) actions[actionIndex].fadeOut(0.15);
            actions[2].reset().fadeIn(0.15).play();
            actionIndex = 2;
          }
          const actualVel = character.body.linvel();
          const horizontalSpeed = Math.sqrt(actualVel.x * actualVel.x + actualVel.z * actualVel.z);
          if (actions[2]) actions[2].timeScale = horizontalSpeed / 8.5;
        } else {
          const airVx = currentVel.x + moveX * AIR_CONTROL_FACTOR;
          const airVz = currentVel.z + moveZ * AIR_CONTROL_FACTOR;
          const horizontalSpeed = Math.sqrt(airVx * airVx + airVz * airVz);
          if (horizontalSpeed > 16.0) {
            character.body.setLinvel(
              {
                x: (airVx / horizontalSpeed) * 16.0,
                y: currentVel.y,
                z: (airVz / horizontalSpeed) * 16.0,
              },
              true
            );
          } else {
            character.body.setLinvel({ x: airVx, y: currentVel.y, z: airVz }, true);
          }
        }
      } else {
        if (inWater) {
          const currentV = character.body.linvel();
          character.body.setLinvel(
            {
              x: THREE.MathUtils.lerp(currentV.x, 0, 0.05),
              y: currentV.y,
              z: THREE.MathUtils.lerp(currentV.z, 0, 0.05),
            },
            true
          );

          if (actionIndex !== 5 && actions[5]) {
            if (actions[actionIndex]) actions[actionIndex].fadeOut(0.2);
            actions[5].reset().fadeIn(0.2).play();
            actionIndex = 5;
          }
        } else if (!isFalling) {
          character.body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
          if (actionIndex !== 0 && actions[0]) {
            if (actions[actionIndex]) actions[actionIndex].fadeOut(0.15);
            actions[0].reset().fadeIn(0.15).play();
            actionIndex = 0;
          }
        }
      }
    } else if (isRecovering) {
      character.body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      character.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const WATER_VISUAL_OFFSET = 2.8;
    const renderY = inWater ? pos.y - WATER_VISUAL_OFFSET : Math.max(pos.y, 1.2) - 1.2;

    const targetPos = new THREE.Vector3(pos.x, renderY, pos.z);
    const targetRot = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const characterLerpFactor = 1.0 - Math.exp(-30.0 * dt);
    character.mesh.position.lerp(targetPos, characterLerpFactor);
    character.mesh.quaternion.slerp(targetRot, characterLerpFactor);

    const cameraLerpFactor = 1.0 - Math.exp(-15.0 * dt);
    orbitControls.target.lerp(character.mesh.position, cameraLerpFactor);
  }

  orbitControls.update();
  renderer.render(scene, camera);
}

let loadingOverlay = null;

function createLoadingScreen() {
  loadingOverlay = document.createElement('div');
  loadingOverlay.style.position = 'fixed';
  loadingOverlay.style.top = '0';
  loadingOverlay.style.left = '0';
  loadingOverlay.style.width = '100%';
  loadingOverlay.style.height = '100%';
  loadingOverlay.style.background = '#121212';
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.flexDirection = 'column';
  loadingOverlay.style.justifyContent = 'center';
  loadingOverlay.style.alignItems = 'center';
  loadingOverlay.style.zIndex = '9999';
  loadingOverlay.style.transition = 'opacity 0.5s ease';
  loadingOverlay.style.fontFamily = 'monospace';
  loadingOverlay.style.color = '#ff9e80';

  const spinner = document.createElement('div');
  spinner.style.width = '50px';
  spinner.style.height = '50px';
  spinner.style.border = '5px solid rgba(255, 158, 128, 0.2)';
  spinner.style.borderTop = '5px solid #ff9e80';
  spinner.style.borderRadius = '50%';
  spinner.style.marginBottom = '20px';
  spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
    duration: 1000,
    iterations: Infinity,
  });

  const text = document.createElement('div');
  text.innerHTML = '🪂 시뮬레이터 로딩 중 ...';
  text.style.fontSize = '18px';
  text.style.letterSpacing = '2px';
  text.style.textShadow = '0 0 10px rgba(255, 158, 128, 0.5)';

  loadingOverlay.appendChild(spinner);
  loadingOverlay.appendChild(text);
  document.body.appendChild(loadingOverlay);
}

function hideLoadingScreen() {
  if (loadingOverlay) {
    loadingOverlay.style.opacity = '0';
    setTimeout(() => {
      if (loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
      }
    }, 500);
  }
}

createLoadingScreen();
init();
animate();