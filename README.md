[![npm version](https://img.shields.io/npm/v/termi-link?logo=npm&labelColor=black&color=07293F)](https://npmjs.com/package/termi-link)

# termi-link

This library provides clickable terminal links for terminals that support them, using an internal terminal-detection mechanism. It is an alternative to [terminal-link](https://npmjs.com/package/terminal-link) with a different API: the entry point and the support check are both shaped differently, so an existing import cannot be switched over unchanged.

## Differences from terminal-link

The API surface differs in three places:

| | `terminal-link` v5 | `termi-link` |
| --- | --- | --- |
| entry | default export, callable | named export `terminalLink` |
| support check | `terminalLink.isSupported` (boolean **property**) | `isSupported()` (**function**) |
| stderr | `terminalLink.stderr(...)` | none |

The missing `stderr` helper is deliberate: it takes a stream argument, and
per-stream capability is downstream of TTY detection, which is an explicit
non-goal here.

The fallback contract is close to v5's, but two differences remain by design:

- **Empty `text`.** v5's default fallback is `` `${text} ${url}` `` with no
  special case, so `terminalLink('', url)` yields a leading space. This library
  returns the url alone.
- **What a custom `fallback` receives.** v5 passes the url through untouched.
  This library passes the display value[^target-display] — sanitized, with the
  SGR[^sgr] decoration kept — which is what makes the default and a hand-written
  `` (text, url) => `${text} ${url}` `` equivalent, and what keeps a
  `BEL`[^escbel] out of the callback.

Behaviour differs too:

- **Zero runtime dependencies.** `terminal-link` depends on `ansi-escapes` and
  `supports-hyperlinks`. Terminal detection here is built in.
- **URLs are made safe for the escape sequence.** Control characters
  (`U+0000`–`U+001F` and `U+007F`) are stripped, and every remaining byte above
  the 32–126 range the
  [OSC 8 specification](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)[^osc8]
  permits is percent-encoded. That is the OSC 8 target[^target-display], and it
  is control-free on every path. The display value — what the fallback prints,
  and what a custom `fallback` receives — is control-free too, except for the
  SGR[^sgr] decoration the library deliberately preserves.
  `terminal-link` interpolates the URL verbatim, so a `BEL`[^escbel] inside it
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

## Styling the url

Both arguments may carry SGR[^sgr] decoration, so `text` and the url can be coloured
independently (`red` and `blue` below are any colour helper — this library
ships none):

```ts
terminalLink(red('termi-link'), blue('https://github.com/king8fisher/termi-link'));
// fallback: red text, blue url — and the link target itself stays byte-clean
```

The decoration is kept for display and never reaches the OSC 8 target. A non-SGR
CSI[^csi] sequence — cursor movement, screen clears — is dropped whole from both
forms rather than surviving as literal URI text.

Only CSI is recognized. Any other escape form — OSC, DCS, a two-character
`ESC x` — has its `ESC` removed as a control character, and its printable
remainder stays in the url: `"\x1b]0;title\x07" + url` reaches the terminal as
`]0;title` + url, in both the link target and the display. No `ESC` or `BEL`
byte ever reaches the target, so no sequence can be injected into the link, but
the URL is no longer the one you passed. Decorate a url with SGR only; if a url
may contain any other escape form, strip it before calling.

On a supported terminal the url is not rendered when `text` is non-empty, so
decorating it has no visible effect there; url styling is a fallback-only
instruction. To colour a rendered link on both paths, wrap the whole return
value instead: `red(terminalLink(text, url))`.

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
  - `fallback: fn` — whatever `fn(text, url)` returns; `url` is passed as the display value[^target-display], so any SGR[^sgr] decoration is preserved while `BEL` and every non-SGR control character are gone

  The default keeps the URL delimited by whitespace so the terminal's own URL
  detector picks it up intact. Wrapping it in parens makes detectors that scan
  for a run of non-whitespace swallow the closing `)`.
- `isSupported` — reports whether the current terminal supports links.
  ```ts
  isSupported(): boolean
  ```

### `TERMI_LINK_HYPERLINK`

The one runtime control surface. It is checked before every detection branch, so
it overrides the answer for both `terminalLink` and `isSupported`:

- `1`, `true`, `always`, `enabled` — force links on
- `0`, `false`, `never`, `disabled` — force links off

Matching is exact and case-sensitive. Any other value — including the empty
string, and including `TRUE` or `True` — falls through to normal detection, so
the variable being merely *set* means nothing.

It is intentionally not aliased to `terminal-link`'s `FORCE_HYPERLINK` — this
library's detection is independent of upstream's, and so is its override.

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

- 2.0.0
  - **Fallback contract** — now matches `terminal-link` v5
    - **Breaking:** `fallback: false` returns `text` unchanged, not an empty string
      - pass `fallback: () => ''` to keep the old behavior
    - **Breaking:** the default fallback is `text url`, not `text (url)`
      - the parens broke terminals whose URL detector scans for a run of non-whitespace
      - to keep the old format:
        ```ts
        fallback: (text, url) => (text ? `${text} (${url})` : url)
        ```
    - **Breaking:** a custom `fallback` receives the sanitized display value, not the raw url
      - control characters used to survive on this path; preserved SGR[^sgr] decoration is the one deliberate exception
  - **URL safety**
    - every byte above the 32–126 range OSC 8 permits is percent-encoded instead of emitted raw
      - astral characters[^astral] encode correctly; a lone surrogate is dropped rather than throwing
    - new `strictUrlEncoding` also encodes the printable ASCII characters RFC 3986 forbids
      - defaults to `false`, so existing output is unchanged
      - turn it on if your URLs can contain spaces — a raw space truncates the link in the plain-text fallback
    - **Breaking:** the `url` argument may carry SGR decoration, so `text` and the url can be coloured independently
      - a decorated url previously reached the terminal as literal URI text — `\x1b[34m` + url arrived as `[34m` + url, a broken target on both paths
      - the sequence is now stripped from the OSC 8 target and kept in the display; a non-SGR CSI is dropped from both
      - a custom `fallback` receives the display form, so it sees the decoration too
      - undecorated urls are byte-identical to before
  - **Terminal detection**
    - add Zed
    - add Foot, mintty, Tabby, Rio and Contour
    - add tmux pass-through — a session inside tmux 3.4 or later, the release that began relaying OSC 8, is reported as supported
      - **Breaking:** inside an older tmux the answer is now unsupported instead of inherited from the outer terminal — those variables go stale the moment the session is re-attached elsewhere, and the multiplexer, not the terminal one hop out, receives the escape sequence
    - **Breaking:** Hyper below 4 is no longer reported as supported
      - it ships xterm.js below 5, which has no OSC 8, so the link was emitted and swallowed and the url disappeared entirely; the plain-text fallback now preserves it
    - a set but unrecognized `TERM_PROGRAM` no longer decides the answer on its own
      - detection falls through to the `TERM`, `COLORTERM`, `TERMINAL_EMULATOR` and standalone-variable checks, so a terminal that sets both is no longer reported unsupported
      - `terminology` 2.0 and later is recognized now — its version gate rejected every release past 1.x

## Credits

Detection and fallback behaviour is tracked against these releases:

- [terminal-link](https://npmjs.com/package/terminal-link) (JavaScript)
  - 5.0.0
- [termlink](https://github.com/savioxavier/termlink) (Go)
  - 1.4.3
- [supports-hyperlinks](https://github.com/zkat/supports-hyperlinks) (Rust)
  - 3.2.0
- [tty-link](https://github.com/piotrmurach/tty-link) (Ruby)
  - 0.2.0

## License

MIT

[^osc8]: **OSC 8** is the escape sequence that makes terminal text clickable — the terminal equivalent of an HTML `<a href>`. The whole link travels as `ESC ]8;; <url> BEL <text> ESC ]8;; BEL`, so the url sits *inside* the sequence and must not contain any byte that could end it early.

[^target-display]: A link is built from two different strings. The **OSC 8 target** is the url the terminal opens on click — never shown, and stripped of everything that is not part of the address. The **display value** is the text printed instead of a link on a terminal without link support, so colour is kept there on purpose.

[^sgr]: **SGR** ("Select Graphic Rendition") is the escape sequence terminals use for colour and text style — bold, underline, red. It is what colour helpers like `chalk`, `picocolors` or `kleur` wrap a string in. Each one starts with an invisible `ESC` byte and ends with `m`, e.g. `ESC[34m` for blue.

[^csi]: **CSI** ("Control Sequence Introducer") is the wider family SGR belongs to: an `ESC`, then `[`, then a command letter. Colour is one command (`m`); the others move the cursor, clear the screen or scroll. Only colour is display decoration, which is why the rest are dropped instead of kept.

[^escbel]: `ESC` (`U+001B`) and `BEL` (`U+0007`) are invisible control characters. `ESC` begins every escape sequence, and `BEL` ends the url part of an OSC 8 link — so either one inside a url can break the link or let a crafted url inject a sequence of its own.

[^astral]: **Astral characters** are the ones outside the basic range — emoji, and less common scripts — which JavaScript stores as a pair of code units. A **lone surrogate** is half of such a pair with no partner, which cannot be encoded at all.

