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
let waterEntryVelocity = 0;
let targetMaxDepth = 0;
let entryTime = 0;

// 트램펄린 관련 전역 변수 및 제어 파라미터
let trampolineMesh = null;
let trampolineBody = null;
let trampolineCollider = null;

const trampolineParams = {
  x: 0,
  y: 2,
  z: 0,
  radius: 30,
};

// =========================================================================
// 🧱 지면 3m 위 고정 및 관통 제어 파라미터 세트
// =========================================================================
const blockStackParams = {
  count: 5, // 유저가 실시간 조절 가능한 블록 개수
  strength: 500, // 개당 500 N·s의 충격을 받으면 파괴
  width: 35.0, // 정사각형 면적 크기 (X, Z)
  height: 2.0, // 블록 두께
  spacing: 5.0, // 블록 간 수직 배치 간격
  spawnOffsetZ: 35.0, // 빌딩 앞(Z축 정면) 생성 오프셋 거리
  groundLevel: 1.2, // 시스템 상의 실제 지면 Y값
  minHeightFromGround: 3.0, // [요구사항] 지면으로부터의 고정 최소 높이 (3m)
};

let breakableBlocks = [];
let debrisPieces = []; // 파괴된 블록 파편들의 실시간 추적 배열
// =========================================================================

// 🕸️ 웹 슈팅 모드 전역 변수
let anchorBlockMesh = null;
let anchorBlockBody = null;
let webLineMesh = null;
let webConstraint = null;
let isSwinging = false;

// 💡 비행기 날개 고정 파라미터
const wingConfig = {
  scale: 5.0,
  offsetX: 0,
  offsetY: 80,
  offsetZ: -2,
};

// 🛸 대나무 헬리콥터 설정값
const copterConfig = {
  scale: 2.0,
  offsetX: 0,
  offsetY: 160,
  offsetZ: 0,
  rotationSpeed: 0.7,
};

// 비행 도구 상태 및 메쉬 전역 변수
let isWingsuitDeployed = false;
let airplaneWingMesh = null;

let isCopterDeployed = false;
let isCopterActive = false;
let bambooCopterMesh = null;
let copterPropeller = null;

// 대나무 헬리콥터 비행 시 부드러운 틸트(기울임) 제어용 변수
let targetTiltX = 0;
let targetTiltZ = 0;
let currentTiltX = 0;
let currentTiltZ = 0;

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

