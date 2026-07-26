const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getTemplatePackage,
    listTemplatePackages,
    publicCatalog,
    publicManifest,
    validateManifest,
} = require('../server/template-registry');

function validManifest(overrides = {}) {
    return {
        id: 'sample',
        taskType: 'sample_task',
        name: 'Sample',
        summary: 'Sample summary',
        category: 'Sample category',
        platforms: ['小红书'],
        tags: ['示例'],
        status: 'coming_soon',
        href: '',
        cover: '/assets/sample.jpg',
        outputLabel: '生成示例',
        creditCost: 0,
        fields: [],
        ...overrides,
    };
}

function validField(type, overrides = {}) {
    const fields = {
        image: {
            key: 'targetImage',
            type: 'image',
            role: 'target',
            label: 'Target image',
            required: true,
            accept: ['image/jpeg', 'image/png', 'image/webp'],
        },
        choice: {
            key: 'ratio',
            type: 'choice',
            label: 'Ratio',
            required: true,
            default: 'square',
            options: [
                { value: 'square', label: 'Square' },
                { value: 'portrait', label: 'Portrait' },
            ],
        },
        boolean: {
            key: 'showLabel',
            type: 'boolean',
            label: 'Show label',
            required: false,
            default: true,
        },
        text: {
            key: 'requirements',
            type: 'text',
            label: 'Requirements',
            required: false,
            maxLength: 200,
            placeholder: 'Optional details',
        },
    };

    return { ...fields[type], ...overrides };
}

function sparseArray(value) {
    const values = new Array(2);
    values[1] = value;
    return values;
}

test('discovers all template packages in stable id order', () => {
    assert.deepEqual(
        listTemplatePackages().map((templatePackage) => templatePackage.manifest.id),
        [
            'before-after',
            'dish-ranking-guide',
            'food-copy-layout',
            'product-swap',
            'store-promotion',
            'summer-seeding',
            'wechat-chat-screenshot',
        ],
    );
});

test('publishes the live wechat chat screenshot contract', () => {
    const template = publicCatalog().find(
        (item) => item.id === 'wechat-chat-screenshot',
    );

    assert.equal(template.status, 'live');
    assert.equal(template.creditCost, 0);
    assert.equal(template.href, '/create.html?template=wechat-chat-screenshot');
    assert.deepEqual(template.fields, [{
        key: 'chatSource',
        type: 'chat-materials',
        label: '聊天素材',
        required: true,
        minSources: 1,
        maxImages: 3,
        accept: ['image/jpeg', 'image/png', 'image/webp'],
    }]);
});

test('validates the chat-materials field contract', () => {
    assert.doesNotThrow(() => validateManifest(validManifest({
        fields: [{
            key: 'chatSource',
            type: 'chat-materials',
            label: '聊天素材',
            required: true,
            minSources: 1,
            maxImages: 3,
            accept: ['image/jpeg', 'image/png', 'image/webp'],
        }],
    }), 'sample'));
});

test('publishes the live food-copy-layout contract without its prompt builder', () => {
    const foodTemplate = publicCatalog().find(
        (template) => template.id === 'food-copy-layout',
    );

    assert.equal(foodTemplate.status, 'live');
    assert.equal(foodTemplate.taskType, 'food_copy_layout');
    assert.deepEqual(
        foodTemplate.fields.map((field) => field.key),
        ['targetImage', 'aspectRatio', 'showDateTime', 'requirements'],
    );
    assert.equal('prompt' in foodTemplate, false);
    assert.equal('buildPrompt' in foodTemplate, false);
});

test('loads the private prompt builder for a live template package', () => {
    assert.equal(
        typeof getTemplatePackage('food-copy-layout').buildPrompt,
        'function',
    );
});

test('requires the arrays and cover consumed by the public catalog UI', () => {
    for (const key of ['platforms', 'tags', 'cover', 'fields']) {
        const manifest = validManifest();
        delete manifest[key];

        assert.throws(
            () => validateManifest(manifest, 'sample'),
            new RegExp(`Template sample is missing ${key}`),
        );
    }
});

test('rejects malformed catalog arrays with clear registry errors', () => {
    for (const key of ['platforms', 'tags', 'fields']) {
        assert.throws(
            () => validateManifest(validManifest({ [key]: {} }), 'sample'),
            new RegExp(`Template sample ${key} must be an array`),
        );
    }
});

