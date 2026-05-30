import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'; // 누락된 OBJLoader 임포트 추가

/**
 * Initialize the statistics domelement
 *
 * @param {Number} type 0: fps, 1: ms, 2: mb, 3+: custom
 * @returns stats javascript object
 */
export function initStats(type) {
  const panelType =
    typeof type !== 'undefined' && type && !isNaN(type) ? parseInt(type) : 0;
  const stats = new Stats();

  stats.showPanel(panelType); // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);

  return stats;
}

/**
 * Initialize a simple default renderer and binds it to the body element.
 *
 * @param additionalProperties Additional properties to pass into the renderer
 */
export function initRenderer(additionalProperties) {
  const props =
    typeof additionalProperties !== 'undefined' && additionalProperties
      ? additionalProperties
      : {};
  const renderer = new THREE.WebGLRenderer(props);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setClearColor(new THREE.Color(0x000000));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  return renderer;
}

/**
 * Initialize a simple default canvas renderer.
 * (CanvasRenderer가 삭제되었으므로 일반 WebGLRenderer로 하위 호환 대체)
 */
export function initCanvasRenderer() {
  console.warn("THREE.CanvasRenderer는 지원되지 않으므로 WebGLRenderer로 대체합니다.");
  return initRenderer();
}

/**
 * Initialize a simple camera and point it at the center of a scene
 *
 * @param {THREE.Vector3} [initialPosition]
 */
export function initCamera(initialPosition) {
  const position =
    initialPosition !== undefined
      ? initialPosition
      : new THREE.Vector3(-30, 40, 30);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100000,
  );
  camera.position.copy(position);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  return camera;
}

export function initDefaultLighting(scene, initialPosition) {
  const position =
    initialPosition !== undefined
      ? initialPosition
      : new THREE.Vector3(-10, 30, 40);

  const spotLight = new THREE.SpotLight(0xffffff, 5000);
  spotLight.position.copy(position);
  spotLight.shadow.mapSize.width = 2048;
  spotLight.shadow.mapSize.height = 2048;
  spotLight.castShadow = true;
  spotLight.decay = 2;
  spotLight.penumbra = 0.05;
  spotLight.name = 'spotLight';

  scene.add(spotLight);

  const ambientLight = new THREE.AmbientLight(0x353535);
  ambientLight.name = 'ambientLight';
  scene.add(ambientLight);
}

export function initDefaultDirectionalLighting(scene, initialPosition) {
  const position =
    initialPosition !== undefined
      ? initialPosition
      : new THREE.Vector3(100, 200, 200);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.copy(position);
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.castShadow = true;

  dirLight.shadow.camera.left = -200;
  dirLight.shadow.camera.right = 200;
  dirLight.shadow.camera.top = 200;
  dirLight.shadow.camera.bottom = -200;

  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0x343434);
  ambientLight.name = 'ambientLight';
  scene.add(ambientLight);
}

/**
 * Initialize orbit controls to control the scene
 *
 * @param {THREE.Camera} camera
 * @param {THREE.Renderer} renderer
 */
export function initOrbitControls(camera, renderer) {
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true; // staticMoving 대신 최신 규격인 Damping 활성화
  orbitControls.dampingFactor = 0.05;
  
  return orbitControls;
}

/**
 * Apply a simple standard material to the passed in geometry and return the mesh
 */
export const applyMeshStandardMaterial = function (geometry, material) {
  let targetMaterial = material;
  if (!targetMaterial || targetMaterial.type !== 'MeshStandardMaterial') {
    targetMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    targetMaterial.side = THREE.DoubleSide;
  }

  return new THREE.Mesh(geometry, targetMaterial);
};

/**
 * Apply meshnormal material to the geometry
 */
export const applyMeshNormalMaterial = function (geometry, material) {
  let targetMaterial = material;
  if (!targetMaterial || targetMaterial.type !== 'MeshNormalMaterial') {
    targetMaterial = new THREE.MeshNormalMaterial();
    targetMaterial.side = THREE.DoubleSide;
  }

  return new THREE.Mesh(geometry, targetMaterial);
};

