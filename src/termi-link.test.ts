import path from "path";
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { isSupported, terminalLink } from './termi-link';

// Local SGR helpers rather than a colour devDependency: chalk and picocolors
// auto-detect colour support and emit empty strings when stdout is not a TTY,
// which is exactly the case under vitest. Every byte-level assertion below
// would then compare '' + url + '' against itself and verify nothing.
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const italic = (s: string) => `\x1b[3m${s}\x1b[0m`;
const underline = (s: string) => `\x1b[4m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const bgYellow = (s: string) => `\x1b[43m${s}\x1b[0m`;
const c256 = (s: string) => `\x1b[38;5;208m${s}\x1b[0m`;
const truecolor = (s: string) => `\x1b[38;2;255;128;0m${s}\x1b[0m`;

const REPO_URL = 'https://github.com/king8fisher/termi-link';

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

  // Printed, not asserted: the byte-level contract is covered by the
  // 'url display decoration' suite, so this block exists to be read in a real
  // terminal. The link text should be styled, the links clickable, and no
  // stray `[34m`-style residue should appear anywhere.
  test('console', () => {
    console.log("terminalLink('', REPO_URL):");
    console.log(terminalLink('', REPO_URL));
    console.log('terminalLink(REPO_URL, REPO_URL):');
    console.log(terminalLink(REPO_URL, REPO_URL));
    const pathToFile = path.resolve(__dirname, 'termi-link.test.ts').split(path.sep).join(path.posix.sep);
    console.log("terminalLink('file://termi-link.test.ts', 'file://' + pathToFile):");
    console.log(terminalLink('file://termi-link.test.ts', 'file://' + pathToFile));

    console.log("terminalLink(red('termi-link'), blue(REPO_URL)):");
    console.log(terminalLink(red('termi-link'), blue(REPO_URL)));
    console.log("red(terminalLink('termi-link', REPO_URL)):");
    console.log(red(terminalLink('termi-link', REPO_URL)));
    console.log("terminalLink('', blue(REPO_URL)):");
    console.log(terminalLink('', blue(REPO_URL)));
    console.log("terminalLink(bold('termi-link'), underline(REPO_URL)):");
    console.log(terminalLink(bold('termi-link'), underline(REPO_URL)));
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
  'TMUX',
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

// A multiplexer is the program that actually receives the escape sequence, so
// when one is present it answers for the session and the outer terminal's
// inherited variables must not. That makes this branch terminal rather than
// fall-through, which is a deliberate divergence from the contract above.
describe('multiplexer pass-through', () => {
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

  const SOCKET = '/tmp/tmux-501/default,1,0';

  test('tmux 3.4 is supported — the floor itself passes', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'tmux';
    process.env.TERM_PROGRAM_VERSION = '3.4';
    expect(isSupported()).toBe(true);
  });

  // The shipped release. Number('6b') is NaN, so this is the case that forces
  // parseVersion onto parseInt.
  test('tmux 3.6b is supported — a letter suffix still parses', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'tmux';
    process.env.TERM_PROGRAM_VERSION = '3.6b';
    expect(isSupported()).toBe(true);
  });

  test('tmux 3.3a is unsupported — below the floor, letter suffix notwithstanding', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'tmux';
    process.env.TERM_PROGRAM_VERSION = '3.3a';
    expect(isSupported()).toBe(false);
  });

  test('tmux without a version is unsupported', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'tmux';
    expect(isSupported()).toBe(false);
  });

  // A tmux old enough not to claim TERM_PROGRAM leaves the outer terminal's
  // value in the pane, and that value must not answer for the multiplexer.
  test('an outer terminal TERM_PROGRAM inside a pane is unsupported', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'ghostty';
    process.env.TERM_PROGRAM_VERSION = '1.3.2';
    expect(isSupported()).toBe(false);
  });

  // The leak this step exists to close: VTE_VERSION is not in tmux's default
  // update-environment, so it is inherited and goes stale on re-attach. This
  // pins the branch as terminal — without it the negative result is
  // indistinguishable from the old behavior.
  test('an inherited VTE_VERSION does not answer for a tmux below the floor', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'tmux';
    process.env.TERM_PROGRAM_VERSION = '3.3a';
    process.env.VTE_VERSION = '6800';
    expect(isSupported()).toBe(false);
  });

  test('the force variable still wins over the multiplexer branch', () => {
    process.env.TMUX = SOCKET;
    process.env.TERM_PROGRAM = 'tmux';
    process.env.TERM_PROGRAM_VERSION = '3.3a';
    process.env.TERMI_LINK_HYPERLINK = 'true';
    expect(isSupported()).toBe(true);
  });

  // No `case 'tmux'` was added to the switch, so outside a pane a stray
  // TERM_PROGRAM=tmux still falls through per the fall-through contract.
  test('TERM_PROGRAM=tmux without TMUX still falls through to the TERM check', () => {
    process.env.TERM_PROGRAM = 'tmux';
    process.env.TERM_PROGRAM_VERSION = '3.6b';
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

  // The control-free guarantee is the OSC 8 target's; a custom fallback still
  // receives a stripped display value, because callers have no way to sanitize
  // it themselves (`splitUrl` is not exported). The display value keeps
  // preserved SGR by design — see the `url display decoration` suite.
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


// The `url` argument may carry SGR decoration, so it is split into a
// decoration-free OSC 8 target and a decoration-preserving display form. That
// lets terminalLink(red(text), blue(url)) render both colours without letting
// an escape byte reach — and corrupt — the link target.
describe('url display decoration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  type Options = Parameters<typeof terminalLink>[2];

  const supported = (text: string, url: string, options?: Options) => {
    process.env.TERMI_LINK_HYPERLINK = 'true';
    return terminalLink(text, url, options);
  };

  const unsupported = (text: string, url: string, options?: Options) => {
    process.env.TERMI_LINK_HYPERLINK = 'false';
    return terminalLink(text, url, options);
  };

  // Splits `\x1b]8;;<target>\x07<display>\x1b]8;;\x07` so the two halves can be
  // asserted on separately.
  const osc8 = (output: string) => {
    const match = /^\x1b\]8;;([^\x07]*)\x07([\s\S]*)\x1b\]8;;\x07$/.exec(output);
    if (!match) throw new Error(`not an OSC 8 sequence: ${JSON.stringify(output)}`);
    return { target: match[1], display: match[2] };
  };

  const wrappers: [string, (s: string) => string][] = [
    ['bold', bold],
    ['italic', italic],
    ['underline', underline],
    ['red', red],
    ['bgYellow', bgYellow],
    ['c256', c256],
    ['truecolor', truecolor],
    ['combined', (s) => `\x1b[1;3;34m${s}\x1b[0m`],
  ];

  test.each(wrappers)('the OSC 8 target drops %s decoration', (_name, wrap) => {
    const { target } = osc8(supported('link', wrap(REPO_URL)));
    expect(target).toBe(REPO_URL);
    expect(target).not.toContain('\x1b');
    expect(target).not.toMatch(/\[[\d;]*m/);
  });

  test.each(wrappers)('the fallback keeps %s decoration around the url', (_name, wrap) => {
    const decorated = wrap(REPO_URL);
    expect(unsupported('link', decorated)).toBe(`link ${decorated}`);
  });

  test('a bare reset on either side leaves the target undecorated', () => {
    expect(osc8(supported('link', `\x1b[m${REPO_URL}`)).target).toBe(REPO_URL);
    expect(osc8(supported('link', `${REPO_URL}\x1b[m`)).target).toBe(REPO_URL);
    expect(osc8(supported('link', `\x1b[m${REPO_URL}\x1b[m`)).target).toBe(REPO_URL);
  });

  test('the fallback renders text and url in two distinct colours', () => {
    expect(unsupported(red('termi-link'), blue(REPO_URL)))
      .toBe(`${red('termi-link')} ${blue(REPO_URL)}`);
  });

  // The url is not rendered on the supported path when `text` is non-empty, so
  // its decoration has nowhere to go and is discarded rather than leaked.
  test('the supported path keeps the text colour and discards the url colour', () => {
    const { target, display } = osc8(supported(red('termi-link'), blue(REPO_URL)));
    expect(target).toBe(REPO_URL);
    expect(display).toBe(red('termi-link'));
    expect(display).not.toContain('\x1b[34m');
  });

  test('an empty text falls back to the decorated url exactly once', () => {
    const output = unsupported('', blue(REPO_URL));
    expect(output).toBe(blue(REPO_URL));
    expect(output.split(REPO_URL)).toHaveLength(2);
  });

  test('an empty text renders the decorated url as the display span', () => {
    const { target, display } = osc8(supported('', blue(REPO_URL)));
    expect(target).toBe(REPO_URL);
    expect(display).toBe(blue(REPO_URL));
  });

  // Only SGR is display decoration. Every other CSI moves the cursor or clears
  // the screen, so it is dropped whole from both forms rather than printed.
  test.each(['\x1b[?25l', '\x1b[2J', '\x1b[1A', '\x1b[1;40r'])(
    'the non-SGR CSI sequence %j is dropped from both target and display',
    (seq) => {
      const { target, display } = osc8(supported('', `${seq}${REPO_URL}`));
      expect(target).toBe(REPO_URL);
      expect(display).toBe(REPO_URL);
      expect(display).not.toContain('[');
      expect(unsupported('', `${seq}${REPO_URL}`)).toBe(REPO_URL);
    },
  );

  test('an undecorated call is byte-identical to the undecorated contract', () => {
    expect(supported('Hello', 'https://example.com'))
      .toBe('\x1b]8;;https://example.com\x07Hello\x1b]8;;\x07');
    expect(unsupported('Hello', 'https://example.com'))
      .toBe('Hello https://example.com');
    expect(unsupported('', 'https://example.com')).toBe('https://example.com');
  });

  test('decoration in the middle of the url stays in the display only', () => {
    const url = 'https://\x1b[31mx.com\x1b[0m/path';
    const { target, display } = osc8(supported('', url));
    expect(target).toBe('https://x.com/path');
    expect(display).toBe(url);
  });

  test('two adjacent sequences both survive into the display', () => {
    const url = `\x1b[1m\x1b[34m${REPO_URL}`;
    const { target, display } = osc8(supported('', url));
    expect(target).toBe(REPO_URL);
    expect(display).toBe(url);
  });

  test('strictUrlEncoding encodes inside a decorated url and leaves the decoration alone', () => {
    const { target, display } = osc8(
      supported('', blue('https://e.com/My Documents'), { strictUrlEncoding: true }),
    );
    expect(target).toBe('https://e.com/My%20Documents');
    expect(display).toBe(blue('https://e.com/My%20Documents'));
  });

  test('a custom fallback receives the display form of the url', () => {
    let received = '';
    unsupported('Hi', blue(REPO_URL), {
      fallback: (_text, url) => (received = url),
    });
    expect(received).toBe(blue(REPO_URL));
  });

  // The control-character guarantee is scoped to the OSC 8 target. The display
  // value a custom fallback receives is control-free except for the SGR the
  // library preserves, so the ESC bytes below are deliberate, not a leak.
  test('preserved SGR reaches a custom fallback', () => {
    let received = '';
    unsupported('Hi', blue(REPO_URL), {
      fallback: (_text, url) => (received = url),
    });
    expect(received).toBe(blue(REPO_URL));
    expect(received).toContain('\x1b');
  });

  test('a BEL does not reach a custom fallback', () => {
    let received = '';
    unsupported('Hi', blue('https://ex\x07ample.com'), {
      fallback: (_text, url) => (received = url),
    });
    expect(received).toBe(blue('https://example.com'));
    expect(received).not.toContain('\x07');
  });

  test('a non-SGR CSI does not reach a custom fallback', () => {
    let received = '';
    unsupported('Hi', blue('https://e\x1b[2Jcom'), {
      fallback: (_text, url) => (received = url),
    });
    expect(received).toBe(blue('https://ecom'));
    expect(received).not.toContain('[2J');
  });

  // The only ESC bytes left here are the two the `blue` wrapper contributes, so
  // this asserts the exact value rather than the absence of ESC.
  test('a lone ESC that is not a CSI introducer does not reach a custom fallback', () => {
    let received = '';
    unsupported('Hi', blue('https://e\x1bcom'), {
      fallback: (_text, url) => (received = url),
    });
    expect(received).toBe(blue('https://ecom'));
  });

  // The contrast that makes the split legible: none of the four urls above
  // leaves any control character in the target.
  test.each([
    REPO_URL,
    'https://ex\x07ample.com',
    'https://e\x1b[2Jcom',
    'https://e\x1bcom',
  ])('the target carries no control-character exception for %j', (url) => {
    const { target } = osc8(supported('', blue(url)));
    expect(target).not.toContain('\x1b');
    expect(target).not.toContain('\x07');
  });

  test('wrapping the whole return value leaves the OSC 8 pair intact', () => {
    expect(red(supported('termi-link', REPO_URL)))
      .toBe(`\x1b[31m\x1b]8;;${REPO_URL}\x07termi-link\x1b]8;;\x07\x1b[0m`);
    expect(red(unsupported('termi-link', REPO_URL)))
      .toBe(`\x1b[31mtermi-link ${REPO_URL}\x1b[0m`);
  });

  test('a BEL inside a decorated url cannot terminate the URI early', () => {
    const { target, display } = osc8(supported('', blue('https://e.com/a\x07b')));
    expect(target).toBe('https://e.com/ab');
    expect(display).toBe(blue('https://e.com/ab'));
  });

  test('a lone ESC not followed by [ is removed from a decorated url', () => {
    const { target, display } = osc8(supported('', blue('https://e.co\x1bm/a')));
    expect(target).toBe('https://e.com/a');
    expect(display).toBe(blue('https://e.com/a'));
  });

  test('bytes above 126 are percent-encoded inside a decorated url', () => {
    const { target, display } = osc8(supported('', blue('https://e.com/café')));
    expect(target).toBe('https://e.com/caf%C3%A9');
    expect(display).toBe(blue('https://e.com/caf%C3%A9'));
  });

  test('an emoji inside a decorated url does not throw', () => {
    expect(() => supported('', blue('https://e.com/🎉'))).not.toThrow();
    expect(osc8(supported('', blue('https://e.com/🎉'))).target)
      .toBe('https://e.com/%F0%9F%8E%89');
  });

  test('a percent-encoded escape lookalike is left alone', () => {
    const url = 'https://e.com/%1b[31m';
    const { target, display } = osc8(supported('', blue(url)));
    expect(target).toBe(url);
    expect(display).toBe(blue(url));
  });

  // Escapes in the url fall into three groups, and only the first two are
  // recognized as sequences:
  //   SGR (`\x1b[…m`)     — kept in the display, absent from the target
  //   other CSI           — dropped whole from both
  //   everything else     — not matched at all: the ESC is removed by the
  //                         control-character strip and its printable
  //                         remainder stays in the url, in both forms
  // The third group is why the documented contract names CSI specifically.
  describe('the CSI-only boundary', () => {
    const nonCsi: [string, string, string][] = [
      ['OSC, BEL-terminated', '\x1b]0;hi\x07', ']0;hi'],
      ['OSC, ST-terminated', '\x1b]8;;evil\x1b\\', ']8;;evil\\'],
      ['DCS', '\x1bPq\x1b\\', 'Pq\\'],
      ['charset select', '\x1b(B', '(B'],
      ['full reset', '\x1bc', 'c'],
      ['SS3', '\x1bOP', 'OP'],
    ];

    test.each(nonCsi)('%s is not dropped whole — its remainder stays in the target', (_label, prefix, residue) => {
      const { target } = osc8(supported('', prefix + REPO_URL));
      expect(target).toBe(residue + REPO_URL);
    });

    // The invariant that does hold, asserted apart from the residue equality so
    // a regression names which half broke: no escape byte survives, so the
    // remainder is inert text rather than an injectable sequence.
    test.each(nonCsi)('%s leaves no ESC or BEL byte in the target', (_label, prefix) => {
      const { target } = osc8(supported('', prefix + REPO_URL));
      expect(target).not.toContain('\x1b');
      expect(target).not.toContain('\x07');
    });

    test.each(nonCsi)('%s produces the same remainder in the fallback form', (_label, prefix, residue) => {
      expect(unsupported('', prefix + REPO_URL)).toBe(residue + REPO_URL);
    });

    test('by contrast, a non-SGR CSI sequence is dropped whole', () => {
      const { target, display } = osc8(supported('', `\x1b[2J${REPO_URL}`));
      expect(target).toBe(REPO_URL);
      expect(display).toBe(REPO_URL);
    });

    test('and an SGR sequence is kept in the display but never in the target', () => {
      const { target, display } = osc8(supported('', blue(REPO_URL)));
      expect(target).toBe(REPO_URL);
      expect(display).toBe(blue(REPO_URL));
    });

    // A fourth case of the same split: these end in `m` yet are not SGR, so the
    // final byte alone cannot classify a sequence. Each carries either a
    // private-parameter introducer (`<` `=` `>` `?`) or an intermediate byte,
    // and each belongs with the non-SGR CSI above — dropped whole from both
    // forms rather than printed.
    const privateM: [string, string][] = [
      ['XTMODKEYS', '\x1b[>4;2m'],
      ['private ?', '\x1b[?1m'],
      ['private =', '\x1b[=1m'],
      ['private <', '\x1b[<1m'],
      ['intermediate', '\x1b[ m'],
    ];

    test.each(privateM)('%s ends in m but is dropped from both target and display', (_label, seq) => {
      const { target, display } = osc8(supported('', seq + REPO_URL));
      expect(target).toBe(REPO_URL);
      expect(display).toBe(REPO_URL);
      expect(display).not.toContain('\x1b');
    });

    test.each(privateM)('%s is dropped from the fallback form', (_label, seq) => {
      expect(unsupported('', seq + REPO_URL)).toBe(REPO_URL);
    });

    test.each(privateM)('%s does not reach a custom fallback', (_label, seq) => {
      let received = '';
      unsupported('Hi', seq + REPO_URL, {
        fallback: (_text, url) => (received = url),
      });
      expect(received).toBe(REPO_URL);
      expect(received).not.toContain('\x1b');
    });

    // The same assertion with the sequence trailing, so the classifier is not
    // accidentally position-dependent.
    test.each(privateM)('%s is dropped when it trails the url', (_label, seq) => {
      const { target, display } = osc8(supported('', REPO_URL + seq));
      expect(target).toBe(REPO_URL);
      expect(display).toBe(REPO_URL);
      expect(display).not.toContain('\x1b');
    });

    // The narrowing must not overshoot. T.416 sub-parameter colour uses `:`
    // separators and is genuine SGR that some terminals emit, so it stays in
    // the display like any other decoration.
    test('a T.416 sub-parameter colour is genuine SGR and survives into the display', () => {
      const seq = '\x1b[38:2::255:128:0m';
      const { target, display } = osc8(supported('', seq + REPO_URL));
      expect(target).toBe(REPO_URL);
      expect(display).toBe(seq + REPO_URL);
    });
  });
});
