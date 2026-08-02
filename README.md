[![npm version](https://img.shields.io/npm/v/termi-link?logo=npm&labelColor=black&color=07293F)](https://npmjs.com/package/termi-link)

# termi-link

Clickable links for terminals that support them, and readable plain text for the ones that do not.
It is an alternative to [terminal-link](https://npmjs.com/package/terminal-link) with an almost
matching API and semantics, differing in [a few places](#differences-from-terminal-link), so you
can move an existing import over with a small edit rather than a rewrite.

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

You can pass text formatting, such as color, to either argument. `red` and `blue` below stand for
whichever color helper you use; this library ships none.

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

Encoding your urls is up to you. Once a url is a single string, only you know whether an `&`
separates two query parameters or is part of the data inside one, so build your urls with
`new URL()` and `URLSearchParams` instead of gluing strings together, then hand the finished
result to `terminalLink`.

The library takes care of the rest. It removes anything from your url that could break or hijack
the link, and encodes the characters the escape sequence cannot carry, both in the link itself and
in the text it prints. Color is the deliberate exception: the formatting you wrapped the
url in survives into whatever gets printed, which is what makes the colored example above show
blue. Your `text` is a different matter, printed exactly as you give it, so clean it yourself if
it can carry anything you did not put there.

Ten characters fall between those two cases: space, `"`, `<`, `>`, `\`, `^`, `` ` ``, `{`, `|` and
`}`. A url is not supposed to contain any of them, but the escape sequence accepts them, so the
library passes them through as you wrote them. `strictUrlEncoding` encodes them for you, and it
stays off unless you ask for it. Turn it on when a url can reach you already unescaped, say from
the filesystem or a config file. A space is the one that does visible damage, cutting your link
short in the plain-text fallback:

```ts
terminalLink('report', 'file:///Users/me/My Documents/report.pdf');
// fallback linkifies only  file:///Users/me/My

terminalLink('report', 'file:///Users/me/My Documents/report.pdf', { strictUrlEncoding: true });
// fallback linkifies       file:///Users/me/My%20Documents/report.pdf
```

One thing to know before you turn it on: inside the path of an `https` or `file` style url, a
backslash works as a path separator, so encoding it changes where the link points. In a query or
a fragment it is just a character. Read [url safety](README.details.md#url-safety) if that could
affect your urls.

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

This environment variable lets you force links on or off at runtime. It is checked before every
detection branch, so it overrides both `terminalLink` and `isSupported`:

- `1`, `true`, `always`, `enabled` force links on
- `0`, `false`, `never`, `disabled` force links off

Matching is exact and case-sensitive. Anything else, including `TRUE` and the empty string,
falls through to normal detection.

## Supported terminals

Detection is built in. The library reads only the environment variables a terminal sets about
itself, with no runtime dependency, no network call and no round-trip to the terminal. Every
terminal it recognizes, the release each is supported from and the variables each is read
from are listed in [README.details.md](README.details.md#supported-terminals).

## Differences from terminal-link

This is an alternative with a different API. The surface differs in three places:

|               | [terminal-link](https://npmjs.com/package/terminal-link) v5 | `termi-link` (this library)    |
| ------------- | ----------------------------------------------------------- | ------------------------------ |
| entry         | default export, callable                                    | named export `terminalLink`    |
| support check | `terminalLink.isSupported` (boolean **property**)           | `isSupported()` (**function**) |
| stderr        | `terminalLink.stderr(...)`                                  | none                           |

Behavior differs in three ways:

- No runtime dependencies, because [terminal detection](#supported-terminals) is built in.
- Urls are made [safe for the escape sequence](README.details.md#url-safety), so a crafted url
  cannot break or hijack the link.
- The [fallback contract](README.details.md#the-fallback-contract) differs twice:
  `terminalLink('', url)` returns the url alone, and a custom `fallback` receives the sanitized
  display value rather than the raw url.

## Reason

The [terminal-link](https://npmjs.com/package/terminal-link) library, long the go-to for
outputting links, added zero-width spaces around urls, which made links lead to `404` in
Windows terminals. [Issue #18](https://github.com/sindresorhus/terminal-link/issues/18) was
opened in February 2022 and stayed open for more than three years. That, plus a
supported-terminal list that needed updating more often than upstream released, led me to
create this alternative.

> [!NOTE]
> terminal-link v5.0.0 (2025-09-08) fixed this issue and removed the zero-width spaces entirely.

## License

MIT
