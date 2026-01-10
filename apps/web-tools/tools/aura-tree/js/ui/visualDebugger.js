import { VisualParams, STATE } from '../core/config.js';

export function initVisualDebugger() {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '90px';
    container.style.right = '10px';
    container.style.width = '250px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    container.style.padding = '15px';
    container.style.borderRadius = '8px';
    container.style.color = '#fff';
    container.style.fontFamily = 'monospace';
    container.style.zIndex = '1000';
    container.style.border = '1px solid #444';

    const title = document.createElement('div');
    title.innerText = "VISUAL DEBUGGER";
    title.style.borderBottom = '1px solid #666';
    title.style.marginBottom = '10px';
    title.style.paddingBottom = '5px';
    title.style.fontWeight = 'bold';
    title.style.textAlign = 'center';
    container.appendChild(title);

    // Capture Initial Defaults for Reset
    const DefaultParams = JSON.parse(JSON.stringify(VisualParams));

    // Store input references for updating UI on Load/Reset
    const controlsUI = {};

    // Helper to create collapsible groups
    const createGroup = (titleText, isOpen = false) => {
        const group = document.createElement('div');
        group.style.border = '1px solid #555';
        group.style.borderRadius = '4px';
        group.style.marginBottom = '8px';
        group.style.overflow = 'hidden';

        const header = document.createElement('div');
        header.style.backgroundColor = '#333';
        header.style.padding = '5px 10px';
        header.style.cursor = 'pointer';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '12px';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';

        const label = document.createElement('span');
        label.innerText = titleText;

        const icon = document.createElement('span');
        icon.innerText = isOpen ? '▼' : '▶';

        header.appendChild(label);
        header.appendChild(icon);

        const content = document.createElement('div');
        content.style.padding = '10px';
        content.style.display = isOpen ? 'block' : 'none';
        content.style.backgroundColor = 'rgba(0,0,0,0.3)';

        header.addEventListener('click', () => {
            const isVisible = content.style.display === 'block';
            content.style.display = isVisible ? 'none' : 'block';
            icon.innerText = isVisible ? '▶' : '▼';
        });

        group.appendChild(header);
        group.appendChild(content);
        container.appendChild(group);

        return content; // Return content div to append controls to
    };

    // Modified addControl that takes a parent container
    const addControlTo = (parent, label, type, paramKey, min, max, step) => {
        const row = document.createElement('div');
        row.style.marginBottom = '8px';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';

        const lbl = document.createElement('label');
        lbl.innerText = label;
        lbl.style.fontSize = '12px';
        lbl.style.flex = '1';

        let input;
        if (type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = VisualParams[paramKey];
            input.addEventListener('change', (e) => {
                VisualParams[paramKey] = e.target.checked;
                if (window.updateBloom) window.updateBloom(VisualParams);
            });
        } else if (type === 'range') {
            input = document.createElement('input');
            input.type = 'range';
            input.min = min;
            input.max = max;
            input.step = step;
            input.value = VisualParams[paramKey];
            input.style.width = '100px';
            input.addEventListener('input', (e) => {
                VisualParams[paramKey] = parseFloat(e.target.value);

                // Specific updates
                if (window.updateBloom) window.updateBloom(VisualParams);
                if (paramKey === 'sceneOffsetY' && window.updateSceneOffset) {
                    window.updateSceneOffset(VisualParams[paramKey]);
                }
                if (paramKey === 'baseRotationSpeed' && window.setRotationSpeed) {
                    // Only update live if currently in base state (approximated by checking if animating)
                    // Or just force update - setShapeActive will override if needed
                    window.setRotationSpeed(VisualParams[paramKey]);
                }
                if (paramKey === 'animRotationSpeed' && window.setRotationSpeed) {
                    // If currently animating, maybe we want to see it? 
                    // Usually less critical, but we can try
                }
            });
        } else if (type === 'color') {
            input = document.createElement('input');
            input.type = 'color';
            input.value = VisualParams[paramKey];
            input.style.width = '50px';
            input.style.border = 'none';
            input.style.padding = '0';
            input.addEventListener('input', (e) => {
                VisualParams[paramKey] = e.target.value;
            });
        }

        controlsUI[paramKey] = input;
        row.appendChild(lbl);
        row.appendChild(input);
        parent.appendChild(row);
    };

    // SCENE GLOBAL

    // Presentation Modes
    const grpMode = createGroup('Presentation Mode', true);

    // Toggle Buttons
    const modeRow = document.createElement('div');
    modeRow.style.display = 'flex';
    modeRow.style.gap = '5px';
    modeRow.style.marginBottom = '5px';

    const btnInteract = document.createElement('button');
    btnInteract.innerText = "Interaction";
    btnInteract.style.flex = '1';
    btnInteract.onclick = () => { STATE.presentationMode = 'INTERACTION'; };

    const btnGallery = document.createElement('button');
    btnGallery.innerText = "Gallery 3D";
    btnGallery.style.flex = '1';
    btnGallery.onclick = () => { STATE.presentationMode = 'GALLERY'; };

    modeRow.appendChild(btnInteract);
    modeRow.appendChild(btnGallery);
    grpMode.appendChild(modeRow);

    addControlTo(grpMode, 'Gallery Speed (ms)', 'range', 'galleryInterval', 1000, 8000, 500);

    // CAMERA DEBUG
    const cameraDebug = document.createElement('div');
    cameraDebug.style.marginBottom = '10px';
    cameraDebug.style.fontSize = '12px';
    cameraDebug.style.borderBottom = '1px solid #444';
    cameraDebug.style.paddingBottom = '5px';
    cameraDebug.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px;">CAMERA POS</div>
        <div style="display:flex; justify-content:space-between;">
            <span>X: <span id="dbg-cam-x">0</span></span>
            <span>Y: <span id="dbg-cam-y">0</span></span>
            <span>Z: <span id="dbg-cam-z">0</span></span>
        </div>
    `;
    container.appendChild(cameraDebug);

    window.updateDebugCameraInfo = (cam) => {
        const xEl = document.getElementById('dbg-cam-x');
        const yEl = document.getElementById('dbg-cam-y');
        const zEl = document.getElementById('dbg-cam-z');
        if (xEl && yEl && zEl && container.style.display !== 'none') {
            xEl.innerText = cam.position.x.toFixed(1);
            yEl.innerText = cam.position.y.toFixed(1);
            zEl.innerText = cam.position.z.toFixed(1);
        }
    };

    // --- GROUPS ---

    // 1. Scene & Camera
    const grpScene = createGroup('Scene & Camera', true);
    addControlTo(grpScene, 'Scene Y Offset', 'range', 'sceneOffsetY', -50, 50, 1);
    addControlTo(grpScene, 'Bloom Active', 'checkbox', 'bloomEnabled');
    addControlTo(grpScene, 'Bloom Str', 'range', 'bloomStrength', 0, 3, 0.1);
    addControlTo(grpScene, 'Bloom Rad', 'range', 'bloomRadius', 0, 2, 0.1);

    // 2. Animation & Rotation
    const grpAnim = createGroup('Animation & Rotation', true);
    addControlTo(grpAnim, 'Base Speed', 'range', 'baseRotationSpeed', 0.1, 5.0, 0.1);
    addControlTo(grpAnim, 'Anim Speed', 'range', 'animRotationSpeed', 1.0, 20.0, 1.0);

    // 3. Foliage (Snow)
    const grpFoliage = createGroup('Foliage (Snow)');
    addControlTo(grpFoliage, 'Foliage Active', 'checkbox', 'foliageVisible');
    addControlTo(grpFoliage, 'Foliage Size', 'range', 'foliageSize', 0.01, 1.0, 0.01);
    addControlTo(grpFoliage, 'Foliage Opacity', 'range', 'foliageOpacity', 0.1, 1.0, 0.05);
    addControlTo(grpFoliage, 'Foliage Color', 'color', 'foliageColor');

    // 4. Background (Stars)
    const grpBg = createGroup('Background');
    addControlTo(grpBg, 'Bg Stars Active', 'checkbox', 'bgStarsVisible');
    addControlTo(grpBg, 'Bg Stars Size', 'range', 'bgStarsSize', 0.1, 5.0, 0.1);
    addControlTo(grpBg, 'Bg Stars Opacity', 'range', 'bgStarsOpacity', 0, 1, 0.1);
    addControlTo(grpBg, 'Bg Speed', 'range', 'bgStarsSpeed', 0, 5.0, 0.1);

    // 5. Ornaments
    const grpOrn = createGroup('Ornaments');
    addControlTo(grpOrn, 'Active', 'checkbox', 'ornamentsVisible');
    addControlTo(grpOrn, 'Gift Boxes', 'range', 'giftBoxCount', 0, 150, 1);
    addControlTo(grpOrn, 'Baubles', 'range', 'baubleCount', 0, 400, 1);
    addControlTo(grpOrn, 'Lights', 'range', 'lightCount', 0, 600, 1);
    addControlTo(grpOrn, 'Light Expansion', 'range', 'lightExpansion', 0.8, 3.0, 0.1);
    addControlTo(grpOrn, 'Gift Weight', 'range', 'giftWeight', 0.5, 5.0, 0.1);
    addControlTo(grpOrn, 'Bauble Weight', 'range', 'baubleWeight', 0.3, 3.0, 0.1);
    addControlTo(grpOrn, 'Light Weight', 'range', 'lightWeight', 0.1, 1.0, 0.1);

    // 6. Tree Geometry
    const grpGeo = createGroup('Tree Geometry');
    addControlTo(grpGeo, 'Tree Scale', 'range', 'treeScale', 0.1, 2.0, 0.1);
    addControlTo(grpGeo, 'Tree Radius', 'range', 'treeBaseRadius', 1, 20, 0.5);
    addControlTo(grpGeo, 'Tree Height', 'range', 'treeHeight', 5, 40, 0.5);

    // DATA MANAGEMENT
    const sep4 = document.createElement('hr');
    sep4.style.borderColor = '#444';
    container.appendChild(sep4);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '5px';
    btnRow.style.justifyContent = 'space-between';

    const createActionBtn = (text, onClick) => {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.flex = '1';
        btn.style.fontSize = '10px';
        btn.style.padding = '5px 2px';
        btn.style.cursor = 'pointer';
        btn.style.backgroundColor = '#444';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #666';
        btn.style.borderRadius = '4px';
        btn.addEventListener('click', onClick);
        return btn;
    };

    const updateUI = () => {
        for (const [key, input] of Object.entries(controlsUI)) {
            if (input.type === 'checkbox') input.checked = VisualParams[key];
            else input.value = VisualParams[key];
        }
        if (window.updateBloom) window.updateBloom(VisualParams);
    };

    btnRow.appendChild(createActionBtn('SAVE', () => {
        localStorage.setItem('auraTreeConfig', JSON.stringify(VisualParams));
        alert('Configuration Saved!');
    }));

    btnRow.appendChild(createActionBtn('LOAD', () => {
        const data = localStorage.getItem('auraTreeConfig');
        if (data) {
            const saved = JSON.parse(data);
            Object.assign(VisualParams, saved);
            updateUI();
        } else {
            alert('No saved configuration found.');
        }
    }));

    btnRow.appendChild(createActionBtn('RESET', () => {
        if (confirm('Reset to defaults?')) {
            Object.assign(VisualParams, JSON.parse(JSON.stringify(DefaultParams)));
            updateUI();
        }
    }));

    container.appendChild(btnRow);

    container.style.display = 'none';

    const toggleBtn = document.getElementById('btn-debug-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (container.style.display === 'none') {
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        });
    }

    document.body.appendChild(container);
}
