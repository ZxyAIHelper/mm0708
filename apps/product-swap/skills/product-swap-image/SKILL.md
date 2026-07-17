---
name: product-swap-image
description: Replace a dish or commercial product in a reference template while preserving layout, photography, and product identity, then refine the generated result through follow-up instructions. Use for food replacement, product compositing, reference-image recreation, and conversational image corrections.
---

# Product Swap Image

Generate or edit an actual image file. Never return only a textual description.

## Interpret inputs

Use the supplied images in the declared order:

- Initial generation: target template, product, optional scene.
- Refinement: previous result, original target template, product, optional scene.

Treat the target template as the source of aspect ratio, camera, composition, perspective, item count, arrangement, background, and lighting. Treat the product image as the source of shape, color, packaging, tableware, texture, and identifying features. Treat a scene image only as atmosphere reference.

## Edit

Replace only the dish or product subject. Preserve the rest of the template. Match scale, perspective, focus, contact shadows, reflections, and color temperature so the composite reads as a real commercial photograph.

For a refinement, edit the previous result and prioritize the newest correction. Keep the product identity and all unaffected areas stable across revisions.

Do not add text, logos, watermarks, borders, unrelated props, or extra products unless the user explicitly requests them.

## Prevent recursive agents

Do not call any HTTP or HTTPS endpoint, including localhost. Do not start a server, invoke Codex, delegate to another agent, or call the product-swap API. Use only image-generation or image-editing capability directly available in the current process. If no such capability exists, fail clearly instead of trying another agent path.

## Output

Create exactly one final image and save it to the output path requested by the caller. For the local product-swap service, save it as `result.png` in the current working directory.