test('rejects malformed platform and tag entries', () => {
    for (const key of ['platforms', 'tags']) {
        assert.throws(
            () => validateManifest(
                validManifest({ [key]: ['valid', ' '] }),
                'sample',
            ),
            new RegExp(
                `Template sample ${key} entries must be non-empty strings`,
            ),
        );
    }
});

test('requires a non-empty cover and non-empty field keys', () => {
    assert.throws(
        () => validateManifest(validManifest({ cover: '' }), 'sample'),
        /Template sample cover must be a non-empty string/,
    );
    assert.throws(
        () => validateManifest(validManifest({ cover: 42 }), 'sample'),
        /Template sample cover must be a non-empty string/,
    );
    assert.throws(
        () => validateManifest(
            validManifest({ fields: [{ key: ' ' }] }),
            'sample',
        ),
        /Template sample field keys must be non-empty strings/,
    );
    assert.throws(
        () => validateManifest(validManifest({ fields: [null] }), 'sample'),
        /Template sample field keys must be non-empty strings/,
    );
});

test('allows only safe non-prototype field identifiers', () => {
    for (const key of [
        '../escape',
        'nested/path',
        '__proto__',
        'constructor',
        'prototype',
        'has-dash',
    ]) {
        assert.throws(
            () => validateManifest(
                validManifest({ fields: [{ key }] }),
                'sample',
            ),
            /Template sample field key/,
        );
    }
    assert.equal(
        validateManifest(
            validManifest({
                fields: [validField('text', { key: 'targetImage2' })],
            }),
            'sample',
        ).fields[0].key,
        'targetImage2',
    );
});

test('rejects a non-object manifest with a clear registry error', () => {
    assert.throws(
        () => validateManifest(null, 'sample'),
        /Template sample manifest must be an object/,
    );
});

test('accepts only plain manifests, fields, and choice options', () => {
    assert.throws(
        () => validateManifest(
            Object.create(validManifest()),
            'sample',
        ),
        /Template sample manifest must be a plain object/,
    );
    assert.throws(
        () => validateManifest(validManifest({
            fields: [Object.create(validField('text'))],
        }), 'sample'),
        /Template sample field must be a plain object/,
    );
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', {
                options: [Object.create({
                    value: 'square',
                    label: 'Square',
                })],
            })],
        }), 'sample'),
        /Template sample field ratio option must be a plain object/,
    );

    const nullPrototypeManifest = Object.assign(
        Object.create(null),
        validManifest(),
    );
    const validated = validateManifest(nullPrototypeManifest, 'sample');
    assert.notEqual(validated, nullPrototypeManifest);
    assert.equal(Object.getPrototypeOf(validated), null);
});

test('rejects hidden and symbol manifest properties', () => {
    const hidden = validManifest();
    Object.defineProperty(hidden, 'internalNotes', {
        value: 'private',
        enumerable: false,
    });
    assert.throws(
        () => validateManifest(hidden, 'sample'),
        /Template sample has unknown property internalNotes/,
    );

    const privateSymbol = Symbol('private');
    const symbolManifest = validManifest();
    symbolManifest[privateSymbol] = true;
    assert.throws(
        () => validateManifest(symbolManifest, 'sample'),
        /Template sample has unknown property Symbol\(private\)/,
    );

    const hiddenField = validField('text');
    Object.defineProperty(hiddenField, 'internalNotes', {
        value: 'private',
        enumerable: false,
    });
    assert.throws(
        () => validateManifest(
            validManifest({ fields: [hiddenField] }),
            'sample',
        ),
        /Template sample field requirements has unknown property internalNotes/,
    );

    const optionSymbol = Symbol('private-option');
    const option = { value: 'square', label: 'Square' };
    option[optionSymbol] = true;
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', { options: [option] })],
        }), 'sample'),
        /Template sample field ratio option has unknown property Symbol\(private-option\)/,
    );
});

test('rejects accessors instead of invoking them as manifest data', () => {
    const manifest = validManifest();
    Object.defineProperty(manifest, 'name', {
        get() {
            return 'Accessor name';
        },
        enumerable: true,
    });
    assert.throws(
        () => validateManifest(manifest, 'sample'),
        /Template sample name must be an own data property/,
    );

    const field = validField('text');
    Object.defineProperty(field, 'label', {
        get() {
            return 'Accessor label';
        },
        enumerable: true,
    });
    assert.throws(
        () => validateManifest(
            validManifest({ fields: [field] }),
            'sample',
        ),
        /Template sample field requirements label must be an own data property/,
    );

    const option = { value: 'square' };
    Object.defineProperty(option, 'label', {
        get() {
            return 'Accessor label';
        },
        enumerable: true,
    });
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', { options: [option] })],
        }), 'sample'),
        /Template sample field ratio option label must be an own data property/,
    );
});

