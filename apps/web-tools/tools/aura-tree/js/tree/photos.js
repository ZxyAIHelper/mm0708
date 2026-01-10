import * as THREE from 'three';
import { CONFIG, VisualParams, STATE } from '../core/config.js';
import { worldGroup, camera } from '../core/scene.js';
import { generateShapePoints, ShapeType } from '../shapes/index.js';

let photoMeshes = [];
let currentCenterPhotoIndex = -1;
const photoData = [];

// Photo files will be loaded dynamically from API
let photoFiles = [];

// Fetch photo list from server
async function fetchPhotoList() {
    try {
        const response = await fetch('/api/photos');
        if (!response.ok) {
            throw new Error('Failed to fetch photos list');
        }
        const photos = await response.json();
        console.log(`Loaded ${photos.length} photos from assets/photos directory`);
        return photos;
    } catch (error) {
        console.error('Error fetching photo list:', error);
        // Fallback to empty array if API fails
        return [];
    }
}

export async function initPhotos() {
    // First, fetch the photo list from the server
    photoFiles = await fetchPhotoList();

    if (photoFiles.length === 0) {
        console.warn('No photos found in assets/photos directory');
        return;
    }

    const photoCount = photoFiles.length;
    console.log(`Initializing ${photoCount} photos...`);

    const totalLights = 400; // Total light positions
    const spacing = Math.floor(totalLights / photoCount);

    // Load textures and create photo planes
    const loader = new THREE.TextureLoader();

    // Concentrate photos in the middle range (0.05 to 0.8) to avoid top and bottom
    const startT = 0.05;
    const endT = 0.8;

    for (let i = 0; i < photoCount; i++) {
        // Calculate normalized height t restricted to the middle range
        const t = startT + (i / (photoCount - 1)) * (endT - startT);

        // Calculate angle to match the spiral pattern at this height
        const angle = t * Math.PI * 8;
        const y = t * CONFIG.treeHeight;
        const maxRadius = CONFIG.treeBaseRadius * (1 - t);
        const radius = maxRadius * (VisualParams.lightExpansion || 1.8);

        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const position = new THREE.Vector3(x, y, z);

        // Create photo plane
        const photoWidth = 2.0; // Reduced from 3.0
        const photoHeight = 2.0;

        const geometry = new THREE.PlaneGeometry(photoWidth, photoHeight);
        const material = new THREE.MeshBasicMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            toneMapped: false,
            emissive: 0xffffff,
            emissiveIntensity: 0.2,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);

        // Set photos to layer 1 to exclude from bloom effect (bloom only affects layer 0)
        mesh.layers.set(1);

        // Create frame border (always visible)
        const borderGeometry = new THREE.PlaneGeometry(photoWidth * 1.1, photoHeight * 1.1);
        const borderMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff, // White frame
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            toneMapped: false,
        });
        const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
        borderMesh.position.z = -0.01; // Slightly behind the photo
        borderMesh.layers.set(1); // Also exclude border from bloom
        mesh.add(borderMesh); // Add border as child of photo mesh

        // Calculate radial direction (from tree center to photo)
        const direction = new THREE.Vector3(x, 0, z).normalize();

        // Make photo face outward (radial)
        // Look at a point further out in the radial direction
        const lookAtPoint = new THREE.Vector3(
            x + direction.x * 10,
            y,
            z + direction.z * 10
        );
        mesh.lookAt(lookAtPoint);

        worldGroup.add(mesh);

        // Extract photo name from file path
        const fileName = photoFiles[i].split('/').pop();
        const photoName = fileName.replace(/\.(jpg|jpeg|png|gif)$/i, '');

        // Store data
        photoData.push({
            mesh: mesh,
            borderMesh: borderMesh,
            position: position.clone(),
            index: i,
            filename: photoFiles[i],
            name: photoName,
            screenPos: new THREE.Vector2(),
            originalPos: position.clone(),
            scatteredPos: new THREE.Vector3() // Initializes at 0,0,0 but will be updated
        });

        photoMeshes.push(mesh);

        // Load texture
        loader.load(
            photoFiles[i],
            (texture) => {
                // Adjust height based on aspect ratio
                const aspect = texture.image.width / texture.image.height;
                const newHeight = photoWidth / aspect;

                geometry.dispose();
                const newGeometry = new THREE.PlaneGeometry(photoWidth, newHeight);
                mesh.geometry = newGeometry;

                // Also update border geometry
                borderGeometry.dispose();
                const newBorderGeometry = new THREE.PlaneGeometry(photoWidth * 1.1, newHeight * 1.1);
                borderMesh.geometry = newBorderGeometry;

                material.map = texture;
                material.needsUpdate = true;
            },
            undefined,
            (error) => {
                console.warn('Failed to load photo:', photoFiles[i], error);
            }
        );
    }

    // BUGFIX: Initialize scattered positions immediately with STARS shape
    // This prevents photos from clustering at (0,0,0) on first scatter
    regeneratePhotosScatter(ShapeType.STARS);
}


