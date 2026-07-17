# Product Swap Domain and Portal Entry Design

## Goal

Expose the deployed product-swap Worker at `https://product-swap.mm0708.top` and add a matching entry to the existing `https://mm0708.top` tools portal.

## Design

The product-swap Worker remains the origin for every path on the new subdomain. Its Wrangler configuration declares `product-swap.mm0708.top` as a Cloudflare Custom Domain, allowing Cloudflare to create the DNS record and certificate without changing the root portal.

The portal receives one new card in the existing “特色应用” grid. The card uses the existing `tool-card` structure, opens the product-swap subdomain in a new tab, and carries a short Chinese description. Existing uncommitted portal cards and unrelated workspace changes must remain untouched.

## Verification

An automated contract test checks both the portal link and the Wrangler Custom Domain. Wrangler dry-run validates configuration. After deployment, HTTP checks must return 200 from the custom subdomain and the root portal must contain the new link.
