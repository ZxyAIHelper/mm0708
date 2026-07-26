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
    const LAYOUT_CAPACITIES = Object.freeze({
        tier: 12,
        'grid-4': 4,
        'grid-9': 9,
        hero: 5,
        leaderboard: 9,
    });
    const LAYOUT_TITLES = Object.freeze({
        'grid-4': Object.freeze({
            title: '必吃四强',
            subtitle: '精选菜品 · 闭眼点不踩雷',
        }),
        'grid-9': Object.freeze({
            title: '菜品九宫格',
            subtitle: '按推荐顺序排列',
        }),
        hero: Object.freeze({
            title: '今日主推',
            subtitle: '第一名值得优先尝试',
        }),
        leaderboard: Object.freeze({
            title: '必吃 TOP 榜',
            subtitle: '本店菜品推荐顺序',
        }),
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

    function layoutTierRanking({ ratio = '3:4', items = [] } = {}) {
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
            const availableWidth = (
                contentWidth - gap * (columnCount - 1)
            );
            const cardWidth = Math.min(
                232,
                availableWidth / columnCount,
            );
            const availableHeight = (
                rowHeight
                - verticalPadding * 2
                - verticalGap * (gridRowCount - 1)
            );
            const cardHeight = Math.min(
                248,
                availableHeight / gridRowCount,
            );
            const groupHeight = (
                cardHeight * gridRowCount
                + verticalGap * (gridRowCount - 1)
            );
            const groupTop = (
                rowIndex * rowHeight
                + (rowHeight - groupHeight) / 2
            );
            const commentHeight = Math.min(
                42,
                Math.max(24, cardHeight * 0.24),
            );
            const y = rowIndex * rowHeight;
            const cards = rowItems.map((item, index) => {
                const column = index % columnCount;
                const gridRow = Math.floor(index / columnCount);
                const currentRowCount = Math.min(
                    columnCount,
                    rowItems.length - gridRow * columnCount,
                );
                const currentRowWidth = (
                    currentRowCount * cardWidth
                    + gap * (currentRowCount - 1)
                );
                const rowLeft = (
                    contentLeft + (contentWidth - currentRowWidth) / 2
                );
                return {
                    ...item,
                    column,
                    gridRow,
                    x: rowLeft + column * (cardWidth + gap),
                    y: groupTop
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
        const cards = rows.flatMap((row) => row.cards);
        return {
            kind: 'tier',
            ratio,
            width,
            height,
            labelWidth,
            rows,
            cards,
        };
    }

    function layoutRanking(options) {
        return layoutTierRanking(options);
    }

    function resolveLayout(layout) {
        return Object.hasOwn(LAYOUT_CAPACITIES, layout)
            ? layout
            : 'tier';
    }

    function selectRankingItems(layout, items = []) {
        const safeItems = Array.isArray(items) ? items : [];
        const resolved = resolveLayout(layout);
        return safeItems.slice(0, LAYOUT_CAPACITIES[resolved]);
    }

    function makeCard(item, {
        x,
        y,
        width,
        height,
        role = 'standard',
        rank = 0,
    }) {
        const commentHeight = Math.min(
            56,
            Math.max(30, height * 0.17),
        );
        return {
            ...item,
            x,
            y,
            width,
            height,
            imageHeight: height - commentHeight,
            commentHeight,
            role,
            rank,
        };
    }

    function contentFrame(ratio) {
        const { width, height } = canvasSize(ratio);
        const margin = 48;
        const headerHeight = Math.min(
            170,
            Math.max(120, height * 0.1),
        );
        return {
            width,
            height,
            margin,
            headerHeight,
            contentWidth: width - margin * 2,
            contentTop: headerHeight,
            contentHeight: height - headerHeight - margin,
        };
    }

    function layoutGridRanking({
        layout,
        ratio = '3:4',
        items = [],
    }) {
        const frame = contentFrame(ratio);
        const columns = layout === 'grid-4' ? 2 : 3;
        const gap = layout === 'grid-4' ? 20 : 16;
        const maxCardHeight = layout === 'grid-4' ? 500 : 350;
        const cardWidth = (
            frame.contentWidth - gap * (columns - 1)
        ) / columns;
        const rowCount = Math.max(1, Math.ceil(items.length / columns));
        const cardHeight = Math.min(
            maxCardHeight,
            cardWidth * 1.08,
            (
                frame.contentHeight - gap * (rowCount - 1)
            ) / rowCount,
        );
        const groupHeight = (
            cardHeight * rowCount + gap * (rowCount - 1)
        );
        const groupTop = (
            frame.contentTop
            + (frame.contentHeight - groupHeight) / 2
        );
        const cards = items.map((item, index) => {
            const row = Math.floor(index / columns);
            const column = index % columns;
            const rowItemCount = Math.min(
                columns,
                items.length - row * columns,
            );
            const rowWidth = (
                rowItemCount * cardWidth
                + gap * (rowItemCount - 1)
            );
            const rowLeft = (
                frame.margin
                + (frame.contentWidth - rowWidth) / 2
            );
            return makeCard(item, {
                x: rowLeft + column * (cardWidth + gap),
                y: groupTop + row * (cardHeight + gap),
                width: cardWidth,
                height: cardHeight,
                rank: index + 1,
            });
        });
        return {
            kind: layout,
            ratio,
            width: frame.width,
            height: frame.height,
            title: LAYOUT_TITLES[layout].title,
            subtitle: LAYOUT_TITLES[layout].subtitle,
            cards,
        };
    }

    function layoutHeroRanking({
        ratio = '3:4',
        items = [],
    }) {
        const frame = contentFrame(ratio);
        const gap = 20;
        const hero = items[0];
        const smallItems = items.slice(1);
        if (!hero) {
            return {
                kind: 'hero',
                ratio,
                width: frame.width,
                height: frame.height,
                title: LAYOUT_TITLES.hero.title,
                subtitle: LAYOUT_TITLES.hero.subtitle,
                cards: [],
            };
        }
        const smallRows = Math.ceil(smallItems.length / 2);
        let heroHeight = Math.min(
            480,
            frame.contentHeight * (smallRows ? 0.42 : 0.55),
        );
        const heroWidth = Math.min(
            frame.contentWidth * 0.78,
            760,
        );
        let smallHeight = 0;
        if (smallRows) {
            smallHeight = Math.min(
                320,
                (
                    frame.contentHeight
                    - heroHeight
                    - gap
                    - gap * (smallRows - 1)
                ) / smallRows,
            );
        }
        if (smallRows && smallHeight < 110) {
            heroHeight -= (110 - smallHeight) * smallRows;
            smallHeight = 110;
        }
        const groupHeight = (
            heroHeight
            + (smallRows ? gap : 0)
            + smallHeight * smallRows
            + gap * Math.max(0, smallRows - 1)
        );
        const groupTop = (
            frame.contentTop
            + (frame.contentHeight - groupHeight) / 2
        );
        const cards = [makeCard(hero, {
            x: (frame.width - heroWidth) / 2,
            y: groupTop,
            width: heroWidth,
            height: heroHeight,
            role: 'hero',
            rank: 1,
        })];
        if (smallRows) {
            const smallWidth = (
                frame.contentWidth - gap
            ) / 2;
            const smallTop = groupTop + heroHeight + gap;
            for (
                let index = 0;
                index < smallItems.length;
                index += 1
            ) {
                const row = Math.floor(index / 2);
                const column = index % 2;
                const rowItemCount = Math.min(
                    2,
                    smallItems.length - row * 2,
                );
                const rowWidth = (
                    rowItemCount * smallWidth
                    + gap * (rowItemCount - 1)
                );
                const rowLeft = (
                    frame.margin
                    + (frame.contentWidth - rowWidth) / 2
                );
                cards.push(makeCard(smallItems[index], {
                    x: rowLeft + column * (smallWidth + gap),
                    y: smallTop + row * (smallHeight + gap),
                    width: smallWidth,
                    height: smallHeight,
                    rank: index + 2,
                }));
            }
        }
        return {
            kind: 'hero',
            ratio,
            width: frame.width,
            height: frame.height,
            title: LAYOUT_TITLES.hero.title,
            subtitle: LAYOUT_TITLES.hero.subtitle,
            cards,
        };
    }

    function layoutLeaderboardRanking({
        ratio = '3:4',
        items = [],
    }) {
        const frame = contentFrame(ratio);
        const gap = 18;
        const sectionGap = 24;
        const columns = 3;
        const topItems = items.slice(0, 3);
        const remaining = items.slice(3);
        const remainingRows = Math.ceil(remaining.length / columns);
        const topHeight = Math.min(
            360,
            frame.contentHeight * (remainingRows ? 0.38 : 0.58),
        );
        const cardWidth = (
            frame.contentWidth - gap * (columns - 1)
        ) / columns;
        const remainingHeight = remainingRows
            ? Math.min(
                280,
                (
                    frame.contentHeight
                    - topHeight
                    - sectionGap
                    - gap * (remainingRows - 1)
                ) / remainingRows,
            )
            : 0;
        const groupHeight = (
            topHeight
            + (remainingRows ? sectionGap : 0)
            + remainingHeight * remainingRows
            + gap * Math.max(0, remainingRows - 1)
        );
        const groupTop = (
            frame.contentTop
            + (frame.contentHeight - groupHeight) / 2
        );
        const topRowWidth = (
            topItems.length * cardWidth
            + gap * Math.max(0, topItems.length - 1)
        );
        const topRowLeft = (
            frame.margin
            + (frame.contentWidth - topRowWidth) / 2
        );
        const cards = topItems.map((item, index) => {
            const offset = index === 0 ? 0 : 28;
            return makeCard(item, {
                x: topRowLeft + index * (cardWidth + gap),
                y: groupTop + offset,
                width: cardWidth,
                height: topHeight - offset,
                role: 'podium',
                rank: index + 1,
            });
        });
        const remainingTop = groupTop + topHeight + sectionGap;
        for (let index = 0; index < remaining.length; index += 1) {
            const row = Math.floor(index / columns);
            const column = index % columns;
            const rowItemCount = Math.min(
                columns,
                remaining.length - row * columns,
            );
            const rowWidth = (
                rowItemCount * cardWidth
                + gap * (rowItemCount - 1)
            );
            const rowLeft = (
                frame.margin
                + (frame.contentWidth - rowWidth) / 2
            );
            cards.push(makeCard(remaining[index], {
                x: rowLeft + column * (cardWidth + gap),
                y: remainingTop + row * (remainingHeight + gap),
                width: cardWidth,
                height: remainingHeight,
                rank: index + 4,
            }));
        }
        return {
            kind: 'leaderboard',
            ratio,
            width: frame.width,
            height: frame.height,
            title: LAYOUT_TITLES.leaderboard.title,
            subtitle: LAYOUT_TITLES.leaderboard.subtitle,
            cards,
        };
    }

    function layoutDishRanking({
        layout = 'tier',
        ratio = '3:4',
        items = [],
    } = {}) {
        const resolved = resolveLayout(layout);
        const selected = selectRankingItems(resolved, items);
        if (resolved === 'tier') {
            return layoutTierRanking({ ratio, items: selected });
        }
        if (resolved === 'grid-4' || resolved === 'grid-9') {
            return layoutGridRanking({
                layout: resolved,
                ratio,
                items: selected,
            });
        }
        if (resolved === 'hero') {
            return layoutHeroRanking({ ratio, items: selected });
        }
        return layoutLeaderboardRanking({
            ratio,
            items: selected,
        });
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

    function drawLayoutHeader(context, layout) {
        context.fillStyle = '#25262a';
        context.font =
            '800 58px "Microsoft YaHei", sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(layout.title, layout.width / 2, 54);
        context.fillStyle = '#776f68';
        context.font =
            '500 25px "Microsoft YaHei", sans-serif';
        context.fillText(layout.subtitle, layout.width / 2, 98);
    }

    function drawTierRails(context, layout) {
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
        }
    }

    function drawCard(context, card, image, showRank) {
        const imageWidth = image.naturalWidth || image.width;
        const imageHeight = image.naturalHeight || image.height;
        const crop = coverRect(
            imageWidth,
            imageHeight,
            card.width,
            card.imageHeight,
        );
        context.fillStyle = '#eadfd5';
        context.fillRect(
            card.x - 3,
            card.y - 3,
            card.width + 6,
            card.height + 6,
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
            Math.min(28, card.commentHeight * 0.66),
        )}px "Microsoft YaHei", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(
            card.comment,
            card.x + card.width / 2,
            card.y + card.imageHeight + card.commentHeight / 2,
        );
        if (showRank && card.rank) {
            const rankSize = Math.min(
                54,
                card.width * 0.2,
                card.imageHeight * 0.22,
            );
            const rankColors = {
                1: '#f2c94c',
                2: '#c8cdd4',
                3: '#d69b6a',
            };
            context.fillStyle = rankColors[card.rank] || '#292a2e';
            context.fillRect(
                card.x,
                card.y,
                rankSize,
                rankSize,
            );
            context.fillStyle = card.rank === 1
                ? '#352500'
                : '#ffffff';
            context.font = `800 ${Math.round(
                Math.max(15, rankSize * 0.48),
            )}px "Microsoft YaHei", sans-serif`;
            context.fillText(
                String(card.rank),
                card.x + rankSize / 2,
                card.y + rankSize / 2,
            );
        }
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

    async function renderDishRanking({
        layout = 'tier',
        ratio = '3:4',
        dishes = [],
        ranking = { items: [] },
        canvas = defaultCanvas(),
        imageLoader = defaultImageLoader,
    } = {}) {
        const layoutResult = layoutDishRanking({
            layout,
            ratio,
            items: ranking?.items || [],
        });
        canvas.width = layoutResult.width;
        canvas.height = layoutResult.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('画布初始化失败');
        context.fillStyle = '#fffdf8';
        context.fillRect(
            0,
            0,
            layoutResult.width,
            layoutResult.height,
        );

        const resources = new Map();
        await Promise.all(layoutResult.cards.map(
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

        if (layoutResult.kind === 'tier') {
            drawTierRails(context, layoutResult);
        } else {
            drawLayoutHeader(context, layoutResult);
        }
        for (const card of layoutResult.cards) {
            drawCard(
                context,
                card,
                resources.get(card.refId),
                layoutResult.kind !== 'tier',
            );
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
        layoutDishRanking,
        layoutRanking,
        selectRankingItems,
        renderDishRanking,
        renderDishRankingDataUrl,
    };
    global.DishRankingRenderer = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
