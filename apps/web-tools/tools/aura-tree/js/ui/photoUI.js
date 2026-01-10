// Photo UI Controller - Handles UI display
import { camera } from '../core/scene.js';

let currentPhotoData = [];
const photoViewer = document.getElementById('photo-viewer');
// Reuse existing container but clear content
const photoContainer = document.querySelector('.photo-container') || photoViewer;

export function initPhotoUI() {
    // Listen for center photo changes
    window.addEventListener('centerPhotoChanged', handlePhotoChange);

    // Ensure container has horizontal grid styling
    photoViewer.style.display = 'grid';
    photoViewer.style.gridTemplateColumns = 'repeat(8, 1fr)';
    photoViewer.style.gridTemplateRows = '1fr';
    photoViewer.style.gap = '15px';
    photoViewer.style.padding = '20px 40px'; // More horizontal padding
    photoViewer.style.width = '100%';
    // photoViewer.style.height = '100%'; // REMOVED: Caused layout to fill screen
    photoViewer.style.maxWidth = 'none';
    photoViewer.style.maxHeight = 'none';

    // Clear default content structure if it exists
    photoViewer.innerHTML = '';
}

function handlePhotoChange(event) {
    const newPhotos = event.detail; // Expecting array of photos

    if (!newPhotos || newPhotos.length === 0) {
        photoViewer.classList.add('hidden');
        return;
    }

    // USER REQUIREMENT: Hide 2D UI in both Gallery and new Interaction modes
    // But maybe we want to keep it capable for debugging? 
    // Let's check config, or just hide it css-wise by default and not show it.
    // The user said: "Interaction mode... UI won't show pictures".
    // Effectively, we can just stop rendering or hide the container.
    // But let's check a global flag or just comment it out?
    // Better: Add a check for a visual param or state.

    // For now, let's force hide it to see if that meets the "clean" requirement.
    // Or simpler: don't remove 'hidden' class.

    // photoViewer.classList.remove('hidden'); // DISABLED 2D UI
    photoViewer.classList.add('hidden'); // FORCE HIDDEN
}

function renderPhotoGrid(photos) {
    // Clear current content
    photoViewer.innerHTML = '';

    photos.forEach(photo => {
        const item = document.createElement('div');
        item.className = 'photo-grid-item';
        item.style.position = 'relative';
        item.style.overflow = 'hidden';
        item.style.borderRadius = '8px';
        item.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        item.style.border = '2px solid #ffd700';
        item.style.aspectRatio = '1';

        const img = document.createElement('img');
        img.src = photo.filename;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.display = 'block';

        const label = document.createElement('div');
        label.textContent = photo.index + 1; // Show index number
        label.style.position = 'absolute';
        label.style.bottom = '5px';
        label.style.right = '5px';
        label.style.background = 'rgba(0,0,0,0.6)';
        label.style.color = 'white';
        label.style.padding = '2px 6px';
        label.style.borderRadius = '4px';
        label.style.fontSize = '12px';

        item.appendChild(img);
        item.appendChild(label);
        photoViewer.appendChild(item);
    });
}
