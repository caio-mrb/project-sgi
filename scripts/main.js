import * as THREE from "three";

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Scene state management
const SceneState = {
    scene: null,
    renderer: null,
    camera: null,
    controls: null,
    // Model components
    support: null,
    cylindricalBulb: null,
    sphericalBulb: null,
    blenderScene: null,
    //Lighting components
    sky: null,
    sun: null,
    pointLight: null,
    spotLight: null,
    ambientLight: null,
    hemisphereLight: null,
    //Loading state
    loadingComplete: false,
    isLoading: true,
};

const AnimationState = {
    isPlaying: false,
    currentFrame: 0,
    targetFrame: 0,
    direction: 0, // -1 for reverse, 1 for forward, 0 for stopped
    animations: [],
    mixer: null,
    speed: 1.5,
    onFrameCallback: null,
    clock: new THREE.Clock()
};

// Configuration constants
const CONFIG = {
    DEFAULT_LIGHT_COLOR: new THREE.Color("lightblue"),
    CAMERA: {
        FOV: 50,
        NEAR: 1,
        FAR: 1000,
        INITIAL_POSITION: new THREE.Vector3(-8, 0, 15),
        LOOK_AT: new THREE.Vector3(0, 0, 0)
    },
    LIGHTING: {
        POINT_LIGHT: {
            INTENSITY: 10,
            DISTANCE: 1.25
        },
        SPOT_LIGHT: {
            INTENSITY: 40,
            DISTANCE: 13
        },
        HEMISPHERE: {
            SKY_COLOR: 0xffffff,
            GROUND_COLOR: 0x444444,
            INTENSITY: 0.5
        },
        AMBIENT: {
            COLOR: 0xffffff,
            INTENSITY: 0.2
        }
    },
    SKY: {
        TURBIDITY: 10,
        RAYLEIGH: 2,
        MIECOEFFICIENT: 0.005,
        MIEDIRECTIONALG: 0.8,
        ELEVATION: 90,
        AZIMUTH: 90
    },
    ANIMATION: {
        FRAMES_PER_SECOND: 60
    }
};

//Global functions
window.toggleViewType = toggleViewType;
window.updateDaytime = updateDaytime;
window.updateAbajurMaterial = updateAbajurMaterial;


window.playToFrame = playToFrame;
window.stopAnimation = stopAnimation;
window.setAnimationSpeed = setAnimationSpeed;

function initializeRenderer(container) {
    if (!container) {
        console.error('Container not found');
        return null;
    }
    
    let canvas = container.querySelector('canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'threeJSCanvas';
        container.appendChild(canvas);
    }

    // Create renderer with error handling
    try {
        const renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: true,
            powerPreference: "high-performance"
        });
        
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.5;
        
        return renderer;
    } catch (error) {
        console.error('Failed to initialize WebGL renderer:', error);
        return null;
    }
}

function setupCamera(canvas) {
    const camera = new THREE.PerspectiveCamera(
        CONFIG.CAMERA.FOV,
        canvas.clientWidth / canvas.clientHeight,
        CONFIG.CAMERA.NEAR,
        CONFIG.CAMERA.FAR
    );
    
    camera.position.copy(CONFIG.CAMERA.INITIAL_POSITION);
    camera.lookAt(CONFIG.CAMERA.LOOK_AT);
    
    return camera;
}

function setupLighting(scene) {
    // Hemisphere light
    SceneState.hemisphereLight = new THREE.HemisphereLight(
        CONFIG.LIGHTING.HEMISPHERE.SKY_COLOR,
        CONFIG.LIGHTING.HEMISPHERE.GROUND_COLOR,
        CONFIG.LIGHTING.HEMISPHERE.INTENSITY
    );
    scene.add(SceneState.hemisphereLight);

    // Ambient light
    SceneState.ambientLight = new THREE.AmbientLight(
        CONFIG.LIGHTING.AMBIENT.COLOR,
        CONFIG.LIGHTING.AMBIENT.INTENSITY
    );
    scene.add(SceneState.ambientLight);
}

function setupSky(scene) {
    // Create Sky
    SceneState.sky = new Sky();
    SceneState.sky.scale.setScalar(450000);
    scene.add(SceneState.sky);

    // Create Sun
    SceneState.sun = new THREE.Vector3();

    // Update Sky
    const uniforms = SceneState.sky.material.uniforms;
    uniforms['turbidity'].value = CONFIG.SKY.TURBIDITY;
    uniforms['rayleigh'].value = CONFIG.SKY.RAYLEIGH;
    uniforms['mieCoefficient'].value = CONFIG.SKY.MIECOEFFICIENT;
    uniforms['mieDirectionalG'].value = CONFIG.SKY.MIEDIRECTIONALG;

    updateDaytime(CONFIG.SKY.ELEVATION, CONFIG.SKY.AZIMUTH);
}

