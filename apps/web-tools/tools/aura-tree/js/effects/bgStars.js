import * as THREE from 'three';
import { VisualParams } from '../core/config.js';
import { worldGroup } from '../core/scene.js';

// Helper to create a soft glowing particle texture
function createSoftParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');

    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

let bokehParticles;

export function initBgStars() {
    const particleTexture = createSoftParticleTexture();

    const bgStarCount = 2000;
    const bgStarGeometry = new THREE.BufferGeometry();
    const bgStarPos = new Float32Array(bgStarCount * 3);
    const bgStarColors = new Float32Array(bgStarCount * 3);
    const bgStarSizes = new Float32Array(bgStarCount);

    // Store velocities for animation
    const bgStarVelocities = [];

    for (let i = 0; i < bgStarCount; i++) {
        // Volumetric distribution (fill the space)
        const radius = Math.pow(Math.random(), 0.5) * 300; // More density near center, max radius 300
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        bgStarPos[i * 3] = x;
        bgStarPos[i * 3 + 1] = y;
        bgStarPos[i * 3 + 2] = z;

        // Colors: Starry Sky (Realism)
        const colorType = Math.random();
        let color;
        if (colorType > 0.9) color = new THREE.Color(0xccddff); // Pale Blue
        else if (colorType > 0.8) color = new THREE.Color(0xffffee); // Pale Yellow
        else color = new THREE.Color(0xffffff); // White

        const brightness = 0.6 + Math.random() * 0.4;
        bgStarColors[i * 3] = color.r * brightness;
        bgStarColors[i * 3 + 1] = color.g * brightness;
        bgStarColors[i * 3 + 2] = color.b * brightness;

        bgStarSizes[i] = Math.random() * 1.5;

        // velocity (slow drift)
        bgStarVelocities.push({
            x: (Math.random() - 0.5) * 0.02,
            y: (Math.random() - 0.5) * 0.02,
            z: (Math.random() - 0.5) * 0.02
        });
    }

    bgStarGeometry.setAttribute('position', new THREE.BufferAttribute(bgStarPos, 3));
    bgStarGeometry.setAttribute('color', new THREE.BufferAttribute(bgStarColors, 3));
    bgStarGeometry.setAttribute('size', new THREE.BufferAttribute(bgStarSizes, 1));

    const bgStarMaterial = new THREE.PointsMaterial({
        size: 1.5,
        map: particleTexture,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    bokehParticles = new THREE.Points(bgStarGeometry, bgStarMaterial);
    bokehParticles.userData = { velocities: bgStarVelocities };
    worldGroup.add(bokehParticles);
}

export function updateBgStars(time, delta) {
    if (!bokehParticles) return;

    bokehParticles.visible = VisualParams.bgStarsVisible;
    bokehParticles.material.size = VisualParams.bgStarsSize;
    bokehParticles.material.opacity = VisualParams.bgStarsOpacity;

    if (bokehParticles.userData.velocities) {
        const bgPos = bokehParticles.geometry.attributes.position.array;
        const velocities = bokehParticles.userData.velocities;
        const speed = VisualParams.bgStarsSpeed;

        for (let i = 0; i < velocities.length; i++) {
            const v = velocities[i];

            bgPos[i * 3] += v.x * speed;
            bgPos[i * 3 + 1] += v.y * speed;
            bgPos[i * 3 + 2] += v.z * speed;

            const limit = 200;
            if (bgPos[i * 3] > limit) bgPos[i * 3] -= limit * 2;
            if (bgPos[i * 3] < -limit) bgPos[i * 3] += limit * 2;
            if (bgPos[i * 3 + 1] > limit) bgPos[i * 3 + 1] -= limit * 2;
            if (bgPos[i * 3 + 1] < -limit) bgPos[i * 3 + 1] += limit * 2;
            if (bgPos[i * 3 + 2] > limit) bgPos[i * 3 + 2] -= limit * 2;
            if (bgPos[i * 3 + 2] < -limit) bgPos[i * 3 + 2] += limit * 2;
        }
        bokehParticles.geometry.attributes.position.needsUpdate = true;
    }
}
