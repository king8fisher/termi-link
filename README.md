[![npm version](https://img.shields.io/npm/v/termi-link?logo=npm&labelColor=black&color=07293F)](https://npmjs.com/package/termi-link)

# termi-link

Clickable links for terminals that support them, and readable plain text for the ones that do not.
It is an alternative to [terminal-link](https://npmjs.com/package/terminal-link) with an almost
matching API and semantics, differing in [a few places](#differences-from-terminal-link), so an
existing import needs a small edit rather than a rewrite.

> [!TIP]
> The exact contracts, the version history and a glossary of the terminal jargon live in [README.details.md](README.details.md).

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

Here is what each call renders, where `url` is `https://example.com`. The supported-terminal
column is imitated with a markdown link, because that is exactly what a supporting terminal
shows you: a clickable label with the url hidden inside the escape sequence.

| Call                                                                           | Supported terminals                        | Unsupported terminals               |
| ------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------- |
| `terminalLink('example.com', url)`                                             | [example.com](https://example.com)         | `example.com https://example.com`   |
| `terminalLink('', url)`                                                        | [https://example.com](https://example.com) | `https://example.com`               |
| `terminalLink('example.com', url, { fallback: false })`                        | [example.com](https://example.com)         | `example.com`                       |
| `terminalLink('example.com', url, { fallback: (t, u) => t + ' <' + u + '>' })` | [example.com](https://example.com)         | `example.com <https://example.com>` |

> [!NOTE]
> The supported-terminal column never changes. `fallback` only decides what a terminal
> *without* link support prints. Leave `text` empty and the url becomes the label on
> both paths.

### Text formatting

Both arguments can carry text formatting such as color. `red` and `blue` below stand for any
color helper; this library ships none.

```ts
terminalLink(red('termi-link'), blue('https://github.com/king8fisher/termi-link'));
// fallback: red text, blue url, and the link target itself stays byte-clean
```

A supported terminal renders the text, not the url, so the url color shows up only in the
fallback. To give both parts the same color, wrap the whole return value:

```ts
red(terminalLink(text, url));
```

### Url encoding

Encoding a url is the caller's job. Once a url is one string, only you know whether an `&`
separates two query parameters or is literal data inside one of them, so build your urls with
`new URL()` and `URLSearchParams` rather than by concatenation, then pass the finished string in.

The library handles what OSC 8 requires on its own. Control characters are removed and every byte
above 126 is percent-encoded, on both the link and the fallback.

`strictUrlEncoding` covers a group in between: the printable characters RFC 3986 forbids in a URI,
a space among them. It is off by default. Turn it on when urls can reach you already unescaped,
from the filesystem or a config file, because a raw space truncates the link in the plain-text
fallback:

```ts
terminalLink('report', 'file:///Users/me/My Documents/report.pdf');
// fallback linkifies only  file:///Users/me/My

terminalLink('report', 'file:///Users/me/My Documents/report.pdf', { strictUrlEncoding: true });
// fallback linkifies       file:///Users/me/My%20Documents/report.pdf
```

On a url you built properly the option is usually harmless, but it is not always a no-op. See
[url safety](README.details.md#url-safety) for the full character set, the cases where it rewrites
something `new URL()` had left alone, and the one case where that matters.

## API

Three exports:

```ts
terminalLink(text: string, url: string, options?: {
  fallback?: false | ((text: string, url: string) => string),
  strictUrlEncoding?: boolean,
} | undefined): string
```

`terminalLink` returns a clickable link when the terminal supports one, and the configured
fallback when it does not.

- `fallback: false` keeps `text` unchanged and drops the url
- `fallback: fn` replaces the whole fallback string with `fn(text, url)`, where `url` arrives
  sanitized and keeps its color

The table above shows what each form outputs. By default the url is left delimited by
whitespace, so the terminal's own url detector picks it up intact.

```ts
isSupported(): boolean
```

`isSupported()` reports whether the current terminal supports links.

### `TERMI_LINK_HYPERLINK`

This environment variable is the one runtime control. It is checked before every detection
branch, so it overrides both `terminalLink` and `isSupported`:

- `1`, `true`, `always`, `enabled` force links on
- `0`, `false`, `never`, `disabled` force links off

Matching is exact and case-sensitive. Anything else, including `TRUE` and the empty string,
falls through to normal detection.

## Differences from terminal-link

This is an alternative with a different API. The surface differs in three places:

|               | `terminal-link` v5                                | `termi-link` (this library)    |
| ------------- | ------------------------------------------------- | ------------------------------ |
| entry         | default export, callable                          | named export `terminalLink`    |
| support check | `terminalLink.isSupported` (boolean **property**) | `isSupported()` (**function**) |
| stderr        | `terminalLink.stderr(...)`                        | none                           |

Behavior differs in three ways:

- No runtime dependencies, because terminal detection is built in.
- Urls are made [safe for the escape sequence](README.details.md#url-safety), so a crafted url
  cannot break or hijack the link.
- The [fallback contract](README.details.md#the-fallback-contract) differs twice:
  `terminalLink('', url)` returns the url alone, and a custom `fallback` receives the sanitized
  display value rather than the raw url.

## Reason

The `terminal-link` library, long the go-to for outputting links, added zero-width spaces around
urls, which made links lead to `404` in Windows terminals.
[Issue #18](https://github.com/sindresorhus/terminal-link/issues/18) was opened in February 2022
and stayed open for more than three years. That, plus a supported-terminal list that needed
updating more often than upstream released, led me to create this alternative.

> [!NOTE]
> terminal-link v5.0.0 (2025-09-08) fixed this issue and removed the zero-width spaces entirely.

## License

MIT
