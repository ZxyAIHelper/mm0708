import { STATE, VisualParams } from '../core/config.js';
import { ShapeType } from '../shapes/index.js';
import { resetGalleryState } from '../tree/photos.js';

export const DebugState = {
    isScattered: false,
    scatterProgress: 0,
    animating: false,
    cooldown: false,
    currentShape: ShapeType.STARS,
    shapePoints: null,
    onShapeChange: null
};

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function setShapeActive(targetShape, isActive) {
    if (DebugState.animating || DebugState.cooldown) return;

    const isCurrentlyScattered = DebugState.isScattered && DebugState.scatterProgress > 0.9;

    if (!isActive) {
        if (!DebugState.isScattered) return;
        DebugState.isScattered = false;
        // Reset speed when returning to tree
        setRotationSpeed(VisualParams.baseRotationSpeed);
        // Return to Gallery Mode after a delay
        setTimeout(() => {
            STATE.presentationMode = 'GALLERY';
        }, 3000); // 3 second delay
        animateTransition(STATE.time, DebugState.scatterProgress, 0);
        return;
    }

    // Activating a shape - switch to INTERACTION mode and reset gallery
    STATE.presentationMode = 'INTERACTION';
    resetGalleryState(); // Stop and reset any ongoing gallery animation

    // Set fast speed when entering any shape
    setRotationSpeed(VisualParams.animRotationSpeed);

    if (DebugState.currentShape !== targetShape) {
        DebugState.currentShape = targetShape;
        if (DebugState.onShapeChange) DebugState.onShapeChange(targetShape);
        import('../core/audio.js').then(m => m.audioManager.playSFX(targetShape));

        if (isCurrentlyScattered) {
            animateMorph(STATE.time);
        } else {
            DebugState.isScattered = true;
            animateTransition(STATE.time, DebugState.scatterProgress, 1);
        }
        return;
    }

    if (!DebugState.isScattered) {
        DebugState.isScattered = true;
        animateTransition(STATE.time, DebugState.scatterProgress, 1);
    }
}

function animateTransition(startTime, startProgress, endProgress) {
    DebugState.animating = true;
    // Speed control is now handled in setShapeActive
    const duration = 2.0;

    function loop() {
        const elapsed = STATE.time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(t);

        DebugState.scatterProgress = startProgress + (endProgress - startProgress) * eased;

        if (t < 1) {
            requestAnimationFrame(loop);
        } else {
            DebugState.animating = false;
            // setRotationSpeed(VisualParams.baseRotationSpeed); // REMOVED: Keep fast speed
            DebugState.scatterProgress = endProgress;
            updateButtons();
            DebugState.cooldown = true;
            setTimeout(() => { DebugState.cooldown = false; }, 500);
        }
    }
    loop();
}

function animateMorph(startTime) {
    DebugState.animating = true;
    // Speed control is now handled in setShapeActive
    const duration = 1.5;

    function loop() {
        const elapsed = STATE.time - startTime;
        const t = Math.min(elapsed / duration, 1);
        let progress;
        if (t < 0.3) {
            progress = 1 - (t / 0.3) * 0.7;
        } else {
            const t2 = (t - 0.3) / 0.7;
            progress = 0.3 + easeInOutCubic(t2) * 0.7;
        }

        DebugState.scatterProgress = progress;

        if (t < 1) {
            requestAnimationFrame(loop);
        } else {
            DebugState.animating = false;
            // setRotationSpeed(VisualParams.baseRotationSpeed); // REMOVED: Keep fast speed
            DebugState.scatterProgress = 1;
            updateButtons();
            DebugState.cooldown = true;
            setTimeout(() => { DebugState.cooldown = false; }, 500);
        }
    }
    loop();
}

function updateButtons() {
    document.querySelectorAll('.debug-btn').forEach(b => b.classList.remove('active'));
    if (DebugState.isScattered && DebugState.scatterProgress > 0.5) {
        let btnId = '';
        switch (DebugState.currentShape) {
            case ShapeType.STARS: btnId = 'btn-scatter'; break;
            case ShapeType.TEXT: btnId = 'btn-heart'; break; // TEXT shape -> btn-heart
            case ShapeType.STAR: btnId = 'btn-star'; break;
            // HEART shape removed - no longer used
        }
        const btn = document.getElementById(btnId);
        if (btn) btn.classList.add('active');
    }
}

function animateToShape(targetShape, btn) {
    const isSameShape = DebugState.currentShape === targetShape;
    const isProcessedActive = DebugState.isScattered;
    if (isSameShape && isProcessedActive) {
        setShapeActive(targetShape, false);
    } else {
        setShapeActive(targetShape, true);
    }
}

export function initShapeControls() {
    const btnReset = document.getElementById('btn-reset');
    const scatterBtn = document.getElementById('btn-scatter');
    const heartBtn = document.getElementById('btn-heart');
    const starBtn = document.getElementById('btn-star');

    if (btnReset) btnReset.addEventListener('click', () => setShapeActive(DebugState.currentShape, false));
    if (scatterBtn) scatterBtn.addEventListener('click', () => animateToShape(ShapeType.STARS, scatterBtn));
    if (heartBtn) heartBtn.addEventListener('click', () => animateToShape(ShapeType.TEXT, heartBtn)); // TEXT shape
    if (starBtn) starBtn.addEventListener('click', () => animateToShape(ShapeType.STAR, starBtn));
}

// Export rotation control functions
export function setRotationSpeed(speed) {
    import('../core/scene.js').then(m => {
        if (m.controls) {
            m.controls.autoRotateSpeed = speed;
        }
    });
}
window.setRotationSpeed = setRotationSpeed;
