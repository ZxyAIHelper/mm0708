'use strict';

(function (global) {
    const TIER_DEFINITIONS = Object.freeze([
        Object.freeze({
            key: 'top',
            label: '夯',
            color: '#ff8f88',
        }),
        Object.freeze({
            key: 'great',
            label: '顶级',
            color: '#ffb36b',
        }),
        Object.freeze({
            key: 'good',
            label: '人上人',
            color: '#f5d66f',
        }),
        Object.freeze({
            key: 'average',
            label: 'NPC',
            color: '#a9d8ad',
        }),
        Object.freeze({
            key: 'poor',
            label: '拉完了',
            color: '#b8c2cf',
        }),
    ]);
    const SIZES = Object.freeze({
        '3:4': Object.freeze({ width: 1080, height: 1440 }),
        '1:1': Object.freeze({ width: 1080, height: 1080 }),
        '9:16': Object.freeze({ width: 1080, height: 1920 }),
    });

    function canvasSize(ratio) {
        const size = SIZES[ratio] || SIZES['3:4'];
        return { ...size };
    }

    function coverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
        const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
        const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
        const sourceRatio = safeSourceWidth / safeSourceHeight;
        const targetRatio = Math.max(1, targetWidth)
            / Math.max(1, targetHeight);
        if (sourceRatio > targetRatio) {
            const sw = safeSourceHeight * targetRatio;
            return {
                sx: (safeSourceWidth - sw) / 2,
                sy: 0,
                sw,
                sh: safeSourceHeight,
            };
        }
        const sh = safeSourceWidth / targetRatio;
        return {
            sx: 0,
            sy: (safeSourceHeight - sh) / 2,
            sw: safeSourceWidth,
            sh,
        };
    }

    function layoutRanking({ ratio = '3:4', items = [] } = {}) {
        const { width, height } = canvasSize(ratio);
        const labelWidth = Math.round(width * 0.18);
        const rowHeight = height / TIER_DEFINITIONS.length;
        const contentLeft = labelWidth + 18;
        const contentRight = width - 18;
        const contentWidth = contentRight - contentLeft;
        const rows = TIER_DEFINITIONS.map((definition, rowIndex) => {
            const rowItems = items.filter(
                (item) => item.tier === definition.key,
            );
            const columnCount = Math.min(6, Math.max(1, rowItems.length));
            const gridRowCount = Math.max(
                1,
                Math.ceil(rowItems.length / 6),
            );
            const gap = 12;
            const verticalGap = 10;
            const verticalPadding = 12;
            const cardWidth = (
                contentWidth - gap * (columnCount - 1)
            ) / columnCount;
            const cardHeight = (
                rowHeight
                - verticalPadding * 2
                - verticalGap * (gridRowCount - 1)
            ) / gridRowCount;
            const commentHeight = Math.min(
                42,
                Math.max(24, cardHeight * 0.24),
            );
            const y = rowIndex * rowHeight;
            const cards = rowItems.map((item, index) => {
                const column = index % 6;
                const gridRow = Math.floor(index / 6);
                return {
                    ...item,
                    column,
                    gridRow,
                    x: contentLeft + column * (cardWidth + gap),
                    y: y
                        + verticalPadding
                        + gridRow * (cardHeight + verticalGap),
                    width: cardWidth,
                    height: cardHeight,
                    imageHeight: cardHeight - commentHeight,
                    commentHeight,
                };
            });
            return {
                ...definition,
                y,
                height: rowHeight,
                cards,
            };
        });
        return {
            ratio,
            width,
            height,
            labelWidth,
            rows,
        };
    }

    function defaultImageLoader(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('菜品图片加载失败'));
            image.src = source;
        });
    }

    function defaultCanvas() {
        if (typeof document === 'undefined') {
            throw new Error('当前环境无法创建画布');
        }
        return document.createElement('canvas');
    }

    async function renderDishRanking({
        ratio = '3:4',
        dishes = [],
        ranking = { items: [] },
        canvas = defaultCanvas(),
        imageLoader = defaultImageLoader,
    } = {}) {
        const layout = layoutRanking({
            ratio,
            items: ranking?.items || [],
        });
        canvas.width = layout.width;
        canvas.height = layout.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('画布初始化失败');
        context.fillStyle = '#fffdf8';
        context.fillRect(0, 0, layout.width, layout.height);

        const resources = new Map();
        await Promise.all(layout.rows.flatMap((row) => row.cards).map(
            async (card) => {
                const index = Number.isInteger(card.inputIndex)
                    ? card.inputIndex
                    : Number(String(card.refId).replace(/^dish-/, ''));
                const dish = dishes[index];
                if (!dish?.image) {
                    throw new Error(`缺少菜品图片 ${card.refId}`);
                }
                resources.set(
                    card.refId,
                    await imageLoader(dish.image),
                );
            },
        ));

        for (const row of layout.rows) {
            context.fillStyle = row.color;
            context.fillRect(0, row.y, layout.labelWidth, row.height);
            context.fillStyle = '#202126';
            context.font = `700 ${Math.round(
                Math.min(54, row.height * 0.2),
            )}px "Microsoft YaHei", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(
                row.label,
                layout.labelWidth / 2,
                row.y + row.height / 2,
            );
            context.fillStyle = '#eee9df';
            context.fillRect(
                0,
                row.y + row.height - 2,
                layout.width,
                2,
            );

            for (const card of row.cards) {
                const image = resources.get(card.refId);
                const imageWidth = image.naturalWidth || image.width;
                const imageHeight = image.naturalHeight || image.height;
                const crop = coverRect(
                    imageWidth,
                    imageHeight,
                    card.width,
                    card.imageHeight,
                );
                context.save();
                context.beginPath();
                context.rect(
                    card.x,
                    card.y,
                    card.width,
                    card.imageHeight,
                );
                context.clip();
                context.drawImage(
                    image,
                    crop.sx,
                    crop.sy,
                    crop.sw,
                    crop.sh,
                    card.x,
                    card.y,
                    card.width,
                    card.imageHeight,
                );
                context.restore();

                context.fillStyle = '#ffffff';
                context.fillRect(
                    card.x,
                    card.y + card.imageHeight,
                    card.width,
                    card.commentHeight,
                );
                context.fillStyle = '#25262a';
                context.font = `600 ${Math.round(
                    Math.min(28, card.commentHeight * 0.48),
                )}px "Microsoft YaHei", sans-serif`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(
                    card.comment,
                    card.x + card.width / 2,
                    card.y + card.imageHeight + card.commentHeight / 2,
                );
                if (card.owned) {
                    const badgeWidth = Math.min(72, card.width * 0.46);
                    const badgeHeight = Math.min(32, card.imageHeight * 0.2);
                    context.fillStyle = '#ff5b51';
                    context.fillRect(
                        card.x + card.width - badgeWidth,
                        card.y,
                        badgeWidth,
                        badgeHeight,
                    );
                    context.fillStyle = '#ffffff';
                    context.font = `700 ${Math.round(
                        Math.max(12, badgeHeight * 0.48),
                    )}px "Microsoft YaHei", sans-serif`;
                    context.fillText(
                        '自家',
                        card.x + card.width - badgeWidth / 2,
                        card.y + badgeHeight / 2,
                    );
                }
            }
        }
        return canvas;
    }

    async function renderDishRankingDataUrl(options) {
        const canvas = await renderDishRanking(options);
        return canvas.toDataURL('image/png');
    }

    const api = {
        TIER_DEFINITIONS,
        canvasSize,
        coverRect,
        layoutRanking,
        renderDishRanking,
        renderDishRankingDataUrl,
    };
    global.DishRankingRenderer = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