// 고정 물리 타임스텝 변수 (2배속 가속 반영: 1/60 -> 1/30)
const timeStep = 1 / 30;
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
    case 'KeyE':
      if (params.tool === '웹 슈팅(Web Shooting)') {
        if (!isSwinging) {
          // 🕸️ 1. 거미줄 발사 및 조인트 생성
          if (anchorBlockBody && character && character.body) {
            const charPos = character.body.translation();
            const anchorPos = anchorBlockBody.translation();

            // 캐릭터와 블록 사이의 현재 거리를 로프의 최대 길이로 설정
            const dist = Math.sqrt(
              Math.pow(charPos.x - anchorPos.x, 2) +
                Math.pow(charPos.y - anchorPos.y, 2) +
                Math.pow(charPos.z - anchorPos.z, 2)
            );

            // Rapier Rope Joint 생성 (유연한 끈)
            const jointData = RAPIER.JointData.rope(
              dist,
              { x: 0, y: 0, z: 0 },
              { x: 0, y: 0, z: 0 }
            );
            webConstraint = physicsWorld.createImpulseJoint(
              jointData,
              character.body,
              anchorBlockBody,
              true
            );
            isSwinging = true;

            // 시각적 거미줄 선(Line) 생성
            const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
            const geometry = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(charPos.x, charPos.y, charPos.z),
              new THREE.Vector3(anchorPos.x, anchorPos.y, anchorPos.z),
            ]);
            webLineMesh = new THREE.Line(geometry, material);
            scene.add(webLineMesh);

            uiDisplay.innerHTML = '🕸️ 슉! 거미줄 연결됨 (자동으로 뛰어내립니다)';

            // 서있는 상태라면 자동으로 점프(낙하) 시작
            if (!isFalling && !inWater) {
              startJump();
            }
          }
        } else {
          // ✂️ 2. 거미줄 끊기
          if (webConstraint) {
            physicsWorld.removeImpulseJoint(webConstraint, true);
            webConstraint = null;
          }
          if (webLineMesh) {
            scene.remove(webLineMesh);
            webLineMesh.geometry.dispose();
            webLineMesh.material.dispose();
            webLineMesh = null;
          }
          isSwinging = false;

          uiDisplay.innerHTML = '🚀 거미줄 컷! 관성을 이용해 날아갑니다!';
        }
      }
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
      } else if (
        params.tool === '윙슈트(Wingsuit)' &&
        !isWingsuitDeployed &&
        !isDead &&
        !isRecovering &&
        !inWater
      ) {
        deployAirplaneWing();
      } else if (params.tool === '대나무 헬리콥터') {
        if (!isCopterDeployed) deployBambooCopter();
        isCopterActive = true;
        isFalling = true;
        if (actions[actionIndex]) actions[actionIndex].stop();
        if (actions[0]) {
          actions[0].reset().play();
          actionIndex = 0;
        }
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
    case 'Space':
      if (params.tool === '대나무 헬리콥터') {
        isCopterActive = false;
      }
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
    initAirplaneWingGeometry();
    initBambooCopterGeometry();
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
  skyTexture = textureLoader.load('./assets/textures/skybox/sky_12_2k.png', (texture) => {
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

function initAirplaneWingGeometry() {
  airplaneWingMesh = new THREE.Group();

  const primaryWingMat = new THREE.MeshStandardMaterial({
    color: 0xfbfbfb,
    roughness: 0.15,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });

  const bodyFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1c2833,
    roughness: 0.4,
    metalness: 0.8,
  });

  const engineNeonMat = new THREE.MeshStandardMaterial({
    color: 0x00d2ff,
    emissive: 0x0099ff,
    roughness: 0.1,
  });

  const pointTrimMat = new THREE.MeshStandardMaterial({
    color: 0xc0392b,
    roughness: 0.2,
  });

  const fuselageGeo = new THREE.CylinderGeometry(1.6, 2.2, 10, 16);
  fuselageGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, bodyFrameMat);
  fuselage.position.set(0, 0, 0);
  airplaneWingMesh.add(fuselage);

  const leftWingGroup = new THREE.Group();
  const leftMainGeo = new THREE.BoxGeometry(24, 0.8, 6);
  leftMainGeo.translate(-12, 0, -2);
  const leftMain = new THREE.Mesh(leftMainGeo, primaryWingMat);
  leftMain.castShadow = true;
  leftWingGroup.add(leftMain);

  const leftTipGeo = new THREE.BoxGeometry(16, 0.4, 4);
  leftTipGeo.translate(-32, 0, -5);
  const leftTip = new THREE.Mesh(leftTipGeo, pointTrimMat);
  leftWingGroup.add(leftTip);

  const leftWingletGeo = new THREE.BoxGeometry(0.5, 5, 3);
  const leftWinglet = new THREE.Mesh(leftWingletGeo, bodyFrameMat);
  leftWinglet.position.set(-40, 2.5, -5);
  leftWingGroup.add(leftWinglet);
  airplaneWingMesh.add(leftWingGroup);

  const rightWingGroup = new THREE.Group();
  const rightMainGeo = new THREE.BoxGeometry(24, 0.8, 6);
  rightMainGeo.translate(12, 0, -2);
  const rightMain = new THREE.Mesh(rightMainGeo, primaryWingMat);
  rightMain.castShadow = true;
  rightWingGroup.add(rightMain);

  const rightTipGeo = new THREE.BoxGeometry(16, 0.4, 4);
  rightTipGeo.translate(32, 0, -5);
  const rightTip = new THREE.Mesh(rightTipGeo, pointTrimMat);
  rightWingGroup.add(rightTip);

  const rightWingletGeo = new THREE.BoxGeometry(0.5, 5, 3);
  const rightWinglet = new THREE.Mesh(rightWingletGeo, bodyFrameMat);
  rightWinglet.position.set(40, 2.5, -5);
  rightWingGroup.add(rightWinglet);
  airplaneWingMesh.add(rightWingGroup);

  const engineLeftGeo = new THREE.CylinderGeometry(1.0, 1.2, 5, 12);
  engineLeftGeo.rotateX(Math.PI / 2);
  const engineLeft = new THREE.Mesh(engineLeftGeo, bodyFrameMat);
  engineLeft.position.set(-3, -1.5, -3);
  airplaneWingMesh.add(engineLeft);

  const nozzleLeftGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 12);
  nozzleLeftGeo.rotateX(Math.PI / 2);
  const nozzleLeft = new THREE.Mesh(nozzleLeftGeo, engineNeonMat);
  nozzleLeft.position.set(-3, -1.5, -5.5);
  airplaneWingMesh.add(nozzleLeft);

  const engineRightGeo = new THREE.CylinderGeometry(1.0, 1.2, 5, 12);
  engineRightGeo.rotateX(Math.PI / 2);
  const engineRight = new THREE.Mesh(engineRightGeo, bodyFrameMat);
  engineRight.position.set(3, -1.5, -3);
  airplaneWingMesh.add(engineRight);

  const nozzleRightGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 12);
  nozzleRightGeo.rotateX(Math.PI / 2);
  const nozzleRight = new THREE.Mesh(nozzleRightGeo, engineNeonMat);
  nozzleRight.position.set(3, -1.5, -5.5);
  airplaneWingMesh.add(nozzleRight);

  const tailHGeo = new THREE.BoxGeometry(14, 0.3, 3.5);
  tailHGeo.translate(0, 0, -9);
  const tailH = new THREE.Mesh(tailHGeo, primaryWingMat);
  airplaneWingMesh.add(tailH);

  const tailVGeo = new THREE.BoxGeometry(0.3, 6, 4);
  tailVGeo.translate(0, 3, -9.5);
  const tailV = new THREE.Mesh(tailVGeo, pointTrimMat);
  airplaneWingMesh.add(tailV);

  airplaneWingMesh.scale.set(wingConfig.scale, wingConfig.scale, wingConfig.scale);
}

function initBambooCopterGeometry() {
  bambooCopterMesh = new THREE.Group();

  const bambooMat = new THREE.MeshStandardMaterial({
    color: 0xf1c40f,
    roughness: 0.3,
    metalness: 0.1,
  });

  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0xe67e22,
    roughness: 0.4,
  });

  const baseGeo = new THREE.CylinderGeometry(1.2, 1.8, 0.8, 16);
  const baseMesh = new THREE.Mesh(baseGeo, shaftMat);
  baseMesh.position.y = 0.4;
  bambooCopterMesh.add(baseMesh);

  const shaftGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.5, 12);
  const shaftMesh = new THREE.Mesh(shaftGeo, bambooMat);
  shaftMesh.position.y = 2.5;
  bambooCopterMesh.add(shaftMesh);

  copterPropeller = new THREE.Group();
  copterPropeller.position.y = 4.25;

  const coreGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12);
  const coreMesh = new THREE.Mesh(coreGeo, shaftMat);
  copterPropeller.add(coreMesh);

  const leftBladeGeo = new THREE.BoxGeometry(8, 0.15, 1.2);
  leftBladeGeo.translate(-4, 0, 0);
  const leftBlade = new THREE.Mesh(leftBladeGeo, bambooMat);
  leftBlade.rotation.x = 0.12;
  copterPropeller.add(leftBlade);

  const rightBladeGeo = new THREE.BoxGeometry(8, 0.15, 1.2);
  rightBladeGeo.translate(4, 0, 0);
  const rightBlade = new THREE.Mesh(rightBladeGeo, bambooMat);
  rightBlade.rotation.x = -0.12;
  copterPropeller.add(rightBlade);

  bambooCopterMesh.add(copterPropeller);
  bambooCopterMesh.scale.set(copterConfig.scale, copterConfig.scale, copterConfig.scale);
}

