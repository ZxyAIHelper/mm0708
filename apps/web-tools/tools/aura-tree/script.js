import * as THREE from 'three';
import { STATE } from './js/core/config.js';
import { initScene, scene, camera, renderer, composer, controls, onWindowResize } from './js/core/scene.js';
import { initTree, updateTree, regenerateTreeScatterPositions } from './js/tree/index.js';
import { initEffects, updateEffects } from './js/effects/index.js';
import { startCamera } from './js/input.js';
import { initDebugControls, DebugState } from './js/ui/index.js';
import { initPhotoUI } from './js/ui/photoUI.js';

// Init Scene
const container = document.getElementById('canvas-container');
initScene(container);

// Async initialization
async function init() {
    // Init Tree (async - photos need to be fetched from API)
    await initTree();

    // Init Effects (Background shimmer & stars)
    initEffects();

    // Set up shape change callback for tree scatter
    DebugState.onShapeChange = (shapeType) => {
        regenerateTreeScatterPositions(shapeType);
    };

    // Init Debug Controls
    initDebugControls();

    // Init Photo UI
    initPhotoUI();

    // Init Camera Input
    startCamera();

    // Start animation loop
    animate();
}

// Main Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    STATE.time += delta;

    controls.update();

    updateTree(STATE.time, delta);
    updateEffects(STATE.time, delta, DebugState.scatterProgress);

    if (window.updateDebugCameraInfo) {
        window.updateDebugCameraInfo(camera);
    }

    composer.render();
}

// Initialize Audio
import { audioManager } from './js/core/audio.js';
const muteBtn = document.getElementById('btn-mute');
if (muteBtn) {
    muteBtn.addEventListener('click', () => {
        const isMuted = audioManager.toggleMute();
        muteBtn.textContent = isMuted ? '🔇' : '🔊';
        muteBtn.classList.toggle('muted', isMuted);
    });
}

// Fullscreen Toggle
const fullscreenBtn = document.getElementById('btn-fullscreen');
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            document.documentElement.requestFullscreen().then(() => {
                fullscreenBtn.textContent = '🔲'; // Exit fullscreen icon
            }).catch(err => {
                console.error('Failed to enter fullscreen:', err);
            });
        } else {
            // Exit fullscreen
            document.exitFullscreen().then(() => {
                fullscreenBtn.textContent = '📺'; // Enter fullscreen icon
            }).catch(err => {
                console.error('Failed to exit fullscreen:', err);
            });
        }
    });

    // Listen for fullscreen changes (e.g., user pressing ESC)
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fullscreenBtn.textContent = '🔲'; // Exit fullscreen icon
        } else {
            fullscreenBtn.textContent = '📺'; // Enter fullscreen icon
        }
    });
}


// Start BGM on first user interaction (click or key)
const startAudio = () => {
    audioManager.startBGM();
    window.removeEventListener('click', startAudio);
    window.removeEventListener('keydown', startAudio);
};
window.addEventListener('click', startAudio);
window.addEventListener('keydown', startAudio);

window.addEventListener('resize', onWindowResize, false);

// Start initialization
init();


// BUGFIX: Try to start BGM immediately on page load
// Browser may block autoplay, but we try anyway
// The user interaction listeners above will retry if blocked
audioManager.startBGM();
