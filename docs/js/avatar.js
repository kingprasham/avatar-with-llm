// js/avatar.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createNoise2D } from 'simplex-noise';

// Put your GLB here (you said you uploaded it)
const MODEL_URL = 'assets/models/avatar.glb';

const OVR_VISEME_TO_ARKIT_MAP = {
  0: 'sil', 1: 'mouthPucker', 2: 'mouthFunnel', 3: 'tongueOut',
  4: 'jawOpen', 5: 'jawOpen', 6: 'mouthShrugUpper', 7: 'mouthShrugUpper',
  8: 'tongueOut', 9: 'mouthRollUpper', 10: 'jawOpen',
  11: 'mouthSmile', 12: 'mouthSmile', 13: 'mouthFunnel', 14: 'mouthPucker'
};

const Avatar = {
  scene: null, camera: null, renderer: null, controls: null,
  model: null, mesh: null,
  clock: new THREE.Clock(),
  noise2D: createNoise2D(),
  blendshapeMap: {},
  targetBlendshapeValues: {},
  currentBlendshapeValues: {},
  lastBlinkTime: 0, nextBlinkTime: 0, isBlinking: false,

  async init() {
    const container = document.getElementById('avatar-canvas-container');
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      50,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1, 1000
    );
    this.camera.position.set(0, 1.4, 0.6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    this.scene.add(dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.35, 0);
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 1.0;

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

          this.mesh = null;
          this.model.traverse((obj) => {
            if (obj.isMesh && obj.morphTargetInfluences && obj.morphTargetDictionary) {
              if (!this.mesh) this.mesh = obj;
            }
          });

          if (!this.mesh) {
            console.warn('No morph targets found. Visemes will be ignored.');
          } else {
            this.blendshapeMap = { ...this.mesh.morphTargetDictionary };
            Object.keys(this.blendshapeMap).forEach((key) => {
              this.targetBlendshapeValues[key]  = 0;
              this.currentBlendshapeValues[key] = 0;
            });
            console.info('Morph targets detected:', Object.keys(this.blendshapeMap));
          }

          // Auto-fit
          const box = new THREE.Box3().setFromObject(this.model);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size); box.getCenter(center);
          this.model.position.sub(center);
          const targetHeight = 1.7;
          const scale = targetHeight / (size.y || 1);
          this.model.scale.setScalar(scale);
          const box2 = new THREE.Box3().setFromObject(this.model);
          const size2 = new THREE.Vector3(); const center2 = new THREE.Vector3();
          box2.getSize(size2); box2.getCenter(center2);
          this.model.position.sub(center2);
          const dist = Math.max(size2.y, size2.x) * 1.8;
          this.camera.position.set(0, size2.y * 0.6, dist);
          this.controls.target.set(0, size2.y * 0.55, 0);
          this.controls.update();

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

  updateVisemes(input) {
    if (!this.mesh) return;
    if (input && !Array.isArray(input)) {
      for (const [name, v] of Object.entries(input)) {
        if (this.blendshapeMap[name] !== undefined) {
          this.targetBlendshapeValues[name] = THREE.MathUtils.clamp(v, 0, 1);
        }
      }
      return;
    }
    const visemeScores = input || [];
    Object.values(OVR_VISEME_TO_ARKIT_MAP).forEach((name) => {
      if (this.blendshapeMap[name] !== undefined) this.targetBlendshapeValues[name] = 0;
    });
    let maxScore = 0, idx = 0;
    visemeScores.forEach((s, i) => { if (s > maxScore) { maxScore = s; idx = i; } });
    const name = OVR_VISEME_TO_ARKIT_MAP[idx];
    if (name && this.blendshapeMap[name] !== undefined) {
      const val = (name === 'jawOpen') ? Math.min(maxScore * 1.2, 1.0) : Math.min(maxScore, 1.0);
      this.targetBlendshapeValues[name] = val;
    }
  },

  updateHeadMovement() {
    if (!this.model) return;
    const t = this.clock.elapsedTime;
    this.model.rotation.y = this.noise2D(t * 0.1, 0) * 0.05;
    this.model.rotation.x = this.noise2D(0, t * 0.12) * 0.03;
  },

  updateBlinking() {
    if (!('eyeBlinkLeft' in this.targetBlendshapeValues)) return;
    const time = this.clock.getElapsedTime();
    if (time > this.nextBlinkTime) this.isBlinking = true;
    if (this.isBlinking) {
      const blinkDuration = 0.2;
      const elapsed = time - this.lastBlinkTime;
      const blinkValue = (elapsed < blinkDuration)
        ? Math.sin((elapsed / blinkDuration) * Math.PI) : 0;
      if (blinkValue === 0) { this.isBlinking = false; this.resetBlinkTimer(); }
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
    const c = document.getElementById('avatar-canvas-container');
    this.camera.aspect = Math.max(1, c.clientWidth) / Math.max(1, c.clientHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(Math.max(1, c.clientWidth), Math.max(1, c.clientHeight));
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

window.Avatar = Avatar;
export default Avatar;
