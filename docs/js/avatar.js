// js/avatar.js (ESM, web-friendly)
// - Imports via import map (index.html must include the import map)
// - Loads a GLB avatar if present (MODEL_URL), else shows a simple placeholder head
// - Supports both viseme arrays (OVR-style 15 length) and direct blendshape objects
// - Includes gentle idle head motion + (optional) blinking when the model has blink shapes

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createNoise2D } from 'simplex-noise';

// --------------- CONFIG ---------------

// If you already have a GLB in your repo, keep this:
const MODEL_URL = 'assets/models/avatar.glb';

// If you want to see something immediately, uncomment one of these sample models:
// const MODEL_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb';
// const MODEL_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb';

// OVR -> ARKit-ish mapping (simple, serviceable defaults). Tune these for your avatar.
const OVR_VISEME_TO_ARKIT_MAP = {
  0: 'sil',            // silence -> often do nothing
  1: 'mouthPucker',    // PP
  2: 'mouthFunnel',    // FF
  3: 'tongueOut',      // TH
  4: 'jawOpen',        // DD
  5: 'jawOpen',        // kk
  6: 'mouthShrugUpper',// CH
  7: 'mouthShrugUpper',// SS
  8: 'tongueOut',      // nn
  9: 'mouthRollUpper', // RR
  10: 'jawOpen',       // aa
  11: 'mouthSmile',    // E
  12: 'mouthSmile',    // ih
  13: 'mouthFunnel',   // oh
  14: 'mouthPucker'    // ou
};

// --------------------------------------

const Avatar = {
  scene: null, camera: null, renderer: null, controls: null,
  model: null, mesh: null,
  clock: new THREE.Clock(),
  noise2D: createNoise2D(),
  blendshapeMap: {},                   // name -> morph index
  targetBlendshapeValues: {},          // name -> value [0..1]
  currentBlendshapeValues: {},         // smoothed
  lastBlinkTime: 0, nextBlinkTime: 0, isBlinking: false,

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

    // Load model or placeholder
    try {
      await this.loadModel(MODEL_URL);
    } catch (e) {
      console.warn('Avatar model failed to load, using placeholder head.', e);
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

          // Find first mesh with morph targets
          this.mesh = null;
          this.model.traverse((obj) => {
            if (obj.isMesh && obj.morphTargetInfluences && obj.morphTargetDictionary) {
              if (!this.mesh) this.mesh = obj;
            }
          });

          if (!this.mesh) {
            console.warn('No morph targets found. Visemes will be ignored.');
          } else {
            // Build name -> index map
            this.blendshapeMap = { ...this.mesh.morphTargetDictionary };

            // Initialize dictionaries
            Object.keys(this.blendshapeMap).forEach((key) => {
              this.targetBlendshapeValues[key]  = 0;
              this.currentBlendshapeValues[key] = 0;
            });

            // Log the names you actually have (helps tune mapping)
            console.info('Morph targets detected:', Object.keys(this.blendshapeMap));
            // If your RPM avatar uses ARKit names, you'll see many keys like 'jawOpen', 'mouthSmileLeft', etc.
          }

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

    this.mesh = null;
    this.blendshapeMap = {};
    this.targetBlendshapeValues = {};
    this.currentBlendshapeValues = {};
    this.resetBlinkTimer();
  },

  /**
   * Update visemes from either:
   *  - an array<number> of length ~15 (OVR order), OR
   *  - an object { blendshapeName: value, ... }
   */
  updateVisemes(input) {
    if (!this.mesh) return; // no morph targets → ignore safely

    // Object form: { 'jawOpen': 0.5, ... }
    if (input && !Array.isArray(input)) {
      for (const [name, v] of Object.entries(input)) {
        if (this.blendshapeMap[name] !== undefined) {
          this.targetBlendshapeValues[name] = THREE.MathUtils.clamp(v, 0, 1);
        }
      }
      return;
    }

    // Array form: map the strongest OVR viseme to a single ARKit-ish target
    const visemeScores = input || [];
    Object.values(OVR_VISEME_TO_ARKIT_MAP).forEach((name) => {
      if (this.blendshapeMap[name] !== undefined) this.targetBlendshapeValues[name] = 0;
    });

    let maxScore = 0, idx = 0;
    visemeScores.forEach((score, i) => { if (score > maxScore) { maxScore = score; idx = i; } });

    const name = OVR_VISEME_TO_ARKIT_MAP[idx];
    if (name && this.blendshapeMap[name] !== undefined) {
      const val = (name === 'jawOpen') ? Math.min(maxScore * 1.2, 1.0) : Math.min(maxScore, 1.0);
      this.targetBlendshapeValues[name] = val;
    }
  },

  // Convenience for amplitude fallback: set jawOpen directly
  updateJawFromAmplitude(level01) {
    if (!this.mesh) return;
    const v = THREE.MathUtils.clamp(level01, 0, 1);
    if (this.blendshapeMap.jawOpen !== undefined) {
      this.targetBlendshapeValues.jawOpen = v;
    }
  },

  updateHeadMovement() {
    if (!this.model) return;
    const t = this.clock.elapsedTime;
    this.model.rotation.y = this.noise2D(t * 0.1, 0) * 0.05;
    this.model.rotation.x = this.noise2D(0, t * 0.12) * 0.03;
  },

  updateBlinking() {
    // Only if blink shapes exist
    if (!('eyeBlinkLeft' in this.targetBlendshapeValues)) return;

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
    const attack = 0.35, release = 0.5;

    for (const key in this.targetBlendshapeValues) {
      const target  = this.targetBlendshapeValues[key] ?? 0;
      const current = this.currentBlendshapeValues[key] ?? 0;
      const coeff   = (target > current) ? attack : release;
      const next    = current + (target - current) * coeff;

      this.currentBlendshapeValues[key] = next;
      const idx = this.blendshapeMap[key];
      if (idx !== undefined) this.mesh.morphTargetInfluences[idx] = next;
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

// Also expose globally for any legacy code
window.Avatar = Avatar;
export default Avatar;
