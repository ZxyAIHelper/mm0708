'use strict';

const path = require('node:path');

const SKILL_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    'skills',
    'product-swap-image',
    'SKILL.md',
);

function buildPrompt({
    imageRoles = [],
    hasPreviousImage = false,
    requirements,
} = {}) {
    const hasProductImage = imageRoles.includes('product');
    const hasSceneImage = imageRoles.includes('scene');
    const initialRoles = [
        '第一张图是目标模板。保持它的宽高比、镜头、构图、商品数量、排列、背景和光线。',
        hasProductImage
            ? '第二张图是需要换入的产品。保留其形状、颜色、包装、餐具和关键识别特征。'
            : '没有提供产品图，请根据用户要求生成需要换入的商品。',
        hasSceneImage
            ? `第${hasProductImage ? '三' : '二'}张图只作为场景参考。只吸收环境和氛围，不改变产品本身。`
            : '',
    ];
    const refinementRoles = [
        '第一张图是上一版结果，以它作为本轮编辑底图。',
        '第二张图是原始目标模板，只用于校准构图、数量、排列、背景和光线。',
        hasProductImage
            ? '第三张图是产品图，产品主体和识别特征不得改变。'
            : '',
        hasSceneImage
            ? `第${hasProductImage ? '四' : '三'}张图只作为场景参考。`
            : '',
    ];
    const instructions = [
        `严格遵循 product-swap-image Skill：${SKILL_PATH}`,
        ...(hasPreviousImage ? refinementRoles : initialRoles),
        '只替换目标模板中的菜品或商品，不增加文字、Logo、水印或额外商品。',
        requirements ? `用户本轮要求：${requirements}` : '',
        '不要调用任何 HTTP/HTTPS 地址，不要启动服务，不要再次运行 codex 或其他 agent。',
        '只使用当前进程直接可用的图片编辑能力生成一张结果图，并将最终文件保存为当前工作目录下的 result.png。不要只描述结果。',
    ];

    return instructions.filter(Boolean).join('\n');
}

module.exports = { SKILL_PATH, buildPrompt };
