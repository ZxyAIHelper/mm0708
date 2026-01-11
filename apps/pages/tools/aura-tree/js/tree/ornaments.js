import * as THREE from 'three';
import { CONFIG, VisualParams } from '../core/config.js';
import { worldGroup } from '../core/scene.js';
import { calculateTreePosition } from './geometry.js';
import { generateShapePoints } from '../shapes/index.js';

let ornaments = [];
const dummy = new THREE.Object3D();

// Instance Meshes for three ornament types
let giftBoxMesh, baubleMesh, lightMesh;

export function initElements() {
    initOrnaments();
}

function initOrnaments() {
    // ===== GIFT BOXES (Heavy - Weight: 3.0) =====
    const giftGeo = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    const giftMat = new THREE.MeshStandardMaterial({
        metalness: 0.6,
        roughness: 0.23,
        emissiveIntensity: 0.8,
        envMapIntensity: 4.0,
    });

    // Allocate larger initial counts to allow dynamic adjustment via VisualParams
    const maxGiftCount = 200;
    giftBoxMesh = new THREE.InstancedMesh(giftGeo, giftMat, maxGiftCount);
    giftBoxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    giftBoxMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxGiftCount * 3), 3);
    giftBoxMesh.count = Math.min(VisualParams.giftBoxCount || 100, maxGiftCount); // Set initial visible count
    worldGroup.add(giftBoxMesh);

    // ===== BAUBLES (Light - Weight: 1.0) ===== Scaled to 0.7x
    const baubleGeo = new THREE.SphereGeometry(0.1575, 16, 16); // 0.225 * 0.7 = 0.1575
    const baubleMat = new THREE.MeshStandardMaterial({
        metalness: 0.9,
        roughness: 0.1,
        envMapIntensity: 3.5,
        emissiveIntensity: 0.7,
    });

    const maxBaubleCount = 500;
    baubleMesh = new THREE.InstancedMesh(baubleGeo, baubleMat, maxBaubleCount);
    baubleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    baubleMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxBaubleCount * 3), 3);
    baubleMesh.count = Math.min(VisualParams.baubleCount || 300, maxBaubleCount); // Set initial visible count
    worldGroup.add(baubleMesh);

    // ===== LIGHTS (Very Light - Weight: 0.3) =====
    const lightGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const lightMat = new THREE.MeshStandardMaterial({
        emissiveIntensity: 1.2,
        metalness: 0,
        roughness: 0.5,
    });

    const maxLightCount = 700;
    lightMesh = new THREE.InstancedMesh(lightGeo, lightMat, maxLightCount);
    lightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lightMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxLightCount * 3), 3);
    lightMesh.count = Math.min(VisualParams.lightCount || 400, maxLightCount); // Set initial visible count
    worldGroup.add(lightMesh);

    // Create ornaments data (using max counts)
    createGiftBoxes(maxGiftCount);
    createBaubles(maxBaubleCount);
    createLights(maxLightCount);
}

