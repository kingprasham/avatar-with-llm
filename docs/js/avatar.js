const Avatar = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    model: null,
    mixer: null,
    clock: new THREE.Clock(),
    noise: new SimplexNoise(),
    blendshapeMap: {},
    targetBlendshapeValues: {},
    currentBlendshapeValues: {},
    lastBlinkTime: 0,
    nextBlinkTime: 0,
    isBlinking: false,

    // Maps OVR visemes to ARKit blendshape names.
    // This is the core of the viseme animation.
    OVR_VISME_TO_ARKIT_MAP: {
        0: 'sil',    // Silence -> neutral
        1: 'PP',     // PP -> mouthPucker
        2: 'FF',     // FF -> mouthFunnel
        3: 'TH',     // TH -> tongueOut
        4: 'DD',     // DD -> viseme_DD
        5: 'kk',     // kk -> viseme_kk
        6: 'CH',     // CH -> viseme_CH
        7: 'SS',     // SS -> viseme_SS
        8: 'nn',     // nn -> viseme_nn
        9: 'RR',     // RR -> viseme_RR
        10: 'aa',    // aa -> jawOpen
        11: 'E',     // E  -> mouthShrugUpper
        12: 'ih',    // ih -> mouthSmile
        13: 'oh',    // oh -> mouthFunnel
        14: 'ou'     // ou -> mouthPucker
    },
    
    // Additional ARKit shapes we control.
    ARKIT_EXTRAS: {
        'jawOpen': 'jawOpen',
        'mouthClose': 'mouthClose',
        'mouthPucker': 'mouthPucker',
        'tongueOut': 'tongueOut',
        'mouthSmile': 'mouthSmile',
        'mouthFunnel': 'mouthFunnel',
        'mouthShrugUpper': 'mouthShrugUpper',
        'eyeBlinkLeft': 'eyeBlinkLeft',
        'eyeBlinkRight': 'eyeBlinkRight'
    },


    async init() {
        // --- Basic Scene Setup ---
        const container = document.getElementById('avatar-canvas-container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 1.4, 0.6); // Positioned for a headshot
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        // --- Controls ---
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.35, 0); // Focus on the head
        this.controls.enablePan = false;
        this.controls.enableZoom = true;
        this.controls.minDistance = 0.4;
        this.controls.maxDistance = 1.0;
        this.controls.update();
        
        // --- Load Model ---
        await this.loadModel('assets/models/avatar.glb');

        // --- Resize Listener ---
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        
        // --- Start Animation Loop ---
        this.animate();
    },

    loadModel(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            loader.load(url, (gltf) => {
                this.model = gltf.scene;
                this.scene.add(this.model);
                this.model.traverse(obj => {
                    if (obj.isMesh && obj.morphTargetInfluences) {
                        this.mesh = obj;
                        // Map blendshape names to their index for quick access
                        Object.keys(obj.morphTargetDictionary).forEach(key => {
                            this.blendshapeMap[key] = obj.morphTargetDictionary[key];
                        });
                    }
                });
                
                if (!this.mesh) {
                    return reject(new Error("No mesh with morph targets found in the model."));
                }
                
                // Initialize blendshape value trackers
                Object.keys(this.blendshapeMap).forEach(key => {
                    this.targetBlendshapeValues[key] = 0;
                    this.currentBlendshapeValues[key] = 0;
                });
                
                this.resetBlinkTimer();
                resolve();
            }, undefined, (error) => {
                console.error('Error loading model:', error);
                reject(error);
            });
        });
    },
    
    updateVisemes(visemeScores) {
        // Reset all mouth-related targets
        Object.values(this.OVR_VISME_TO_ARKIT_MAP).forEach(name => {
            if (this.blendshapeMap[name] !== undefined) {
                this.targetBlendshapeValues[name] = 0;
            }
        });

        // OVR gives an array of 15 scores. Find the most prominent one.
        let maxScore = 0;
        let dominantViseme = 0;
        visemeScores.forEach((score, i) => {
            if (score > maxScore) {
                maxScore = score;
                dominantViseme = i;
            }
        });
        
        // Apply the score to the corresponding ARKit blendshape
        const blendshapeName = this.OVR_VISME_TO_ARKIT_MAP[dominantViseme];
        if (blendshapeName && this.blendshapeMap[blendshapeName] !== undefined) {
             // We give jawOpen more influence to make speech more expressive
            const influence = (blendshapeName === 'jawOpen') ? maxScore * 1.2 : maxScore;
            this.targetBlendshapeValues[blendshapeName] = Math.min(influence, 1.0);
        }
    },

    updateHeadMovement(deltaTime) {
        if (!this.model) return;
        const time = this.clock.elapsedTime;
        // Subtle, slow head movement using Perlin noise
        this.model.rotation.y = this.noise.noise2D(time * 0.1, 0) * 0.05;
        this.model.rotation.x = this.noise.noise2D(0, time * 0.12) * 0.03;
    },

    updateBlinking(deltaTime) {
        const time = this.clock.getElapsedTime();
        if (time > this.nextBlinkTime) {
            this.isBlinking = true;
        }

        if (this.isBlinking) {
            // Simple blink animation: quickly close and open
            const blinkDuration = 0.2; // in seconds
            const elapsed = time - this.lastBlinkTime;
            let blinkValue = 0;
            if (elapsed < blinkDuration) {
                blinkValue = Math.sin((elapsed / blinkDuration) * Math.PI);
            } else {
                this.isBlinking = false;
                this.resetBlinkTimer();
            }
            this.targetBlendshapeValues.eyeBlinkLeft = blinkValue;
            this.targetBlendshapeValues.eyeBlinkRight = blinkValue;
        }
    },
    
    resetBlinkTimer() {
        this.lastBlinkTime = this.clock.getElapsedTime();
        this.nextBlinkTime = this.lastBlinkTime + 3 + Math.random() * 2; // Blink every 3-5 seconds
        this.targetBlendshapeValues.eyeBlinkLeft = 0;
        this.targetBlendshapeValues.eyeBlinkRight = 0;
    },

    applySmoothing(deltaTime) {
        if (!this.mesh) return;
        
        // Smoothing factor (lerp)
        const attack = 0.3; // How fast to open mouth
        const release = 0.5; // How fast to close mouth
        
        for (const key in this.targetBlendshapeValues) {
            const target = this.targetBlendshapeValues[key];
            const current = this.currentBlendshapeValues[key];
            const smoothing = (target > current) ? attack : release;
            
            // Linear interpolation for smooth transitions
            this.currentBlendshapeValues[key] += (target - current) * smoothing;
            
            const blendshapeIndex = this.blendshapeMap[key];
            if (blendshapeIndex !== undefined) {
                this.mesh.morphTargetInfluences[blendshapeIndex] = this.currentBlendshapeValues[key];
            }
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
        const deltaTime = this.clock.getDelta();
        
        this.updateHeadMovement(deltaTime);
        this.updateBlinking(deltaTime);
        this.applySmoothing(deltaTime);
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
};