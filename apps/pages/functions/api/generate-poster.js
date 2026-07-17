export async function onRequestPost(context) {
    const { env, request } = context;
    const baseUrl = (env.OPENAI_COMPAT_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { prompt, size = '1024x1536', quality = 'medium', background = 'opaque', referenceImage } = await request.json();

        if (!prompt || !String(prompt).trim()) {
            return new Response(JSON.stringify({ error: 'Prompt is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const endpoint = `${baseUrl}/v1/images/generations`;
        const finalPrompt = referenceImage
            ? `${prompt}\n\n参考图要求：请参考用户上传图片的整体构图和气质，但重新生成一张完整的新海报。`
            : prompt;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                prompt: finalPrompt,
                size,
                quality,
                background,
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

        const image = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || null;
        const imageUrl = image && image.startsWith('http') ? image : image ? `data:image/png;base64,${image}` : null;

        return new Response(JSON.stringify({
            imageUrl,
            raw: data,
            model,
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
