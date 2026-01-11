import * as THREE from 'three';
import { CONFIG, VisualParams } from '../core/config.js';
import { worldGroup } from '../core/scene.js';
import { ShapeType } from '../shapes/index.js';

let topStar;
let topStarOriginal = new THREE.Vector3();
let topStarScattered = new THREE.Vector3();

export function initTopStar() {
    // Create 8-point star by combining two rotated squares
    const starSize = 2.5;
    const points = [];

    // Generate 8 points for the star
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI / 4) - Math.PI / 2; // 45 degrees between points
        const radius = (i % 2 === 0) ? starSize : starSize * 0.25; // Thinner points with smaller inner radius
        points.push(new THREE.Vector2(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        ));
    }

    // Create the star shape
    const starShape = new THREE.Shape(points);

    // Extrude the shape to give it depth
    const extrudeSettings = {
        depth: 0.5,
        bevelEnabled: true,
        bevelThickness: 0.2,
        bevelSize: 0.1,
        bevelSegments: 2
    };

    const topStarGeo = new THREE.ExtrudeGeometry(starShape, extrudeSettings);

    // Center the geometry
    topStarGeo.center();

    const topStarMat = new THREE.MeshStandardMaterial({
        color: 0xffff00,        // Brighter yellow
        emissive: 0xffdd44,     // Brighter emissive color
        emissiveIntensity: 1.8, // Increased to 1.5x brightness (was 1.2)
        metalness: 1.0,
        roughness: 0.0
    });
    topStar = new THREE.Mesh(topStarGeo, topStarMat);
    topStar.position.set(0, 26, 0); // Above letter "I" at y=20
    worldGroup.add(topStar);

    // Store top star positions for scatter
    topStarOriginal.set(0, 26, 0); // Updated to match new position
    topStarScattered.set(0, 20, 0);
}

export function updateTopStar(delta, scatterAmount) {
    if (!topStar) return;

    topStar.visible = VisualParams.treeElementsVisible;
    topStar.rotation.y += delta * (1 + scatterAmount * 2);

    // Star is now at fixed position y=26 (above letter I)
    const dynamicTopY = 26;

    topStar.position.x = topStarOriginal.x + (topStarScattered.x - topStarOriginal.x) * scatterAmount;
    topStar.position.y = dynamicTopY + (topStarScattered.y - dynamicTopY) * scatterAmount;
    topStar.position.z = topStarOriginal.z + (topStarScattered.z - topStarOriginal.z) * scatterAmount;

    const topStarScale = (1 + scatterAmount * 0.5) * VisualParams.treeScale;
    topStar.scale.setScalar(topStarScale);
}

export function regenerateTopStarScatter(shapeType) {
    // Update top star scattered position based on shape
    if (shapeType === ShapeType.HEART) {
        topStarScattered.set(0, 25, 0);  // Top of heart
    } else if (shapeType === ShapeType.STAR) {
        topStarScattered.set(0, 30, 0);  // Top of star
    } else if (shapeType === ShapeType.TEXT) {
        topStarScattered.set(0, 22, 0);  // Above text
    } else {
        topStarScattered.set(0, 20, 0);  // Starry sky center
    }
}
