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

test('supports every ranking guide layout', () => {
    assert.match(buildPrompt({ layout: 'grid' }), /九宫格点评/);
    assert.match(buildPrompt({ layout: 'quad' }), /四宫格攻略/);
    assert.match(buildPrompt({ layout: 'collage' }), /自由拼贴海报/);
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

