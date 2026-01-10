import { STATE } from './core/config.js';
import { controls, scene } from './core/scene.js';
import { setShapeActive, DebugState } from './ui/index.js';
import { ShapeType } from './shapes/index.js';

const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementById('skeleton-canvas');
const canvasCtx = canvasElement.getContext('2d');
const gestureText = document.getElementById('gesture-text');

// Load KNN Data
import { knn } from './knn.js';
knn.load('assets/model/gesture_data.json');

function onResults(results) {
    if (!results.poseLandmarks) return;

    // 1. Draw Skeleton Debug View
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (window.drawConnectors && window.drawLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
            { color: 'rgba(255, 255, 255, 0.5)', lineWidth: 2 });
        drawLandmarks(canvasCtx, results.poseLandmarks,
            { color: '#ffd700', lineWidth: 1, radius: 2 });
    }
    canvasCtx.restore();

    // 2. Logic Gates
    if (DebugState.animating) {
        updateDebugText("⏳ 动画中...");
        return;
    }
    if (DebugState.cooldown) {
        updateDebugText("⏳ 冷却中...");
        return;
    }

    const lm = results.poseLandmarks;
    // Key landmarks aliases
    const nose = lm[0];
    const leftEye = lm[2];
    const rightEye = lm[5];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftElbow = lm[13];
    const rightElbow = lm[14];
    const leftWrist = lm[15];
    const rightWrist = lm[16];

    // Visibility check
    if (leftWrist.visibility < 0.5 || rightWrist.visibility < 0.5) return;

    let detectedGesture = null;
    let uiText = "📷 请摆出姿势...";

    // Metrics
    const wristDist = Math.sqrt(Math.pow(leftWrist.x - rightWrist.x, 2) + Math.pow(leftWrist.y - rightWrist.y, 2));
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x); // Normalization scale

    // Y-Levels (Lower value is HIGHER on screen)
    // Head level approx: nose.y
    // Shoulder level: (leftShoulder.y + rightShoulder.y) / 2

    // 1. STAR (🫡 Salute): Right hand near Right Eye/Ear, Left hand down
    const isSalute = () => {
        const rightHandUp = rightWrist.y < rightShoulder.y;
        const leftHandDown = leftWrist.y > leftShoulder.y;
        // Check proximity to right eye/ear area
        const distToEye = Math.sqrt(Math.pow(rightWrist.x - rightEye.x, 2) + Math.pow(rightWrist.y - rightEye.y, 2));

        return rightHandUp && leftHandDown && distToEye < (shoulderWidth * 0.8);
    };

    // 2. HANDS UP (🙌): Both hands raised above shoulders (diagonal/upward)
    const isHandsUp = () => {
        // Both wrists above shoulders (relaxed threshold)
        // Y coordinate: lower value = higher position on screen
        const leftHandUp = leftWrist.y < leftShoulder.y - 0.1; // 10% margin above shoulder
        const rightHandUp = rightWrist.y < rightShoulder.y - 0.1;

        // Optional: Check that hands are not too low (at least near head level)
        // This allows diagonal/upward gestures while filtering out T-pose
        const avgEyeY = (leftEye.y + rightEye.y) / 2;
        const reasonablyHigh = (leftWrist.y < avgEyeY + 0.15) || (rightWrist.y < avgEyeY + 0.15);

        return leftHandUp && rightHandUp && reasonablyHigh;
    };

    // 3. STARS (👐 T-Pose): Arms spread wide, level with shoulders
    const isTPose = () => {
        // Vertical check: Wrists roughly at shoulder level (+/- tolerance)
        const leftLevel = Math.abs(leftWrist.y - leftShoulder.y) < 0.2;
        const rightLevel = Math.abs(rightWrist.y - rightShoulder.y) < 0.2;
        // Horizontal check: Wrists far from shoulders
        const leftSpread = (leftWrist.x - leftShoulder.x) > 0.1; // Note: X direction varies by mirror?
        // MediaPipe X: 0 left, 1 right. Left Shoulder X > Right Shoulder X ? 
        // Usually Left Shoulder is e.g. 0.6, Left Wrist should be 0.8 (larger).
        // Let's use simpler absolute distance from center body.

        const wristSpan = Math.abs(leftWrist.x - rightWrist.x);
        const wideArms = wristSpan > (shoulderWidth * 2.5); // Arms much wider than shoulders

        return leftLevel && rightLevel && wideArms;
    };

    // 4. TILT (🤸 Body Tilt): Lean body left/right to control rotation
    const isTilt = () => {
        // Calculate shoulder tilt using Y-coordinate difference
        const shoulderYDiff = leftShoulder.y - rightShoulder.y;

        // Normalize by shoulder width to get tilt angle (relative measure)
        const tiltAmount = shoulderYDiff / shoulderWidth;

        // Threshold to avoid false positives from natural body movement
        const tiltThreshold = 0.15; // About 15% of shoulder width

        if (Math.abs(tiltAmount) < tiltThreshold) {
            return { detected: false, direction: 0, speed: 0 };
        }

        // Calculate rotation speed based on tilt amount
        // Tilt range: -1.0 (lean left) to +1.0 (lean right)
        // Rotation speed: -5.0 (CCW) to +5.0 (CW) - doubled for faster response
        const maxRotationSpeed = 270.0;
        const rotationSpeed = Math.sign(tiltAmount) * Math.min(Math.abs(tiltAmount) * 10, maxRotationSpeed);

        return {
            detected: true,
            direction: Math.sign(tiltAmount), // -1 = left, +1 = right
            speed: rotationSpeed,
            tiltAmount: tiltAmount
        };
    };


    // Priority Check
    if (isHandsUp()) {
        detectedGesture = ShapeType.TEXT;
        uiText = "🙌 举手 (湖贝里)";
    }
    else if (isSalute()) {
        detectedGesture = ShapeType.STAR;
        uiText = "🫡 敬礼 (Star)";
    }
    else {
        const tiltResult = isTilt();
        /*
        // DISABLED: Body tilt rotation control
        if (tiltResult.detected) {
            // Don't set detectedGesture - tilt only controls rotation, not shape
            const direction = tiltResult.direction < 0 ? '⬅️' : '➡️';
            const intensity = Math.abs(tiltResult.tiltAmount) > 0.3 ? '快速' : '慢速';
            uiText = `🤸 倾斜 ${direction} ${intensity}旋转`;

            // Control rotation speed based on body tilt
            import('./ui/controls.js').then(m => {
                m.setRotationSpeed(tiltResult.speed);
            });
        }
        else */ if (isTPose()) {
            detectedGesture = ShapeType.STARS;
            uiText = "👐 平举 (Stars)";
        }
    }


    // -------------------------------------------------------------
    // EXECUTE
    // -------------------------------------------------------------

    updateDebugText(uiText, !!detectedGesture);

    if (detectedGesture) {
        setShapeActive(detectedGesture, true);
    } else {
        // Auto-Revert if Neutral (Hands Down)
        if (leftWrist.y > leftShoulder.y + 0.1 && rightWrist.y > rightShoulder.y + 0.1) {
            setShapeActive(ShapeType.STARS, false);
        }
    }
}

function updateDebugText(text, isActive = false) {
    if (!gestureText) return;
    gestureText.textContent = text;

    const container = document.getElementById('gesture-debug');
    if (container) {
        container.style.opacity = '1';
        if (isActive) {
            container.style.borderColor = 'rgba(255, 215, 0, 0.8)';
            container.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.3)';
        } else {
            container.style.borderColor = 'rgba(255, 215, 0, 0.3)';
            container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
        }
    }
}

// MediaPipe Pose Global Wrapper
const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
pose.onResults(onResults);

export const startCamera = async () => {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasWebcam = devices.some(device => device.kind === 'videoinput');
        if (!hasWebcam) return;

        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await pose.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });

        await camera.start();
    } catch (err) {
        console.warn("Camera init error:", err);
    }
};