// Gallery Mode State
const galleryState = {
    queue: [],
    currentPhotoIndex: -1,
    phase: 'idle', // idle, in, hold, out
    timer: 0,
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    startRot: new THREE.Quaternion(),
    targetRot: new THREE.Quaternion(),
    currentMesh: null,
    side: 1 // 1 for right, -1 for left
};

function updateGalleryMode(time, dt) {
    if (galleryState.queue.length === 0) {
        galleryState.queue = photoData.map((_, i) => i);
        // Shuffle
        for (let i = galleryState.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [galleryState.queue[i], galleryState.queue[j]] = [galleryState.queue[j], galleryState.queue[i]];
        }
    }

    if (galleryState.phase === 'idle') {
        galleryState.currentPhotoIndex = galleryState.queue.pop();
        if (galleryState.currentPhotoIndex === undefined) return;

        galleryState.currentMesh = photoMeshes[galleryState.currentPhotoIndex];
        if (!galleryState.currentMesh) return;

        galleryState.startPos.copy(galleryState.currentMesh.position);

        // Toggle side for alternating display
        galleryState.side *= -1;

        // Calculate target position relative to camera (left or right side)
        const offset = new THREE.Vector3(galleryState.side * 12, 0, -25);
        galleryState.targetPos.copy(offset);
        galleryState.targetPos.applyMatrix4(camera.matrixWorld);

        const dummy = new THREE.Object3D();
        dummy.position.copy(galleryState.targetPos);
        dummy.lookAt(camera.position);
        galleryState.targetRot.copy(dummy.quaternion);

        galleryState.startRot.copy(galleryState.currentMesh.quaternion);

        galleryState.phase = 'in';
        galleryState.timer = 0;
    }

    if (galleryState.phase === 'in') {
        galleryState.timer += dt * 0.8;
        let t = Math.min(galleryState.timer, 1);
        const ease = t * (2 - t);

        galleryState.currentMesh.position.lerpVectors(galleryState.startPos, galleryState.targetPos, ease);
        galleryState.currentMesh.quaternion.slerp(galleryState.targetRot, ease);

        const scale = 1 + ease * 3.0; // Scale up to 4x
        galleryState.currentMesh.scale.setScalar(scale);

        if (t >= 1) {
            galleryState.phase = 'hold';
            galleryState.timer = 0;
        }
    } else if (galleryState.phase === 'hold') {
        galleryState.timer += dt * 1000;
        if (galleryState.timer >= VisualParams.galleryInterval) {
            galleryState.phase = 'out';
            galleryState.timer = 0;
        }
    } else if (galleryState.phase === 'out') {
        galleryState.timer += dt * 0.8;
        let t = Math.min(galleryState.timer, 1);
        const ease = t * t;

        galleryState.currentMesh.position.lerpVectors(galleryState.targetPos, galleryState.startPos, ease);
        galleryState.currentMesh.quaternion.slerp(galleryState.startRot, ease);

        const scale = 4.0 - ease * 3.0; // Scale down from 4x
        galleryState.currentMesh.scale.setScalar(scale);

        if (t >= 1) {
            galleryState.currentMesh.scale.setScalar(1);
            galleryState.phase = 'idle';
        }
    }
}

// Reset gallery state and immediately return photo to original position
export function resetGalleryState() {
    if (galleryState.currentMesh && galleryState.phase !== 'idle') {
        // Immediately snap photo back to original position
        galleryState.currentMesh.position.copy(galleryState.startPos);
        galleryState.currentMesh.quaternion.copy(galleryState.startRot);
        galleryState.currentMesh.scale.setScalar(1);
    }

    // Reset state
    galleryState.phase = 'idle';
    galleryState.currentPhotoIndex = -1;
    galleryState.currentMesh = null;
    galleryState.timer = 0;
}