// 🧹 웹 슈팅 장비 해제 및 초기화 함수
function removeWebShooter() {
  if (webConstraint && physicsWorld) {
    physicsWorld.removeImpulseJoint(webConstraint, true);
    webConstraint = null;
  }
  isSwinging = false;

  if (webLineMesh) {
    scene.remove(webLineMesh);
    webLineMesh.geometry.dispose();
    webLineMesh.material.dispose();
    webLineMesh = null;
  }

  if (anchorBlockMesh) {
    scene.remove(anchorBlockMesh);
    anchorBlockMesh.geometry.dispose();
    anchorBlockMesh.material.dispose();
    anchorBlockMesh = null;
  }

  if (anchorBlockBody && physicsWorld) {
    physicsWorld.removeRigidBody(anchorBlockBody);
    anchorBlockBody = null;
  }
}

// 🧱 블록 생성
function buildBlockStack() {
  clearBlockStack();

  const geom = new THREE.BoxGeometry(
    blockStackParams.width,
    blockStackParams.height,
    blockStackParams.width
  );
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe67e22,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  const baseBottomY =
    blockStackParams.groundLevel +
    blockStackParams.minHeightFromGround +
    blockStackParams.height / 2;

  for (let i = 0; i < blockStackParams.count; i++) {
    const targetY = baseBottomY + i * blockStackParams.spacing;
    const targetZ = blockStackParams.spawnOffsetZ;
    const targetX = 0;

    if (targetY > params.buildingHeight + 30) continue;

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(targetX, targetY, targetZ);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(targetX, targetY, targetZ);
    const body = physicsWorld.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      blockStackParams.width / 2,
      blockStackParams.height / 2,
      blockStackParams.width / 2
    )
      .setRestitution(0.0)
      .setFriction(0.2);
    const collider = physicsWorld.createCollider(colliderDesc, body);

    breakableBlocks.push({
      mesh,
      body,
      collider,
      initialX: targetX,
      initialY: targetY,
      initialZ: targetZ,
    });
  }
}

// 🧱 파괴 블록 실감나는 파편 폭발 역학 효과
function explodeBlock(x, y, z, impactVelocity) {
  const segments = 2;
  const pWidth = blockStackParams.width / segments;
  const pHeight = blockStackParams.height / segments;
  const pDepth = blockStackParams.width / segments;

  const debrisGeom = new THREE.BoxGeometry(pWidth, pHeight, pDepth);
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0xd35400,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 1.0,
  });

  for (let dx = 0; dx < segments; dx++) {
    for (let dy = 0; dy < segments; dy++) {
      for (let dz = 0; dz < segments; dz++) {
        const rx = (dx - 0.5) * pWidth;
        const ry = (dy - 0.5) * pHeight;
        const rz = (dz - 0.5) * pDepth;

        const px = x + rx;
        const py = y + ry;
        const pz = z + rz;

        const mesh = new THREE.Mesh(debrisGeom, debrisMat.clone());
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        scene.add(mesh);

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(px, py, pz)
          .setCcdEnabled(false);
        const body = physicsWorld.createRigidBody(bodyDesc);

        // 💡 밀도를 극단적으로 낮추고 setSensor(true)로 물리적 반발력 제거
        const colliderDesc = RAPIER.ColliderDesc.cuboid(pWidth / 2, pHeight / 2, pDepth / 2)
          .setRestitution(0.1)
          .setFriction(0.2)
          .setDensity(0.01)
          .setSensor(true);
        physicsWorld.createCollider(colliderDesc, body);

        const forceMagnitude = Math.max(impactVelocity * 0.1, 2.0);
        const impulse = {
          x: (Math.random() - 0.5) * forceMagnitude,
          y: (Math.random() * 0.5 + 0.1) * forceMagnitude,
          z: (Math.random() - 0.5) * forceMagnitude,
        };
        body.applyImpulse(impulse, true);

        body.setAngvel(
          {
            x: (Math.random() - 0.5) * 12,
            y: (Math.random() - 0.5) * 12,
            z: (Math.random() - 0.5) * 12,
          },
          true
        );

        debrisPieces.push({
          mesh,
          body,
          spawnTime: clock.getElapsedTime(),
          lifeTime: 1.5,
        });
      }
    }
  }
}

function clearDebris() {
  debrisPieces.forEach((piece) => {
    if (piece.mesh) {
      scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
      piece.mesh.material.dispose();
    }
    if (piece.body && physicsWorld) {
      physicsWorld.removeRigidBody(piece.body);
    }
  });
  debrisPieces = [];
}

