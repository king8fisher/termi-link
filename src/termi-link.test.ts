import path from "path";
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { isSupported, terminalLink } from './termi-link';

const testAll = (input: string, expectedHyperlink: string, expectedNoHyperlink: string) => {
  if (isSupported()) {
    expect(input).toBe(expectedHyperlink)
  } else {
    expect(input).toBe(expectedNoHyperlink)
  }
}

describe('terminalLink with hyperlinks enabled', () => {
  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    process.env.TERMI_LINK_HYPERLINK = 'true';
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;
  });

  tests(true);
})

describe('terminalLink with hyperlinks disabled', () => {
  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    process.env.TERMI_LINK_HYPERLINK = 'false';
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = originalEnv;
  });

  tests(false);
})


function tests(setAsSupported: boolean) {
  test('isSupported', () => {
    expect(isSupported()).toBe(setAsSupported);
  });

  test('console', () => {
    console.log(terminalLink('', 'https://github.com/redwoodjs/redwood/releases'));
    console.log(terminalLink('https://github.com/redwoodjs/redwood/releases',
      'https://github.com/redwoodjs/redwood/releases'));
    const pathToFile = path.resolve(__dirname, 'termi-link.test.ts').split(path.sep).join(path.posix.sep);
    console.log(terminalLink('file://termi-link.test.ts', 'file://' + pathToFile));
  });

  test('empty text', () => {
    const input = terminalLink('', 'https://example.com');
    const expectedHyperlink = '\x1b]8;;https://example.com\x07https://example.com\x1b]8;;\x07';
    const expectedNoHyperlink = 'https://example.com';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });

  test('basic link', () => {
    const input = terminalLink('Hello', 'https://example.com');
    const expectedHyperlink = '\x1b]8;;https://example.com\x07Hello\x1b]8;;\x07';
    const expectedNoHyperlink = 'Hello https://example.com';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });

  // `fallback: false` means "do not append the URL", not "emit nothing" —
  // the text is returned unchanged, matching terminal-link.
  test('fallback set to false', () => {
    const input = terminalLink('Hello', 'https://example.com', { fallback: false });
    const expectedHyperlink = '\x1b]8;;https://example.com\x07Hello\x1b]8;;\x07';
    const expectedNoHyperlink = 'Hello';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });

  test('fallback set to false returns text verbatim', () => {
    const input = terminalLink('Hello (world)', 'https://example.com', { fallback: false });
    const expectedHyperlink = '\x1b]8;;https://example.com\x07Hello (world)\x1b]8;;\x07';
    const expectedNoHyperlink = 'Hello (world)';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });

  // The one case where "return the text" and the old "return an empty string"
  // coincide, so it is pinned explicitly rather than left to inference.
  test('fallback set to false with empty text', () => {
    const input = terminalLink('', 'https://example.com', { fallback: false });
    const expectedHyperlink = '\x1b]8;;https://example.com\x07https://example.com\x1b]8;;\x07';
    const expectedNoHyperlink = '';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });

  test('custom fallback function', () => {
    const input = terminalLink('Hello', 'https://example.com', {
      fallback: (text, url) => `${text} -> ${url}`,
    });
    const expectedHyperlink = '\x1b]8;;https://example.com\x07Hello\x1b]8;;\x07';
    const expectedNoHyperlink = 'Hello -> https://example.com';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });
}

// Every variable supportsHyperlinks() inspects. Detection tests must clear all
// of them, or they inherit the terminal the suite happens to be running in and
// pass for the wrong reason.
const DETECTION_ENV_VARS = [
  'TERMI_LINK_HYPERLINK',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM',
  'COLORTERM',
  'VTE_VERSION',
  'DOMTERM',
  'WT_SESSION',
  'KONSOLE_VERSION',
  'TERMINAL_EMULATOR',
  'TERMINAL_NAME',
  'TERMINAL_VERSION_TRIPLE',
];