test('does not treat inherited optional values as manifest data', () => {
    Object.defineProperty(Object.prototype, 'quickPrompts', {
        value: ['Inherited prompt'],
        configurable: true,
    });
    try {
        const manifest = validManifest();

        validateManifest(manifest, 'sample');

        assert.deepEqual(publicManifest(manifest).quickPrompts, []);
        assert.deepEqual(
            publicManifest(
                validManifest({ quickPrompts: ['Own prompt'] }),
            ).quickPrompts,
            ['Own prompt'],
        );
    } finally {
        delete Object.prototype.quickPrompts;
    }
});

test('rejects unknown top-level manifest properties', () => {
    for (const key of ['prompt', 'internalNotes']) {
        assert.throws(
            () => validateManifest(
                validManifest({ [key]: 'private' }),
                'sample',
            ),
            new RegExp(`Template sample has unknown property ${key}`),
        );
    }
});

test('validates top-level public catalog scalar and array contracts', () => {
    for (const key of [
        'id',
        'taskType',
        'name',
        'summary',
        'category',
        'href',
        'outputLabel',
    ]) {
        assert.throws(
            () => validateManifest(validManifest({ [key]: 42 }), 'sample'),
            new RegExp(`Template sample ${key} must be a string`),
        );
    }

    assert.throws(
        () => validateManifest(
            validManifest({ creditCost: '3' }),
            'sample',
        ),
        /Template sample creditCost must be a non-negative number/,
    );
    assert.throws(
        () => validateManifest(
            validManifest({ status: 'draft' }),
            'sample',
        ),
        /Template sample status must be live or coming_soon/,
    );
    assert.throws(
        () => validateManifest(
            validManifest({ status: 'live', href: '' }),
            'sample',
        ),
        /Live template sample href must be a non-empty string/,
    );
    assert.throws(
        () => validateManifest(
            validManifest({ quickPrompts: 'Try this' }),
            'sample',
        ),
        /Template sample quickPrompts must be an array/,
    );
    assert.throws(
        () => validateManifest(
            validManifest({ quickPrompts: ['valid', ' '] }),
            'sample',
        ),
        /Template sample quickPrompts entries must be non-empty strings/,
    );
});

test('rejects reserved request transport field keys', () => {
    for (const key of [
        'templateId',
        'previousImage',
        'messages',
        'conversationId',
        'generatedAt',
        'requestId',
        'hasPreviousImage',
        'imageRoles',
    ]) {
        assert.throws(
            () => validateManifest(
                validManifest({
                    fields: [validField('text', { key })],
                }),
                'sample',
            ),
            new RegExp(`Template sample field key ${key} is reserved`),
        );
    }
});

test('rejects sparse manifest arrays before validating their entries', () => {
    for (const [key, value] of [
        ['platforms', 'Platform'],
        ['tags', 'Tag'],
        ['quickPrompts', 'Prompt'],
        ['fields', validField('text')],
    ]) {
        assert.throws(
            () => validateManifest(
                validManifest({ [key]: sparseArray(value) }),
                'sample',
            ),
            new RegExp(`Template sample ${key} must be a dense array`),
        );
    }
});

test('rejects sparse image accept and choice options arrays clearly', () => {
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('image', {
                accept: sparseArray('image/png'),
            })],
        }), 'sample'),
        /Template sample field targetImage accept must be a dense array/,
    );
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', {
                options: sparseArray({
                    value: 'square',
                    label: 'Square',
                }),
            })],
        }), 'sample'),
        /Template sample field ratio options must be a dense array/,
    );
});

test('rejects array instance overrides before invoking iteration methods', () => {
    const fields = [validField('text')];
    fields.forEach = () => {};
    assert.throws(
        () => validateManifest(validManifest({ fields }), 'sample'),
        /Template sample fields has unknown array property forEach/,
    );

    const accept = ['image/gif'];
    accept.some = () => false;
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('image', { accept })],
        }), 'sample'),
        /Template sample field targetImage accept has unknown array property some/,
    );

    const options = [{
        value: 'square',
        label: 'Square',
    }];
    options[Symbol.iterator] = function* iterator() {};
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', { options })],
        }), 'sample'),
        /Template sample field ratio options has unknown array property Symbol\(Symbol.iterator\)/,
    );

    const quickPrompts = ['Prompt'];
    quickPrompts.map = () => [];
    assert.throws(
        () => validateManifest(
            validManifest({ quickPrompts }),
            'sample',
        ),
        /Template sample quickPrompts has unknown array property map/,
    );
});

