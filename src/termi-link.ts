import { matchesEnv, TERMINALS } from "./terminals";

// Check if current terminal supports hyperlinks
function supportsHyperlinks(): boolean {
  // Force hyperlinks if environment variable is set
  if (matchesEnv("TERMI_LINK_HYPERLINK", ["1", "true", "always", "enabled"])) {
    return true;
  }
  if (matchesEnv("TERMI_LINK_HYPERLINK", ["0", "false", "never", "disabled"])) {
    return false;
  }

  // Detection is positive-only by default: a terminal that is present but below
  // its floor has nothing to say, so the entries after it still get their turn.
  // Only an `answersForSession` entry — the multiplexer receiving our escape
  // sequence — turns a failed gate into a `false` for the whole session.
  for (const terminal of TERMINALS) {
    if (!terminal.claims()) continue;
    if (terminal.supported()) return true;
    if (terminal.answersForSession) return false;
  }

  return false;
}

export const ANSI_RESET = "\u001b[0m";

// Printable ASCII that RFC 3986 does not permit in a URI. None of them delimit
// anything in the RFC's grammar, so encoding them yields the form it asks for —
// but they are still legal to OSC 8, which permits all of bytes 32-126, so the
// encoding is opt-in rather than automatic.
//
// Not a no-op for every parser, which is the other half of why it is opt-in:
// WHATWG reads `\` as a path separator under the special schemes, so
// `https://e.com/a\b` is the path `/a/b` raw and the single segment `/a%5Cb`
// encoded. The rest of the set only ever changes spelling, since none of them
// delimit anything in the URI grammar, but spelling is not nothing: `|` and
// `%7C` are not equivalent under RFC 3986, which normalizes percent-encoding
// for unreserved characters only, so a server may still tell them apart.
const INVALID_URI_CHARS = /[ "<>\\^`{|}]/g;

// A CSI sequence: ESC [, parameter bytes, intermediate bytes, one final byte.
// SGR is display decoration a caller may legitimately wrap the url in; every
// other CSI moves the cursor, clears the screen or sets a terminal mode.
const CSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

// SGR proper: parameter bytes only, no private-parameter introducer
// (`<` `=` `>` `?`) and no intermediate bytes. `CSI > 4 ; 2 m` ends in `m` but
// sets keyboard reporting, so the final byte alone cannot classify a sequence.
// `:` is admitted on purpose — T.416 sub-parameter colors are genuine SGR.
const SGR_SEQUENCE = /^\x1b\[[0-9;:]*m$/;

function sanitizeCore(url: string, strict = false): string {
  // Remove control characters. In an OSC 8 sequence a BEL would end the URI
  // early and an ESC could open a new sequence, so these are dropped rather
  // than encoded.
  const stripped = url.replace(/[\x00-\x1F\x7F]/g, "");
  // OSC 8 requires the URI to stay inside bytes 32-126. Anything above that is
  // unambiguously data rather than a delimiter, so percent-encoding it is
  // lossless. Bytes 32-126 are left alone: only the caller knows whether an `&`
  // separates parameters or is literal data. The `u` flag makes the class match
  // whole code points, so astral characters survive as a surrogate pair; a lone
  // surrogate cannot be encoded at all and is dropped like a control character.
  const encoded = stripped.replace(/[^\x00-\x7F]/gu, (c) => {
    try {
      return encodeURIComponent(c);
    } catch {
      return "";
    }
  });
  if (!strict) {
    return encoded;
  }
  // `%` is deliberately not in the set, so an already-encoded url stays
  // idempotent instead of double-encoding.
  return encoded.replace(INVALID_URI_CHARS, (c) => encodeURIComponent(c));
}

// Split a url that may carry SGR decoration into the bare `target` that feeds
// the OSC 8 URI and the decorated `display` that is actually printed.
//
// Order matters: each CSI match is consumed before the control-character strip
// runs on the plain run around it, so a dropped sequence leaves no `[34m`-style
// residue behind. A lone ESC that is not a CSI introducer never matches here and
// is still removed by the per-run strip.
function splitUrl(url: string, strict = false): { target: string; display: string } {
  let target = "";
  let display = "";
  let cursor = 0;
  for (const match of url.matchAll(CSI_SEQUENCE)) {
    const run = sanitizeCore(url.slice(cursor, match.index), strict);
    target += run;
    display += run;
    if (SGR_SEQUENCE.test(match[0])) {
      display += match[0];
    }
    cursor = match.index + match[0].length;
  }
  const tail = sanitizeCore(url.slice(cursor), strict);
  return { target: target + tail, display: display + tail };
}

/**
 * Creates a clickable terminal link sequence of characters. The url provided will be sanitized into two values: the OSC 8 target, from which control characters are removed and bytes above the 32-126 range OSC 8 permits are percent-encoded; and the display value, which is control-free except for the SGR sequences the library preserves. Encoding within ASCII stays with the caller, and has to: only the caller knows whether an `&` separates two query parameters or is literal data inside one of them, so a library that guessed would corrupt every url it guessed wrong about. Assemble urls with `new URL()` and `URLSearchParams`, or run each portion through `encodeURIComponent` before joining them, rather than concatenating strings.
 *
 * @param text The text to display, if an empty string `""` is passed, the text will be the same as the url, and in the fallback case, the link will be the only thing displayed.
 * @param url The URL to link to. It may carry SGR decoration, as in `terminalLink(red(text), blue(url))`, which is kept for display and never reaches the link target. A non-SGR CSI sequence is dropped whole from both forms. Only CSI is recognized: any other escape form (OSC, DCS, a two-character `ESC x`) has its `ESC` removed as a control character, and its printable remainder stays in the url. No `ESC` or `BEL` byte ever reaches the target, so no sequence can be injected into the link, but the target is not guaranteed byte-identical to a url carrying a non-CSI escape. On a supported terminal the url is not rendered when `text` is non-empty, so its decoration has no visible effect there.
 * @param options Optional parameters
 * @param options.fallback Override the default fallback or disable it. When a function is provided, it receives the `text` and the display value of the `url` as parameters and is expected to return a string. Because it is the display value, any SGR decoration on the url reaches the callback, while `BEL` and every non-SGR control character are already gone. That is safe: what the callback returns is printed as text and never becomes an OSC 8 URI.
 * If set to `false`, the `text` is returned unchanged on an unsupported terminal, with the URL simply not appended. This matches `terminal-link`.
 * @param options.strictUrlEncoding Also percent-encode the printable ASCII characters RFC 3986 forbids in a URI: space, double quote, angle brackets, backslash, caret, backtick, braces and pipe. Encoding them produces the form RFC 3986 asks for, while OSC 8 permits them raw, which is why this is opt-in and defaults to `false`. One caveat: a WHATWG url parser reads `\` as a path separator under the special schemes, so `https://e.com/a\b` resolves to the path `/a/b` raw but to a single segment `/a%5Cb` once encoded. Encoding it here would pin the backslash as a literal, so a url relying on that normalization should be run through `new URL()` and passed as its `.href`, which rewrites the backslash to `/` before this library sees it. The pass runs before the target and the display are split, so it applies on both paths rather than only the fallback. It is idempotent, since `%` is never re-encoded, but it is not a no-op on a url built with `new URL()`: the WHATWG encode set is narrower than RFC 3986 and leaves `|` raw in paths, along with `\`, `^`, `` ` ``, `{`, `|` and `}` in query and fragment. For those the option changes spelling without changing structure, since none of them delimit anything in the URI grammar. Whether a server treats `/a|b` and `/a%7Cb` as the same resource is application behavior, not something this library can promise: RFC 3986 guarantees equivalence only for percent-encoded unreserved characters, and `|` is not one. The truncation it prevents belongs to the fallback alone: a raw space is legal to OSC 8 and unambiguous inside the terminator-delimited sequence, but in plain text a URL detector stops at whitespace. Treat it as a safety net for urls you did not assemble yourself, not as a substitute for encoding them properly.
 * @returns Formatted terminal link string
 */
export function terminalLink(
  text: string,
  url: string,
  options?:
    | {
        fallback?: false | ((text: string, url: string) => string);
        strictUrlEncoding?: boolean;
      }
    | undefined,
): string {
  const { fallback = null, strictUrlEncoding = false } = options || {};
  const { target, display } = splitUrl(url, strictUrlEncoding);
  if (supportsHyperlinks()) {
    return `\x1b]8;;${target}\x07${text || display}\x1b]8;;\x07`;
  }
  if (fallback == null) {
    if (!text) {
      return display;
    }
    // Space-delimited, not wrapped in parens: a linkifier that treats a URL as
    // a run of non-whitespace would otherwise capture the closing paren.
    return `${text} ${display}`;
  } else if (fallback === false) {
    return text;
  } else {
    return fallback(text, display);
  }
}

/**
 * Checks if the terminal supports hyperlinks.
 * @returns boolean indicating hyperlink support
 */
export function isSupported(): boolean {
  return supportsHyperlinks();
}
