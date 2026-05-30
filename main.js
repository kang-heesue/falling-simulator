import * as THREE from 'three';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

let scene, camera, renderer, orbitControls;
let physicsWorld;

let character = null;

// 단일 빌딩 및 텍스처 관리를 위한 전역 변수
let targetBuildingMesh = null;
let targetBuildingCollider = null;
let targetBuildingBody = null;
let buildingTexture = null;

// 지면 텍스처 및 재질 관리를 위한 전역 변수
let groundMaterial = null;
let stoneTexture = null;
let moonTexture = null;

// 하늘 텍스처 관리를 위한 전역 변수
let skyTexture = null;
let spaceTexture = null;

let characterModel = null;
let mixer = null;
const clock = new THREE.Clock();
let isFalling = false;
let isDead = false;
let isRecovering = false;
let hasFallen = false;

// 충격량 연산을 위한 직전 프레임 속도 저장 벡터
const lastVelocity = new THREE.Vector3();
const currentVelocity = new THREE.Vector3();
let maxFallSpeed = 0;

// 성능 최적화 및 부드러운 회전을 위한 객체들
const tempVec3 = new THREE.Vector3();
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

// UI 출력을 위한 DOM 요소 생성
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

// 키보드 이벤트
window.addEventListener('keydown', (e) => {
  if (isDead || isRecovering || hasFallen) return;
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
  }
  if (!params.simulationActive && (keys.forward || keys.backward || keys.left || keys.right)) {
    params.simulationActive = true;
  }
});

window.addEventListener('keyup', (e) => {
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
  buildingHeight: 80,
  gravityPreset: '지구',
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

const GRAVITY_PRESETS = {
  무중력: 0,
  달: -1.62,
  화성: -3.71,
  지구: -9.81,
  목성: -24.79,
};

async function init() {
  try {
    initThree();
    await initPhysics();
    buildCity();
    initGUI();
    await loadAnimations();
  } catch (error) {
    console.error(error);
  }
}

function initThree() {
  scene = new THREE.Scene();

  // ★ 지면 가시성 확보를 위해 선형 안개(Linear Fog)로 교체
  // 가까운 거리(10m)부터 먼 거리(2000m)까지 서서히 안개가 끼므로 아래 지면이 선명하게 청소됩니다.
  scene.fog = new THREE.Fog(0xff9e80, 10, 2000);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 200000);
  // ★ 시작 시 카메라 가우징 각도를 넓혀 아래 바닥이 자연스럽게 시야에 들어오도록 조정
  camera.position.set(0, params.buildingHeight + 40, 140);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 시네마틱 톤 매핑 설정
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  document.body.appendChild(renderer.domElement);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.target.set(0, params.buildingHeight, 0);

  // ★ 지면 그늘이 너무 어둡게 뭉치는 현상을 방지하기 위해 환경 조명 광량 대폭 보강
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x6c4d85, 0xff8a69, 0.8);
  hemiLight.position.set(0, 500, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffedd6, 1.5);
  dirLight.position.set(1200, 300, -50); // 그림자가 너무 길어지지 않게 고도 살짝 상향
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

async function initPhysics() {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: GRAVITY_PRESETS['지구'], z: 0 });
}