function clearBlockStack() {
  breakableBlocks.forEach((block) => {
    if (block.mesh) {
      scene.remove(block.mesh);
      block.mesh.geometry.dispose();
    }
    if (block.collider && physicsWorld) physicsWorld.removeCollider(block.collider, false);
    if (block.body && physicsWorld) physicsWorld.removeRigidBody(block.body);
  });
  breakableBlocks = [];
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

function deployAirplaneWing() {
  isWingsuitDeployed = true;
  if (character && character.mesh && airplaneWingMesh) {
    airplaneWingMesh.position.set(wingConfig.offsetX, wingConfig.offsetY, wingConfig.offsetZ);
    airplaneWingMesh.scale.set(wingConfig.scale, wingConfig.scale, wingConfig.scale);
    character.mesh.add(airplaneWingMesh);
  }
  uiDisplay.innerHTML = '✈️ 비행기 날개 가동! 수평 글라이딩 비행 활성 (W: 수평 제트 가속)';
}

function removeAirplaneWing() {
  isWingsuitDeployed = false;
  if (character && character.mesh && airplaneWingMesh) {
    character.mesh.remove(airplaneWingMesh);
  }
}

function deployBambooCopter() {
  isCopterDeployed = true;
  isCopterActive = false;
  targetTiltX = targetTiltZ = currentTiltX = currentTiltZ = 0;
  if (character && character.mesh && bambooCopterMesh) {
    bambooCopterMesh.position.set(copterConfig.offsetX, copterConfig.offsetY, copterConfig.offsetZ);
    bambooCopterMesh.scale.set(copterConfig.scale, copterConfig.scale, copterConfig.scale);
    character.mesh.add(bambooCopterMesh);
  }
  uiDisplay.innerHTML = '🛸 대나무 헬리콥터 장착 완료! (스페이스바 유지 시 기본 상태 비행)';
}

function removeBambooCopter() {
  isCopterDeployed = false;
  isCopterActive = false;
  if (character && character.mesh && bambooCopterMesh) {
    character.mesh.remove(bambooCopterMesh);
    character.mesh.rotation.set(0, currentRotationAngle, 0);
  }
}

function handleToolChange(currentTool) {
  removeTrampoline();
  removeParachute();
  removeAirplaneWing();
  removeBambooCopter();
  clearBlockStack();
  removeWebShooter(); // 💡 웹 슈팅 초기화 추가

  if (currentTool === '웹 슈팅(Web Shooting)') {
    // 빌딩 높이와 동일한 거리에 캐릭터 정면(Z축 음수 방향)으로 앵커 블록 생성
    const distance = params.buildingHeight;
    const targetX = 0;
    const targetY = params.buildingHeight;
    const targetZ = -distance;

    // 시각적 블록 생성
    const geom = new THREE.BoxGeometry(4, 4, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.2, metalness: 0.5 });
    anchorBlockMesh = new THREE.Mesh(geom, mat);
    anchorBlockMesh.position.set(targetX, targetY, targetZ);
    anchorBlockMesh.castShadow = true;
    scene.add(anchorBlockMesh);

    // 물리적 고정 강체 생성
    anchorBlockBody = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(targetX, targetY, targetZ)
    );
    const colliderDesc = RAPIER.ColliderDesc.cuboid(2, 2, 2);
    physicsWorld.createCollider(colliderDesc, anchorBlockBody);

    uiDisplay.innerHTML = '🕸️ 웹 슈팅 모드! (E 키: 거미줄 발사 / 끊기)';
  } else if (currentTool === '트램펄린(Trampoline)') {
    const group = new THREE.Group();
    const frameGeo = new THREE.TorusGeometry(trampolineParams.radius, 1.2, 16, 100);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x34495e,
      metalness: 0.8,
      roughness: 0.2,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.rotation.x = Math.PI / 2;
    group.add(frame);

    const matGeo = new THREE.CylinderGeometry(
      trampolineParams.radius - 1,
      trampolineParams.radius - 1,
      0.2,
      32
    );
    const matMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
    const mat = new THREE.Mesh(matGeo, matMat);
    mat.position.y = 0.1;
    mat.receiveShadow = true;
    group.add(mat);

    group.position.set(trampolineParams.x, trampolineParams.y, trampolineParams.z);
    scene.add(group);
    trampolineMesh = group;

    trampolineBody = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        trampolineParams.x,
        trampolineParams.y,
        trampolineParams.z
      )
    );

    const trampolineColliderDesc = RAPIER.ColliderDesc.cylinder(0.25, trampolineParams.radius)
      .setRestitution(1.15)
      .setFriction(0.8);

    trampolineCollider = physicsWorld.createCollider(trampolineColliderDesc, trampolineBody);
  } else if (currentTool === '대나무 헬리콥터') {
    deployBambooCopter();
  } else if (currentTool === '파괴 블록 스택') {
    buildBlockStack();
  }
}

function updateTrampolineTransform() {
  if (trampolineMesh) {
    trampolineMesh.position.set(trampolineParams.x, trampolineParams.y, trampolineParams.z);
  }
  if (trampolineBody) {
    trampolineBody.setTranslation(
      { x: trampolineParams.x, y: trampolineParams.y, z: trampolineParams.z },
      true
    );
  }
}

