import * as THREE from 'three';
import { CONFIG, VisualParams } from '../core/config.js';
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

let shimmerParticles;
const shimmerPositions = [];

export function initShimmer() {
    const particleTexture = createSoftParticleTexture();

    const shimmerCount = 500;
    const shimmerGeometry = new THREE.BufferGeometry();
    const shimmerPos = new Float32Array(shimmerCount * 3);
    const shimmerColors = new Float32Array(shimmerCount * 3);

    const shimmerColorPalette = [
        new THREE.Color(0xff3388),
        new THREE.Color(0x33ff88),
        new THREE.Color(0x3388ff),
        new THREE.Color(0xffaa33),
        new THREE.Color(0xff33ff),
    ];

    for (let i = 0; i < shimmerCount; i++) {
        const t = Math.random();
        const y = t * CONFIG.treeHeight;
        const maxRadius = CONFIG.treeBaseRadius * (1 - t) * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const radius = maxRadius * (0.7 + Math.random() * 0.3);
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);

        shimmerPos[i * 3] = x;
        shimmerPos[i * 3 + 1] = y;
        shimmerPos[i * 3 + 2] = z;

        const color = shimmerColorPalette[Math.floor(Math.random() * shimmerColorPalette.length)];
        shimmerColors[i * 3] = color.r;
        shimmerColors[i * 3 + 1] = color.g;
        shimmerColors[i * 3 + 2] = color.b;

        shimmerPositions.push({
            baseY: y, angle: angle, radius: radius,
            speed: 1.0 + Math.random() * 2.0,
            offset: Math.random() * Math.PI * 2
        });
    }

    shimmerGeometry.setAttribute('position', new THREE.BufferAttribute(shimmerPos, 3));
    shimmerGeometry.setAttribute('color', new THREE.BufferAttribute(shimmerColors, 3));

    const shimmerMaterial = new THREE.PointsMaterial({
        size: 0.25,
        map: particleTexture,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.7,
        vertexColors: true,
        depthWrite: false
    });

    shimmerParticles = new THREE.Points(shimmerGeometry, shimmerMaterial);
    worldGroup.add(shimmerParticles);
}

export function updateShimmer(time, delta, scatterAmount) {
    if (!shimmerParticles) return;

    // Also hide/show shimmer based on stardust visibility for now
    shimmerParticles.visible = VisualParams.stardustVisible;

    const shimmerPos = shimmerParticles.geometry.attributes.position.array;
    for (let i = 0; i < shimmerPositions.length; i++) {
        const particle = shimmerPositions[i];
        const currentAngle = particle.angle + time * particle.speed;
        const heightProgress = ((time * particle.speed * 0.3 + particle.offset) % (Math.PI * 2)) / (Math.PI * 2);
        const currentY = heightProgress * CONFIG.treeHeight;
        const currentRadius = particle.radius * (1 - currentY / CONFIG.treeHeight);

        const shimmerScatterRadius = 30 + i * 0.03;
        const shimmerScatterAngle = particle.angle + i * 0.1;

        const treeShimmerX = currentRadius * Math.cos(currentAngle);
        const treeShimmerY = currentY;
        const treeShimmerZ = currentRadius * Math.sin(currentAngle);

        const scatterShimmerX = shimmerScatterRadius * Math.cos(shimmerScatterAngle);
        const scatterShimmerY = Math.sin(shimmerScatterAngle * 2) * 20 + 15;
        const scatterShimmerZ = shimmerScatterRadius * Math.sin(shimmerScatterAngle);

        shimmerPos[i * 3] = treeShimmerX + (scatterShimmerX - treeShimmerX) * scatterAmount;
        shimmerPos[i * 3 + 1] = treeShimmerY + (scatterShimmerY - treeShimmerY) * scatterAmount;
        shimmerPos[i * 3 + 2] = treeShimmerZ + (scatterShimmerZ - treeShimmerZ) * scatterAmount;
    }
    shimmerParticles.geometry.attributes.position.needsUpdate = true;
}
