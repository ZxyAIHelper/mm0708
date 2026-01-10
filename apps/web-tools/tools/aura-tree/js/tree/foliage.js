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

let foliageParticles;
const foliagePositions = [];
const foliageOriginal = [];
let foliageScattered = [];

export function initFoliage() {
    const particleTexture = createSoftParticleTexture();

    const foliageCount = 7500;
    const foliageGeometry = new THREE.BufferGeometry();
    const foliagePos = new Float32Array(foliageCount * 3);
    const foliageColors = new Float32Array(foliageCount * 3);

    for (let i = 0; i < foliageCount; i++) {
        const t = Math.random();
        const y = t * CONFIG.treeHeight;
        const maxRadius = CONFIG.treeBaseRadius * (1 - t);
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);



        foliagePos[i * 3] = x;
        foliagePos[i * 3 + 1] = y;
        foliagePos[i * 3 + 2] = z;

        // Green-to-white gradient based on height (bottom = more green, middle = white)
        // t ranges from 0 (bottom) to 1 (top)
        // We want green to be strongest at bottom (t=0) and fade to white at middle (t=0.5)
        const greenIntensity = Math.max(0, 1 - (t / 0.5)); // 1.0 at bottom, 0.0 at middle (50% height)
        const greenAmount = greenIntensity * 0.85; // Max 85% green at bottom (increased for visibility)

        const baseWhite = new THREE.Color(0xffffff);
        const greenColor = new THREE.Color(0x228b22); // Brighter forest green
        const color = new THREE.Color().lerpColors(baseWhite, greenColor, greenAmount);

        // Increase brightness at the bottom (bottom 30% of tree) by 1.2x
        const bottomBrightness = t < 0.3 ? 1.2 : 1.0;

        foliageColors[i * 3] = Math.min(1.0, color.r * bottomBrightness);
        foliageColors[i * 3 + 1] = Math.min(1.0, color.g * bottomBrightness);
        foliageColors[i * 3 + 2] = Math.min(1.0, color.b * bottomBrightness);

        foliagePositions.push({
            x: x, y: y, z: z, baseY: y,
            offset: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 1.0
        });

        foliageOriginal.push({ x, y, z });

        // Generate scattered position (Wider Starry Sky)
        const scatterTheta = Math.random() * Math.PI * 2;
        const scatterPhi = Math.acos(2 * Math.random() - 1);
        // Reduced from 150+150 to 40+40, and now to 20+20 to match other elements
        const scatterRadius = 20 + Math.random() * 20;

        foliageScattered.push({
            x: scatterRadius * Math.sin(scatterPhi) * Math.cos(scatterTheta),
            y: scatterRadius * Math.sin(scatterPhi) * Math.sin(scatterTheta),
            z: scatterRadius * Math.cos(scatterPhi)
        });
    }

    foliageGeometry.setAttribute('position', new THREE.BufferAttribute(foliagePos, 3));
    foliageGeometry.setAttribute('color', new THREE.BufferAttribute(foliageColors, 3));

    const foliageMaterial = new THREE.PointsMaterial({
        size: VisualParams.foliageSize || 0.25,
        map: particleTexture,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 1.0,
        vertexColors: true,
        depthWrite: false
    });

    foliageParticles = new THREE.Points(foliageGeometry, foliageMaterial);
    worldGroup.add(foliageParticles);
}

export function updateFoliage(time, delta, scatterAmount) {
    if (!foliageParticles) return;

    // Dynamic Updates from VisualParams
    foliageParticles.visible = VisualParams.foliageVisible;
    foliageParticles.material.size = VisualParams.foliageSize;
    foliageParticles.material.opacity = VisualParams.foliageOpacity;

    // NOTE: Removed dynamic color update to preserve the green-to-white gradient
    // The gradient is set during initialization and should not be overridden

    const positions = foliageParticles.geometry.attributes.position.array;

    for (let i = 0; i < foliagePositions.length; i++) {
        const particle = foliagePositions[i];
        const original = foliageOriginal[i];
        const scattered = foliageScattered[i];

        // Safety check: if scattered is undefined, create a default position
        if (!scattered) {
            const scatterTheta = Math.random() * Math.PI * 2;
            const scatterPhi = Math.acos(2 * Math.random() - 1);
            const scatterRadius = 20 + Math.random() * 20;
            foliageScattered[i] = {
                x: scatterRadius * Math.sin(scatterPhi) * Math.cos(scatterTheta),
                y: scatterRadius * Math.sin(scatterPhi) * Math.sin(scatterTheta),
                z: scatterRadius * Math.cos(scatterPhi)
            };
        }

        const drift = Math.sin(time * particle.speed + particle.offset) * 0.2; // Less drift for needles
        const swirl = Math.cos(time * particle.speed * 0.5 + particle.offset) * 0.05; // Subtle movement
        const treeX = original.x + swirl;
        const treeY = original.y + drift;
        const treeZ = original.z;

        const twinkle = Math.sin(time * 0.3 + particle.offset * 2) * 0.2;
        const scatterX = foliageScattered[i].x + twinkle;
        const scatterY = foliageScattered[i].y + Math.cos(time * 0.2 + particle.offset) * 0.2;
        const scatterZ = foliageScattered[i].z;

        positions[i * 3] = treeX + (scatterX - treeX) * scatterAmount;
        positions[i * 3 + 1] = treeY + (scatterY - treeY) * scatterAmount;
        positions[i * 3 + 2] = treeZ + (scatterZ - treeZ) * scatterAmount;
    }
    foliageParticles.geometry.attributes.position.needsUpdate = true;

    if (scatterAmount < 0.5) {
        foliageParticles.rotation.y += delta * 0.03 * (1 - scatterAmount * 2); // Slower rotation
    }
}

export function regenerateFoliageScatter(shapePoints) {
    // Create a new array with proper handling for count mismatch
    const pointCount = shapePoints.length;
    foliageScattered = [];

    // Assign each particle a shape point (reuse points if needed)
    for (let i = 0; i < foliageOriginal.length; i++) {
        // Use modulo to wrap around if we don't have enough points
        const point = shapePoints[i % pointCount];
        foliageScattered.push({ x: point.x, y: point.y, z: point.z });
    }

    // Shuffle for random distribution
    for (let i = foliageScattered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [foliageScattered[i], foliageScattered[j]] = [foliageScattered[j], foliageScattered[i]];
    }
}
