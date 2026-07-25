function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': status === 200
                ? 'public, max-age=300'
                : 'no-store',
        },
    });
}

function parseQuery(url) {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 9 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 12) {
        throw new Error('limit must be an integer between 1 and 12');
    }
    return {
        limit,
        tags: (url.searchParams.get('tags') || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 12),
        random: url.searchParams.get('random') === 'true',
    };
}

function selectItems(catalog, options) {
    const tagSet = new Set(options.tags);
    const items = tagSet.size
        ? catalog.filter((item) => (
            item.tags.some((tag) => tagSet.has(tag))
        ))
        : catalog.slice();
    if (options.random) {
        for (let index = items.length - 1; index > 0; index -= 1) {
            const target = Math.floor(Math.random() * (index + 1));
            [items[index], items[target]] = [items[target], items[index]];
        }
    }
    return items.slice(0, options.limit);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname.replace(/\/+$/, '') !== '/api/dish-assets') {
            return env.ASSETS.fetch(request);
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return json({
                success: false,
                error: {
                    code: 'METHOD_NOT_ALLOWED',
                    message: '请求方法不受支持',
                },
            }, 405);
        }
        try {
            const options = parseQuery(url);
            const catalogUrl = new URL(
                '/assets/dish-library/catalog.json',
                url,
            );
            const catalogResponse = await env.ASSETS.fetch(catalogUrl);
            if (!catalogResponse.ok) {
                throw new Error('菜品资源库不可用');
            }
            const items = selectItems(await catalogResponse.json(), options);
            if (request.method === 'HEAD') {
                return new Response(null, {
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'public, max-age=300',
                    },
                });
            }
            return json({ success: true, items, total: items.length });
        } catch (error) {
            return json({
                success: false,
                error: {
                    code: 'INVALID_INPUT',
                    message: error.message,
                },
            }, 400);
        }
    },
};

export { parseQuery, selectItems };
