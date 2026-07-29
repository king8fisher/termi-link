[![npm version](https://img.shields.io/npm/v/termi-link?logo=npm&labelColor=black&color=07293F)](https://npmjs.com/package/termi-link)

# termi-link

Clickable links for terminals that support them, and readable plain text for the ones that do not.
It is an alternative to [terminal-link](https://npmjs.com/package/terminal-link) with a different
API, so you cannot switch an existing import over unchanged.

## Installation

```bash
npm install termi-link
```

## Usage

```ts
import { terminalLink } from 'termi-link';

terminalLink('example.com', 'https://example.com');
terminalLink('example.com', 'https://example.com', { fallback: (_text, url) => `${url}` });
```

Both arguments may carry color (`red` and `blue` are any color helper — this library ships none):

```ts
terminalLink(red('termi-link'), blue('https://github.com/king8fisher/termi-link'));
// fallback: red text, blue url — and the link target itself stays byte-clean
```

A supported terminal renders the text, not the url, so url color shows only in the
fallback. Wrap the whole return value — `red(terminalLink(text, url))` — to color a
link on both paths.

Turn on `strictUrlEncoding` if your urls can contain spaces — a raw space truncates
the link in the plain-text fallback:

```ts
// without the option the fallback linkifies only  file:///Users/me/My
terminalLink('report', 'file:///Users/me/My Documents/report.pdf', { strictUrlEncoding: true });
// with it, the whole path survives  file:///Users/me/My%20Documents/report.pdf
```

## API

`terminalLink` returns a clickable link when the terminal supports one, and the configured fallback when it does not:

```ts
terminalLink(text: string, url: string, options?: {
  fallback?: false | ((text: string, url: string) => string),
  strictUrlEncoding?: boolean,
} | undefined): string
```

- default — `text url`, space-delimited so the terminal's own url detector picks it up intact, or the url alone when `text` is empty
- `fallback: false` — `text` unchanged, with no url appended
- `fallback: fn` — whatever `fn(text, url)` returns, with `url` sanitized and its color kept

`isSupported()` reports whether the current terminal supports links.

### `TERMI_LINK_HYPERLINK`

The one runtime control surface. This environment variable is checked before every detection branch, so it overrides both `terminalLink` and `isSupported`:

- `1`, `true`, `always`, `enabled` — force links on
- `0`, `false`, `never`, `disabled` — force links off

Matching is exact and case-sensitive. Anything else, including `TRUE` and the empty string, falls through to normal detection.

## Differences from terminal-link

This is an alternative with a different API. The surface differs in three places:

| | `terminal-link` v5 | `termi-link` |
| --- | --- | --- |
| entry | default export, callable | named export `terminalLink` |
| support check | `terminalLink.isSupported` (boolean **property**) | `isSupported()` (**function**) |
| stderr | `terminalLink.stderr(...)` | none |

Behavior differs in three ways:

- No runtime dependencies — terminal detection is built in.
- Urls are made [safe for the escape sequence](https://github.com/king8fisher/termi-link/blob/main/README-details.md#url-safety), so a crafted url cannot break or hijack the link.
- The [fallback contract](https://github.com/king8fisher/termi-link/blob/main/README-details.md#the-fallback-contract) differs twice — `terminalLink('', url)` returns the url alone, and a custom `fallback` receives the sanitized display value rather than the raw url.

## Reason

The `terminal-link` library, long the go-to for outputting links, added zero-width spaces around
urls, which made links lead to `404` in Windows terminals.
[Issue #18](https://github.com/sindresorhus/terminal-link/issues/18) was opened in February 2022
and stayed open for more than three years. That, plus a supported-terminal list that needed
updating more often than upstream released, led me to create this alternative.

> [!NOTE]
> terminal-link v5.0.0 (2025-09-08) fixed this issue and removed the zero-width spaces entirely.

The exact contracts, the version history and a glossary of the terminal jargon live in [README-details.md](https://github.com/king8fisher/termi-link/blob/main/README-details.md).

## License

MIT
