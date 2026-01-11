import { CONFIG } from '../core/config.js';

/**
 * Calculate tree position for a given height ratio and randomization
 */
export function calculateTreePosition(heightRatio) {
    const y = heightRatio * CONFIG.treeHeight;
    const maxRadiusAtHeight = CONFIG.treeBaseRadius * (1 - heightRatio);

    // Place mostly on surface (0.85 to 1.0 of max radius) to act as ornaments
    const r = maxRadiusAtHeight * (0.85 + 0.15 * Math.random());
    const angle = Math.random() * Math.PI * 2;

    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);

    return { x, y, z };
}

/**
 * Get current tree dimensions from config
 */
export function getTreeDimensions() {
    return {
        height: CONFIG.treeHeight,
        baseRadius: CONFIG.treeBaseRadius
    };
}