function createGiftBoxes(count) {
    // Split boxes: 40% pink (near heart), 60% gold (elsewhere)
    const pinkCount = Math.floor(count * 0.4);

    for (let i = 0; i < count; i++) {
        const isPink = i < pinkCount;

        let originalPos;
        if (isPink) {
            // Pink boxes: spread more widely around heart level
            const angle = Math.random() * Math.PI * 2;
            const radius = CONFIG.treeBaseRadius * (0.2 + Math.random() * 0.5); // Wider radius spread
            originalPos = new THREE.Vector3(
                radius * Math.cos(angle),
                6 + Math.random() * 8, // y = 6-14 (wider vertical spread)
                radius * Math.sin(angle)
            );
        } else {
            // Gold boxes: regular tree distribution
            const rand = Math.random();
            const t = Math.pow(rand, 1.5) * 0.7; // Only 0-70% height, weighted to bottom
            const pos = calculateTreePosition(t);
            originalPos = new THREE.Vector3(pos.x, pos.y, pos.z);
        }

        // Scattered position
        const scatterTheta = Math.random() * Math.PI * 2;
        const scatterPhi = Math.acos(2 * Math.random() - 1);
        const scatterRadius = 12 + Math.random() * 15; // Closer scatter

        const scatteredPos = new THREE.Vector3(
            scatterRadius * Math.sin(scatterPhi) * Math.cos(scatterTheta),
            scatterRadius * Math.sin(scatterPhi) * Math.sin(scatterTheta) * 0.7,
            scatterRadius * Math.cos(scatterPhi)
        );

        // Color: Pink for heart area, Gold for others
        const color = new THREE.Color(isPink ? 0xffb6c1 : 0xffd700);
        giftBoxMesh.setColorAt(i, color);

        // Store ornament data
        ornaments.push({
            type: 'gift',
            mesh: giftBoxMesh,
            index: i,
            originalPos: originalPos,
            scatteredPos: scatteredPos,
            weight: 3.0, // Heavy
            bobOffset: Math.random() * 100,
            bobSpeed: 0.5 + Math.random() * 0.5, // Slow bobbing
            rotationSpeed: (Math.random() - 0.5) * 0.5, // Slow rotation
            scale: 0.9 + Math.random() * 0.2,
        });

        // Set initial matrix for gift box
        dummy.position.copy(originalPos);
        dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        dummy.scale.setScalar(ornaments[ornaments.length - 1].scale);
        dummy.updateMatrix();
        giftBoxMesh.setMatrixAt(i, dummy.matrix);
    }
}

function createBaubles(count) {
    // Only gold color for baubles (removed white)
    const colors = [
        0xffd700, // Gold
    ];

    for (let i = 0; i < count; i++) {
        // Weight distribution to middle and bottom (avoid top clustering)
        const rand = Math.random();
        const t = Math.pow(rand, 1.3) * 0.85; // 0-85% height, weighted to bottom
        const pos = calculateTreePosition(t);
        const originalPos = new THREE.Vector3(pos.x, pos.y, pos.z);

        // Scattered position
        const scatterTheta = Math.random() * Math.PI * 2;
        const scatterPhi = Math.acos(2 * Math.random() - 1);
        const scatterRadius = 18 + Math.random() * 20; // Normal scatter

        const scatteredPos = new THREE.Vector3(
            scatterRadius * Math.sin(scatterPhi) * Math.cos(scatterTheta),
            scatterRadius * Math.sin(scatterPhi) * Math.sin(scatterTheta) * 0.7,
            scatterRadius * Math.cos(scatterPhi)
        );

        // Color
        const color = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
        baubleMesh.setColorAt(i, color);

        // Store ornament data
        ornaments.push({
            type: 'bauble',
            mesh: baubleMesh,
            index: i,
            originalPos: originalPos,
            scatteredPos: scatteredPos,
            weight: 1.0, // Normal
            bobOffset: Math.random() * 100,
            bobSpeed: 1.0 + Math.random() * 1.0, // Medium bobbing
            rotationSpeed: (Math.random() - 0.5) * 1.5,
            scale: 0.8 + Math.random() * 0.4,
        });

        // Set initial matrix for bauble
        dummy.position.copy(originalPos);
        dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        dummy.scale.setScalar(ornaments[ornaments.length - 1].scale);
        dummy.updateMatrix();
        baubleMesh.setMatrixAt(i, dummy.matrix);
    }
}

