# Security and bug review: swpt_creditors_ui

| | |
|---|---|
| Reviewed commit | `da12aed` (2026-09-12) |
| Review date | 2026-10-27 |
| Scope | `src/` (OAuth2/PKCE client and token storage, debtor-info parsing, Svelte components that render server-supplied data) |
| Method | Manual code review; the fixed finding was reproduced with a Jest test |

This is the creditors' wallet (a Svelte + Vite PWA). The main concerns
for a wallet are XSS (it holds OAuth tokens and can initiate transfers)
and how those tokens are stored. This document covers the issue
**fixed in this pull request**, plus review notes.

## Summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| SEC-1 | Medium | A debtor-controlled homepage link allows `javascript:` URLs (DOM XSS on click) | Fixed |

## SEC-1: `javascript:` URL in a currency's homepage link (Medium, fixed)

**Where:** `src/debtor-info/index.ts` (`parseDebtorInfoDocument`); the
sink is the `debtorHomepage.uri` binding in `AccountInfo.svelte`,
`AckAccountInfoPage.svelte` and other components.

**Problem.** A currency's "CoinInfo" document is published by its
debtor and fetched by the wallet. It contains an optional
`debtorHomepage.uri`. The wallet renders it as a link:

```svelte
<a href={homepage} target="_blank" rel="noreferrer">info</a>
```

Svelte does **not** sanitize `href` values. Three things line up so
that a dangerous URL reaches this sink unchanged:

1. The JSON schema types `debtorHomepage` as a `ShortLink` with
   `format: iri`, but the validator is compiled with
   `--validate-formats=false`, so the format is never enforced (and
   `iri`/`uri` formats accept `javascript:` anyway).
2. `parseDebtorInfoDocument` normalizes `latestDebtorInfo.uri` through
   `new URL(...)`, but left `debtorHomepage` untouched
   (`data.debtorHomepage = data.debtorHomepage`).
3. No component checks the scheme before binding it to `href`.

So a malicious debtor can set
`debtorHomepage.uri = "javascript:<payload>"`. Any creditor who holds
or views that currency and clicks the homepage link runs the payload
in the wallet's origin, which can read stored data and drive the Web
API with the user's session.

It needs a click and the victim viewing that currency, so it is rated
Medium rather than High.

**Fix.** `parseDebtorInfoDocument` now passes every URL from the
document through a `parseHttpUrl` helper that requires an `http:` or
`https:` scheme:

- `latestDebtorInfo.uri` and `peg.latestDebtorInfo.uri`: reject the
  whole document if the scheme is not HTTP(S) (these are fetched, and
  were already rejected when unparseable).
- `debtorHomepage.uri`: since it is optional and non-essential, drop it
  when it is not an HTTP(S) URL, keeping the rest of the currency
  usable.

**Test:** `Reject dangerous URL schemes in CoinInfo document` — a
`javascript:` homepage is dropped, a normal one is kept, and a
`javascript:` `latestDebtorInfo` rejects the document. It fails without
the fix.

**Hardening suggestion (not in this PR).** As defence in depth, the
components could also pass homepage URLs through a shared
`safeExternalUrl()` helper before binding them to `href`, so the sink
is protected even if another code path ever produces an unsanitized
`DebtorData`.

## Review notes

- **No HTML-injection sinks.** There is no `{@html}`, `innerHTML`,
  `eval`, `document.write` or `new Function` anywhere in `src/`. Svelte
  auto-escapes interpolated text, so the template XSS surface is limited
  to attribute sinks like the one above.
- **Token storage.** The access token itself is not kept in
  `localStorage`; only a `tokenHash` and the entrypoint are
  (`src/web-api/index.ts`). The PKCE client keeps the full OAuth state
  in `localStorage` only when the scopes are "safe" and no
  `codeVerifier` is present; otherwise it uses `sessionStorage`
  (`auth-code-pkce.ts`, `setState`).
- **OAuth2 PKCE flow.** The authorization-code flow uses S256 PKCE, and
  the `state` parameter from the callback is compared against the stored
  value (`isReturningFromAuthServer`), which protects against
  authorization-code injection / login CSRF.
- **Document size.** `parseDebtorInfoDocument` enforces
  `MAX_DOCUMENT_CONTENT_SIZE` before parsing.

## Tests

Full suite: 13 passed (Jest). `svelte-check`: 0 errors. The new test
fails without the fix.