function updateDaytime(elevation, azimuth) {
    if (!SceneState.loadingComplete) return;

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);

    SceneState.sun.setFromSphericalCoords(1, phi, theta);
    SceneState.sky.material.uniforms['sunPosition'].value.copy(SceneState.sun);

    // Adjust lighting based on time of day
    const timeOfDay = (elevation + 90) / 180;
    const intensity = Math.max(0.1, timeOfDay);

    if (SceneState.hemisphereLight) {
        SceneState.hemisphereLight.intensity = CONFIG.LIGHTING.HEMISPHERE.INTENSITY * intensity;
    }
    if (SceneState.ambientLight) {
        SceneState.ambientLight.intensity = CONFIG.LIGHTING.AMBIENT.INTENSITY * intensity;
    }

    if(SceneState.pointLight) {
        SceneState.pointLight.intensity = CONFIG.LIGHTING.POINT_LIGHT.INTENSITY / intensity;
    }
    
    if(SceneState.spotLight) {
        SceneState.spotLight.intensity = CONFIG.LIGHTING.SPOT_LIGHT.INTENSITY / intensity;
    }

    if (SceneState.renderer) {
        SceneState.renderer.toneMappingExposure = Math.max(0.3, intensity);
    }
}

function configureLights(scene) {
    SceneState.pointLight = scene.getObjectByName("Point");
    SceneState.spotLight = scene.getObjectByName("Spot");

    const pointLight = SceneState.pointLight;
    const spotLight = SceneState.spotLight;

    if (pointLight) {
        pointLight.intensity = CONFIG.LIGHTING.POINT_LIGHT.INTENSITY;
        pointLight.distance = CONFIG.LIGHTING.POINT_LIGHT.DISTANCE;
        pointLight.color = CONFIG.DEFAULT_LIGHT_COLOR;
    }
    
    if (spotLight) {
        spotLight.intensity = CONFIG.LIGHTING.SPOT_LIGHT.INTENSITY;
        spotLight.distance = CONFIG.LIGHTING.SPOT_LIGHT.DISTANCE;
        spotLight.color = CONFIG.DEFAULT_LIGHT_COLOR;
    }
}

const materialPresets = {
    black: {
        color: 0x101010,
        roughness: 0.5,   
        metalness: 0.5,   
        name: 'AbajurOutside',
    },
    wood: {
        color: 0xffd9b3,
        roughness: 0.8,   
        metalness: 0.0,   
        name: 'AbajurOutside',
        map: new THREE.TextureLoader().load('../../../models/produto/2648/textures/mdf-bp-tauari-guararapes-imagem-01-transformed.webp'),
        normalMap: new THREE.TextureLoader().load('../../../models/produto/2648/textures/2K-fabric_60_normal.jpg'),
        normalScale: new THREE.Vector2(0, 0),
        roughnessMap: new THREE.TextureLoader().load('../../../models/produto/2648/textures/tauari roughness.webp'),
    },
    inox: {
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.7,
        envMapIntensity: 1.0,
        name: 'AbajurOutside',
        map: new THREE.TextureLoader().load('../../../models/produto/2648/textures/Diffuse.jpg'),
        normalMap: new THREE.TextureLoader().load('../../../models/produto/2648/textures/Normal.jpg'),
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: new THREE.TextureLoader().load('../../../models/produto/2648/textures/Roughness.jpg'),
    }
};

function updateAbajurMaterial(materialType) {
    const abajur = SceneState.scene.getObjectByName("Abajur");
    
    if (!abajur) {
        console.warn("Abajur object not found in scene");
        return;
    }
    const materialProperties = materialPresets[materialType];
    if (!materialProperties) {
        console.warn(`Material type '${materialType}' not found in presets`);
        return;
    }

    const newMaterial = new THREE.MeshStandardMaterial(materialProperties);

    abajur.traverse((node) => {
        if (node.isMesh) {
            if (node.material.name === "AbajurOutside") {
                node.material = newMaterial;
            }
        }
    });
}


async function loadBlenderScene(scene) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        
        loader.load(
            '../../../models/produto/2648/Scene.gltf',
            (gltf) => {
                SceneState.blenderScene = gltf.scene;
                scene.add(SceneState.blenderScene);            
                
                SceneState.blenderScene.position.set(27, -9, -0.1);
                SceneState.blenderScene.scale.set(1, 1, 1);
                
                resolve();
            },
            () => {
                updateLoadingUI();
            },
            reject
        );
    });
}

