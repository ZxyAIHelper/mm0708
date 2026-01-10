import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from './config.js';

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02); // Deep black fog

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(CONFIG.cameraPosition.x, CONFIG.cameraPosition.y, CONFIG.cameraPosition.z);

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI / 2 + 0.1;

export const composer = new EffectComposer(renderer);

export const worldGroup = new THREE.Group();

export function initScene(container) {
    // Enable camera to see both layer 0 (bloom-affected) and layer 1 (photos, non-bloom)
    camera.layers.enable(0);
    camera.layers.enable(1);

    // Default worldGroup Y offset
    worldGroup.position.y = CONFIG.sceneOffsetY;
    scene.add(worldGroup);

    container.appendChild(renderer.domElement);
    // ==========================================
    // ENVIRONMENT (Critical for Metallic Reflections!)
    // ==========================================
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // ==========================================
    // LIGHTING setup (Simplified - Environment does most work)
    // ==========================================
    // 1. Ambient for base visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight); // Ambient can stay in scene or world, doesn't matter much for position

    // 2. Key Point Light for sparkle
    const keyLight = new THREE.PointLight(0xffffff, 2.0, 100);
    keyLight.position.set(20, 30, 20);
    worldGroup.add(keyLight); // Move to worldGroup

    // 3. Central Warm Glow
    const centerLight = new THREE.PointLight(0xffd700, 1.5, 50);
    centerLight.position.set(0, 20, 0);
    worldGroup.add(centerLight); // Move to worldGroup

    // ==========================================
    // POST-PROCESSING (BLOOM)
    // ==========================================
    const renderScene = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.8; // High threshold - only very bright objects bloom
    bloomPass.strength = CONFIG.bloomStrength;
    bloomPass.radius = CONFIG.bloomRadius;

    composer.addPass(renderScene);

    // Override bloom render to only affect layer 0
    const originalCameraLayers = camera.layers.mask;
    const originalRender = bloomPass.render.bind(bloomPass);
    bloomPass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        camera.layers.set(0); // Temporarily show only layer 0
        originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        camera.layers.mask = originalCameraLayers; // Restore all layers
    };

    composer.addPass(bloomPass);

    // Expose update function for debug usage
    window.updateBloom = (params) => {
        if (!params.bloomEnabled) {
            bloomPass.strength = 0;
            return;
        }
        bloomPass.strength = params.bloomStrength;
        bloomPass.radius = params.bloomRadius;
        bloomPass.threshold = params.bloomThreshold;
    };

    window.updateSceneOffset = (offsetY) => {
        worldGroup.position.y = offsetY;
    };
}

export function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}
