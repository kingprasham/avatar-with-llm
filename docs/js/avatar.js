const Avatar = {
    scene: null, camera: null, renderer: null, controls: null, model: null, mixer: null,
    clock: new THREE.Clock(), noise: new SimplexNoise(), blendshapeMap: {},
    targetBlendshapeValues: {}, currentBlendshapeValues: {}, lastBlinkTime: 0,
    nextBlinkTime: 0, isBlinking: false,

    OVR_VISME_TO_ARKIT_MAP: { 0: 'sil', 1: 'mouthPucker', 2: 'mouthFunnel', 3: 'tongueOut', 4: 'jawOpen', 5: 'jawOpen', 6: 'mouthShrugUpper', 7: 'mouthShrugUpper', 8: 'tongueOut', 9: 'mouthRollUpper', 10: 'jawOpen', 11: 'mouthSmile', 12: 'mouthSmile', 13: 'mouthFunnel', 14: 'mouthPucker' },

    async init() {
        const container = document.getElementById('avatar-canvas-container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 1.4, 0.6);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 1, 1);
        this.scene.add(dirLight);
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.35, 0);
        this.controls.enablePan = false; this.controls.enableZoom = true;
        this.controls.minDistance = 0.4; this.controls.maxDistance = 1.0;
        await this.loadModel('assets/models/avatar.glb');
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        this.animate();
    },

    loadModel(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            loader.load(url, (gltf) => {
                this.model = gltf.scene; this.scene.add(this.model);
                this.model.traverse(obj => {
                    if (obj.isMesh && obj.morphTargetInfluences) {
                        this.mesh = obj;
                        Object.keys(obj.morphTargetDictionary).forEach(key => this.blendshapeMap[key] = obj.morphTargetDictionary[key]);
                    }
                });
                if (!this.mesh) return reject(new Error("No mesh with morph targets found in model."));
                Object.keys(this.blendshapeMap).forEach(key => { this.targetBlendshapeValues[key] = 0; this.currentBlendshapeValues[key] = 0; });
                this.resetBlinkTimer(); resolve();
            }, undefined, (error) => reject(error));
        });
    },
    updateVisemes(visemeScores) {
        Object.values(this.OVR_VISME_TO_ARKIT_MAP).forEach(name => { if (this.blendshapeMap[name] !== undefined) this.targetBlendshapeValues[name] = 0; });
        let maxScore = 0, dominantViseme = 0;
        visemeScores.forEach((score, i) => { if (score > maxScore) { maxScore = score; dominantViseme = i; } });
        const blendshapeName = this.OVR_VISME_TO_ARKIT_MAP[dominantViseme];
        if (blendshapeName && this.blendshapeMap[blendshapeName] !== undefined) {
            this.targetBlendshapeValues[blendshapeName] = Math.min((blendshapeName === 'jawOpen') ? maxScore * 1.2 : maxScore, 1.0);
        }
    },
    updateHeadMovement() {
        if (!this.model) return;
        const time = this.clock.elapsedTime;
        this.model.rotation.y = this.noise.noise2D(time * 0.1, 0) * 0.05;
        this.model.rotation.x = this.noise.noise2D(0, time * 0.12) * 0.03;
    },
    updateBlinking() {
        const time = this.clock.getElapsedTime();
        if (time > this.nextBlinkTime) this.isBlinking = true;
        if (this.isBlinking) {
            const blinkDuration = 0.2, elapsed = time - this.lastBlinkTime;
            let blinkValue = (elapsed < blinkDuration) ? Math.sin((elapsed / blinkDuration) * Math.PI) : 0;
            if (blinkValue === 0) { this.isBlinking = false; this.resetBlinkTimer(); }
            this.targetBlendshapeValues.eyeBlinkLeft = blinkValue; this.targetBlendshapeValues.eyeBlinkRight = blinkValue;
        }
    },
    resetBlinkTimer() {
        this.lastBlinkTime = this.clock.getElapsedTime();
        this.nextBlinkTime = this.lastBlinkTime + 3 + Math.random() * 2;
        this.targetBlendshapeValues.eyeBlinkLeft = 0; this.targetBlendshapeValues.eyeBlinkRight = 0;
    },
    applySmoothing() {
        if (!this.mesh) return;
        const attack = 0.3, release = 0.5;
        for (const key in this.targetBlendshapeValues) {
            const target = this.targetBlendshapeValues[key], current = this.currentBlendshapeValues[key];
            this.currentBlendshapeValues[key] += (target - current) * ((target > current) ? attack : release);
            const idx = this.blendshapeMap[key];
            if (idx !== undefined) this.mesh.morphTargetInfluences[idx] = this.currentBlendshapeValues[key];
        }
    },
    onWindowResize() {
        const container = document.getElementById('avatar-canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    },
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.updateHeadMovement(); this.updateBlinking(); this.applySmoothing();
        this.controls.update(); this.renderer.render(this.scene, this.camera);
    }
};