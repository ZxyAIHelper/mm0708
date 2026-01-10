// Shape generator for scatter patterns
import { CONFIG } from '../core/config.js';

// Generate points for different shapes
export const ShapeType = {
    STARS: 'stars',      // 满天星
    HEART: 'heart',      // 爱心
    STAR: 'star',        // 五角星
    TEXT: 'text'         // 湖贝里
};

// Generate heart shape points
function generateHeartPoints(count) {
    const points = [];
    for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        // Heart parametric equation
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

        // Add some random offset for volume
        const offset = 0.5 + Math.random() * 1.5;
        const angle = Math.random() * Math.PI * 2;

        points.push({
            x: x * 1.2 + Math.cos(angle) * offset,
            y: y * 1.0 + 10 + Math.sin(angle) * offset,  // Center around y=10
            z: (Math.random() - 0.5) * 8
        });
    }
    return points;
}

// Generate 5-pointed star shape
function generateStarPoints(count) {
    const points = [];
    const outerRadius = 20;
    const innerRadius = 8;

    for (let i = 0; i < count; i++) {
        // Distribute points along star edges
        const segment = Math.floor(Math.random() * 10);
        const t = Math.random();

        const angle1 = (segment * Math.PI / 5) - Math.PI / 2;
        const angle2 = ((segment + 1) * Math.PI / 5) - Math.PI / 2;

        const r1 = segment % 2 === 0 ? outerRadius : innerRadius;
        const r2 = segment % 2 === 0 ? innerRadius : outerRadius;

        const x = r1 * Math.cos(angle1) * (1 - t) + r2 * Math.cos(angle2) * t;
        const y = r1 * Math.sin(angle1) * (1 - t) + r2 * Math.sin(angle2) * t;

        // Add some random offset
        const offset = Math.random() * 2;
        const offsetAngle = Math.random() * Math.PI * 2;

        points.push({
            x: x + Math.cos(offsetAngle) * offset,
            y: y + 12 + Math.sin(offsetAngle) * offset,  // Center around y=12
            z: (Math.random() - 0.5) * 6
        });
    }
    return points;
}