function buildCity() {
  const textureLoader = new THREE.TextureLoader();

  // ★ 1. 지면 텍스처 로드 및 무한 반복 설정
  stoneTexture = textureLoader.load('./assets/textures/floor/stone.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // 50000m의 광활한 영토이므로, 텍스처가 깨지지 않게 가로세로 2,000번 반복 바둑판 배열 지정
    texture.repeat.set(2000, 2000);
  });

  moonTexture = textureLoader.load('./assets/textures/floor/moon.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1000, 1000);
  });

  // ★ 2. 재질(Material)의 map 속성에 기본(돌) 바닥 매핑 및 반사율 미세 조정
  groundMaterial = new THREE.MeshStandardMaterial({
    map: params.gravityPreset === '달' ? moonTexture : stoneTexture,
    roughness: 0.65, // 돌 특유의 거친 느낌 유지
    metalness: 0.15, // 노을빛이 바닥에 미세하게 반사되도록 살짝 부여
  });

  // 지면 메쉬 생성 (돌바닥 평면)
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000), groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, 0, 0);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // 물리 엔진 지면 바디 및 콜라이더 (기존 코드 유지)
  const groundBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -50.0, 0),
  );
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(25000, 50.0, 25000)
    .setRestitution(0.05)
    .setFriction(0.9);
  physicsWorld.createCollider(groundColliderDesc, groundBody);

  // 빌딩 생성 및 텍스처 매핑 (기존 코드 유지)
  buildingTexture = textureLoader.load('./assets/textures/building_window.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, params.buildingHeight / 10);
  });

  const buildingMaterial = new THREE.MeshStandardMaterial({
    map: buildingTexture,
    roughness: 0.15,
    metalness: 0.55,
  });

  const startBuildingMesh = new THREE.Mesh(
    new THREE.BoxGeometry(START_BUILDING_WIDTH, params.buildingHeight, START_BUILDING_WIDTH),
    buildingMaterial,
  );
  startBuildingMesh.position.set(0, params.buildingHeight / 2, 0);
  startBuildingMesh.castShadow = true;
  startBuildingMesh.receiveShadow = true;
  scene.add(startBuildingMesh);
  targetBuildingMesh = startBuildingMesh;

  targetBuildingBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, params.buildingHeight / 2, 0),
  );
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    START_BUILDING_WIDTH / 2,
    params.buildingHeight / 2,
    START_BUILDING_WIDTH / 2,
  )
    .setRestitution(0.1)
    .setFriction(0.6);
  targetBuildingCollider = physicsWorld.createCollider(colliderDesc, targetBuildingBody);
}

function updateBuildingHeight(newHeight) {
  if (!targetBuildingMesh || !physicsWorld) return;
  const safeHeight = newHeight <= 0 ? 0.1 : newHeight;

  targetBuildingMesh.geometry.dispose();
  targetBuildingMesh.geometry = new THREE.BoxGeometry(
    START_BUILDING_WIDTH,
    safeHeight,
    START_BUILDING_WIDTH,
  );
  targetBuildingMesh.position.set(0, safeHeight / 2, 0);

  if (buildingTexture) {
    buildingTexture.repeat.set(2, safeHeight / 10);
    buildingTexture.needsUpdate = true;
  }

  if (targetBuildingCollider) physicsWorld.removeCollider(targetBuildingCollider, false);
  if (targetBuildingBody) physicsWorld.removeRigidBody(targetBuildingBody);

  targetBuildingBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, safeHeight / 2, 0),
  );
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    START_BUILDING_WIDTH / 2,
    safeHeight / 2,
    START_BUILDING_WIDTH / 2,
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
    .add(params, 'buildingHeight', 0, 10000, 10)
    .name('🏢 빌딩 높이 (m)')
    .onChange((v) => updateBuildingHeight(v));
  gui.add(params, 'characterMass', 10, 200, 5).name('⚖️ 캐릭터 질량 (kg)');
  gui.add(params, 'dieThreshold', 500, 5000, 100).name('💥 사망 임계 충격량');

  const folder = gui.addFolder('행동 제어');
  folder.add(params, 'jump').name('낙하 시작 🪂');
  folder.add(params, 'respawn').name('리스폰 🔄');
  gui
    .add(params, 'gravityPreset', Object.keys(GRAVITY_PRESETS))
    .name('중력 환경')
    .onChange((v) => {
      physicsWorld.gravity = { x: 0, y: GRAVITY_PRESETS[v], z: 0 };

      // 중력 환경이 '달'인 경우 달 지면 및 우주 배경으로 변경
      if (v === '달') {
        if (groundMaterial) groundMaterial.map = moonTexture;
        if (spaceTexture) {
          scene.background = spaceTexture;
          scene.environment = spaceTexture;
        }
        // 안개 색상을 우주에 맞는 검은색으로 변경
        if (scene.fog) scene.fog.color.setHex(0x000000);
      } else {
        if (groundMaterial) groundMaterial.map = stoneTexture;
        if (skyTexture) {
          scene.background = skyTexture;
          scene.environment = skyTexture;
        }
        // 안개 색상을 원래로 복원
        if (scene.fog) scene.fog.color.setHex(0xff9e80);
      }

      if (groundMaterial) groundMaterial.needsUpdate = true;
    });
}

