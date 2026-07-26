'use strict';

(function (global) {
    const DEFAULT_WIDTH = 1080;
    const DEFAULT_HEIGHT = 1920;
    const TOP_CONTENT = 300;
    const BOTTOM_SAFE = 160;
    const MESSAGE_GAP = 26;
    const AVATAR_SIZE = 88;
    const TEXT_LINE_HEIGHT = 52;
    const TEXT_PADDING_X = 28;
    const TEXT_PADDING_Y = 24;
    const TEXT_MAX_WIDTH = 680;

    function wrapMessageText(text, maxWidth, measureText) {
        const characters = Array.from(String(text || ''));
        const lines = [];
        let line = '';
        for (const character of characters) {
            const candidate = `${line}${character}`;
            if (line && measureText(candidate) > maxWidth) {
                lines.push(line);
                line = character;
            } else {
                line = candidate;
            }
        }
        if (line || lines.length === 0) lines.push(line);
        return lines;
    }

    function imageSize(asset) {
        const width = Math.max(1, Number(asset?.width) || 1);
        const height = Math.max(1, Number(asset?.height) || 1);
        const ratio = width / height;
        if (ratio < 0.8) {
            return { width: 360, height: 520 };
        }
        const targetWidth = 520;
        return {
            width: targetWidth,
            height: Math.max(
                280,
                Math.min(440, Math.round(targetWidth / ratio)),
            ),
        };
    }

    function layoutChat({
        width = DEFAULT_WIDTH,
        height = DEFAULT_HEIGHT,
        contactName = '好友',
        messages = [],
        measureText = (text) => Array.from(text).length * 34,
        assets = {},
    }) {
        let y = TOP_CONTENT;
        const items = [];
        for (const message of messages) {
            let itemWidth;
            let itemHeight;
            let lines = null;
            if (message.type === 'text') {
                lines = wrapMessageText(
                    message.text,
                    TEXT_MAX_WIDTH - TEXT_PADDING_X * 2,
                    measureText,
                );
                const measured = Math.max(
                    ...lines.map((line) => measureText(line)),
                    40,
                );
                itemWidth = Math.min(
                    TEXT_MAX_WIDTH,
                    measured + TEXT_PADDING_X * 2,
                );
                itemHeight = (
                    lines.length * TEXT_LINE_HEIGHT
                    + TEXT_PADDING_Y * 2
                );
            } else if (message.type === 'image_ref') {
                const size = imageSize(assets[message.refId]);
                itemWidth = size.width;
                itemHeight = size.height;
            } else {
                itemWidth = 720;
                itemHeight = 300;
            }
            const left = message.side === 'right'
                ? width - 70 - AVATAR_SIZE - 24 - itemWidth
                : 70 + AVATAR_SIZE + 24;
            const item = {
                ...message,
                x: left,
                y,
                width: itemWidth,
                height: itemHeight,
                bottom: y + itemHeight,
                lines,
            };
            items.push(item);
            y = item.bottom + MESSAGE_GAP;
        }
        const safeBottom = height - BOTTOM_SAFE;
        return {
            width,
            height,
            contactName,
            items,
            contentBottom: items.at(-1)?.bottom || TOP_CONTENT,
            safeBottom,
            overflow: items.some((item) => item.bottom > safeBottom),
        };
    }

    function paginateChat(input = {}) {
        const messages = Array.isArray(input.messages)
            ? input.messages
            : [];
        const pages = [];
        let currentMessages = [];
        for (const message of messages) {
            const nextMessages = [...currentMessages, message];
            const nextLayout = layoutChat({
                ...input,
                messages: nextMessages,
            });
            if (currentMessages.length > 0 && nextLayout.overflow) {
                pages.push(layoutChat({
                    ...input,
                    messages: currentMessages,
                }));
                currentMessages = [message];
            } else {
                currentMessages = nextMessages;
            }
        }
        if (currentMessages.length > 0 || pages.length === 0) {
            pages.push(layoutChat({
                ...input,
                messages: currentMessages,
            }));
        }
        const pageCount = pages.length;
        return pages.map((page, index) => ({
            ...page,
            pageNumber: index + 1,
            pageCount,
        }));
    }

    function roundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(
            x + width,
            y + height,
            x,
            y + height,
            r,
        );
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    function drawImageCover(ctx, image, x, y, width, height) {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const scale = Math.max(
            width / sourceWidth,
            height / sourceHeight,
        );
        const cropWidth = width / scale;
        const cropHeight = height / scale;
        const sourceX = (sourceWidth - cropWidth) / 2;
        const sourceY = (sourceHeight - cropHeight) / 2;
        ctx.drawImage(
            image,
            sourceX,
            sourceY,
            cropWidth,
            cropHeight,
            x,
            y,
            width,
            height,
        );
    }

    function drawAvatar(ctx, side, x, y) {
        const color = side === 'left' ? '#f5a66f' : '#6ea9e8';
        roundedRect(ctx, x, y, AVATAR_SIZE, AVATAR_SIZE, 18);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            side === 'left' ? '友' : '我',
            x + AVATAR_SIZE / 2,
            y + AVATAR_SIZE / 2 + 2,
        );
    }

    function drawHeader(ctx, layout) {
        ctx.fillStyle = '#f7f7f7';
        ctx.fillRect(0, 0, layout.width, 230);
        ctx.fillStyle = '#111111';
        ctx.font = '600 34px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('20:43', 54, 54);
        ctx.textAlign = 'center';
        ctx.font = '600 42px sans-serif';
        ctx.fillText(layout.contactName, layout.width / 2, 162);
        ctx.textAlign = 'left';
        ctx.font = '500 58px sans-serif';
        ctx.fillText('‹', 42, 164);
        ctx.textAlign = 'right';
        ctx.font = '600 48px sans-serif';
        ctx.fillText('⋯', layout.width - 48, 153);
        ctx.strokeStyle = '#d9d9d9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 229);
        ctx.lineTo(layout.width, 229);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a5a5a5';
        ctx.font = '400 30px sans-serif';
        ctx.fillText('20:43', layout.width / 2, 268);
    }

    function drawTextMessage(ctx, item) {
        roundedRect(ctx, item.x, item.y, item.width, item.height, 18);
        ctx.fillStyle = item.side === 'right' ? '#95ec69' : '#ffffff';
        ctx.fill();
        ctx.fillStyle = '#171717';
        ctx.font = '400 36px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        item.lines.forEach((line, index) => {
            ctx.fillText(
                line,
                item.x + TEXT_PADDING_X,
                item.y + TEXT_PADDING_Y + index * TEXT_LINE_HEIGHT,
            );
        });
    }

    function drawImageMessage(ctx, item, resources) {
        roundedRect(ctx, item.x, item.y, item.width, item.height, 18);
        ctx.save();
        ctx.clip();
        const image = resources[item.refId];
        if (image) {
            drawImageCover(
                ctx,
                image,
                item.x,
                item.y,
                item.width,
                item.height,
            );
        } else {
            ctx.fillStyle = '#d9d9d9';
            ctx.fillRect(item.x, item.y, item.width, item.height);
        }
        ctx.restore();
    }

    function drawLocationMessage(ctx, item, resources, locations) {
        roundedRect(ctx, item.x, item.y, item.width, item.height, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.save();
        roundedRect(ctx, item.x, item.y, item.width, 178, 18);
        ctx.clip();
        const image = resources[item.refId];
        if (image) {
            drawImageCover(ctx, image, item.x, item.y, item.width, 178);
        } else {
            ctx.fillStyle = '#dce7df';
            ctx.fillRect(item.x, item.y, item.width, 178);
            ctx.fillStyle = '#07c160';
            ctx.beginPath();
            ctx.arc(
                item.x + item.width / 2,
                item.y + 82,
                18,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
        ctx.restore();
        const location = locations[item.refId] || {};
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#1b1b1b';
        ctx.font = '600 35px sans-serif';
        ctx.fillText(
            String(location.name || '已选择位置').slice(0, 18),
            item.x + 26,
            item.y + 194,
        );
        ctx.fillStyle = '#8b8b8b';
        ctx.font = '400 27px sans-serif';
        ctx.fillText(
            String(location.address || '真实地点').slice(0, 32),
            item.x + 26,
            item.y + 244,
        );
    }

    function drawChat(canvas, layout, resources = {}) {
        canvas.width = layout.width;
        canvas.height = layout.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ededed';
        ctx.fillRect(0, 0, layout.width, layout.height);
        drawHeader(ctx, layout);
        const locations = resources.locations || {};
        for (const item of layout.items) {
            const avatarX = item.side === 'right'
                ? layout.width - 70 - AVATAR_SIZE
                : 70;
            drawAvatar(ctx, item.side, avatarX, item.y);
            if (item.type === 'text') {
                drawTextMessage(ctx, item);
            } else if (item.type === 'image_ref') {
                drawImageMessage(ctx, item, resources);
            } else {
                drawLocationMessage(
                    ctx,
                    item,
                    resources,
                    locations,
                );
            }
        }
        return canvas;
    }

    function loadImage(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('图片加载失败'));
            if (/^https?:\/\//i.test(source)) {
                image.crossOrigin = 'anonymous';
            }
            image.src = source;
        });
    }

    function canvasBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('PNG 导出失败'));
            }, 'image/png');
        });
    }

    function outputFileName(
        date = new Date(),
        pageNumber = null,
        pageCount = 1,
    ) {
        const digits = (value) => String(value).padStart(2, '0');
        const pageSuffix = pageCount > 1 && pageNumber
            ? `-${digits(pageNumber)}`
            : '';
        return `微信聊天截图-${
            date.getFullYear()
        }${digits(date.getMonth() + 1)}${digits(date.getDate())}-${
            digits(date.getHours())
        }${digits(date.getMinutes())}${pageSuffix}.png`;
    }

    async function loadResources(materials, mapPreviewUrl) {
        const resources = { locations: {} };
        for (const image of materials.images || []) {
            resources[image.id] = await loadImage(image.dataUrl);
        }
        if (materials.location) {
            resources.locations[materials.location.id] = materials.location;
            if (typeof mapPreviewUrl === 'function') {
                try {
                    resources[materials.location.id] = await loadImage(
                        mapPreviewUrl(materials.location),
                    );
                } catch {
                    // The location card remains usable with its safe fallback.
                }
            }
        }
        return resources;
    }

    async function renderChatPages(
        draft,
        materials,
        {
            canvasFactory = () => document.createElement('canvas'),
            mapPreviewUrl = global.TencentMapPicker?.mapPreviewUrl,
        } = {},
    ) {
        const resources = await loadResources(materials, mapPreviewUrl);
        const measureCanvas = document.createElement('canvas');
        const measureContext = measureCanvas.getContext('2d');
        measureContext.font = '400 36px sans-serif';
        const layouts = paginateChat({
            contactName: draft.contactName,
            messages: draft.messages,
            assets: resources,
            measureText: (text) => measureContext.measureText(text).width,
        });
        const renderedAt = new Date();
        const pages = [];
        for (const layout of layouts) {
            const canvas = canvasFactory(layout.pageNumber);
            drawChat(canvas, layout, resources);
            const blob = await canvasBlob(canvas);
            pages.push({
                canvas,
                blob,
                url: URL.createObjectURL(blob),
                fileName: outputFileName(
                    renderedAt,
                    layout.pageNumber,
                    layout.pageCount,
                ),
                layout,
            });
        }
        return pages;
    }

    async function renderChatPng(
        draft,
        materials,
        {
            canvas = document.createElement('canvas'),
            mapPreviewUrl = global.TencentMapPicker?.mapPreviewUrl,
        } = {},
    ) {
        const pages = await renderChatPages(draft, materials, {
            canvasFactory: (pageNumber) => (
                pageNumber === 1
                    ? canvas
                    : document.createElement('canvas')
            ),
            mapPreviewUrl,
        });
        return {
            ...pages[0],
            pages,
        };
    }

    const api = {
        DEFAULT_HEIGHT,
        DEFAULT_WIDTH,
        drawChat,
        layoutChat,
        outputFileName,
        paginateChat,
        renderChatPages,
        renderChatPng,
        wrapMessageText,
    };
    global.WechatChatRenderer = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(globalThis));