// Generate Chinese character "湖贝里" using stroke-based approach
function generateTextPoints(count) {
    const points = [];

    // 1. 定义笔画
    // ★ 修改重点：
    // (1) "湖"字大幅收窄，三个部件(氵,古,月) 靠得更近了。
    // (2) 所有字都重新定义为 "以 x=0 为中心"，这样排版更整齐。
    // 1. Define strokes for "I ❤️ HOOBEI" (scaled: I and HOOBEI at 0.7x, Heart at 2x)
    // Coordinate system: Centered at x=0
    const characters = {
        I: [
            [0, 5.6, 0, -5.6], // Vertical line (0.7x)
            [-1.4, 5.6, 1.4, 5.6], // Top serif (0.7x)
            [-1.4, -5.6, 1.4, -5.6] // Bottom serif (0.7x)
        ],
        HEART: 'FILLED', // Special marker for filled heart (will be denser)
        H: [
            [-2.1, 5.6, -2.1, -5.6], // Left vertical (0.7x)
            [2.1, 5.6, 2.1, -5.6],   // Right vertical (0.7x)
            [-2.1, 0, 2.1, 0]        // Middle horizontal (0.7x)
        ],
        O: [
            [-2.1, 4.2, 2.1, 4.2],   // Top (0.7x)
            [-2.1, -4.2, 2.1, -4.2], // Bottom (0.7x)
            [-2.1, 4.2, -2.1, -4.2], // Left (0.7x)
            [2.1, 4.2, 2.1, -4.2]    // Right (0.7x)
        ],
        B: [
            [-2.1, 5.6, -2.1, -5.6], // Stem (0.7x)
            [-2.1, 5.6, 1.4, 5.6],   // Top horizontal (0.7x)
            [1.4, 5.6, 2.1, 4.9],    // Top curve (0.7x)
            [2.1, 4.9, 2.1, 3.5],    // Top right curve (0.7x)
            [2.1, 3.5, 1.4, 2.8],    // Top to middle curve (0.7x)
            [1.4, 2.8, -2.1, 2.8],   // Middle horizontal (0.7x)
            [-2.1, 2.8, 2.1, 2.8],   // Middle horizontal repeat (0.7x)
            [2.1, 2.8, 2.1, -4.2],   // Bottom right curve (0.7x)
            [2.1, -4.2, 1.4, -5.6],  // Bottom curve (0.7x)
            [1.4, -5.6, -2.1, -5.6]  // Bottom horizontal (0.7x)
        ],
        E: [
            [-2.1, 5.6, -2.1, -5.6],  // Left vertical (0.7x)
            [-2.1, 5.6, 2.1, 5.6],    // Top horizontal (0.7x)
            [-2.1, 0, 1.4, 0],        // Middle horizontal (0.7x)
            [-2.1, -5.6, 2.1, -5.6]   // Bottom horizontal (0.7x)
        ],
        I2: [  // Second I (0.7x)
            [0, 5.6, 0, -5.6],        // Vertical line (0.7x)
            [-1.4, 5.6, 1.4, 5.6],    // Top serif (0.7x)
            [-1.4, -5.6, 1.4, -5.6]   // Bottom serif (0.7x)
        ]
    };

    // 2. Layout configuration - VERTICAL ARRANGEMENT
    // Row 1 (Top): I (y = 20)
    // Row 2 (Middle): ❤️ (y = 10)  
    // Row 3 (Bottom): HOOBEI (y = 0)
    // Heart gets higher weight (appears more times) to make it denser
    const layout = [
        // Row 1: I at top
        { char: 'I', xOffset: 0, yOffset: 20 },
        // Row 2: Heart in middle (3x for density)
        { char: 'HEART', xOffset: 0, yOffset: 10 },
        { char: 'HEART', xOffset: 0, yOffset: 10 }, // Duplicate for density
        { char: 'HEART', xOffset: 0, yOffset: 10 }, // Duplicate for density
        // Row 3: HOOBEI at bottom
        { char: 'H', xOffset: -18, yOffset: 0 },
        { char: 'O', xOffset: -11, yOffset: 0 },
        { char: 'O', xOffset: -4, yOffset: 0 },
        { char: 'B', xOffset: 3, yOffset: 0 },
        { char: 'E', xOffset: 10, yOffset: 0 },
        { char: 'I2', xOffset: 17, yOffset: 0 }
    ];

    // Pre-calculate stroke lengths for each character in layout with optimized caching
    const layoutData = layout.map(item => {
        const strokes = characters[item.char];

        // Special handling for filled heart
        if (strokes === 'FILLED') {
            return { item, strokes, strokeLens: null, totalLen: 1, isFilled: true };
        }

        let totalLen = 0;
        const strokeLens = strokes.map(s => {
            const len = Math.sqrt(Math.pow(s[2] - s[0], 2) + Math.pow(s[3] - s[1], 2));
            totalLen += len;
            return len;
        });
        return { item, strokes, strokeLens, totalLen, isFilled: false };
    });

    for (let i = 0; i < count; i++) {
        // Interleave particles among characters to ensure even distribution and exact count
        const data = layoutData[i % layoutData.length];
        const { item, strokes, strokeLens, totalLen, isFilled } = data;

        let originX, originY;

        if (isFilled) {
            // Generate filled heart using parametric equation and rejection sampling
            let validPoint = false;
            while (!validPoint) {
                const t = Math.random() * Math.PI * 2;
                const r = Math.random();

                // Heart parametric equation (scaled 2x larger)
                const heartX = 16 * Math.pow(Math.sin(t), 3) * 0.8 * r;  // 0.4 * 2 = 0.8
                const heartY = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.7 * r;  // 0.35 * 2 = 0.7

                originX = heartX;
                originY = heartY;
                validPoint = true;
            }
        } else {
            // Original stroke-based logic
            let rand = Math.random() * totalLen;
            let sIdx = 0;

            // Weighted random selection of stroke based on length
            for (let j = 0; j < strokeLens.length; j++) {
                rand -= strokeLens[j];
                if (rand <= 0) {
                    sIdx = j;
                    break;
                }
            }

            const stroke = strokes[sIdx];
            const t = Math.random();

            originX = stroke[0] + (stroke[2] - stroke[0]) * t;
            originY = stroke[1] + (stroke[3] - stroke[1]) * t;
        }

        const noise = (Math.random() - 0.5) * 1.0;
        const angle = Math.random() * Math.PI * 2;

        points.push({
            x: originX + item.xOffset + Math.cos(angle) * noise,
            y: originY + (item.yOffset || 0) + Math.sin(angle) * noise,
            z: (Math.random() - 0.5) * 4,
            // Pink color for heart, white for other letters
            color: isFilled ? { r: 1.0, g: 0.4, b: 0.6 } : { r: 1.0, g: 1.0, b: 1.0 }
        });
    }

    return points;
}

// Generate random starry sky points (original scatter)
function generateStarsPoints(count) {
    const points = [];
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        // Much wider radius to simulate distant stars (skybox feel)
        // Reduced from 150+150 to 40+40, and now to 20+20 to match ornaments
        const radius = 20 + Math.random() * 20;

        points.push({
            x: radius * Math.sin(phi) * Math.cos(theta),
            y: radius * Math.sin(phi) * Math.sin(theta),
            z: radius * Math.cos(phi)
        });
    }
    return points;
}

// Main function to generate shape points
export function generateShapePoints(shapeType, count) {
    switch (shapeType) {
        case ShapeType.HEART:
            return generateHeartPoints(count);
        case ShapeType.STAR:
            return generateStarPoints(count);
        case ShapeType.TEXT:
            return generateTextPoints(count);
        case ShapeType.STARS:
        default:
            return generateStarsPoints(count);
    }
}