test('rejects arrays with custom or null prototypes', () => {
    for (const prototype of [{}, null]) {
        const fields = [validField('text')];
        Object.setPrototypeOf(fields, prototype);

        assert.throws(
            () => validateManifest(validManifest({ fields }), 'sample'),
            /Template sample fields must use Array.prototype/,
        );
    }
});

test('rejects invalid field types and properties outside the type contract', () => {
    assert.throws(
        () => validateManifest({
            ...validManifest(),
            fields: [{
                key: 'mystery',
                type: 'upload',
                label: 'Mystery',
            }],
        }, 'sample'),
        /Template sample field mystery has unknown type upload/,
    );
    assert.throws(
        () => validateManifest({
            ...validManifest(),
            fields: [{
                key: 'mystery',
                type: 'toString',
                label: 'Mystery',
            }],
        }, 'sample'),
        /Template sample field mystery has unknown type toString/,
    );

    for (const [type, property] of [
        ['image', 'default'],
        ['choice', 'role'],
        ['boolean', 'options'],
        ['text', 'accept'],
    ]) {
        const field = validField(type, { [property]: 'not public' });
        assert.throws(
            () => validateManifest(
                validManifest({ fields: [field] }),
                'sample',
            ),
            new RegExp(
                `Template sample field ${field.key} has unknown property ${property}`,
            ),
        );
    }
});

test('validates common field labels and required flags', () => {
    for (const type of ['image', 'choice', 'boolean', 'text']) {
        const field = validField(type, { label: '' });
        assert.throws(
            () => validateManifest(
                validManifest({ fields: [field] }),
                'sample',
            ),
            new RegExp(
                `Template sample field ${field.key} label must be a non-empty string`,
            ),
        );

        const invalidRequired = validField(type, { required: 'yes' });
        assert.throws(
            () => validateManifest(
                validManifest({ fields: [invalidRequired] }),
                'sample',
            ),
            new RegExp(
                `Template sample field ${invalidRequired.key} required must be a boolean`,
            ),
        );
    }
});

test('validates image field role and accepted media types', () => {
    for (const role of ['', 42]) {
        assert.throws(
            () => validateManifest(validManifest({
                fields: [validField('image', { role })],
            }), 'sample'),
            /Template sample field targetImage role must be a non-empty string/,
        );
    }
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('image', { accept: 'image/png' })],
        }), 'sample'),
        /Template sample field targetImage accept must be an array/,
    );
    for (const accept of [
        [],
        ['image/gif'],
        ['image/jpeg', 'image/png', 42],
    ]) {
        assert.throws(
            () => validateManifest(validManifest({
                fields: [validField('image', { accept })],
            }), 'sample'),
            /Template sample field targetImage accept may only contain image\/jpeg, image\/png, or image\/webp/,
        );
    }
});

test('validates choice options and defaults', () => {
    for (const options of [
        [],
        [{ value: '', label: 'Blank value' }],
        [{ value: 'one', label: '' }],
        [
            { value: 'same', label: 'One' },
            { value: 'same', label: 'Two' },
        ],
        [
            { value: 'one', label: 'Same' },
            { value: 'two', label: 'Same' },
        ],
    ]) {
        assert.throws(
            () => validateManifest(validManifest({
                fields: [validField('choice', { options })],
            }), 'sample'),
            /Template sample field ratio options must have unique non-empty string values and labels/,
        );
    }
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', { default: 'landscape' })],
        }), 'sample'),
        /Template sample field ratio default must match an option value/,
    );
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', {
                options: [{
                    value: 'square',
                    label: 'Square',
                    internalNotes: 'private',
                }],
            })],
        }), 'sample'),
        /Template sample field ratio option has unknown property internalNotes/,
    );
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('choice', {
                options: [{
                    value: 'square',
                    label: 'Square',
                    preview: 'untrusted-preview',
                }],
            })],
        }), 'sample'),
        /Template sample field ratio option preview must be supported/,
    );
});

test('validates boolean defaults and text presentation properties', () => {
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('boolean', { default: 'true' })],
        }), 'sample'),
        /Template sample field showLabel default must be a boolean/,
    );
    for (const maxLength of [0, -1, 1.5, '200']) {
        assert.throws(
            () => validateManifest(validManifest({
                fields: [validField('text', { maxLength })],
            }), 'sample'),
            /Template sample field requirements maxLength must be a positive integer/,
        );
    }
    assert.throws(
        () => validateManifest(validManifest({
            fields: [validField('text', { placeholder: 42 })],
        }), 'sample'),
        /Template sample field requirements placeholder must be a string/,
    );
});