/**
 * Add a simple cube and sphere to the provided scene
 *
 * @param {THREE.Scene} scene
 */
export function addDefaultCubeAndSphere(scene) {
  const cubeGeometry = new THREE.BoxGeometry(4, 4, 4);
  const cubeMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.castShadow = true;

  cube.position.x = -4;
  cube.position.y = 3;
  cube.position.z = 0;
  scene.add(cube);

  const sphereGeometry = new THREE.SphereGeometry(4, 20, 20);
  const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0x7777ff });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

  sphere.position.x = 20;
  sphere.position.y = 0;
  sphere.position.z = 2;
  sphere.castShadow = true;
  scene.add(sphere);

  return { cube, sphere };
}

/**
 * Add a simple ground plane to the provided scene
 */
export function addGroundPlane(scene) {
  const planeGeometry = new THREE.PlaneGeometry(60, 20, 120, 120);
  const planeMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.receiveShadow = true;

  plane.rotation.x = -0.5 * Math.PI;
  plane.position.x = 15;
  plane.position.y = 0;
  plane.position.z = 0;

  scene.add(plane);
  return plane;
}

/**
 * Add a large ground plane to the provided scene
 */
export function addLargeGroundPlane(scene, useTexture) {
  const withTexture = useTexture !== undefined ? useTexture : false;

  const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
  const planeMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
  
  if (withTexture) {
    const textureLoader = new THREE.TextureLoader();
    planeMaterial.map = textureLoader.load('./assets/textures/floor-wood.jpg');
    planeMaterial.map.wrapS = THREE.RepeatWrapping;
    planeMaterial.map.wrapT = THREE.RepeatWrapping;
    planeMaterial.map.repeat.set(80, 80);
  }
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.receiveShadow = true;

  plane.rotation.x = -0.5 * Math.PI;
  plane.position.set(0, 0, 0);

  scene.add(plane);
  return plane;
}

export function addHouseAndTree(scene) {
  createBoundingWall(scene);
  createGroundPlane(scene);
  createHouse(scene);
  createTree(scene);

  function createBoundingWall(scene) {
    const wallLeft = new THREE.BoxGeometry(70, 2, 2);
    const wallRight = new THREE.BoxGeometry(70, 2, 2);
    const wallTop = new THREE.BoxGeometry(2, 2, 50);
    const wallBottom = new THREE.BoxGeometry(2, 2, 50);

    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0xa0522d });

    const wallLeftMesh = new THREE.Mesh(wallLeft, wallMaterial);
    const wallRightMesh = new THREE.Mesh(wallRight, wallMaterial);
    const wallTopMesh = new THREE.Mesh(wallTop, wallMaterial);
    const wallBottomMesh = new THREE.Mesh(wallBottom, wallMaterial);

    wallLeftMesh.position.set(15, 1, -25);
    wallRightMesh.position.set(15, 1, 25);
    wallTopMesh.position.set(-19, 1, 0);
    wallBottomMesh.position.set(49, 1, 0);

    scene.add(wallLeftMesh, wallRightMesh, wallBottomMesh, wallTopMesh);
  }

  function createGroundPlane(scene) {
    const planeGeometry = new THREE.PlaneGeometry(70, 50);
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x9acd32 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.receiveShadow = true;

    plane.rotation.x = -0.5 * Math.PI;
    plane.position.set(15, 0, 0);
    scene.add(plane);
  }

  function createHouse(scene) {
    const roof = new THREE.ConeGeometry(5, 4);
    const base = new THREE.CylinderGeometry(5, 5, 6);

    const roofMesh = new THREE.Mesh(roof, new THREE.MeshPhongMaterial({ color: 0x8b7213 }));
    const baseMesh = new THREE.Mesh(base, new THREE.MeshPhongMaterial({ color: 0xffe4c4 }));

    roofMesh.position.set(25, 8, 0);
    baseMesh.position.set(25, 3, 0);

    roofMesh.receiveShadow = roofMesh.castShadow = true;
    baseMesh.receiveShadow = baseMesh.castShadow = true;

    scene.add(roofMesh, baseMesh);
  }

  function createTree(scene) {
    const trunk = new THREE.BoxGeometry(1, 8, 1);
    const leaves = new THREE.SphereGeometry(4);

    const trunkMesh = new THREE.Mesh(trunk, new THREE.MeshPhongMaterial({ color: 0x8b4513 }));
    const leavesMesh = new THREE.Mesh(leaves, new THREE.MeshPhongMaterial({ color: 0x00ff00 }));

    trunkMesh.position.set(-10, 4, 0);
    leavesMesh.position.set(-10, 12, 0);

    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    leavesMesh.castShadow = leavesMesh.receiveShadow = true;

    scene.add(trunkMesh, leavesMesh);
  }
}