describe('terminal detection by environment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of DETECTION_ENV_VARS) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('zed is supported', () => {
    process.env.TERM_PROGRAM = 'zed';
    process.env.TERM_PROGRAM_VERSION = '0.198.5';
    expect(isSupported()).toBe(true);
  });

  test('zed is supported when TERM_PROGRAM_VERSION is absent', () => {
    process.env.TERM_PROGRAM = 'zed';
    expect(isSupported()).toBe(true);
  });

  test('zed renders a hyperlink', () => {
    process.env.TERM_PROGRAM = 'zed';
    process.env.TERM_PROGRAM_VERSION = '0.198.5';
    expect(terminalLink('Zed', 'https://zed.dev'))
      .toBe('\x1b]8;;https://zed.dev\x07Zed\x1b]8;;\x07');
  });

  test('an unrecognized TERM_PROGRAM alone is unsupported', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    expect(isSupported()).toBe(false);
  });

  test('mintty 2.9.7 is supported — the floor itself passes', () => {
    process.env.TERM_PROGRAM = 'mintty';
    process.env.TERM_PROGRAM_VERSION = '2.9.7';
    expect(isSupported()).toBe(true);
  });

  // The floor is patch-level, so a two-component comparison would wrongly pass.
  test('mintty 2.9.6 is unsupported — the floor is patch-level', () => {
    process.env.TERM_PROGRAM = 'mintty';
    process.env.TERM_PROGRAM_VERSION = '2.9.6';
    expect(isSupported()).toBe(false);
  });

  test('mintty 3.0.0 is supported — a higher major implies support', () => {
    process.env.TERM_PROGRAM = 'mintty';
    process.env.TERM_PROGRAM_VERSION = '3.0.0';
    expect(isSupported()).toBe(true);
  });

  // An absent version parses to 0.0.0, which must not read as satisfying a gate.
  test('mintty without a version is unsupported', () => {
    process.env.TERM_PROGRAM = 'mintty';
    expect(isSupported()).toBe(false);
  });

  test('Tabby is supported — ungated', () => {
    process.env.TERM_PROGRAM = 'Tabby';
    expect(isSupported()).toBe(true);
  });

  // Case-insensitivity is why `switch (term)` cannot express these cases.
  test('tabby is supported regardless of case', () => {
    process.env.TERM_PROGRAM = 'tabby';
    expect(isSupported()).toBe(true);
  });

  test('rio 0.0.28 is supported — the floor itself passes', () => {
    process.env.TERM_PROGRAM = 'rio';
    process.env.TERM_PROGRAM_VERSION = '0.0.28';
    expect(isSupported()).toBe(true);
  });

  test('rio 0.0.27 is unsupported', () => {
    process.env.TERM_PROGRAM = 'rio';
    process.env.TERM_PROGRAM_VERSION = '0.0.27';
    expect(isSupported()).toBe(false);
  });

  test('rio 0.1.0 is supported — a higher minor implies support', () => {
    process.env.TERM_PROGRAM = 'rio';
    process.env.TERM_PROGRAM_VERSION = '0.1.0';
    expect(isSupported()).toBe(true);
  });

  test('foot is supported', () => {
    process.env.TERM = 'foot';
    expect(isSupported()).toBe(true);
  });

  // Foot sets either value, and the exact-match TERM list would miss this one.
  test('foot-extra is supported', () => {
    process.env.TERM = 'foot-extra';
    expect(isSupported()).toBe(true);
  });

  test('FOOT is supported regardless of case', () => {
    process.env.TERM = 'FOOT';
    expect(isSupported()).toBe(true);
  });

  test('contour 0.1.0 is supported — the floor itself passes', () => {
    process.env.TERMINAL_NAME = 'contour';
    process.env.TERMINAL_VERSION_TRIPLE = '0.1.0';
    expect(isSupported()).toBe(true);
  });

  test('contour 0.0.9 is unsupported', () => {
    process.env.TERMINAL_NAME = 'contour';
    process.env.TERMINAL_VERSION_TRIPLE = '0.0.9';
    expect(isSupported()).toBe(false);
  });

  test('contour without a version triple is unsupported', () => {
    process.env.TERMINAL_NAME = 'contour';
    expect(isSupported()).toBe(false);
  });

  // A failed Contour gate must fall through to the standalone-variable check,
  // not answer for it.
  test('a failed contour gate still reaches the standalone-variable check', () => {
    process.env.TERMINAL_NAME = 'contour';
    process.env.TERMINAL_VERSION_TRIPLE = '0.0.9';
    process.env.WT_SESSION = '1';
    expect(isSupported()).toBe(true);
  });

  // 3.4.1 is Hyper's newest stable release and it pins xterm.js 4.19.0, below
  // the 5.0.0 floor where OSC 8 support begins.
  test('Hyper 3.4.1 is unsupported — every stable Hyper is below the floor', () => {
    process.env.TERM_PROGRAM = 'Hyper';
    process.env.TERM_PROGRAM_VERSION = '3.4.1';
    expect(isSupported()).toBe(false);
  });

  test('Hyper 4.0.0 is supported', () => {
    process.env.TERM_PROGRAM = 'Hyper';
    process.env.TERM_PROGRAM_VERSION = '4.0.0';
    expect(isSupported()).toBe(true);
  });

  // The shipped 4.x builds are canaries, and parseVersion yields patch: NaN for
  // them. A major-only comparison is unaffected; routing this gate through
  // atLeast would compare NaN and wrongly reject.
  test('Hyper 4.0.0-canary.5 is supported', () => {
    process.env.TERM_PROGRAM = 'Hyper';
    process.env.TERM_PROGRAM_VERSION = '4.0.0-canary.5';
    expect(isSupported()).toBe(true);
  });

  test('Hyper without a version is unsupported', () => {
    process.env.TERM_PROGRAM = 'Hyper';
    expect(isSupported()).toBe(false);
  });
});

