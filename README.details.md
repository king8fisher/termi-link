# termi-link: the details

This is the long half of the documentation: the exact contracts, the version
history, and a glossary of the terminal jargon the front page uses. You need
none of it to call the library. Start at [README.md](README.md), which covers
what `termi-link` is, how to install it and how to use it.

- [The fallback contract](#the-fallback-contract)
- [URL safety](#url-safety)
- [The escape contract](#the-escape-contract)
- [Changelog](#changelog)
- [Credits](#credits)
- [Glossary](#glossary)

## The fallback contract

The fallback contract is close to `terminal-link` v5's, but two differences
remain by design:

- **Empty `text`.** v5's default fallback is `` `${text} ${url}` `` with no
  special case, so `terminalLink('', url)` yields a leading space. This library
  returns the url alone.
- **What a custom `fallback` receives.** v5 passes the url through untouched.
  This library passes the [display value](#target-and-display), sanitized and
  with the [SGR](#sgr) decoration kept. That is what makes the default and a
  hand-written `` (text, url) => `${text} ${url}` `` equivalent, and what keeps a
  [`BEL`](#esc-and-bel) out of the callback.

## URL safety

The
[OSC 8 specification](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
permits only bytes 32–126 inside the url. This library therefore strips the
control characters (`U+0000`–`U+001F` and `U+007F`) and percent-encodes every
remaining byte above 126. What survives is the
[OSC 8 target](#target-and-display), and it is control-free on every path.

The [display value](#target-and-display) is control-free too, apart from the
[SGR](#sgr) decoration the library preserves on purpose. That is the value the
fallback prints and a custom `fallback` receives.

`terminal-link` interpolates the url verbatim instead. A [`BEL`](#esc-and-bel)
inside it therefore ends the sequence early, an `ESC` can start a new one, and a
non-ASCII url is emitted in a form the specification calls undefined.

Encoding *within* ASCII stays with you. Once a url is a single string, only you
know whether an `&` separates parameters or is literal data inside one, so no
library can encode that half without corrupting one case or the other. Above 126
the ambiguity disappears, because those bytes are always data, and that is where
this library takes over. Build urls with `new URL()` or `URLSearchParams` rather
than by concatenation and the question never comes up.

Ten characters sit between those two cases: space, `"`, `<`, `>`, `\`, `^`,
`` ` ``, `{`, `|` and `}`. RFC 3986 forbids them in a URI, yet OSC 8 accepts
them, since it permits all of bytes 32–126, so they are left raw by default. Opt
in with `strictUrlEncoding: true`, which is worth doing if your urls can arrive
with spaces already in them, since a raw space truncates the link in the
plain-text fallback:

```ts
terminalLink('report', 'file:///Users/me/My Documents/report.pdf');
// fallback linkifies only  file:///Users/me/My

terminalLink('report', 'file:///Users/me/My Documents/report.pdf', {
  strictUrlEncoding: true,
});
// fallback linkifies       file:///Users/me/My%20Documents/report.pdf
```

The option is not fallback-only. It runs before the url is split, so it rewrites
the OSC 8 target a supported terminal receives as well as the display value that
is printed. The fallback is only where the raw form does visible damage, because
a url detector stops at whitespace while OSC 8 does not. On a supported terminal
the rewrite stays invisible as long as `text` is non-empty, since the url is not
rendered then; leave `text` empty and the label reads `My%20Documents`.

### What you can rely on

The pass is idempotent, because `%` is never re-encoded. Run it over a url that
is already encoded and the url comes back unchanged.

That still does not make it a no-op on a url you built with `new URL()`. The
WHATWG parser behind `new URL()` encodes a narrower set of characters than
RFC 3986 does, so a correctly built url can reach this library with some of them
still raw:

| component | left raw by `new URL()`      |
| --------- | ---------------------------- |
| path      | `\|`                         |
| query     | `\` `^` `` ` `` `{` `\|` `}` |
| fragment  | `\` `^` `{` `\|` `}`         |

The option respells all of those without restructuring them. None of them delimit
anything in the URI grammar, so encoding them leaves the components and the path
segments where they were: `/a|b` and `/a%7Cb` are each a single segment.

Whether a server treats those two spellings as the same resource is a different
question, and not one this library can answer for you. RFC 3986 guarantees
equivalence only for percent-encoded *unreserved* characters, and `|` is not one
of them, so a server may legitimately tell them apart. Decoding and routing are
application behavior. If one of your urls depends on that, settle on the
spelling the server expects, produce that spelling yourself, and leave
`strictUrlEncoding` off so nothing rewrites it afterwards.

One character does change meaning, which is why everything above talks about
spelling rather than meaning. A WHATWG parser reads `\` as a path separator, but
only in the path, and only under the special schemes (`http`, `https`, `ws`,
`wss`, `ftp`, `file`). The path in `https://e.com/a\b` is therefore `/a/b`,
while encoding it to `https://e.com/a%5Cb` yields a single segment named `a\b`.
The same backslash in a query, in a fragment, or under any other scheme is an
ordinary character, so encoding it there only respells it: `?q=a\b` and
`custom://e.com/a\b` both keep the backslash exactly where you put it. A url that went
through `new URL()` cannot hit this, because the parser rewrites that backslash
to `/` before the string ever reaches this library. Only a hand-assembled string
can, which is one more reason to build your urls rather than concatenate them.

## The escape contract

You can decorate both arguments with [SGR](#sgr), which is what lets you color
`text` and the url independently.

The decoration is kept for display and never reaches the OSC 8 target. A non-SGR
[CSI](#csi) sequence, such as cursor movement or a screen clear, is dropped
whole from both forms rather than surviving as literal URI text.

Only CSI is recognized. Any other escape form, whether OSC, DCS or a
two-character `ESC x`, loses its `ESC` as a control character and keeps its
printable remainder in the url: `"\x1b]0;title\x07" + url` reaches the terminal
as `]0;title` + url, in both the link target and the display. No `ESC` or `BEL`
byte ever reaches the target, so nothing can inject a sequence into the link,
but the url is no longer the one you passed. Decorate a url with SGR only, and
strip any other escape form before you call.

## Changelog

- 2.0.0
  - **Fallback contract**, now matching `terminal-link` v5
    - **Breaking:** `fallback: false` returns `text` unchanged, not an empty string
      - pass `fallback: () => ''` to keep the old behavior
    - **Breaking:** the default fallback is `text url`, not `text (url)`
      - the parens broke terminals whose URL detector scans for a run of non-whitespace
      - to keep the old format:
        ```ts
        fallback: (text, url) => (text ? `${text} (${url})` : url)
        ```
    - **Breaking:** a custom `fallback` receives the sanitized display value, not the raw url
      - control characters used to survive on this path; preserved [SGR](#sgr) decoration is the one deliberate exception
  - **URL safety**
    - every byte above the 32–126 range OSC 8 permits is percent-encoded instead of emitted raw
      - [astral characters](#astral-characters) encode correctly; a lone surrogate is dropped rather than throwing
    - new `strictUrlEncoding` also encodes the printable ASCII characters RFC 3986 forbids
      - defaults to `false`, so existing output is unchanged
      - turn it on if your URLs can contain spaces, since a raw space truncates the link in the plain-text fallback
    - **Breaking:** the `url` argument may carry SGR decoration, so `text` and the url can be colored independently
      - a decorated url previously reached the terminal as literal URI text: `\x1b[34m` + url arrived as `[34m` + url, a broken target on both paths
      - the sequence is now stripped from the OSC 8 target and kept in the display; a non-SGR CSI is dropped from both
      - a custom `fallback` receives the display form, so it sees the decoration too
      - undecorated urls are byte-identical to before
  - **Terminal detection**
    - add Zed
    - add Foot, mintty, Tabby, Rio and Contour
    - add tmux pass-through, so a session inside tmux 3.4 or later, the release that began relaying OSC 8, is reported as supported
      - **Breaking:** inside an older tmux the answer is now unsupported instead of inherited from the outer terminal, since those variables go stale the moment the session is re-attached elsewhere, and the multiplexer, not the terminal one hop out, receives the escape sequence
    - **Breaking:** Hyper below 4 is no longer reported as supported
      - it ships xterm.js below 5, which has no OSC 8, so the link was emitted and swallowed and the url disappeared entirely; the plain-text fallback now preserves it
    - a set but unrecognized `TERM_PROGRAM` no longer decides the answer on its own
      - detection falls through to the `TERM`, `COLORTERM`, `TERMINAL_EMULATOR` and standalone-variable checks, so a terminal that sets both is no longer reported unsupported
      - `terminology` 2.0 and later is recognized now, as its version gate rejected every release past 1.x

## Credits

Detection and fallback behavior is tracked against these releases:

- [terminal-link](https://npmjs.com/package/terminal-link) (JavaScript)
  - 5.0.0
- [termlink](https://github.com/savioxavier/termlink) (Go)
  - 1.4.3
- [supports-hyperlinks](https://github.com/zkat/supports-hyperlinks) (Rust)
  - 3.2.0
- [tty-link](https://github.com/piotrmurach/tty-link) (Ruby)
  - 0.2.0

## Glossary

### OSC 8

**OSC 8** is the escape sequence that makes terminal text clickable, the terminal equivalent of an HTML `<a href>`. The whole link travels as `ESC ]8;; <url> BEL <text> ESC ]8;; BEL`, so the url sits *inside* the sequence and must not contain any byte that could end it early.

### Target and display

A link is built from two different strings. The **OSC 8 target** is the url the terminal opens on click. It is never shown, and is stripped of everything that is not part of the address. The **display value** is the text printed instead of a link on a terminal without link support, so color is kept there on purpose.

### SGR

**SGR** ("Select Graphic Rendition") is the escape sequence terminals use for color and text style such as bold, underline and red. It is what color helpers like `chalk`, `picocolors` or `kleur` wrap a string in. Each one starts with an invisible `ESC` byte and ends with `m`, e.g. `ESC[34m` for blue.

### CSI

**CSI** ("Control Sequence Introducer") is the wider family SGR belongs to: an `ESC`, then `[`, then a command letter. Color is one command (`m`); the others move the cursor, clear the screen or scroll. Only color is display decoration, which is why the rest are dropped instead of kept.

### ESC and BEL

`ESC` (`U+001B`) and `BEL` (`U+0007`) are invisible control characters. `ESC` begins every escape sequence, and `BEL` ends the url part of an OSC 8 link, so either one inside a url can break the link or let a crafted url inject a sequence of its own.

### Astral characters

**Astral characters** are the ones outside the basic range, such as emoji and less common scripts, which JavaScript stores as a pair of code units. A **lone surrogate** is half of such a pair with no partner, which cannot be encoded at all.