function loadFBX(filename) {
  return new Promise((resolve, reject) => {
    loader.load(
      filename,
      (obj) => resolve(obj),
      undefined,
      (err) => reject(err),
    );
  });
}

async function loadAnimations() {
  console.log('--- 애니메이션 로딩 시작 ---');
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
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    try {
      const fallObj = await loadFBX('Falling.fbx');
      actions[1] = mixer.clipAction(fallObj.animations[0], characterModel);
      actions[1].name = 'Falling';
    } catch (e) {
      console.warn('Falling 애니메이션 로드 실패');
    }

    try {
      const walkObj = await loadFBX('Walking.fbx');
      actions[2] = mixer.clipAction(walkObj.animations[0], characterModel);
      actions[2].name = 'Walking';
    } catch (e) {
      console.warn('Walking 애니메이션 로드 실패');
    }

    try {
      const dieObj = await loadFBX('fall_die.fbx');
      actions[3] = mixer.clipAction(dieObj.animations[0], characterModel);
      actions[3].name = 'FallDie';
      actions[3].setLoop(THREE.LoopOnce);
      actions[3].clampWhenFinished = true;
    } catch (e) {
      console.warn('fall_die.fbx 로드 실패');
    }

    try {
      const liveObj = await loadFBX('fall_live.fbx');
      actions[4] = mixer.clipAction(liveObj.animations[0], characterModel);
      actions[4].name = 'FallLive';
      actions[4].setLoop(THREE.LoopOnce);
      actions[4].clampWhenFinished = true;
    } catch (e) {
      console.warn('fall_live.fbx 로드 실패');
    }
  } catch (error) {
    console.error('기본 모델 스킨 로드 실패:', error);
  } finally {
    respawnCharacter();
  }
}

function respawnCharacter() {
  params.simulationActive = false;
  isFalling = false;
  isDead = false;
  isRecovering = false;
  hasFallen = false;
  maxFallSpeed = 0;
  keys.forward = keys.backward = keys.left = keys.right = false;
  uiDisplay.innerHTML = '💥 마지막 충격량: 0 N·s<br> 상태: 대기 중';

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
  currentRotationAngle = 0;
  targetRotationAngle = 0;
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
  // ★ 스폰 시에도 카메라가 조금 더 후퇴하여 주변 지면과의 원근감을 인지할 수 있도록 보정
  camera.position.set(0, params.buildingHeight + 15, 45);
  orbitControls.update();
}

function startJump() {
  if (!character || isFalling || isDead || isRecovering || hasFallen) return;
  params.simulationActive = true;
  isFalling = true;
  hasFallen = true;
  keys.forward = keys.backward = keys.left = keys.right = false;

  if (actions[actionIndex]) actions[actionIndex].stop();
  if (actions[1]) {
    actions[1].reset().play();
    actionIndex = 1;
  }

  character.body.setLinvel({ x: 25.0, y: 12.0, z: 25.0 }, true);
}