// Setting TERM_PROGRAM must not decide the answer on its own. A program the
// switch does not know, or a known one whose version gate fails, still has to
// reach the TERM / COLORTERM / TERMINAL_EMULATOR / standalone-variable checks
// below it — a terminal that sets both TERM_PROGRAM and TERM is otherwise
// reported unsupported for the wrong reason.
describe('TERM_PROGRAM fall-through', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of DETECTION_ENV_VARS) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('an unknown program still reaches the TERM check', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    process.env.TERM = 'xterm-kitty';
    expect(isSupported()).toBe(true);
  });

  test('an unknown program still reaches the COLORTERM check', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    process.env.COLORTERM = 'xfce4-terminal';
    expect(isSupported()).toBe(true);
  });

  test('an unknown program still reaches the TERMINAL_EMULATOR check', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    process.env.TERMINAL_EMULATOR = 'JetBrains-JediTerm';
    expect(isSupported()).toBe(true);
  });

  test('an unknown program still reaches the standalone-variable check', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    process.env.WT_SESSION = '1';
    expect(isSupported()).toBe(true);
  });

  test('a known program whose gate fails still reaches the TERM check', () => {
    process.env.TERM_PROGRAM = 'ghostty';
    process.env.TERM_PROGRAM_VERSION = '0.9.0';
    process.env.TERM = 'xterm-ghostty';
    expect(isSupported()).toBe(true);
  });

  test('falling through does not turn a failed gate into a pass', () => {
    process.env.TERM_PROGRAM = 'ghostty';
    process.env.TERM_PROGRAM_VERSION = '0.9.0';
    expect(isSupported()).toBe(false);
  });

  test('iTerm.app above its floor still returns early', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    process.env.TERM_PROGRAM_VERSION = '3.1.0';
    expect(isSupported()).toBe(true);
  });

  test('ghostty above its floor still returns early', () => {
    process.env.TERM_PROGRAM = 'ghostty';
    process.env.TERM_PROGRAM_VERSION = '1.0.0';
    expect(isSupported()).toBe(true);
  });

  test('terminology 2.0 is supported — a higher major implies support', () => {
    process.env.TERM_PROGRAM = 'terminology';
    process.env.TERM_PROGRAM_VERSION = '2.0.0';
    expect(isSupported()).toBe(true);
  });

  test('terminology 1.1 is unsupported — the 1.2 floor still holds', () => {
    process.env.TERM_PROGRAM = 'terminology';
    process.env.TERM_PROGRAM_VERSION = '1.1.0';
    expect(isSupported()).toBe(false);
  });

  test('terminology 1.2 is supported', () => {
    process.env.TERM_PROGRAM = 'terminology';
    process.env.TERM_PROGRAM_VERSION = '1.2.0';
    expect(isSupported()).toBe(true);
  });

  test('alacritty is matched by TERM, not by a version-gated program case', () => {
    process.env.TERM_PROGRAM = 'alacritty';
    process.env.TERM_PROGRAM_VERSION = '0.10.0';
    process.env.TERM = 'alacritty';
    expect(isSupported()).toBe(true);
  });

  test('kitty is matched by TERM, not by a version-gated program case', () => {
    process.env.TERM_PROGRAM = 'kitty';
    process.env.TERM_PROGRAM_VERSION = '1.0.0';
    process.env.TERM = 'xterm-kitty';
    expect(isSupported()).toBe(true);
  });

  test('a substring-matched program whose gate fails still reaches the TERM check', () => {
    process.env.TERM_PROGRAM = 'rio';
    process.env.TERM_PROGRAM_VERSION = '0.0.1';
    process.env.TERM = 'xterm-kitty';
    expect(isSupported()).toBe(true);
  });

  test('falling through does not turn a failed mintty gate into a pass', () => {
    process.env.TERM_PROGRAM = 'mintty';
    process.env.TERM_PROGRAM_VERSION = '1.0.0';
    expect(isSupported()).toBe(false);
  });

  test('a Hyper below the floor still reaches the TERM check', () => {
    process.env.TERM_PROGRAM = 'Hyper';
    process.env.TERM_PROGRAM_VERSION = '3.4.1';
    process.env.TERM = 'xterm-kitty';
    expect(isSupported()).toBe(true);
  });
});

