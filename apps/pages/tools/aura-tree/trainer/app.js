
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

let pose;
let isRecording = false;
let currentLabel = '';
let collectedData = [];

// Counts
const counts = {
    neutral: 0,
    stars: 0,
    heart: 0,
    star: 0,
    fly: 0
};

// UI Elements
const countSpans = {
    neutral: document.getElementById('count-neutral'),
    stars: document.getElementById('count-stars'),
    heart: document.getElementById('count-heart'),
    star: document.getElementById('count-star'),
    fly: document.getElementById('count-fly')
};
const btnDownload = document.getElementById('btn-download');

// Setup Buttons
document.querySelectorAll('.label-btn').forEach(btn => {
    btn.addEventListener('mousedown', () => startRecording(btn.dataset.label, btn));
    btn.addEventListener('mouseup', () => stopRecording(btn));
    btn.addEventListener('mouseleave', () => stopRecording(btn));

    // Touch support
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(btn.dataset.label, btn); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(btn); });
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm("Clear all collected data?")) {
        collectedData = [];
        Object.keys(counts).forEach(k => counts[k] = 0);
        updateUI();
    }
});

document.getElementById('btn-download').addEventListener('click', () => {
    const dataStr = JSON.stringify(collectedData);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gesture_data.json';
    a.click();
});

function startRecording(label, btnElement) {
    currentLabel = label;
    isRecording = true;
    btnElement.classList.add('recording');
}

function stopRecording(btnElement) {
    isRecording = false;
    currentLabel = '';
    btnElement.classList.remove('recording');
}

function updateUI() {
    Object.keys(counts).forEach(key => {
        countSpans[key].textContent = counts[key];
    });
    btnDownload.disabled = collectedData.length === 0;
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
            { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks,
            { color: '#FF0000', lineWidth: 2 });

        if (isRecording && currentLabel) {
            // Flatten landmarks to simple array [x, y, z, v, x, y, z, v...]
            // Or keep object structure. Let's flatten for efficiency usually, but objects are easier to debug.
            // Let's store compact objects: { x, y, z, visibility }

            // We only need 33 landmarks
            const landmarks = results.poseLandmarks.map(lm => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                v: lm.visibility
            }));

            collectedData.push({
                label: currentLabel,
                data: landmarks
            });

            counts[currentLabel]++;
            updateUI();
        }
    }
    canvasCtx.restore();
}

// MediaPipe Setup
pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
pose.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480
});
camera.start();