// 2D Canvas를 활용한 유령 텍스처 생성 함수
export function createGhostTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;

  const ctx = canvas.getContext('2d');
  ctx.translate(-81, -84);

  ctx.fillStyle = 'orange';
  ctx.beginPath();
  ctx.moveTo(83, 116);
  ctx.lineTo(83, 102);
  ctx.bezierCurveTo(83, 94, 89, 88, 97, 88);
  ctx.bezierCurveTo(105, 88, 111, 94, 111, 102);
  ctx.lineTo(111, 116);
  ctx.lineTo(106.333, 111.333);
  ctx.lineTo(101.666, 116);
  ctx.lineTo(97, 111.333);
  ctx.lineTo(92.333, 116);
  ctx.lineTo(87.666, 111.333);
  ctx.lineTo(83, 116);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(91, 96);
  ctx.bezierCurveTo(88, 96, 87, 99, 87, 101);
  ctx.bezierCurveTo(87, 103, 88, 106, 91, 106);
  ctx.bezierCurveTo(94, 106, 95, 103, 95, 101);
  ctx.bezierCurveTo(95, 99, 94, 96, 91, 96);
  ctx.moveTo(103, 96);
  ctx.bezierCurveTo(100, 96, 99, 99, 99, 101);
  ctx.bezierCurveTo(99, 103, 100, 106, 103, 106);
  ctx.bezierCurveTo(106, 106, 107, 103, 107, 101);
  ctx.bezierCurveTo(107, 99, 106, 96, 103, 96);
  ctx.fill();

  ctx.fillStyle = 'blue';
  ctx.beginPath();
  ctx.arc(101, 102, 2, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(89, 102, 2, 0, Math.PI * 2, true);
  ctx.fill();

  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function addBasicMaterialSettings(gui, controls, material, name) {
  const folderName = name !== undefined ? name : 'THREE.Material';
  controls.material = material;

  const folder = gui.addFolder(folderName);
  folder.add(controls.material, 'id');
  folder.add(controls.material, 'uuid');
  folder.add(controls.material, 'name');
  folder.add(controls.material, 'opacity', 0, 1, 0.01);
  folder.add(controls.material, 'transparent');
  folder.add(controls.material, 'visible');
  folder
    .add(controls.material, 'side', { FrontSide: 0, BackSide: 1, BothSides: 2 })
    .onChange(function (side) {
      controls.material.side = parseInt(side);
    });

  folder.add(controls.material, 'colorWrite');
  folder.add(controls.material, 'wireframe');
  folder.add(controls.material, 'fog');

  return folder;
}

export function addSpecificMaterialSettings(gui, controls, material, name) {
  controls.material = material;

  const folderName = name !== undefined ? name : 'THREE.' + material.type;
  const folder = gui.addFolder(folderName);
  
  switch (material.type) {
    case 'MeshNormalMaterial':
      folder.add(controls.material, 'wireframe');
      return folder;

    case 'MeshPhongMaterial':
      controls.specular = material.specular.getStyle();
      folder.addColor(controls, 'specular').onChange(function (e) {
        material.specular.setStyle(e);
      });
      folder.add(material, 'shininess', 0, 100, 0.01);
      return folder;

    case 'MeshStandardMaterial':
      controls.color = material.color.getStyle();
      folder.addColor(controls, 'color').onChange(function (e) {
        material.color.setStyle(e);
      });
      controls.emissive = material.emissive.getStyle();
      folder.addColor(controls, 'emissive').onChange(function (e) {
        material.emissive.setStyle(e);
      });
      folder.add(material, 'metalness', 0, 1, 0.01);
      folder.add(material, 'roughness', 0, 1, 0.01);
      folder.add(material, 'wireframe');
      return folder;
  }
}

export function redrawGeometryAndUpdateUI(gui, scene, controls, geomFunction) {
  guiRemoveFolder(gui, controls.specificMaterialFolder);
  guiRemoveFolder(gui, controls.currentMaterialFolder);
  if (controls.mesh) scene.remove(controls.mesh);
  
  const changeMat = eval('(' + controls.appliedMaterial + ')');
  if (controls.mesh) {
    controls.mesh = changeMat(geomFunction(), controls.mesh.material);
  } else {
    controls.mesh = changeMat(geomFunction());
  }

  controls.mesh.castShadow = controls.castShadow;
  scene.add(controls.mesh);
  
  controls.currentMaterialFolder = addBasicMaterialSettings(gui, controls, controls.mesh.material);
  controls.specificMaterialFolder = addSpecificMaterialSettings(gui, controls, controls.mesh.material);
}

/**
 * lil-gui 문법에 맞춰 폴더 제거 API 최적화 수정
 */
function guiRemoveFolder(gui, folder) {
  if (folder) {
    folder.destroy(); // lil-gui의 표준 폴더 제거 메서드 사용
  }
}

export function addMeshSelection(gui, controls, material, scene) {
  const sphereGeometry = new THREE.SphereGeometry(10, 20, 20);
  const cubeGeometry = new THREE.BoxGeometry(16, 16, 15);
  const planeGeometry = new THREE.PlaneGeometry(14, 14, 4, 4);

  const sphere = new THREE.Mesh(sphereGeometry, material);
  const cube = new THREE.Mesh(cubeGeometry, material);
  const plane = new THREE.Mesh(planeGeometry, material);

  sphere.position.set(0, 11, 2);
  cube.position.y = 8;

  controls.selectedMesh = 'cube';
  loadGopher(material).then(function (gopher) {
    gopher.scale.set(5, 5, 5);
    gopher.position.set(-10, 0, 0);

    gui
      .add(controls, 'selectedMesh', ['cube', 'sphere', 'plane', 'gopher'])
      .onChange(function (e) {
        scene.remove(controls.selected);

        switch (e) {
          case 'cube':
            scene.add(cube);
            controls.selected = cube;
            break;
          case 'sphere':
            scene.add(sphere);
            controls.selected = sphere;
            break;
          case 'plane':
            scene.add(plane);
            controls.selected = plane;
            break;
          case 'gopher':
            scene.add(gopher);
            controls.selected = gopher;
            break;
        }
      });
  });

  controls.selected = cube;
  scene.add(controls.selected);
}

export function loadGopher(material) {
  const loader = new OBJLoader();
  return new Promise(function (resolve) {
    loader.load('../../assets/models/gopher/gopher.obj', function (loadedMesh) {
      let mesh = loadedMesh; // const에서 let으로 재할당 버그 수정
      if (material) {
        computeNormalsGroup(mesh);
        setMaterialGroup(material, mesh);
      }
      resolve(mesh);
    });
  });
}

export function setMaterialGroup(material, group) {
  if (group instanceof THREE.Mesh) {
    group.material = material;
  } else if (group.children) {
    group.children.forEach(function (child) {
      setMaterialGroup(material, child);
    });
  }
}

/**
 * THREE.Geometry 완전 제거에 따른 최신 BufferGeometry 법선 맵 연동 수정
 */
export function computeNormalsGroup(group) {
  if (group instanceof THREE.Mesh) {
    // 최신 Three.js는 BufferGeometry만 지원하므로 내장 연산 사용
    group.geometry.computeVertexNormals(); 
  } else if (group.children) {
    group.children.forEach(function (child) {
      computeNormalsGroup(child);
    });
  }
}

export function addGeometry(scene, geom, texture) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.2,
    roughness: 0.07,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;

  scene.add(mesh);
  return mesh;
}

export function addGeometryWithMaterial(scene, geom, name, gui, controls, material) {
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;

  scene.add(mesh);
  return mesh;
}