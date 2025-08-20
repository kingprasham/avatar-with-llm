// js/avatar.js (ESM)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import SimplexNoise from 'simplex-noise';

const MODEL_URL = 'assets/models/avatar.glb'; 
// If you don't have a file, set this to a known URL temporarily, e.g.:
// const MODEL_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb';

const Avatar = {
  scene: null, camera: null, renderer: null, controls: null, model: null, mesh: null,
  clock: new THREE.Clock(), noise: new SimplexNoise(), blendshapeMap: {},
  targetBlendshapeValues: {}, currentBlendshapeValues: {}, lastBlinkTime: 0,
  nextBlinkTime: 0, isBlinking: false,

  // Placeholder mapping; real visemes depend on your model
  OVR_VISEME_TO_ARKIT_MAP: {
    0: 'sil', 1: 'mouthPucker', 2: 'mouthFunnel', 3: 'tongueOut',
    4: 'jawOpen', 5: 'jawOpen', 6: 'mouthShrugUpper', 7: 'mouthShrugUpper',
    8: 'tongueOut', 9: 'mouthRollUpper', 10: 'jawOpen',
    11: 'mouthSmile', 12: 'mouthSmile', 13: 'mouthFunnel', 14: 'mouthPucker'
  },

  async init() {
    const container = document.getElementById('avatar-canvas-container');

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      1000
    );
    this.camera.position.set(0, 1.4, 0.6);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight)
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    this.scene.add(dirLight);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.35, 0);
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 1.0;

    // Try to load a model; if missing, create a placeholder head
    try {
      await this.loadModel(MODEL_URL);
    } catch (e) {
      console.warn('Avatar model missing or failed to load. Using placeholder head.', e);
      this.addPlaceholderHead();
    }

    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    this.animate();
  },

  loadModel(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          this.model = gltf.scene;
          this.scene.add(this.model);

          this.model.traverse((obj) => {
            if (obj.isMesh && obj.morphTargetInfluences) {
              this.mesh = obj;
              Object.keys(obj.morphTargetDictionary).forEach((key) => {
                this.blendshapeMap[key] = obj.morphTargetDictionary[key];
              });
            }
          });

          if (!this.mesh) {
            console.warn('No morph targets found on the loaded model. Visemes will be ignored.');
          }

          // Initialize morph dictionaries
          Object.keys(this.blendshapeMap).forEach((key) => {
            this.targetBlendshapeValues[key]  = 0;
            this.currentBlendshapeValues[key] = 0;
          });

          this.resetBlinkTimer();
          resolve();
        },
        undefined,
        (err) => reject(err)
      );
    });
  },

  addPlaceholderHead() {
    const group = new THREE.Group();

    const headGeo = new THREE.SphereGeometry(0.18, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd0d4e6, roughness: 0.6, metalness: 0.05 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.35, 0);
    group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.02, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.05, 1.38, 0.155);
    rightEye.position.set(0.05, 1.38, 0.155);
    group.add(leftEye, rightEye);

    const mouthGeo = new THREE.BoxGeometry(0.09, 0.008, 0.02);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 1.30, 0.17);
    group.add(mouth);

    this.model = group;
    this.scene.add(group);

    // No morph targets in placeholder
    this.mesh = null;
    this.blendshapeMap = {};
    this.targetBlendshapeValues = {};
    this.currentBlendshapeValues = {};
    this.resetBlinkTimer();
  },

  updateVisemes(visemeScores) {
    if (!this.mesh) return; // model has no morphs → ignore safely

    // Zero out mapped targets first
    Object.values(this.OVR_VISEME_TO_ARKIT_MAP).forEach((name) => {
      if (this.blendshapeMap[name] !== undefined) this.targetBlendshapeValues[name] = 0;
    });

    // Pick dominant viseme (simple)
    let maxScore = 0, dominantViseme = 0;
    visemeScores.forEach((score, i) => {
      if (score > maxScore) { maxScore = score; dominantViseme = i; }
    });

    const blendshapeName = this.OVR_VISEME_TO_ARKIT_MAP[dominantViseme];
    if (blendshapeName && this.blendshapeMap[blendshapeName] !== undefined) {
      const v = (blendshapeName === 'jawOpen') ? Math.min(maxScore * 1.2, 1.0) : Math.min(maxScore, 1.0);
      this.targetBlendshapeValues[blendshapeName] = v;
    }
  },

  updateHeadMovement() {
    if (!this.model) return;
    const t = this.clock.elapsedTime;
    this.model.rotation.y = this.noise.noise2D(t * 0.1, 0) * 0.05;
    this.model.rotation.x = this.noise.noise2D(0, t * 0.12) * 0.03;
  },

  updateBlinking() {
    if (!('eyeBlinkLeft' in this.targetBlendshapeValues)) return; // no morphs → skip

    const time = this.clock.getElapsedTime();
    if (time > this.nextBlinkTime) this.isBlinking = true;

    if (this.isBlinking) {
      const blinkDuration = 0.2;
      const elapsed = time - this.lastBlinkTime;
      const blinkValue = (elapsed < blinkDuration)
        ? Math.sin((elapsed / blinkDuration) * Math.PI)
        : 0;

      if (blinkValue === 0) {
        this.isBlinking = false;
        this.resetBlinkTimer();
      }
      this.targetBlendshapeValues.eyeBlinkLeft  = blinkValue;
      this.targetBlendshapeValues.eyeBlinkRight = blinkValue;
    }
  },

  resetBlinkTimer() {
    this.lastBlinkTime = this.clock.getElapsedTime();
    this.nextBlinkTime = this.lastBlinkTime + 3 + Math.random() * 2;
    if ('eyeBlinkLeft' in this.targetBlendshapeValues) {
      this.targetBlendshapeValues.eyeBlinkLeft  = 0;
      this.targetBlendshapeValues.eyeBlinkRight = 0;
    }
  },

  applySmoothing() {
    if (!this.mesh) return;
    const attack = 0.3, release = 0.5;

    for (const key in this.targetBlendshapeValues) {
      const target  = this.targetBlendshapeValues[key] ?? 0;
      const current = this.currentBlendshapeValues[key] ?? 0;

      this.currentBlendshapeValues[key] = current + (target - current) * ((target > current) ? attack : release);
      const idx = this.blendshapeMap[key];
      if (idx !== undefined) this.mesh.morphTargetInfluences[idx] = this.currentBlendshapeValues[key];
    }
  },

  onWindowResize() {
    const container = document.getElementById('avatar-canvas-container');
    this.camera.aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight)
    );
  },

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.updateHeadMovement();
    this.updateBlinking();
    this.applySmoothing();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
};

// Make available both ways (module + global) for any legacy code
window.Avatar = Avatar;
export default Avatar;
