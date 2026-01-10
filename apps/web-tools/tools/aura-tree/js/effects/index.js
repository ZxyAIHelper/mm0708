import { initShimmer, updateShimmer } from './shimmer.js';
import { initBgStars, updateBgStars } from './bgStars.js';

export function initEffects() {
    initShimmer();
    initBgStars();
}

export function updateEffects(time, delta, scatterAmount) {
    updateShimmer(time, delta, scatterAmount);
    updateBgStars(time, delta);
}