function handleImpact(impulseValue) {
  isFalling = false;
  const finalImpulse = Math.max(impulseValue, Math.abs(lastVelocity.y) * params.characterMass);

  if (finalImpulse >= params.dieThreshold) {
    isDead = true;
    uiDisplay.innerHTML = `💥 마지막 충격량: <span style="color:#ff5555;font-weight:bold;">${finalImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (Fall Die)</span>`;

    if (actions[actionIndex]) actions[actionIndex].stop();
    if (actions[3]) {
      actions[3].reset().play();
      actionIndex = 3;
    }
    character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  } else {
    isRecovering = true;
    uiDisplay.innerHTML = `💥 마지막 충격량: <span style="color:#55ff55;font-weight:bold;">${finalImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#55ff55;font-weight:bold;">생존 (부상 복구 중...)</span>`;

    character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    character.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    if (actions[actionIndex]) actions[actionIndex].stop();
    if (actions[4]) {
      actions[4].reset().play();
      actionIndex = 4;

      const duration = actions[4].getClip().duration * 1000;
      setTimeout(() => {
        if (!isDead && character && isRecovering) {
          isRecovering = false;
          uiDisplay.innerHTML = `💥 마지막 충격량: ${finalImpulse.toFixed(1)} N·s<br>상태: 초기화 완료 (조작 불가, 리스폰 필요)`;
          if (actions[4]) actions[4].stop();
          if (actions[0]) {
            actions[0].reset().play();
            actionIndex = 0;
          }
        }
      }, duration);
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
    physicsWorld.timestep = dt;

    if (character && isFalling) {
      const v = character.body.linvel();
      lastVelocity.set(v.x, v.y, v.z);

      const currentSpeedY = Math.abs(v.y);
      if (currentSpeedY > maxFallSpeed) {
        maxFallSpeed = currentSpeedY;
      }
    }

    physicsWorld.step();

    if (character && isFalling) {
      const v = character.body.linvel();
      currentVelocity.set(v.x, v.y, v.z);

      const pos = character.body.translation();
      const isPhysicsImpact = lastVelocity.y < -2.0 && currentVelocity.y >= lastVelocity.y * -0.2;
      const isAbsoluteGroundImpact = pos.y <= 1.25;

      if (isPhysicsImpact || isAbsoluteGroundImpact) {
        const collisionVelocity = Math.max(Math.abs(lastVelocity.y), maxFallSpeed);
        const realPhysicsImpulse = params.characterMass * collisionVelocity;
        handleImpact(realPhysicsImpulse);
      }
    }
  }

  if (character) {
    const pos = character.body.translation();
    const rot = character.body.rotation();
    const currentVel = character.body.linvel();

    if (params.simulationActive && physicsWorld && !isDead && !isRecovering && !hasFallen) {
      let moveX = 0,
        moveZ = 0;
      if (keys.forward) moveZ -= 10;
      if (keys.backward) moveZ += 10;
      if (keys.left) moveX -= 10;
      if (keys.right) moveX += 10;

      if (!isFalling) {
        if (moveX !== 0 || moveZ !== 0) {
          const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
          moveX = (moveX / len) * 10;
          moveZ = (moveZ / len) * 10;
          character.body.setLinvel({ x: moveX, y: currentVel.y, z: moveZ }, true);

          targetRotationAngle = Math.atan2(moveX, moveZ);
          let diff = targetRotationAngle - currentRotationAngle;

          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          currentRotationAngle += diff * 0.2;

          tempQuat.setFromAxisAngle(upAxis, currentRotationAngle);
          character.body.setRotation(
            { x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w },
            true,
          );

          if (actions[2]) {
            const horizontalSpeed = Math.sqrt(
              currentVel.x * currentVel.x + currentVel.z * currentVel.z,
            );
            actions[2].timeScale = horizontalSpeed / 10.0;
          }
          if (actionIndex !== 2 && actions[2]) {
            if (actions[actionIndex]) actions[actionIndex].fadeOut(0.15);
            actions[2].reset().fadeIn(0.15).play();
            actionIndex = 2;
          }
        } else {
          character.body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
          if (actionIndex !== 0 && actions[0]) {
            if (actions[actionIndex]) actions[actionIndex].fadeOut(0.15);
            actions[0].reset().fadeIn(0.15).play();
            actionIndex = 0;
          }
        }
      }
    }

    if (
      params.simulationActive &&
      !isFalling &&
      !hasFallen &&
      pos.y < params.buildingHeight - 0.8
    ) {
      isFalling = true;
      hasFallen = true;

      keys.forward = keys.backward = keys.left = keys.right = false;
      character.body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);

      if (actions[actionIndex]) actions[actionIndex].stop();
      if (actions[1]) {
        actions[1].reset().play();
        actionIndex = 1;
      }
    }

    const renderY = Math.max(pos.y, 1.2) - 1.2;
    character.mesh.position.set(pos.x, renderY, pos.z);
    character.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // ★ 카메라 추적 보간 로직 고도화
    // 캐릭터가 땅에 가까워지면 카메라도 지면 쪽을 비출 수 있도록 유연하게 타깃이 변합니다.
    tempVec3.set(pos.x, pos.y + 10, pos.z + 30);
    camera.position.lerp(tempVec3, 0.05);
    orbitControls.target.set(pos.x, pos.y, pos.z);
  }
  orbitControls.update();
  renderer.render(scene, camera);
}

init();
animate();
