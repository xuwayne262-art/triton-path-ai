This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Signing in

UCSDPlans is private. Every page, API route and dataset file under `/data`
requires a signed-in Google account whose **verified** email ends exactly in
`@ucsd.edu`. Only the login page, `/api/auth/*` and the login page's own assets
are public.

`alice@eng.ucsd.edu` is rejected — `.ucsd.edu` is not `@ucsd.edu`. There is no
approval list and no student/faculty check; the domain is the whole rule, and
it is applied on the server against Google's ID token, never against anything
the browser sends.

### Configuring Google (required — sign-in cannot work until this is done)

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
2. Add these **Authorised JavaScript origins**:
   - `http://localhost:3000`
   - `https://YOUR-DOMAIN` (production)
3. Add these **Authorised redirect URIs** — the path is fixed by Auth.js:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-DOMAIN/api/auth/callback/google`
4. On the OAuth consent screen, the only scopes needed are `openid`, `email`
   and `profile`.
5. Put the credentials in `.env.local` (and in your host's environment for
   production):

```bash
AUTH_SECRET=          # generate with: npx auth secret
AUTH_GOOGLE_ID=       # ...apps.googleusercontent.com
AUTH_GOOGLE_SECRET=
```

Restart the server afterwards. Until all three are set the login page says so
and shows the exact callback URI for the current host — it does not offer a
button that cannot work, and nothing else on the site is reachable.

## Hosted AI is turned off

All three AI endpoints answer **503** with `Cache-Control: no-store`:

| Endpoint | Code |
| --- | --- |
| `POST /api/chat` | `AI_CHAT_UNAVAILABLE` |
| `POST /api/advisor` | `AI_AUDIT_UNAVAILABLE` |
| `POST /api/generate-plan` | `AI_PLAN_GENERATION_UNAVAILABLE` |

They were reachable by anyone on the internet with no authentication and no
usage limit, so any visitor could spend the project's model budget. Each POST
handler now takes no `Request` argument at all, which makes reading the body,
loading course data, building a provider client or starting generation
structurally impossible. The refusal does not depend on whether
`ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is configured, and no request field,
header, cookie or query parameter can lift it.

**This is a shutdown, not a security feature.** It is not authentication and it
is not rate limiting — nothing here identifies a caller or counts their usage.

Before hosted AI chat may be reopened, all three of these must exist:

1. **Genuine server-side authentication** — a session the server verifies
   itself. A client-supplied user id, email, header or flag is not one.
2. **Eligibility enforcement** — who is allowed to spend model budget.
3. **Durable usage limits** — per-user and global, surviving restarts and
   shared across serverless instances. An in-memory counter is not one.

The chat generation path itself is fixed and tested (validation, size limits,
lazy provider construction, timeouts, cancellation, sanitized errors). It lives
in `src/lib/ai/chatHandler.ts` and is exercised by `npm test` with a mocked
provider. No route wires it up; wiring it up is step 4, after the three above.

`GET /api/chat` is a read-only availability probe (`{"available": false, ...}`)
so the UI can show an honest state instead of guessing.

## Checks

```bash
npm test        # Node's built-in runner; Anthropic is always mocked
npm run typecheck
npm run lint
npm run build
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