async function loadModel(scene) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            '../../../models/produto/2648/ApliqueArticuladoPecaUnica.gltf',
            (gltf) => {
                scene.add(gltf.scene);

                SceneState.support = scene.getObjectByName("Support");
                SceneState.cylindricalBulb = scene.getObjectByName("C_LightBulb");
                SceneState.sphericalBulb = scene.getObjectByName("S_LightBulb");
                
                if (SceneState.sphericalBulb) {
                    SceneState.sphericalBulb.visible = false;
                }
                
                if (SceneState.cylindricalBulb?.children[0]?.material) {
                    SceneState.cylindricalBulb.children[0].material.emissive = CONFIG.DEFAULT_LIGHT_COLOR;
                }
                
                if (SceneState.support && SceneState.blenderScene) {
                    SceneState.support.position.set(0, 0, 0);
                }

                initializeAnimations(gltf);

                resolve();
            },
            () => {
                updateLoadingUI();
            },
            reject
        );
    });
}

function updateLoadingUI() {
    const loadingScreen = document.getElementById('loading3DScene');
    if (loadingScreen) {
        if (SceneState.isLoading) {
            loadingScreen.style.display = 'flex';
        } else {
            loadingScreen.style.display = 'none';
        }
    }
}

async function initScene() {
    try {
        SceneState.isLoading = true;
        updateLoadingUI();

        await Promise.all([
            loadBlenderScene(SceneState.scene),
            loadModel(SceneState.scene)
        ]);

        setupLighting(SceneState.scene);
        setupSky(SceneState.scene);
        configureLights(SceneState.scene);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        SceneState.scene.add(directionalLight);

        SceneState.loadingComplete = true;
        SceneState.isLoading = false;
        updateLoadingUI();
        
        updateDaytime(CONFIG.SKY.ELEVATION, CONFIG.SKY.AZIMUTH);
    } catch (error) {
        console.error('Error during scene initialization:', error);
        SceneState.isLoading = false;
        updateLoadingUI();
    }
}

async function init3DScene() {
    if(SceneState.scene) return;

    const container = document.getElementById('threeJSContainer');

    // Initialize renderer
    const renderer = initializeRenderer(container);
    if (!renderer) {
        console.error('Failed to initialize renderer');
        return;
    }
    SceneState.renderer = renderer;

    // Initialize other components
    SceneState.scene = new THREE.Scene();
    SceneState.camera = setupCamera(container);
    SceneState.controls = new OrbitControls(SceneState.camera, renderer.domElement);
    SceneState.controls.target.copy(CONFIG.CAMERA.LOOK_AT);

    // Initialize scene with proper loading sequence
    try {
        await initScene();
        initializeAnimation();
    } catch (error) {
        console.error('Error during scene initialization:', error);
        cleanup3D();
    }
}

function initializeAnimations(gltf) {
    AnimationState.mixer = new THREE.AnimationMixer(gltf.scene);
    
    // Initialize all animations
    AnimationState.animations = gltf.animations.map(clip => {
        const action = AnimationState.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        return action;
    });
    
    // Start all animations but pause them immediately
    AnimationState.animations.forEach(action => {
        action.play();
        action.paused = true;
    });
    
    // Set initial frame
    AnimationState.mixer.setTime(0);
    AnimationState.currentFrame = 0;
}

function updateAnimation(deltaTime) {
    if (!AnimationState.mixer || !AnimationState.isPlaying) return;

    const currentFrame = Math.round(AnimationState.mixer.time * CONFIG.ANIMATION.FRAMES_PER_SECOND);
    
    // Check if we've reached the target frame
    if ((AnimationState.direction > 0 && currentFrame >= AnimationState.targetFrame) ||
        (AnimationState.direction < 0 && currentFrame <= AnimationState.targetFrame)) {
        
        AnimationState.isPlaying = false;
        AnimationState.direction = 0;
        AnimationState.currentFrame = AnimationState.targetFrame;
        
        // Ensure we're exactly at the target frame
        AnimationState.mixer.setTime(AnimationState.targetFrame / CONFIG.ANIMATION.FRAMES_PER_SECOND);
        
        // Pause all animations
        AnimationState.animations.forEach(action => {
            action.paused = true;
        });
        
        if (AnimationState.onFrameCallback) {
            AnimationState.onFrameCallback({
                currentFrame: AnimationState.targetFrame,
                targetFrame: AnimationState.targetFrame,
                status: 'completed'
            });
        }
        return;
    }

    // Update all animations
    AnimationState.animations.forEach(action => {
        action.paused = false;
    });
    
    // Update the mixer with the correct direction and speed
    AnimationState.mixer.update(deltaTime * AnimationState.direction * AnimationState.speed);
    AnimationState.currentFrame = currentFrame;

    if (AnimationState.onFrameCallback) {
        AnimationState.onFrameCallback({
            currentFrame: currentFrame,
            targetFrame: AnimationState.targetFrame,
            status: 'playing'
        });
    }
}

