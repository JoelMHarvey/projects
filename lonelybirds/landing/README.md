# LonelyBirds landing page

Standalone static landing page — a single `index.html`, no build step, no
dependencies. Dawn-light palette (amber / teal / cream), animated
birds-on-a-wire hero (pure CSS/SVG, honours `prefers-reduced-motion`),
waitlist signup form backed by Supabase.

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire page (markup, styles, waitlist JS) |
| `vercel.json` | Static deploy config (clean URLs + security headers) |

## Placeholder substitution (required before deploy)

`index.html` contains two deploy-time placeholders:

| Placeholder | Value |
|---|---|
| `__SUPABASE_URL__` | Your Supabase project URL, e.g. `https://abcdefgh.supabase.co` (no trailing slash needed) |
| `__SUPABASE_ANON_KEY__` | The project's **anon/public** API key (never the service-role key) |

Substitute them with `sed` (or any templating step in CI):

```bash
sed -i.bak \
  -e "s|__SUPABASE_URL__|https://YOUR-PROJECT-REF.supabase.co|g" \
  -e "s|__SUPABASE_ANON_KEY__|YOUR_ANON_KEY|g" \
  index.html && rm index.html.bak
```

If you deploy **without** substituting, the page still works: the form
validates email input and shows a friendly "signups aren't open yet" fallback
instead of attempting a network call. The unconfigured-state detection is
robust to naive find-and-replace (the sentinel string in the JS is built by
concatenation), so a plain `sed` over the whole file is safe.

### Backend expectations

The form POSTs `{"email": "...", "source": "landing"}` to
`{SUPABASE_URL}/rest/v1/waitlist_signups` with the anon key. This relies on
the `waitlist_signups` table from the repo migrations, whose RLS policy
allows **anonymous INSERT only** (see `CONTRACTS.md`). A `409` response
(duplicate email — the column is unique) is treated as success so returning
visitors see the confirmation state rather than an error.

## Deploy to Vercel

```bash
cd landing
# 1. Substitute placeholders (see above)
# 2. Deploy this directory as a static site
npx vercel deploy --prod
```

When prompted, accept the defaults (no build command, output directory `.`).
Then point the `lonelybirds.app` domain at the deployment:

```bash
npx vercel domains add lonelybirds.app
```

### Alternative: Cloudflare Pages

Also works as-is: create a Pages project, set the build command to *(none)*
and the output directory to `landing/` (run the `sed` substitution in a
pre-deploy step or commit a configured copy to a private deploy branch).

## Analytics

The page loads [Plausible](https://plausible.io) with
`data-domain="lonelybirds.app"`. Register the site in your Plausible account
(or change the `data-domain` / remove the `<script>` tag if you use a
different domain or provider). No cookies, no consent banner required.

## Local preview

No server needed — open the file directly:

```bash
open landing/index.html        # macOS
xdg-open landing/index.html    # Linux
```

or serve it: `npx serve landing`.
