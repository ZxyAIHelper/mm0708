export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const body = await request.json();
        const { image, prompt, model, size, quality, background, referenceImage, mode } = body;

        if (!prompt || !String(prompt).trim()) {
            return new Response(JSON.stringify({ error: 'Prompt is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Backward-compatible meme generation path.
        if (image && env.DOUBAO_API_KEY && env.DOUBAO_ENDPOINT_ID && mode !== 'poster') {
            const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.DOUBAO_API_KEY}`,
                },
                body: JSON.stringify({
                    model: env.DOUBAO_ENDPOINT_ID,
                    prompt,
                    image,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                return new Response(JSON.stringify({
                    error: 'Doubao API Error',
                    details: data,
                    status: response.status,
                }), {
                    status: response.status,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const baseUrl = (env.OPENAI_COMPAT_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
        const apiKey = env.OPENAI_API_KEY;
        const imageModel = model || env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const finalPrompt = referenceImage
            ? `${prompt}\n\n请参考用户上传图片的整体气质和构图倾向，但输出一张完整的新海报。`
            : prompt;

        const response = await fetch(`${baseUrl}/v1/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: imageModel,
                prompt: finalPrompt,
                size: size || '1024x1536',
                quality: quality || 'medium',
                background: background || 'opaque',
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            return new Response(JSON.stringify({
                error: 'Image generation failed',
                details: data,
                status: response.status,
            }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const imageValue = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || null;
        const imageUrl = imageValue && imageValue.startsWith('http')
            ? imageValue
            : imageValue
                ? `data:image/png;base64,${imageValue}`
                : null;

        return new Response(JSON.stringify({
            imageUrl,
            raw: data,
            model: imageModel,
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
