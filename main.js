import * as THREE from 'three';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

let scene, camera, renderer, orbitControls;
let physicsWorld;

let character = null;

// 단일 빌딩 관리를 위한 전역 변수
let targetBuildingMesh = null;
let targetBuildingCollider = null;
let targetBuildingBody = null;

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
uiDisplay.style.position = 'absolute'; uiDisplay.style.top = '15px'; uiDisplay.style.left = '15px';
uiDisplay.style.padding = '12px'; uiDisplay.style.background = 'rgba(0,0,0,0.75)';
uiDisplay.style.color = '#fff'; uiDisplay.style.fontFamily = 'monospace'; uiDisplay.style.borderRadius = '5px';
uiDisplay.style.zIndex = '999'; uiDisplay.innerHTML = '💥 마지막 충격량: 0 N·s<br> 상태: 대기 중';
document.body.appendChild(uiDisplay);

// 키보드 이벤트
window.addEventListener('keydown', (e) => {
  if (isDead || isRecovering || hasFallen) return; 
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': keys.forward = true; break;
    case 'ArrowDown': case 'KeyS': keys.backward = true; break;
    case 'ArrowLeft': case 'KeyA': keys.left = true; break;
    case 'ArrowRight': case 'KeyD': keys.right = true; break;
  }
  if (!params.simulationActive && (keys.forward || keys.backward || keys.left || keys.right)) {
    params.simulationActive = true;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': keys.forward = false; break;
    case 'ArrowDown': case 'KeyS': keys.backward = false; break;
    case 'ArrowLeft': case 'KeyA': keys.left = false; break;
    case 'ArrowRight': case 'KeyD': keys.right = false; break;
  }
});

const loader = new FBXLoader();
const START_BUILDING_WIDTH = 25;

const params = {
  buildingHeight: 80, 
  gravityPreset: '지구',
  airResistance: 0.1,
  simulationActive: false,
  characterMass: 70,    
  dieThreshold: 2500,   
  jump: function () { startJump(); },
  respawn: function () { respawnCharacter(); },
};

const GRAVITY_PRESETS = {
  무중력: 0, 달: -1.62, 화성: -3.71, 지구: -9.81, 목성: -24.79,
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
  scene.background = new THREE.Color(0xbfd1e5); 
  
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 200000);
  camera.position.set(0, params.buildingHeight + 20, 100);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.target.set(0, params.buildingHeight, 0);
  
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
  scene.add(ambientLight);
  
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(500, 2000, 500);
  dirLight.castShadow = true;
  scene.add(dirLight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

async function initPhysics() {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: GRAVITY_PRESETS['지구'], z: 0 });
}

function buildCity() {
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(50000, 50000), 
    new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, 0, 0); 
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  
  const groundBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -50.0, 0));
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(25000, 50.0, 25000) 
    .setRestitution(0.05) 
    .setFriction(0.9);
  physicsWorld.createCollider(groundColliderDesc, groundBody);

  const startBuildingMesh = new THREE.Mesh(
    new THREE.BoxGeometry(START_BUILDING_WIDTH, params.buildingHeight, START_BUILDING_WIDTH), 
    new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.5 })
  );
  startBuildingMesh.position.set(0, params.buildingHeight / 2, 0);
  startBuildingMesh.castShadow = true; startBuildingMesh.receiveShadow = true;
  scene.add(startBuildingMesh);
  targetBuildingMesh = startBuildingMesh;

  targetBuildingBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, params.buildingHeight / 2, 0));
  const colliderDesc = RAPIER.ColliderDesc.cuboid(START_BUILDING_WIDTH / 2, params.buildingHeight / 2, START_BUILDING_WIDTH / 2).setRestitution(0.1).setFriction(0.6);
  targetBuildingCollider = physicsWorld.createCollider(colliderDesc, targetBuildingBody);
}

function updateBuildingHeight(newHeight) {
  if (!targetBuildingMesh || !physicsWorld) return;
  const safeHeight = newHeight <= 0 ? 0.1 : newHeight;
  targetBuildingMesh.geometry.dispose(); 
  targetBuildingMesh.geometry = new THREE.BoxGeometry(START_BUILDING_WIDTH, safeHeight, START_BUILDING_WIDTH);
  targetBuildingMesh.position.set(0, safeHeight / 2, 0);

  if (targetBuildingCollider) physicsWorld.removeCollider(targetBuildingCollider, false);
  if (targetBuildingBody) physicsWorld.removeRigidBody(targetBuildingBody);

  targetBuildingBody = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, safeHeight / 2, 0));
  const colliderDesc = RAPIER.ColliderDesc.cuboid(START_BUILDING_WIDTH / 2, safeHeight / 2, START_BUILDING_WIDTH / 2).setRestitution(0.1).setFriction(0.6);
  targetBuildingCollider = physicsWorld.createCollider(colliderDesc, targetBuildingBody);
  respawnCharacter();
}