function removeTrampoline() {
  if (trampolineMesh) {
    trampolineMesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      }
    });
    scene.remove(trampolineMesh);
    trampolineMesh = null;
  }
  if (trampolineCollider && physicsWorld) {
    physicsWorld.removeCollider(trampolineCollider, false);
    trampolineCollider = null;
  }
  if (trampolineBody && physicsWorld) {
    physicsWorld.removeRigidBody(trampolineBody);
    trampolineBody = null;
  }
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

  seaNormalTexture = textureLoader.load('./assets/textures/floor/water_normal.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
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
      if (Math.random() > 0.65) continue;

      const bx = baseX + (Math.random() - 0.5) * 20;
      const bz = baseZ + (Math.random() - 0.5) * 20;
      const randomModel = buildingModelTypes[Math.floor(Math.random() * buildingModelTypes.length)];
      const randomHeight = 30 + Math.random() * 85;
      spawnBackgroundSkyscraper(randomModel, bx, bz, randomHeight);
    }
  }

  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x002b3d,
    metalness: 0.1,
    roughness: 0.12,
    transparent: true,
    opacity: 0.85,
    normalMap: seaNormalTexture,
    normalScale: new THREE.Vector2(0.2, 0.2),
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

  const folderTramp = gui.addFolder('🛠️ 트램펄린 정밀 조정');
  folderTramp
    .add(trampolineParams, 'x', -50, 50, 0.5)
    .name('위치 X (좌우)')
    .onChange(updateTrampolineTransform);
  folderTramp
    .add(trampolineParams, 'y', 0, 50, 0.5)
    .name('위치 Y (높이)')
    .onChange(updateTrampolineTransform);
  folderTramp
    .add(trampolineParams, 'z', -50, 50, 0.5)
    .name('위치 Z (앞뒤)')
    .onChange(updateTrampolineTransform);
  folderTramp
    .add(trampolineParams, 'radius', 5, 50, 1)
    .name('반경 (크기)')
    .onChange(() => {
      if (params.tool === '트램펄린(Trampoline)') handleToolChange('트램펄린(Trampoline)');
    });
  folderTramp.hide();

  const folderStack = gui.addFolder('🧱 블록 스택 세부 조정');
  folderStack
    .add(blockStackParams, 'count', 1, 20, 1)
    .name('배치 개수 (층수)')
    .onChange(() => {
      if (params.tool === '파괴 블록 스택') buildBlockStack();
    });
  folderStack.hide();

  gui
    .add(params, 'tool', [
      '없음(None)',
      '낙하산(Parachute)',
      '트램펄린(Trampoline)',
      '윙슈트(Wingsuit)',
      '대나무 헬리콥터',
      '파괴 블록 스택',
      '웹 슈팅(Web Shooting)',
    ])
    .name('🎒 장착 도구')
    .onChange((v) => {
      handleToolChange(v);
      if (v === '트램펄린(Trampoline)') {
        folderTramp.show();
        folderTramp.open();
        folderStack.hide();
      } else if (v === '파괴 블록 스택') {
        folderStack.show();
        folderStack.open();
        folderTramp.hide();
      } else {
        folderTramp.hide();
        folderStack.hide();
      }
      if (document.activeElement) document.activeElement.blur();
    });

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
          if (document.activeElement) document.activeElement.blur();
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
    } catch (e) {}

    try {
      const swimObj = await loadFBX('Swimming.fbx');
      const swimClip = swimObj.animations[0];
      swimClip.tracks = swimClip.tracks.filter((track) => !track.name.includes('position'));
      actions[6] = mixer.clipAction(swimClip, characterModel);
      actions[6].name = 'Swimming';
    } catch (e) {}

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
  removeAirplaneWing();
  removeBambooCopter();
  clearDebris();
  removeWebShooter(); // 리스폰 시 웹 슈팅 초기화

  if (params.tool === '파괴 블록 스택') {
    buildBlockStack();
  } else {
    clearBlockStack();
  }

  handleToolChange(params.tool);

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
    if (document.activeElement) document.activeElement.blur();
  }, 50);
}

function startJump() {
  if (!character || isFalling || isDead || isRecovering || hasFallen) return;
  params.simulationActive = true;
  isFalling = true;
  hasFallen = true;

  if (actions[actionIndex]) actions[actionIndex].stop();

  if (params.tool === '대나무 헬리콥터') {
    if (actions[0]) {
      actions[0].reset().play();
      actionIndex = 0;
    }
  } else {
    if (actions[1]) {
      actions[1].reset().play();
      actionIndex = 1;
    }
  }

  const jumpSpeed = 16.0;

  const vx = Math.sin(currentRotationAngle) * jumpSpeed;
  const vz = Math.cos(currentRotationAngle) * jumpSpeed;

  character.body.setLinvel({ x: vx, y: 7.5, z: vz }, true);

  tempQuat.setFromAxisAngle(upAxis, currentRotationAngle);
  character.body.setRotation({ x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w }, true);

  setTimeout(() => {
    if (document.activeElement) document.activeElement.blur();
  }, 50);
}

