export const CONFIG = {
    particleCount: 1000,
    treeHeight: 22,
    treeBaseRadius: 9,
    bloomStrength: 1.5,
    bloomRadius: 0.85,
    bloomThreshold: 0.4,
    cameraPosition: { x: 60, y: 30, z: 10 },
    // Scene Offset
    sceneOffsetY: -5
};

export const STATE = {
    mode: 'ASSEMBLE', // 'ASSEMBLE' or 'EXPLODE'
    handsUp: false,
    handsClose: false,
    handsUp: false,
    handsClose: false,
    time: 0,
    // Modes: 'INTERACTION' (default), 'GALLERY'
    presentationMode: 'GALLERY' // Default to Gallery Mode
};

// Mutable Visual State for Debugging
export const VisualParams = {
    // Global Bloom
    bloomEnabled: true,
    bloomStrength: 1.5,
    bloomRadius: 0.85,
    bloomThreshold: 0.4,

    // Background Stars (Layer 2)
    bgStarsVisible: true,
    bgStarsSize: 1.5,
    bgStarsOpacity: 0.9,
    bgStarsSpeed: 1.0,

    // Foliage (Tree Needles - Framework)
    foliageVisible: true,
    foliageSize: 0.7,  // Doubled for more prominent snow effect
    foliageOpacity: 0.95,  // Very bright
    foliageColor: '#ffffff', // Snowy white

    // Ornaments (Decorations with Physics Weights)
    ornamentsVisible: true,
    treeScale: 1.0,

    // Ornament Counts
    giftBoxCount: 100,  // Heavy ornaments
    baubleCount: 300,   // Light ornaments
    lightCount: 600,    // Very light ornaments (increased)

    // Light Expansion
    lightExpansion: 1.8, // How far lights extend from tree (2.2 = 120% outward, doubled)

    // Physics Weights
    giftWeight: 3.0,
    baubleWeight: 1.0,
    lightWeight: 0.3,

    // Tree Geometry
    treeBaseRadius: 9,
    treeHeight: 22,

    // Photos
    photosVisible: true,

    // Rotation Control
    baseRotationSpeed: 0.5,
    animRotationSpeed: 10.0,  // Fast rotation during animations

    // Gallery Mode
    galleryInterval: 3000 // ms per photo
};