function createLights(count) {
    const colors = [
        0xfffacd, // Warm white
        0xffff99, // Yellow
        0xffd700, // Gold
    ];

    for (let i = 0; i < count; i++) {
        // Spiral pattern around tree (expanded outward)
        const angle = (i / count) * Math.PI * 8; // Multiple spirals
        const t = i / count;
        const y = t * CONFIG.treeHeight;
        const maxRadius = CONFIG.treeBaseRadius * (1 - t);
        const radius = maxRadius * (VisualParams.lightExpansion || 1.1); // Expanded outward by 10%

        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const originalPos = new THREE.Vector3(x, y, z);

        // Scattered position (far)
        const scatterTheta = Math.random() * Math.PI * 2;
        const scatterPhi = Math.acos(2 * Math.random() - 1);
        const scatterRadius = 20 + Math.random() * 20; // Tight scatter matched to foliage

        const scatteredPos = new THREE.Vector3(
            scatterRadius * Math.sin(scatterPhi) * Math.cos(scatterTheta),
            scatterRadius * Math.sin(scatterPhi) * Math.sin(scatterTheta) * 0.7,
            scatterRadius * Math.cos(scatterPhi)
        );

        // Color (with emissive)
        const color = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
        lightMesh.setColorAt(i, color);

        // Store ornament data
        ornaments.push({
            type: 'light',
            mesh: lightMesh,
            index: i,
            originalPos: originalPos,
            scatteredPos: scatteredPos,
            weight: 0.3, // Very light
            bobOffset: Math.random() * 100,
            bobSpeed: 1.5 + Math.random() * 1.5, // Fast bobbing
            rotationSpeed: (Math.random() - 0.5) * 2.0,
            scale: 0.8 + Math.random() * 0.4,
            emissiveColor: color,
            streamlineFactor: 0.7 + Math.sin(i * 0.5) * 0.3 + Math.cos(i * 0.3) * 0.3, // Store streamline variation
        });

        // Set initial matrix with streamlined scale variation
        dummy.position.copy(originalPos);
        dummy.rotation.set(0, 0, 0); // No rotation for lights
        // Add streamlined size variation based on position (0.7 to 1.3 scale)
        const streamlineScale = 0.7 + Math.sin(i * 0.5) * 0.3 + Math.cos(i * 0.3) * 0.3;
        dummy.scale.setScalar(ornaments[ornaments.length - 1].scale * streamlineScale);
        dummy.updateMatrix();
        lightMesh.setMatrixAt(i, dummy.matrix);
    }

    // Update emissive colors for lights
    if (lightMesh.material) {
        lightMesh.material.emissive = new THREE.Color(0xffffff);
    }
}

