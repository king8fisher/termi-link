[![npm version](https://img.shields.io/npm/v/termi-link?logo=npm&labelColor=black&color=07293F)](https://npmjs.com/package/termi-link)

# termi-link

This library provides clickable terminal links for terminals that support them. It is designed to seamlessly replace [terminal-link](https://npmjs.com/package/terminal-link) using an internal terminal-detection mechanism.

## Differences from terminal-link

- **Zero runtime dependencies.** `terminal-link` depends on `ansi-escapes` and
  `supports-hyperlinks`. Terminal detection here is built in.
- **URLs are made safe for the escape sequence.** Control characters
  (`U+0000`–`U+001F` and `U+007F`) are stripped, and every remaining byte above
  the 32–126 range the
  [OSC 8 specification](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
  permits is percent-encoded. This holds on every path, including a custom
  `fallback`. `terminal-link` interpolates the URL verbatim, so a `BEL` inside it
  ends the sequence early, an `ESC` can start a new one, and a non-ASCII URL is
  emitted in a form the specification calls undefined.

Encoding *within* ASCII stays with the caller. Once a URL is a single string,
only the caller knows whether an `&` separates parameters or is literal data
inside one, so no library can encode that half without corrupting one case or
the other. Above 126 there is no such ambiguity — those bytes are always data —
which is why the split falls where it does. Build URLs with `new URL()` or
`URLSearchParams` rather than string concatenation and this takes care of
itself.

One group sits in between: space and `"`, `<`, `>`, `\`, `^`, `` ` ``, `{`, `|`,
`}` are forbidden in a URI by RFC 3986, yet still legal to OSC 8, which permits
all of bytes 32–126. They are left raw by default. Opt in with
`strictUrlEncoding: true` — worth doing if your URLs can contain spaces, since a
raw space truncates the link in the plain-text fallback:

```ts
terminalLink('report', 'file:///Users/me/My Documents/report.pdf');
// fallback linkifies only  file:///Users/me/My

terminalLink('report', 'file:///Users/me/My Documents/report.pdf', {
  strictUrlEncoding: true,
});
// fallback linkifies       file:///Users/me/My%20Documents/report.pdf
```

## API

- `terminalLink` — converts `text` and `url` into a clickable link when the terminal supports them. Otherwise, it uses the configured fallback.
  ```ts
  terminalLink(text: string, url: string, options?: {
    fallback?: false | ((text: string, url: string) => string),
    strictUrlEncoding?: boolean,
  } | undefined): string
  ```
  On an unsupported terminal:
  - default — `text url`, space-delimited, or just the URL when `text` is empty
  - `fallback: false` — `text` unchanged, with no URL appended
  - `fallback: fn` — whatever `fn(text, url)` returns; `url` is passed already sanitized

  The default keeps the URL delimited by whitespace so the terminal's own URL
  detector picks it up intact. Wrapping it in parens makes detectors that scan
  for a run of non-whitespace swallow the closing `)`.
- `isSupported` — reports whether the current terminal supports links.
  ```ts
  isSupported(): boolean
  ```

## Reason

The `terminal-link` library, long the go-to for outputting links, added zero-width spaces around URLs, which made links lead to `404` in Windows terminals. [Issue #18](https://github.com/sindresorhus/terminal-link/issues/18) was opened in February 2022 and stayed open for more than three years. That, plus a supported-terminal list that needed updating more often than upstream released, led me to create this alternative.

> [!NOTE]
> terminal-link v5.0.0 (2025-09-08) fixed this issue and removed the zero-width spaces entirely.

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

## Changelog

- 2.1.0
  - add detection of Foot, mintty, Tabby, Rio and Contour

- 2.0.0
  - **Breaking:** `fallback: false` now returns `text` unchanged instead of an empty string, matching `terminal-link`. Pass `fallback: () => ''` to keep the old behavior.
  - **Breaking:** the default fallback is now `text url` instead of `text (url)`, matching `terminal-link` v5. The parens broke URL detection in terminals that scan for a run of non-whitespace. Pass
    ```ts
    fallback: (text, url) => (text ? `${text} (${url})` : url)
    ```
    to keep the old format.
  - **Breaking:** a custom `fallback` function now receives the sanitized url instead of the raw one. Previously control characters survived on this path, so the documented sanitization guarantee did not hold for custom fallbacks.
  - urls now percent-encode every byte above the 32–126 range that OSC 8 permits, instead of emitting raw non-ASCII. Astral characters encode correctly and a lone surrogate is dropped rather than throwing.
  - add `strictUrlEncoding`, an opt-in that also percent-encodes the printable ASCII characters RFC 3986 forbids in a URI. Defaults to `false`, so existing output is unchanged. Turn it on if your URLs can contain spaces — a raw space truncates the link in the plain-text fallback.
  - add detection of Zed terminal

## Credits  

- [terminal-link](https://npmjs.com/package/terminal-link)
- [termlink](https://github.com/savioxavier/termlink)
- [supports-hyperlinks](https://github.com/zkat/supports-hyperlinks)
  - 3.2.0
- [tty-link](https://github.com/piotrmurach/tty-link)

## License

MIT

