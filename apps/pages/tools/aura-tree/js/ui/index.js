export { DebugState, setShapeActive, initShapeControls } from './controls.js';
export { initVisualDebugger } from './visualDebugger.js';

export async function initDebugControls() {
    const { initShapeControls } = await import('./controls.js');
    const { initVisualDebugger } = await import('./visualDebugger.js');

    initShapeControls();
    initVisualDebugger();
}
