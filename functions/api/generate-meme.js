export async function onRequestPost(context) {
    const { env, request } = context;
    const { DOUBAO_API_KEY, DOUBAO_ENDPOINT_ID } = env;

    if (!DOUBAO_API_KEY || !DOUBAO_ENDPOINT_ID) {
        return new Response(JSON.stringify({ error: "Missing API configuration in environment variables." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const { image, prompt, model } = await request.json();

        // 豆包 API (Volcengine Ark) 图片生成接口
        const apiEndpoint = `https://ark.cn-beijing.volces.com/api/v3/images/generations`;

        // 豆包 API 要求传入完整的 Data URL (包含 data:image/...;base64,)
        const base64Image = image;

        const response = await fetch(apiEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${DOUBAO_API_KEY}`,
            },
            body: JSON.stringify({
                model: DOUBAO_ENDPOINT_ID,
                prompt: prompt,
                // 传入参考图
                image: base64Image,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            // 记录详细错误并返回给前端
            console.error("Doubao API Error:", data);
            return new Response(JSON.stringify({
                error: "Doubao API Error",
                details: data,
                status: response.status
            }), {
                status: response.status,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
