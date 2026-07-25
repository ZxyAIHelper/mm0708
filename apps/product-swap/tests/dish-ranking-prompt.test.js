'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPrompt,
} = require('../template-packs/dish-ranking-guide/prompt');

test('puts every owned dish in the 夯 tier', () => {
    const prompt = buildPrompt({
        dishes: [
            { owned: true, source: 'user' },
            { owned: false, source: 'library' },
            { owned: true, source: 'user' },
        ],
        layout: 'tier',
        aspectRatio: '3:4',
    });

    assert.match(prompt, /第 1 张菜品图：自家菜品/);
    assert.match(prompt, /第 2 张菜品图：资源库补充菜品/);
    assert.match(prompt, /第 3 张菜品图：自家菜品/);
    assert.match(prompt, /全部自家菜品放入“夯”档/);
    assert.match(prompt, /3:4/);
});

test('describes every ranking guide layout precisely', () => {
    const tier = buildPrompt({ layout: 'tier' });
    assert.match(tier, /纯白或浅米白背景/);
    assert.match(tier, /左侧固定档位栏约占画布宽度 18%/);
    assert.match(tier, /每个档位独占一行/);
    assert.match(tier, /全部自家菜品放入“夯”档/);

    const grid = buildPrompt({ layout: 'grid' });
    assert.match(grid, /固定三列/);
    assert.match(grid, /6 张时使用 3×2/);
    assert.match(grid, /10～12 张时使用 3×4/);
    assert.match(grid, /半透明黑色文字带/);

    const quad = buildPrompt({ layout: 'quad' });
    assert.match(quad, /2×2 四个矩形区域/);
    assert.match(quad, /输入超过四张时/);
    assert.match(quad, /不得覆盖超过任一区域高度的 20%/);

    const collage = buildPrompt({ layout: 'collage' });
    assert.match(collage, /三列隐形网格/);
    assert.match(collage, /大、中、小三级卡片尺寸/);
    assert.match(collage, /不旋转、不相互覆盖/);
});

test('adds common fidelity and platform-chrome exclusions', () => {
    const prompt = buildPrompt({ layout: 'tier' });
    assert.match(prompt, /所有输入菜品必须各出现一次/);
    assert.match(prompt, /不得遗漏、重复或把不同菜品融合/);
    assert.match(prompt, /短视频平台头像、点赞栏、评论栏/);
});

test('treats a previous image as the refinement base', () => {
    const prompt = buildPrompt({
        hasPreviousImage: true,
        dishes: [{ owned: true, source: 'user' }],
        requirements: '标题醒目一点',
        messages: [{ role: 'user', content: '标题大一点' }],
    });

    assert.match(prompt, /第一张图是上一版结果/);
    assert.match(prompt, /只修改用户明确指定的内容/);
    assert.match(prompt, /BEGIN_UNTRUSTED_USER_EDIT_INTENT/);
    assert.match(prompt, /标题醒目一点/);
});
