// Interface for version information
interface Version {
  major: number;
  minor: number;
  patch: number;
}

// Environment variables that indicate hyperlink support
const ENVIRONMENT_VARIABLES = ["DOMTERM", "WT_SESSION", "KONSOLE_VERSION"];

// Parse version string into Version object
function parseVersion(version: string): Version {
  // parseInt, not Number: a component may carry a letter suffix — tmux numbers
  // its point releases `3.5a`, `3.6b` — and the leading digits are the version.
  // A wholly non-numeric component still yields NaN and still fails its gate.
  const [major = 0, minor = 0, patch = 0] = version
    .split(".")
    .map((component) => parseInt(component, 10));
  return { major, minor, patch };
}

// Check if environment variable exists
function hasEnv(name: string): boolean {
  return process.env[name] !== undefined;
}

// Get environment variable value
function getEnv(name: string): string {
  return process.env[name] || "";
}

// Check if environment variable matches any of the given values
function matchesEnv(name: string, values: string[]): boolean {
  return hasEnv(name) && values.includes(getEnv(name));
}

// Check if an environment variable contains the given needle, ignoring case.
// Wider than matchesEnv, which compares by exact equality: the terminals below
// that use it are documented by substring, not by an exact value.
function envIncludes(name: string, needle: string): boolean {
  return hasEnv(name) && getEnv(name).toLowerCase().includes(needle.toLowerCase());
}

// Compare a parsed version against a floor, major then minor then patch. A
// non-numeric component parses to NaN and every NaN comparison is false, so an
// unparseable version fails its gate rather than passing it.
function atLeast(v: Version, floor: string): boolean {
  const f = parseVersion(floor);
  if (v.major !== f.major) return v.major > f.major;
  if (v.minor !== f.minor) return v.minor > f.minor;
  return v.patch >= f.patch;
}

// Check if any of the environment variables exist
function hasAnyEnv(vars: string[]): boolean {
  return vars.some((v) => hasEnv(v));
}