test('publicManifest projects and deeply clones only public properties', () => {
    const source = validManifest({
        fields: [validField('choice', {
            options: [
                {
                    value: 'square',
                    label: 'Square',
                    preview: 'grid-4',
                },
                {
                    value: 'portrait',
                    label: 'Portrait',
                },
            ],
        })],
        quickPrompts: ['Try square'],
        internalNotes: {
            secret: true,
        },
    });
    const published = publicManifest(source);

    assert.deepEqual(
        Object.keys(published),
        [
            'id',
            'taskType',
            'name',
            'summary',
            'category',
            'platforms',
            'tags',
            'status',
            'href',
            'cover',
            'outputLabel',
            'creditCost',
            'fields',
            'quickPrompts',
        ],
    );
    assert.equal('internalNotes' in published, false);
    assert.notEqual(published.fields, source.fields);
    assert.notEqual(published.fields[0].options, source.fields[0].options);
    assert.equal(
        published.fields[0].options[0].preview,
        'grid-4',
    );
    assert.equal(
        'preview' in published.fields[0].options[1],
        false,
    );

    published.fields[0].options[0].label = 'Changed';
    published.quickPrompts.push('Changed');

    assert.equal(source.fields[0].options[0].label, 'Square');
    assert.deepEqual(source.quickPrompts, ['Try square']);
});

test('publicManifest supplies an empty quickPrompts array when absent', () => {
    const published = publicManifest(validManifest());

    assert.deepEqual(published.quickPrompts, []);
});

test('canonical packages and public DTOs ignore Object prototype pollution', () => {
    const polluted = {
        required: 'polluted',
        maxLength: 9999,
        accept: ['image/gif'],
        default: 'polluted',
        placeholder: 'polluted',
        quickPrompts: ['Polluted prompt'],
    };
    const previousDescriptors = new Map();
    for (const [key, value] of Object.entries(polluted)) {
        previousDescriptors.set(
            key,
            Object.getOwnPropertyDescriptor(Object.prototype, key),
        );
        Object.defineProperty(Object.prototype, key, {
            value,
            configurable: true,
        });
    }

    try {
        const productPackage = getTemplatePackage('product-swap');
        const foodPackage = getTemplatePackage('food-copy-layout');
        const productTarget = productPackage.manifest.fields.find(
            (field) => field.key === 'targetImage',
        );
        const productText = productPackage.manifest.fields.find(
            (field) => field.key === 'requirements',
        );
        const foodBoolean = foodPackage.manifest.fields.find(
            (field) => field.key === 'showDateTime',
        );
        const foodChoice = foodPackage.manifest.fields.find(
            (field) => field.key === 'aspectRatio',
        );

        assert.equal(Object.getPrototypeOf(productPackage.manifest), null);
        assert.equal(Object.getPrototypeOf(productTarget), null);
        assert.equal(Object.getPrototypeOf(foodChoice.options[0]), null);
        assert.equal(productTarget.accept, undefined);
        assert.equal(productText.placeholder, undefined);
        assert.equal(foodBoolean.required, undefined);
        assert.equal(foodBoolean.default, true);
        assert.equal(foodChoice.default, '3:4');

        const comingSoon = publicCatalog().find(
            (template) => template.id === 'before-after',
        );
        assert.deepEqual(comingSoon.quickPrompts, []);
        assert.equal(
            Object.getPrototypeOf(comingSoon),
            Object.prototype,
        );
    } finally {
        for (const [key, descriptor] of previousDescriptors) {
            if (descriptor) {
                Object.defineProperty(Object.prototype, key, descriptor);
            } else {
                delete Object.prototype[key];
            }
        }
    }
});

test('package manifests cannot be mutated through registry results', () => {
    const templatePackage = getTemplatePackage('food-copy-layout');
    const originalKey = templatePackage.manifest.fields[0].key;

    templatePackage.manifest.fields[0].key = 'polluted';

    assert.equal(
        getTemplatePackage('food-copy-layout').manifest.fields[0].key,
        originalKey,
    );
    assert.equal(
        publicCatalog().find(
            (template) => template.id === 'food-copy-layout',
        ).fields[0].key,
        originalKey,
    );
    assert.equal(typeof templatePackage.buildPrompt, 'function');
});
