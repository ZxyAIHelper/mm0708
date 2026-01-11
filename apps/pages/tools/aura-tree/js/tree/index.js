import { initElements, updateElements, regenerateElementsScatter } from './ornaments.js';
import { initTopStar, updateTopStar, regenerateTopStarScatter } from './topStar.js';
import { initFoliage, updateFoliage, regenerateFoliageScatter } from './foliage.js';
import { initPhotos, updatePhotos, regeneratePhotosScatter } from './photos.js';
import { generateShapePoints } from '../shapes/index.js';
import { DebugState } from '../ui/index.js';

export async function initTree() {
    initFoliage();   // Tree framework (needle system)
    initElements();  // Tree ornaments (gifts, baubles, lights)
    initTopStar();   // Tree topper
    await initPhotos();    // Photo gallery (async - fetches from API)
}

export function updateTree(time, delta) {
    const scatterAmount = DebugState.scatterProgress;

    updateFoliage(time, delta, scatterAmount);
    updateElements(time, delta, scatterAmount);
    updateTopStar(delta, scatterAmount);
    updatePhotos(time, delta, scatterAmount);
}

export function regenerateTreeScatterPositions(shapeType) {
    // Generate shape points for foliage (7500 particles - matches foliage count)
    const foliagePoints = generateShapePoints(shapeType, 7500);
    regenerateFoliageScatter(foliagePoints);

    // Generate shape points for ornaments (particle count varies)
    regenerateElementsScatter(shapeType);
    regenerateTopStarScatter(shapeType);

    // Generate shape points for photos
    regeneratePhotosScatter(shapeType);
}