function playToFrame(targetFrame, onFrame = null) {
    if (!AnimationState.mixer) return;

    const currentFrame = Math.round(AnimationState.mixer.time * CONFIG.ANIMATION.FRAMES_PER_SECOND);
    
    // Don't do anything if we're already at the target frame
    if (currentFrame === targetFrame) return;
    
    AnimationState.onFrameCallback = onFrame;
    AnimationState.direction = targetFrame > currentFrame ? 1 : -1;
    AnimationState.targetFrame = targetFrame;
    AnimationState.isPlaying = true;

    // Unpause all animations
    AnimationState.animations.forEach(action => {
        action.paused = false;
    });

    if (AnimationState.onFrameCallback) {
        AnimationState.onFrameCallback({
            currentFrame: currentFrame,
            targetFrame: targetFrame,
            status: 'started'
        });
    }
}

function stopAnimation() {
    if (!AnimationState.mixer) return;
    
    AnimationState.isPlaying = false;
    AnimationState.direction = 0;
    
    // Pause all animations
    AnimationState.animations.forEach(action => {
        action.paused = true;
    });
}

function setAnimationSpeed(speed) {
    AnimationState.speed = speed;
}

function initializeAnimation() {
    const animate = () => {
        if(!SceneState.renderer) return;
        requestAnimationFrame(animate);
        
        if (AnimationState.mixer) {
            const delta = AnimationState.clock.getDelta();
            updateAnimation(delta);
        }
        
        SceneState.renderer.render(SceneState.scene, SceneState.camera);
    };
    
    animate();
}



function cleanup3D() {
    // Properly dispose of renderer
    if (SceneState.renderer) {
        SceneState.renderer.dispose();
    }

    // Clear the container
    const container = document.getElementById('threeJSContainer');
    if (container) {
        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.id = 'threeJSCanvas';
        container.appendChild(canvas);
    }
   
    // Reset scene state
    Object.keys(SceneState).forEach(key => {
        SceneState[key] = null;
    });
    
    SceneState.loadingComplete = false;
    SceneState.isLoading = true;
}

function updateRendererSize() {
    const container = document.getElementById('threeJSContainer');
    if (SceneState.renderer && SceneState.camera && container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        if (width > 0 && height > 0) {
            SceneState.renderer.setSize(width, height);
            SceneState.camera.aspect = width / height;
            SceneState.camera.updateProjectionMatrix();
        }
    }
}
window.addEventListener('resize', updateRendererSize);

function updateButtons(viewType) {
    const imageBtn = document.getElementById('imageViewBtn');
    const threeDBtn = document.getElementById('3DViewBtn');
    
    const ACTIVE_CLASSES = ['bg-gray-200', 'shadow-inner', 'cursor-default'];
    const INACTIVE_CLASSES = ['bg-white', 'hover:text-rose-500'];
    
    if (viewType === '3DView') {
        imageBtn.classList.remove(...ACTIVE_CLASSES);
        imageBtn.classList.add(...INACTIVE_CLASSES);
        
        threeDBtn.classList.add(...ACTIVE_CLASSES);
        threeDBtn.classList.remove(...INACTIVE_CLASSES);
    } else {
        threeDBtn.classList.remove(...ACTIVE_CLASSES);
        threeDBtn.classList.add(...INACTIVE_CLASSES);
        
        imageBtn.classList.add(...ACTIVE_CLASSES);
        imageBtn.classList.remove(...INACTIVE_CLASSES);
    }
}

function toggleView(viewType) {
    const image = document.getElementById('carouselImage');
    const container = document.getElementById('threeJSContainer');
    
    if (viewType === '3DView') {
        image.style.display = 'none';
        container.style.display = 'block';
        init3DScene();

    } else if (viewType === 'imageView') {
        cleanup3D();
        image.style.display = 'block';
        container.style.display = 'none';
    }
}

function toggleViewType(selected) {
    toggleView(selected);
    updateButtons(selected);
}