function initGUI() {
  const gui = new GUI();
  gui.title('시뮬레이터 조작 설정');
  gui.add(params, 'buildingHeight', 0, 10000, 10).name('🏢 빌딩 높이 (m)').onChange(v => updateBuildingHeight(v));
  gui.add(params, 'characterMass', 10, 200, 5).name('⚖️ 캐릭터 질량 (kg)');
  gui.add(params, 'dieThreshold', 500, 5000, 100).name('💥 사망 임계 충격량');

  const folder = gui.addFolder('행동 제어');
  folder.add(params, 'jump').name('낙하 시작 🪂');
  folder.add(params, 'respawn').name('리스폰 🔄');
  gui.add(params, 'gravityPreset', Object.keys(GRAVITY_PRESETS)).name('중력 환경').onChange(v => { physicsWorld.gravity = {x:0, y:GRAVITY_PRESETS[v], z:0}; });
}

function loadFBX(filename) {
  return new Promise((resolve, reject) => { 
    loader.load(filename, (obj) => resolve(obj), undefined, (err) => reject(err)); 
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
    
    actions[0] = mixer.clipAction(characterModel.animations[0]); actions[0].name = 'Idle'; actions[0].play();
    characterModel.traverse(c => { if(c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

    try {
      const fallObj = await loadFBX('Falling.fbx');
      actions[1] = mixer.clipAction(fallObj.animations[0], characterModel); actions[1].name = 'Falling';
    } catch(e) {}

    try {
      const walkObj = await loadFBX('Walking.fbx');
      actions[2] = mixer.clipAction(walkObj.animations[0], characterModel); actions[2].name = 'Walking';
    } catch(e) {}

    try {
      const dieObj = await loadFBX('fall_die.fbx');
      actions[3] = mixer.clipAction(dieObj.animations[0], characterModel);
      actions[3].name = 'FallDie';
      actions[3].setLoop(THREE.LoopOnce); 
      actions[3].clampWhenFinished = true; 
    } catch(e) { console.warn('fall_die.fbx 로드 실패'); }

    try {
      const liveObj = await loadFBX('fall_live.fbx');
      actions[4] = mixer.clipAction(liveObj.animations[0], characterModel);
      actions[4].name = 'FallLive';
      actions[4].setLoop(THREE.LoopOnce);
      actions[4].clampWhenFinished = true; 
    } catch(e) { console.warn('fall_live.fbx 로드 실패'); }

  } catch (error) {
    console.error(error);
  } finally {
    respawnCharacter();
  }
}

function respawnCharacter() {
  params.simulationActive = false; isFalling = false; isDead = false; isRecovering = false;
  hasFallen = false; maxFallSpeed = 0;
  keys.forward = keys.backward = keys.left = keys.right = false;
  uiDisplay.innerHTML = '💥 마지막 충격량: 0 N·s<br> 상태: 대기 중';

  if (character) { scene.remove(character.mesh); if(character.body) physicsWorld.removeRigidBody(character.body); }
  if (!characterModel) return;
  
  actions.forEach(a => { if(a) a.stop(); });
  if(actions[0]) { actions[0].reset().play(); actionIndex = 0; }

  characterModel.position.set(0, params.buildingHeight, 0);
  currentRotationAngle = 0; targetRotationAngle = 0;
  characterModel.rotation.set(0, 0, 0);
  scene.add(characterModel);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, params.buildingHeight + 1.2, 0)
    .setCcdEnabled(true) 
    .enabledRotations(false, true, false);
    
  const body = physicsWorld.createRigidBody(bodyDesc);
  const characterColliderDesc = RAPIER.ColliderDesc.capsule(0.6, 0.6).setFriction(0.5).setRestitution(0.0); 
  physicsWorld.createCollider(characterColliderDesc, body);
  
  character = { mesh: characterModel, body };
  lastVelocity.set(0, 0, 0);

  orbitControls.target.set(0, params.buildingHeight, 0);
  camera.position.set(0, params.buildingHeight + 10, 30);
  orbitControls.update();
}

function startJump() {
  if (!character || isFalling || isDead || isRecovering || hasFallen) return;
  params.simulationActive = true; isFalling = true;
  hasFallen = true; 
  keys.forward = keys.backward = keys.left = keys.right = false; 
  
  if(actions[actionIndex]) actions[actionIndex].stop(); 
  if(actions[1]) { actions[1].reset().play(); actionIndex = 1; }

  // ★ 수정: 수평 튕겨나가는 힘(x, z축 속도)을 6.0에서 25.0으로 4배 이상 강력하게 변경 ★
  // 건물 중심(0,0)에서 가로폭 반절인 12.5m 펜스를 한 번에 넘어가도록 밀어줍니다.
  character.body.setLinvel({ x: 25.0, y: 12.0, z: 25.0 }, true);
}

function handleImpact(impulseValue) {
  isFalling = false;
  const finalImpulse = Math.max(impulseValue, Math.abs(lastVelocity.y) * params.characterMass);

  if (finalImpulse >= params.dieThreshold) {
    isDead = true;
    uiDisplay.innerHTML = `💥 마지막 충격량: <span style="color:#ff5555;font-weight:bold;">${finalImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#ff5555;font-weight:bold;">사망 (Fall Die)</span>`;
    
    if(actions[actionIndex]) actions[actionIndex].stop();
    if(actions[3]) { actions[3].reset().play(); actionIndex = 3; }
    character.body.setLinvel({ x: 0, y: 0, z: 0 }, true); 
  } else {
    isRecovering = true;
    uiDisplay.innerHTML = `💥 마지막 충격량: <span style="color:#55ff55;font-weight:bold;">${finalImpulse.toFixed(1)} N·s</span><br>상태: <span style="color:#55ff55;font-weight:bold;">생존 (부상 복구 중...)</span>`;
    
    character.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    character.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    if(actions[actionIndex]) actions[actionIndex].stop();
    if(actions[4]) {
      actions[4].reset().play(); actionIndex = 4;
      
      const duration = actions[4].getClip().duration * 1000;
      setTimeout(() => {
        if (!isDead && character && isRecovering) {
          isRecovering = false;
          uiDisplay.innerHTML = `💥 마지막 충격량: ${finalImpulse.toFixed(1)} N·s<br>상태: 초기화 완료 (조작 불가, 리스폰 필요)`;
          if(actions[4]) actions[4].stop();
          if(actions[0]) { actions[0].reset().play(); actionIndex = 0; }
        }
      }, duration);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  
  if (params.simulationActive && physicsWorld) {
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
      let moveX = 0, moveZ = 0;
      if (keys.forward) moveZ -= 10; if (keys.backward) moveZ += 10;
      if (keys.left) moveX -= 10; if (keys.right) moveX += 10;

      if (!isFalling) {
        if (moveX !== 0 || moveZ !== 0) {
          const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
          moveX = (moveX/len)*10; moveZ = (moveZ/len)*10;
          character.body.setLinvel({ x: moveX, y: currentVel.y, z: moveZ }, true);
          
          targetRotationAngle = Math.atan2(moveX, moveZ);
          let diff = targetRotationAngle - currentRotationAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          currentRotationAngle += diff * 0.2; 
          tempQuat.setFromAxisAngle(upAxis, currentRotationAngle);
          character.body.setRotation({ x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w }, true);
          
          if (actions[2]) {
            const horizontalSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
            actions[2].timeScale = horizontalSpeed / 10.0; 
          }
          if (actionIndex !== 2 && actions[2]) {
            if(actions[actionIndex]) actions[actionIndex].fadeOut(0.15);
            actions[2].reset().fadeIn(0.15).play(); actionIndex = 2;
          }
        } else {
          character.body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
          if (actionIndex !== 0 && actions[0]) {
            if(actions[actionIndex]) actions[actionIndex].fadeOut(0.15);
            actions[0].reset().fadeIn(0.15).play(); actionIndex = 0;
          }
        }
      }
    }

    if (params.simulationActive && !isFalling && !hasFallen && pos.y < params.buildingHeight - 0.8) {
      isFalling = true;
      hasFallen = true; 
      
      keys.forward = keys.backward = keys.left = keys.right = false;
      character.body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      
      if (actions[actionIndex]) actions[actionIndex].stop(); 
      if (actions[1]) { actions[1].reset().play(); actionIndex = 1; }
    }
    
    const renderY = Math.max(pos.y, 1.2) - 1.2;
    character.mesh.position.set(pos.x, renderY, pos.z);
    character.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    
    tempVec3.set(pos.x, pos.y + 10, pos.z + 25);
    camera.position.lerp(tempVec3, 0.05);
    orbitControls.target.set(pos.x, pos.y, pos.z);
  }
  orbitControls.update();
  renderer.render(scene, camera);
}

init();
animate();