function handleImpact(impulseValue) {
  if (isDead || isRecovering) return;
  removeParachute();
  removeAirplaneWing();
  removeBambooCopter();
  removeWebShooter(); // 충돌 시 거미줄 해제

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
  const dt = Math.min(clock.getDelta(), 0.1) * 2;

  if (mixer) mixer.update(dt);

  if (params.simulationActive && physicsWorld) {
    physicsAccumulator += dt;

    if (seaMesh && seaMesh.visible && seaNormalTexture) {
      const time = clock.getElapsedTime() * 2;
      seaNormalTexture.offset.x = time * 0.015;
      seaNormalTexture.offset.y = time * 0.025;
    }

    const currentElapsedTime = clock.getElapsedTime();
    for (let i = debrisPieces.length - 1; i >= 0; i--) {
      const piece = debrisPieces[i];
      const age = currentElapsedTime - piece.spawnTime;
      if (age >= piece.lifeTime) {
        scene.remove(piece.mesh);
        piece.mesh.geometry.dispose();
        piece.mesh.material.dispose();
        physicsWorld.removeRigidBody(piece.body);
        debrisPieces.splice(i, 1);
      } else {
        const dPos = piece.body.translation();
        const dRot = piece.body.rotation();
        piece.mesh.position.set(dPos.x, dPos.y, dPos.z);
        piece.mesh.quaternion.set(dRot.x, dRot.y, dRot.z, dRot.w);

        const ratio = (piece.lifeTime - age) / piece.lifeTime;
        piece.mesh.material.opacity = ratio;
      }
    }

    if (character && isFalling) {
      const v = character.body.linvel();
      lastVelocity.set(v.x, v.y, v.z);

      if (isCopterDeployed) {
        if (isCopterActive) {
          if (copterPropeller) copterPropeller.rotation.y += copterConfig.rotationSpeed;
          const ascentSpeed = 8.0;
          character.body.setLinvel(
            { x: v.x, y: THREE.MathUtils.lerp(v.y, ascentSpeed, 0.15), z: v.z },
            true
          );
          uiDisplay.innerHTML = '🛸 대나무 헬리콥터 가동 중! (양력 상승 중...)';
        } else {
          if (copterPropeller)
            copterPropeller.rotation.y +=
              THREE.MathUtils.lerp(copterConfig.rotationSpeed, 0, 0.1) * 0.1;
          uiDisplay.innerHTML = '🛸 대나무 헬리콥터 대기 (스페이스바 유지 시 날아오릅니다)';
        }
        maxFallSpeed = Math.abs(character.body.linvel().y);
      } else if (isWingsuitDeployed) {
        const wingsuitTerminalSpeed = -5.0;
        if (v.y < wingsuitTerminalSpeed) {
          character.body.setLinvel(
            { x: v.x, y: v.y * 0.85 + wingsuitTerminalSpeed * 0.15, z: v.z },
            true
          );
        }
        maxFallSpeed = Math.abs(character.body.linvel().y);
      } else if (isParachuteDeployed) {
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

      // 💡 [핵심 사전 판정] 물리 충돌 전에 관통 처리하여 튕김 완전 제거
      if (
        params.tool === '파괴 블록 스택' &&
        breakableBlocks.length > 0 &&
        !isDead &&
        !isRecovering
      ) {
        const pos = character.body.translation();
        for (let i = breakableBlocks.length - 1; i >= 0; i--) {
          const block = breakableBlocks[i];
          const distH = Math.sqrt(
            Math.pow(pos.x - block.initialX, 2) + Math.pow(pos.z - block.initialZ, 2)
          );
          const charBottom = pos.y - 1.2;
          const blockTop = block.initialY + blockStackParams.height / 2;

          if (distH < blockStackParams.width / 2 && v.y < 0) {
            const nextFrameBottom = charBottom + v.y * dt;

            if (charBottom >= blockTop - 0.5 && nextFrameBottom <= blockTop + 0.5) {
              const blockCollisionVelocity = Math.abs(v.y);
              const computedImpulse = params.characterMass * blockCollisionVelocity;

              if (computedImpulse >= blockStackParams.strength) {
                physicsWorld.removeCollider(block.collider, false);
                physicsWorld.removeRigidBody(block.body);
                scene.remove(block.mesh);
                block.mesh.geometry.dispose();

                explodeBlock(
                  block.initialX,
                  block.initialY,
                  block.initialZ,
                  blockCollisionVelocity
                );
                breakableBlocks.splice(i, 1);

                const remainingImpulse = computedImpulse - blockStackParams.strength;
                const newFallSpeed = -(remainingImpulse / params.characterMass);

                character.body.setLinvel({ x: v.x, y: newFallSpeed, z: v.z }, true);

                v.y = newFallSpeed;
                lastVelocity.y = newFallSpeed;
                maxFallSpeed = Math.abs(newFallSpeed);

                uiDisplay.innerHTML = `🧱 관통 성공! (-${blockStackParams.strength} N·s 흡수, 현재속도: ${newFallSpeed.toFixed(1)} m/s)`;
              }
            }
          }
        }
      }
    }

    while (physicsAccumulator >= timeStep) {
      physicsWorld.step();
      physicsAccumulator -= timeStep;
    }

    // 🕸️ 진자 운동 시 거미줄 시각화 업데이트
    if (isSwinging && webLineMesh && character && anchorBlockMesh) {
      const charPos = character.body.translation();
      const anchorPos = anchorBlockMesh.position;
      const positions = webLineMesh.geometry.attributes.position.array;
      positions[0] = charPos.x;
      positions[1] = charPos.y;
      positions[2] = charPos.z;
      positions[3] = anchorPos.x;
      positions[4] = anchorPos.y;
      positions[5] = anchorPos.z;
      webLineMesh.geometry.attributes.position.needsUpdate = true;
    }

    if (character && isFalling && !isDead && !isRecovering) {
      const v = character.body.linvel();
      currentVelocity.set(v.x, v.y, v.z);
      const pos = character.body.translation();
      const isSea = params.mapType === '바다(Sea)';

      if (!isSea) {
        let handledBlockLanding = false;

        // 💡 [핵심 사후 판정]
        if (params.tool === '파괴 블록 스택' && breakableBlocks.length > 0) {
          for (let i = breakableBlocks.length - 1; i >= 0; i--) {
            const block = breakableBlocks[i];
            const distH = Math.sqrt(
              Math.pow(pos.x - block.initialX, 2) + Math.pow(pos.z - block.initialZ, 2)
            );
            const charBottom = pos.y - 1.2;
            const blockTop = block.initialY + blockStackParams.height / 2;

            if (distH < blockStackParams.width / 2 && Math.abs(charBottom - blockTop) < 0.3) {
              if (lastVelocity.y < -0.5 && currentVelocity.y >= -0.1) {
                const collisionVelocity = Math.abs(lastVelocity.y);
                const realPhysicsImpulse = params.characterMass * collisionVelocity;

                if (realPhysicsImpulse < blockStackParams.strength) {
                  lastImpulseValue = realPhysicsImpulse;
                  uiDisplay.innerHTML = `✅ 안전 안착! 충격량 ${realPhysicsImpulse.toFixed(1)} N·s (블록 유지)`;
                  handledBlockLanding = true;
                  handleImpact(realPhysicsImpulse);
                  break;
                }
              }
            }
          }
        }

        const trampY = trampolineParams.y;
        if (
          !handledBlockLanding &&
          params.tool === '트램펄린(Trampoline)' &&
          pos.y > trampY - 0.2 &&
          pos.y < trampY + 3.0
        ) {
          if (currentVelocity.y > 0.5 && lastVelocity.y < -1.0) {
            const impactVelocity = Math.abs(lastVelocity.y);
            const realPhysicsImpulse = params.characterMass * impactVelocity;
            const mitigatedImpulse = realPhysicsImpulse * 0.15;
            lastImpulseValue = mitigatedImpulse;
            maxFallSpeed = 0;

            if (mitigatedImpulse >= params.dieThreshold) {
              isDead = true;
              uiDisplay.innerHTML = `💥 트램펄린 파손! 임계 초과: <span style="color:#ff5555;font-weight:bold;">${mitigatedImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (초고도 직격 충돌)</span>`;
              if (actions[actionIndex]) actions[actionIndex].stop();
              if (actions[3]) {
                actions[3].reset().play();
                actionIndex = 3;
              }
              character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            } else if (impactVelocity < 4.0) {
              isFalling = false;
              hasFallen = false;
              character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
              uiDisplay.innerHTML = `✅ 안전 안착 성공! (최종 충격량: ${mitigatedImpulse.toFixed(1)} N·s)<br>상태: 트램펄린 위 대기`;
              if (actions[actionIndex]) actions[actionIndex].stop();
              if (actions[0]) {
                actions[0].reset().fadeIn(0.15).play();
                actionIndex = 0;
              }
            } else {
              uiDisplay.innerHTML = `🚀 감쇄 리바운드 탄성 감속 중! (완화 충격량: ${mitigatedImpulse.toFixed(1)} N·s)<br>상태: 공중 재상승 (진동 하강속도: ${impactVelocity.toFixed(1)} m/s)`;
              if (actions[actionIndex]) actions[actionIndex].stop();
              if (actions[1]) {
                actions[1].reset().play();
                actionIndex = 1;
              }
              isFalling = true;
            }
          }
        } else if (!handledBlockLanding) {
          const isPhysicsImpact =
            lastVelocity.y < -2.0 && currentVelocity.y >= lastVelocity.y * -0.2;
          const isAbsoluteGroundImpact = pos.y <= 1.21;
          if (isPhysicsImpact || isAbsoluteGroundImpact) {
            const collisionVelocity = Math.max(Math.abs(lastVelocity.y), maxFallSpeed);
            const finalMassFactor =
              isWingsuitDeployed || isCopterDeployed
                ? params.characterMass * 0.1
                : params.characterMass;
            const realPhysicsImpulse = finalMassFactor * collisionVelocity;
            lastImpulseValue = realPhysicsImpulse;
            handleImpact(realPhysicsImpulse);
          }
        }
      } else {
        if (pos.y <= 1.2 && !inWater) {
          inWater = true;
          isFalling = false;
          removeParachute();
          removeAirplaneWing();
          removeBambooCopter();
          removeWebShooter();

          const collisionVelocity = Math.max(Math.abs(lastVelocity.y), maxFallSpeed);
          const realPhysicsImpulse = params.characterMass * collisionVelocity;
          const waterSurfaceImpulse = realPhysicsImpulse * 0.4;
          lastImpulseValue = waterSurfaceImpulse;

          waterEntryVelocity = collisionVelocity;
          targetMaxDepth = THREE.MathUtils.clamp(waterEntryVelocity * 0.16, 1.0, 15.0);
          entryTime = clock.getElapsedTime();

          if (waterSurfaceImpulse >= params.dieThreshold) {
            isDead = true;
            uiDisplay.innerHTML = `💥 수면 충돌량 초과: <span style="color:#ff5555;font-weight:bold;">${waterSurfaceImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (수면 타격)</span>`;
            if (actions[actionIndex]) actions[actionIndex].stop();
            if (actions[3]) {
              actions[3].reset().play();
              actionIndex = 3;
            }
          } else {
            uiDisplay.innerHTML = `💦 퐁당! 실감 입수 (표면 충격량: ${waterSurfaceImpulse.toFixed(1)} N·s)<br>상태: 하강 파고들기 중... (최대 목표 깊이: -${targetMaxDepth.toFixed(1)}m)`;
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

    if (inWater && character) {
      const v = character.body.linvel();
      const pos = character.body.translation();
      const targetWaterLevel = 0.4;
      const timeInWater = clock.getElapsedTime() - entryTime;

      if (!isDead) {
        if (timeInWater < 1.5) {
          const progress = timeInWater / 1.5;
          const currentDepthOffset = Math.sin(progress * Math.PI) * targetMaxDepth;
          const computedTargetY = targetWaterLevel - currentDepthOffset;
          const nextY = THREE.MathUtils.lerp(pos.y, computedTargetY, 0.15);
          character.body.setTranslation({ x: pos.x, y: nextY, z: pos.z }, true);
          character.body.setLinvel({ x: v.x * 0.8, y: v.y * 0.6, z: v.z * 0.8 }, true);
          if (timeInWater > 0.7 && uiDisplay.innerHTML.indexOf('최저점 도달 후 부상') === -1) {
            uiDisplay.innerHTML = `🏊‍♂️ 감속 제어 완료<br>상태: 최저점 도달 후 해수면 부상 중...`;
          }
        } else {
          const depth = targetWaterLevel - pos.y;
          const buoyancy = depth > 0 ? depth * 15.0 : -2.0;
          character.body.setLinvel(
            {
              x: v.x * 0.9,
              y: v.y * 0.82 + buoyancy * dt,
              z: v.z * 0.9,
            },
            true
          );

          if (Math.abs(depth) < 0.15 && Math.abs(v.y) < 0.2) {
            if (uiDisplay.innerHTML.indexOf('튜브 둥둥') === -1) {
              uiDisplay.innerHTML = `💦 입수 시뮬레이션 완착 완료<br>상태: 해수면 휴식 (튜브 둥둥 🏊‍♂️)`;
            }
          }
        }
      } else {
        character.body.setLinvel({ x: v.x * 0.92, y: -0.4, z: v.z * 0.92 }, true);
      }
    }
  }

  if (character) {
    const pos = character.body.translation();
    const rot = character.body.rotation();
    const currentVel = character.body.linvel();

    let inputX = 0,
      inputZ = 0;
    if (keys.forward) inputZ -= 1;
    if (keys.backward) inputZ += 1;
    if (keys.left) inputX -= 1;
    if (keys.right) inputX += 1;

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

      if (params.tool === '대나무 헬리콥터') {
        if (actions[0]) {
          actions[0].reset().play();
          actionIndex = 0;
        }
      } else {
        if (actions[1]) {
          actions[1].reset().play();
          actionIndex = 1;
        }
      }
    }

    targetTiltX = 0;
    targetTiltZ = 0;

    if (params.simulationActive && physicsWorld && !isDead && !isRecovering) {
      if (inputX !== 0 || inputZ !== 0) {
        const camForward = new THREE.Vector3();
        const camRight = new THREE.Vector3();

        camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();

        camRight.crossVectors(camForward, upAxis).normalize();

        const moveDirection = new THREE.Vector3();
        moveDirection.addScaledVector(camForward, -inputZ);
        moveDirection.addScaledVector(camRight, inputX);
        moveDirection.normalize();

        targetRotationAngle = Math.atan2(moveDirection.x, moveDirection.z);
        let diff = targetRotationAngle - currentRotationAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));

        currentRotationAngle += diff * 10.0 * dt;

        tempQuat.setFromAxisAngle(upAxis, currentRotationAngle);
        character.body.setRotation(
          { x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w },
          true
        );

        if (inWater) {
          const swimSpeed = 3.0;
          const currentV = character.body.linvel();
          character.body.setLinvel(
            {
              x: THREE.MathUtils.lerp(currentV.x, moveDirection.x * swimSpeed, 0.05),
              y: currentV.y,
              z: THREE.MathUtils.lerp(currentV.z, moveDirection.z * swimSpeed, 0.05),
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
            {
              x: moveDirection.x * moveSpeed,
              y: currentVel.y,
              z: moveDirection.z * moveSpeed,
            },
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
          if (isWingsuitDeployed) {
            const glideThrust = 2.5;
            const maxGlideSpeed = 35.0;

            const targetVx = currentVel.x + moveDirection.x * glideThrust;
            const targetVz = currentVel.z + moveDirection.z * glideThrust;
            const horizontalSpeed = Math.sqrt(targetVx * targetVx + targetVz * targetVz);

            if (horizontalSpeed > maxGlideSpeed) {
              character.body.setLinvel(
                {
                  x: (targetVx / horizontalSpeed) * maxGlideSpeed,
                  y: currentVel.y,
                  z: (targetVz / horizontalSpeed) * maxGlideSpeed,
                },
                true
              );
            } else {
              character.body.setLinvel({ x: targetVx, y: currentVel.y, z: targetVz }, true);
            }

            if (airplaneWingMesh) {
              const turnFactor = inputX * 0.45;
              airplaneWingMesh.rotation.z = THREE.MathUtils.lerp(
                airplaneWingMesh.rotation.z,
                turnFactor,
                0.1
              );
            }
          } else if (isCopterDeployed) {
            const copterMoveSpeed = 14.0;
            character.body.setLinvel(
              {
                x: THREE.MathUtils.lerp(currentVel.x, moveDirection.x * copterMoveSpeed, 0.1),
                y: currentVel.y,
                z: THREE.MathUtils.lerp(currentVel.z, moveDirection.z * copterMoveSpeed, 0.1),
              },
              true
            );

            targetTiltX = 0.35;
          } else {
            const airVx = currentVel.x + moveDirection.x * AIR_CONTROL_FACTOR;
            const airVz = currentVel.z + moveDirection.z * AIR_CONTROL_FACTOR;
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
        } else if (isWingsuitDeployed) {
          const currentV = character.body.linvel();
          character.body.setLinvel(
            { x: currentV.x * 0.99, y: currentV.y, z: currentV.z * 0.99 },
            true
          );

          if (airplaneWingMesh) {
            airplaneWingMesh.rotation.z = THREE.MathUtils.lerp(airplaneWingMesh.rotation.z, 0, 0.1);
          }
        } else if (isCopterDeployed) {
          character.body.setLinvel(
            { x: currentVel.x * 0.85, y: currentVel.y, z: currentVel.z * 0.85 },
            true
          );

          if (actionIndex !== 0 && actions[0]) {
            if (actions[actionIndex]) actions[actionIndex].stop();
            actions[0].reset().play();
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

    currentTiltX = THREE.MathUtils.lerp(currentTiltX, targetTiltX, 0.1);
    currentTiltZ = THREE.MathUtils.lerp(currentTiltZ, targetTiltZ, 0.1);

    const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(upAxis, currentRotationAngle);
    const tiltQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(currentTiltX, 0, currentTiltZ)
    );
    const targetRotGroup = baseQuaternion.multiply(tiltQuaternion);

    const characterLerpFactor = 1.0 - Math.exp(-30.0 * dt);
    character.mesh.position.lerp(targetPos, characterLerpFactor);
    character.mesh.quaternion.slerp(targetRotGroup, characterLerpFactor);

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
      if (loadingOverlay.parentNode) loadingOverlay.parentNode.removeChild(loadingOverlay);
    }, 500);
  }
}

createLoadingScreen();
init();
animate();