export function updateElements(time, delta, scatterAmount) {
    if (!giftBoxMesh || !baubleMesh || !lightMesh) return;

    // Update counts from VisualParams
    giftBoxMesh.count = Math.min(VisualParams.giftBoxCount || 100, giftBoxMesh.instanceMatrix.count);
    baubleMesh.count = Math.min(VisualParams.baubleCount || 300, baubleMesh.instanceMatrix.count);
    lightMesh.count = Math.min(VisualParams.lightCount || 200, lightMesh.instanceMatrix.count);

    // Visibility
    const visible = VisualParams.ornamentsVisible;
    giftBoxMesh.visible = visible;
    baubleMesh.visible = visible;
    lightMesh.visible = visible;

    // Update each ornament
    ornaments.forEach(orn => {
        // Tree scaling
        const currentHeight = VisualParams.treeHeight;
        const currentRadius = VisualParams.treeBaseRadius;
        const scaleY = currentHeight / CONFIG.treeHeight;
        const scaleR = currentRadius / CONFIG.treeBaseRadius;

        let treePos = orn.originalPos.clone();

        // For lights, recalculate position based on dynamic lightExpansion
        if (orn.type === 'light') {
            const totalLights = ornaments.filter(o => o.type === 'light').length;
            const lightIndex = ornaments.filter(o => o.type === 'light').indexOf(orn);
            const angle = (lightIndex / totalLights) * Math.PI * 8;
            const t = lightIndex / totalLights;
            const y = t * CONFIG.treeHeight;
            const maxRadius = CONFIG.treeBaseRadius * (1 - t);
            const radius = maxRadius * (VisualParams.lightExpansion || 1.1);

            treePos.x = radius * Math.cos(angle);
            treePos.y = y;
            treePos.z = radius * Math.sin(angle);
        }

        treePos.y *= scaleY;
        treePos.x *= scaleR;
        treePos.z *= scaleR;

        // Bobbing animation
        const bobY = Math.sin(time * orn.bobSpeed + orn.bobOffset) * 0.1;
        treePos.y += bobY;

        // Physics-based scatter (weight affects scatter distance)
        const scatteredPos = orn.scatteredPos.clone();
        const weightMultiplier = 1.0 / orn.weight; // Lighter objects move more
        const twinkle = Math.sin(time * 0.5 + orn.bobOffset * 3) * 0.5 * weightMultiplier;
        scatteredPos.x += twinkle;
        scatteredPos.y += Math.sin(time * 0.3 + orn.bobOffset) * 0.3 * weightMultiplier;

        // Interpolate with weight-based multiplier
        const effectiveScatter = scatterAmount * weightMultiplier;
        const finalX = treePos.x + (scatteredPos.x - treePos.x) * effectiveScatter;
        const finalY = treePos.y + (scatteredPos.y - treePos.y) * effectiveScatter;
        const finalZ = treePos.z + (scatteredPos.z - treePos.z) * effectiveScatter;

        dummy.position.set(finalX, finalY, finalZ);

        // Rotation
        const rotationMultiplier = 1 + scatterAmount * 2;
        const r = time * orn.rotationSpeed * rotationMultiplier;
        dummy.rotation.set(r, r * 1.2, r * 0.8);

        // Scale with streamlined variation for lights
        let scatterScale = orn.scale * (1 + scatterAmount * 0.2) * VisualParams.treeScale;
        if (orn.type === 'light' && orn.streamlineFactor) {
            scatterScale *= orn.streamlineFactor; // Apply streamlined size variation
        }
        dummy.scale.setScalar(scatterScale);

        dummy.updateMatrix();
        orn.mesh.setMatrixAt(orn.index, dummy.matrix);
    });

    // Update matrices
    giftBoxMesh.instanceMatrix.needsUpdate = true;
    baubleMesh.instanceMatrix.needsUpdate = true;
    lightMesh.instanceMatrix.needsUpdate = true;
}

export function regenerateElementsScatter(shapeType) {
    const count = ornaments.length;
    const newPositions = generateShapePoints(shapeType, count);

    // Shuffle positions for random explosion effect
    for (let i = newPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newPositions[i], newPositions[j]] = [newPositions[j], newPositions[i]];
    }

    for (let i = 0; i < count; i++) {
        // Check if position exists (in case generateShapePoints returns fewer points)
        const pos = newPositions[i];
        if (!pos) {
            // Fallback to a random position if point doesn't exist
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 20 + Math.random() * 15;

            ornaments[i].scatteredPos = new THREE.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );
            continue;
        }

        // Apply weight-based distance multiplier?
        // NO - removing this because it causes lights (low weight) to fly too far
        // Use the shape position directly to ensure consistent shape formation
        ornaments[i].scatteredPos = new THREE.Vector3(
            pos.x,
            pos.y,
            pos.z
        );

        // Apply color from shape point ONLY if it's pink (heart particles)
        // Preserve original gold/pink gift box colors for non-heart positions
        if (pos.color && ornaments[i].mesh) {
            const shapeColor = pos.color;
            // Only apply if the shape point color is pink (heart)
            // Pink heart has r=1.0, g=0.4, b=0.6
            const isPinkHeart = shapeColor.r === 1.0 && shapeColor.g === 0.4 && shapeColor.b === 0.6;

            if (isPinkHeart) {
                // Apply pink color for heart particles
                const color = new THREE.Color(shapeColor.r, shapeColor.g, shapeColor.b);
                ornaments[i].mesh.setColorAt(ornaments[i].index, color);
                ornaments[i].mesh.instanceColor.needsUpdate = true;
            }
            // Otherwise, keep the original color (gold or pink gift boxes)
        }
    }
}