export function updatePhotos(time, delta, scatterAmount = 0) {
    if (photoMeshes.length === 0) return;

    // Handle Gallery Mode Logic if active
    if (STATE.presentationMode === 'GALLERY') {
        updateGalleryMode(time, delta);
        return;
    }

    // --- NORMAL INTERACTION MODE BELOW ---

    // Ensure all photos are at original position/scale when in interaction mode
    photoMeshes.forEach((mesh, i) => {
        const photo = photoData[i];
        if (photo) {
            mesh.position.copy(photo.originalPos);
            mesh.scale.set(1, 1, 1);

            // Reset rotation to face outward
            const direction = new THREE.Vector3(photo.originalPos.x, 0, photo.originalPos.z).normalize();
            const lookAtPoint = new THREE.Vector3(
                photo.originalPos.x + direction.x * 10,
                photo.originalPos.y,
                photo.originalPos.z + direction.z * 10
            );
            mesh.lookAt(lookAtPoint);
        }
    });

    // Update visibility
    const visible = VisualParams.photosVisible !== false;
    photoMeshes.forEach(mesh => {
        mesh.visible = visible;
        // Reset scale ensure normal size
        mesh.scale.set(1, 1, 1);
    });
    if (!visible) return;

    // Calculate which photos are closest to screen center
    const visiblePhotos = [];

    photoData.forEach((photo, index) => {
        // Project 3D position to screen coordinates
        const screenPos = photo.position.clone();
        screenPos.project(camera);

        // Convert to screen coordinates (-1 to 1 range)
        photo.screenPos.set(screenPos.x, screenPos.y);

        // Calculate distance to center (0, 0)
        const distance = photo.screenPos.length();

        // Check if in front of camera
        if (screenPos.z < 1) {
            visiblePhotos.push({
                index: index,
                distance: distance,
                data: photo
            });
        }

        // Scatter animation
        const original = photo.originalPos;
        const scattered = photo.scatteredPos;

        if (scatterAmount > 0) {
            // Interpolate position
            const currentX = original.x + (scattered.x - original.x) * scatterAmount;
            const currentY = original.y + (scattered.y - original.y) * scatterAmount;
            const currentZ = original.z + (scattered.z - original.z) * scatterAmount;

            photo.mesh.position.set(currentX, currentY, currentZ);

            // Disable billboard effect (user request)
            // Just keep original rotation or simple behavior
            if (scatterAmount > 0.1) {
                // Optional: Add back subtle rotation if needed, or do nothing (keep original outward facing)
            } else {
                // Reset rotation (handled below or just kept)
            }
        } else {
            // Reset to original exact position
            photo.mesh.position.copy(original);
            // Reset rotation
            const direction = new THREE.Vector3(original.x, 0, original.z).normalize();
            const lookAtPoint = new THREE.Vector3(
                original.x + direction.x * 10,
                original.y,
                original.z + direction.z * 10
            );
            photo.mesh.lookAt(lookAtPoint);
        }
    });

    // Sort by distance and take top 8
    visiblePhotos.sort((a, b) => a.distance - b.distance);
    const topPhotos = visiblePhotos.slice(0, 8);
    const topIndices = new Set(topPhotos.map(p => p.index));

    // Update UI with top photos
    updatePhotoUI(topPhotos.map(p => p.data));

    // Update borders - highlight top 8 with pulse effect (keep white)
    photoData.forEach((photo, index) => {
        if (photo.borderMesh) {
            const isSelected = topIndices.has(index);
            if (isSelected) {
                // Keep white frame, just add pulse effect
                photo.borderMesh.material.color.setHex(0xffffff);
                const pulseSpeed = 2.5;
                const pulse = Math.sin(time * pulseSpeed) * 0.15 + 0.85;
                photo.borderMesh.material.opacity = pulse;
            } else {
                // Normal white frame color
                photo.borderMesh.material.color.setHex(0xffffff);
                photo.borderMesh.material.opacity = 0.9;
            }
        }
    });
}

function updatePhotoUI(photos) {
    // Dispatch event with array of top photos
    const event = new CustomEvent('centerPhotoChanged', {
        detail: photos
    });
    window.dispatchEvent(event);
}

export function getPhotoData() {
    return photoData;
}

export function getCurrentCenterPhoto() {
    return currentCenterPhotoIndex >= 0 ? photoData[currentCenterPhotoIndex] : null;
}

export function regeneratePhotosScatter(shapeType) {
    const count = photoData.length;
    // Generate points specifically for photos (reuse shape generator)
    const newPositions = generateShapePoints(shapeType, count);

    // Shuffle
    for (let i = newPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newPositions[i], newPositions[j]] = [newPositions[j], newPositions[i]];
    }

    for (let i = 0; i < count; i++) {
        if (newPositions[i]) {
            photoData[i].scatteredPos.set(
                newPositions[i].x,
                newPositions[i].y,
                newPositions[i].z
            );
        }
    }
}