// Check if current terminal supports hyperlinks
function supportsHyperlinks(): boolean {
  // Force hyperlinks if environment variable is set
  if (matchesEnv("TERMI_LINK_HYPERLINK", ["1", "true", "always", "enabled"])) {
    return true;
  }
  if (matchesEnv("TERMI_LINK_HYPERLINK", ["0", "false", "never", "disabled"])) {
    return false;
  }

  // A multiplexer is the program that actually receives our escape sequence,
  // so when one is present it answers for the session — the outer terminal is
  // one hop further out and its variables are inherited into the pane, where
  // they go stale on re-attach. That makes this branch terminal rather than
  // positive-only: falling through would let an inherited VTE_VERSION answer
  // for a tmux that drops OSC 8.
  //
  // Zellij is deliberately not a second arm of this branch (goal G5b). A
  // captured 0.44.3 pane environment shows it adds only
  // ZELLIJ, ZELLIJ_PANE_ID and ZELLIJ_SESSION_NAME, and leaves the outer
  // terminal's TERM_PROGRAM in place rather than claiming it the way tmux does.
  // So the checks below already answer for the outer terminal, and no ZELLIJ
  // variable carries a version to gate a pre-0.21.0 Zellij out with. A
  // presence-only branch could only restate what inheritance says, or claim a
  // terminal we cannot see is capable.
  if (hasEnv("TMUX")) {
    // tmux relays OSC 8 from 3.4, and from 3.2 it reports itself as
    // TERM_PROGRAM=tmux with its own version, so the gate is an ordinary one.
    // Whether the *outer* terminal can render the link is tmux's question, not
    // ours: it gates emission on the `hyperlinks` terminal feature (`Hls`).
    return (
      getEnv("TERM_PROGRAM") === "tmux" &&
      atLeast(parseVersion(getEnv("TERM_PROGRAM_VERSION")), "3.4")
    );
  }

  // VTE-based terminals. Positive-only: VTE_VERSION describes the terminal a
  // process was *launched from*, not the one receiving the escape sequence, so
  // it is inherited by whatever runs inside — a kitty started from a
  // gnome-terminal shell carries a stale value. A failed gate therefore means
  // "nothing to say" rather than "no", and the checks below get their turn.
  //
  // VTE packs its version as major * 10000 + minor * 100 + micro, so 5000 is
  // exactly 0.50.0 — the release that shipped OSC 8 and segfaulted on it. The
  // comparison is strict on purpose: 0.50.0 itself is out.
  if (hasEnv("VTE_VERSION")) {
    const v = parseVersion(getEnv("VTE_VERSION"));
    if (v.major > 5000) return true;
  }

  // Terminals with TERM_PROGRAM variable
  if (hasEnv("TERM_PROGRAM")) {
    const v = parseVersion(getEnv("TERM_PROGRAM_VERSION"));
    const term = getEnv("TERM_PROGRAM");

    switch (term) {
      case "iTerm.app":
        if (v.major > 3 || (v.major === 3 && v.minor >= 1)) return true;
        break;
      case "WezTerm": {
        // nixpkgs re-versions VCS snapshots as `0-unstable-<date>`, which parses
        // to major 0 and fails a date-stamped floor. Compare the date instead —
        // lexicographic ordering is exact for zero-padded ISO dates, which is
        // why the pattern requires the padding.
        const nix = /^0-unstable-(\d{4}-\d{2}-\d{2})$/.exec(getEnv("TERM_PROGRAM_VERSION"));
        if (nix) {
          if (nix[1] >= "2020-06-20") return true;
          break;
        }
        if (v.major >= 20200620) return true;
        break;
      }
      case "vscode":
        if (v.major > 1 || (v.major === 1 && v.minor >= 72)) return true;
        break;
      case "ghostty":
        if (v.major >= 1) return true;
        break;
      // Zed has only ever shipped 0.x, so any major-version gate would reject
      // every real release; upstream supports-hyperlinks matches it ungated.
      case "zed":
        return true;
      case "terminology":
        if (v.major > 1 || (v.major === 1 && v.minor >= 2)) return true;
        break;
      // Hyper below 4 renders OSC 8 as non-clickable pseudo-links: it ships
      // xterm.js < 5, which has no OSC 8 support at all.
      case "Hyper":
        if (v.major >= 4) return true;
        break;
    }

    // Matched by substring rather than by an exact value, so they cannot join
    // the switch above.
    if (envIncludes("TERM_PROGRAM", "mintty") && atLeast(v, "2.9.7")) return true;
    if (envIncludes("TERM_PROGRAM", "tabby")) return true;
    if (envIncludes("TERM_PROGRAM", "rio") && atLeast(v, "0.0.28")) return true;

    // positive-only: an unknown program, or a known one that failed its version
    // gate, falls through to the TERM / COLORTERM / TERMINAL_EMULATOR /
    // standalone-variable checks below instead of answering for them.
  }

  // Check TERM variable
  if (matchesEnv("TERM", ["xterm-kitty", "alacritty", "alacritty-direct", "xterm-ghostty"])) {
    return true;
  }

  // Kept out of the list above, which is exact-match: Foot sets either `foot`
  // or a value carrying it as a substring.
  if (envIncludes("TERM", "foot")) {
    return true;
  }

  // Check COLORTERM variable
  if (matchesEnv("COLORTERM", ["xfce4-terminal"])) {
    return true;
  }

  // Check JetBrains terminals
  if (matchesEnv("TERMINAL_EMULATOR", ["JetBrains-JediTerm"])) {
    return true;
  }

  // Contour is the only terminal keyed off neither TERM_PROGRAM, TERM,
  // COLORTERM nor TERMINAL_EMULATOR, so TERMINAL_VERSION_TRIPLE is read here
  // and nowhere else.
  if (
    envIncludes("TERMINAL_NAME", "contour") &&
    atLeast(parseVersion(getEnv("TERMINAL_VERSION_TRIPLE")), "0.1.0")
  ) {
    return true;
  }

  // Check standalone environment variables
  if (hasAnyEnv(ENVIRONMENT_VARIABLES)) {
    return true;
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