// On an unsupported terminal the output is plain text, so the terminal's own
// URL detector has to find the link. Many detectors take a run of
// non-whitespace after the scheme, which swallows a trailing `)`. U+200B is a
// format character, not whitespace, so padding with it gets captured too and
// percent-encodes to %E2%80%8B. A real space is the only delimiter that works
// everywhere — these tests pin that.
describe('fallback format contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TERMI_LINK_HYPERLINK = 'false';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const grab = (s: string) => s.match(/https?:\/\/[^\s]+/)?.[0];

  test('the URL survives a naive non-whitespace linkifier', () => {
    expect(grab(terminalLink('Hello', 'https://example.com')))
      .toBe('https://example.com');
  });

  test('default fallback is space-delimited, with no parens or zero-width space', () => {
    const output = terminalLink('Hello', 'https://example.com');
    expect(output).toBe('Hello https://example.com');
    expect(output).not.toContain('​');
  });

  test('empty text yields the bare URL with no leading space', () => {
    expect(terminalLink('', 'https://example.com')).toBe('https://example.com');
  });

  // The sanitization guarantee has to hold on every path, not just the default
  // one — a custom fallback receives the url already stripped, because callers
  // have no way to sanitize it themselves (`sanitizeUrl` is not exported).
  test('a custom fallback receives the sanitized url', () => {
    let received = '';
    const output = terminalLink('Hi', 'https://ex\x07am\x1bple.com', {
      fallback: (text, url) => {
        received = url;
        return `${text} ${url}`;
      },
    });
    expect(received).toBe('https://example.com');
    expect(output).toBe('Hi https://example.com');
  });

  test('the default fallback strips control characters too', () => {
    expect(terminalLink('Hi', 'https://ex\x07am\x1bple.com'))
      .toBe('Hi https://example.com');
  });
});

// OSC 8 requires the URI to stay inside bytes 32-126, so anything above that
// has to be percent-encoded before it reaches the escape sequence. Bytes 32-126
// stay untouched — that half of the encoding is the caller's, because only they
// know whether an `&` is a separator or literal data.
describe('url encoding contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TERMI_LINK_HYPERLINK = 'false';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const urlOf = (text: string, url: string) =>
    terminalLink(text, url, { fallback: (_t, u) => u });

  test('non-ASCII is percent-encoded', () => {
    expect(urlOf('x', 'https://e.com/café')).toBe('https://e.com/caf%C3%A9');
    expect(urlOf('x', 'https://e.com/привет'))
      .toBe('https://e.com/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82');
  });

  // A naive [-￿] class would match each half of the surrogate pair
  // separately and throw URIError. The `u` flag is what prevents that.
  test('astral characters encode without throwing', () => {
    expect(urlOf('x', 'https://e.com/🎉')).toBe('https://e.com/%F0%9F%8E%89');
  });

  test('a lone surrogate is dropped rather than throwing', () => {
    expect(() => urlOf('x', 'https://e.com/\uD83D')).not.toThrow();
    expect(urlOf('x', 'https://e.com/\uD83D')).toBe('https://e.com/');
  });

  test('an already-encoded url is left unchanged', () => {
    expect(urlOf('x', 'https://e.com/caf%C3%A9')).toBe('https://e.com/caf%C3%A9');
  });

  test('ASCII delimiters are left to the caller', () => {
    expect(urlOf('x', 'https://e.com/?a=1&b=2#frag'))
      .toBe('https://e.com/?a=1&b=2#frag');
  });

  // Opt-in, because a raw space is legal to OSC 8 even though RFC 3986 forbids
  // it. Default-off keeps 1.x output byte-identical for these characters.
  test('strictUrlEncoding is off by default, leaving invalid ASCII raw', () => {
    expect(urlOf('x', 'https://e.com/My Documents'))
      .toBe('https://e.com/My Documents');
  });

  test('strictUrlEncoding encodes the characters RFC 3986 forbids', () => {
    const strict = (url: string) =>
      terminalLink('x', url, { fallback: (_t, u) => u, strictUrlEncoding: true });
    expect(strict('https://e.com/My Documents')).toBe('https://e.com/My%20Documents');
    expect(strict('https://e.com/a"b<c>d\\e^f`g{h|i}j'))
      .toBe('https://e.com/a%22b%3Cc%3Ed%5Ce%5Ef%60g%7Bh%7Ci%7Dj');
  });

  test('strictUrlEncoding does not double-encode an existing escape', () => {
    expect(terminalLink('x', 'https://e.com/My%20Documents', {
      fallback: (_t, u) => u, strictUrlEncoding: true,
    })).toBe('https://e.com/My%20Documents');
  });

  // The reason the option exists: whitespace truncates the fallback link.
  test('strictUrlEncoding keeps a spaced url intact for a naive linkifier', () => {
    const url = 'file:///Users/me/My Documents/report.pdf';
    const loose = terminalLink('report', url);
    const strict = terminalLink('report', url, { strictUrlEncoding: true });
    expect(loose.match(/file:\S+/)?.[0]).toBe('file:///Users/me/My');
    expect(strict.match(/file:\S+/)?.[0])
      .toBe('file:///Users/me/My%20Documents/report.pdf');
  });

  test('every emitted url stays inside bytes 32-126', () => {
    for (const url of [
      'https://e.com/café',
      'https://e.com/привет',
      'https://e.com/🎉',
      'https://e.com/a\x07b',
    ]) {
      const out = urlOf('x', url);
      expect(out).toMatch(/^[\x20-\x7E]*$/);
    }
  });
});

