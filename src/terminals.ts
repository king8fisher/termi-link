// Interface for version information
interface Version {
  major: number;
  minor: number;
  patch: number;
}

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
export function matchesEnv(name: string, values: string[]): boolean {
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

// The version most terminals report alongside TERM_PROGRAM.
function programVersionAtLeast(floor: string): boolean {
  return atLeast(parseVersion(getEnv("TERM_PROGRAM_VERSION")), floor);
}

// VTE packs its version as major * 10000 + minor * 100 + micro, so a dotted
// floor has to be packed before it can be compared against VTE_VERSION.
function packVte(version: string): number {
  const { major, minor, patch } = parseVersion(version);
  return major * 10000 + minor * 100 + patch;
}

/**
 * One terminal the library recognizes. `name` is spelled exactly as the
 * `## Supported terminals` table in README.md spells it, and `floor` is the
 * version that table states — `null` for a terminal recognized by presence.
 * The floor is the value `supported()` enforces rather than a label beside it,
 * so raising one here raises the gate.
 */
export interface Terminal {
  name: string;
  floor: string | null;
  /** A match answers for the whole session and must not fall through. */
  answersForSession?: boolean;
  /** Is this terminal present at all? */
  claims: () => boolean;
  /** Given it is present, does it meet its floor? */
  supported: () => boolean;
}

/** A terminal behind a version gate, with the floor bound into the gate. */
function gated(
  name: string,
  floor: string,
  claims: () => boolean,
  supported: (floor: string) => boolean,
): Terminal {
  return { name, floor, claims, supported: () => supported(floor) };
}

/** A terminal recognized by presence, with no version to read. */
function ungated(name: string, claims: () => boolean): Terminal {
  return { name, floor: null, claims, supported: () => true };
}

/**
 * The terminals `supportsHyperlinks()` consults, in precedence order. Array
 * order is the precedence: the first entry whose `claims()` holds and whose
 * `supported()` holds wins, and every other claim falls through to the entries
 * below it rather than answering for them.
 */
export const TERMINALS: Terminal[] = [
  // A multiplexer is the program that actually receives our escape sequence,
  // so when one is present it answers for the session — the outer terminal is
  // one hop further out and its variables are inherited into the pane, where
  // they go stale on re-attach. That is what `answersForSession` marks: falling
  // through would let an inherited VTE_VERSION answer for a tmux that drops
  // OSC 8.
  //
  // Zellij is deliberately not a second entry here (goal G5b). A captured
  // 0.44.3 pane environment shows it adds only ZELLIJ, ZELLIJ_PANE_ID and
  // ZELLIJ_SESSION_NAME, and leaves the outer terminal's TERM_PROGRAM in place
  // rather than claiming it the way tmux does. So the entries below already
  // answer for the outer terminal, and no ZELLIJ variable carries a version to
  // gate a pre-0.21.0 Zellij out with. A presence-only entry could only restate
  // what inheritance says, or claim a terminal we cannot see is capable.
  //
  // tmux relays OSC 8 from 3.4, and from 3.2 it reports itself as
  // TERM_PROGRAM=tmux with its own version, so the gate is an ordinary one.
  // Whether the *outer* terminal can render the link is tmux's question, not
  // ours: it gates emission on the `hyperlinks` terminal feature (`Hls`).
  {
    ...gated(
      "tmux",
      "3.4",
      () => hasEnv("TMUX"),
      (floor) => matchesEnv("TERM_PROGRAM", ["tmux"]) && programVersionAtLeast(floor),
    ),
    answersForSession: true,
  },

  // VTE-based terminals. Positive-only: VTE_VERSION describes the terminal a
  // process was *launched from*, not the one receiving the escape sequence, so
  // it is inherited by whatever runs inside — a kitty started from a
  // gnome-terminal shell carries a stale value. A failed gate therefore means
  // "nothing to say" rather than "no", and the entries below get their turn.
  //
  // The floor starts one micro above 0.50.0, the release that shipped OSC 8 and
  // segfaulted on it, so 0.50.0 itself is out.
  gated(
    "VTE-based terminals",
    "0.50.1",
    () => hasEnv("VTE_VERSION"),
    (floor) => parseVersion(getEnv("VTE_VERSION")).major >= packVte(floor),
  ),

  // Terminals identified by TERM_PROGRAM.
  gated("iTerm2", "3.1", () => matchesEnv("TERM_PROGRAM", ["iTerm.app"]), programVersionAtLeast),
  gated(
    "WezTerm",
    "20200620",
    () => matchesEnv("TERM_PROGRAM", ["WezTerm"]),
    (floor) => {
      // nixpkgs re-versions VCS snapshots as `0-unstable-<date>`, which parses
      // to major 0 and fails a date-stamped floor. Compare the date instead —
      // lexicographic ordering is exact for zero-padded ISO dates, which is why
      // the pattern requires the padding, and why the floor is hyphenated here
      // rather than restated as a second literal.
      const nix = /^0-unstable-(\d{4}-\d{2}-\d{2})$/.exec(getEnv("TERM_PROGRAM_VERSION"));
      if (nix) {
        return nix[1] >= `${floor.slice(0, 4)}-${floor.slice(4, 6)}-${floor.slice(6, 8)}`;
      }
      return programVersionAtLeast(floor);
    },
  ),
  gated("VS Code", "1.72", () => matchesEnv("TERM_PROGRAM", ["vscode"]), programVersionAtLeast),
  // One entry, two paths. A Ghostty below the floor that sets TERM is supported
  // anyway: TERM=xterm-ghostty is set by the terminal itself and carries no
  // version, so there is nothing to gate on and every release setting it speaks
  // OSC 8.
  gated(
    "Ghostty",
    "1.0",
    () => matchesEnv("TERM_PROGRAM", ["ghostty"]) || matchesEnv("TERM", ["xterm-ghostty"]),
    (floor) => matchesEnv("TERM", ["xterm-ghostty"]) || programVersionAtLeast(floor),
  ),
  // Zed has only ever shipped 0.x, so any major-version gate would reject every
  // real release; upstream supports-hyperlinks matches it ungated.
  ungated("Zed", () => matchesEnv("TERM_PROGRAM", ["zed"])),
  gated(
    "Terminology",
    "1.2",
    () => matchesEnv("TERM_PROGRAM", ["terminology"]),
    programVersionAtLeast,
  ),
  // Hyper below 4 renders OSC 8 as non-clickable pseudo-links: it ships
  // xterm.js < 5, which has no OSC 8 support at all.
  gated("Hyper", "4.0", () => matchesEnv("TERM_PROGRAM", ["Hyper"]), programVersionAtLeast),

  // Matched by substring rather than by an exact TERM_PROGRAM value.
  gated("mintty", "2.9.7", () => envIncludes("TERM_PROGRAM", "mintty"), programVersionAtLeast),
  ungated("Tabby", () => envIncludes("TERM_PROGRAM", "tabby")),
  gated("Rio", "0.0.28", () => envIncludes("TERM_PROGRAM", "rio"), programVersionAtLeast),

  // Terminals identified by TERM.
  ungated("kitty", () => matchesEnv("TERM", ["xterm-kitty"])),
  ungated("Alacritty", () => matchesEnv("TERM", ["alacritty", "alacritty-direct"])),
  // Kept out of the exact-match entries above: Foot sets either `foot` or a
  // value carrying it as a substring.
  ungated("Foot", () => envIncludes("TERM", "foot")),

  ungated("Xfce Terminal", () => matchesEnv("COLORTERM", ["xfce4-terminal"])),
  ungated("JetBrains IDEs", () => matchesEnv("TERMINAL_EMULATOR", ["JetBrains-JediTerm"])),

  // Contour is the only terminal keyed off neither TERM_PROGRAM, TERM,
  // COLORTERM nor TERMINAL_EMULATOR, so TERMINAL_VERSION_TRIPLE is read here
  // and nowhere else.
  gated(
    "Contour",
    "0.1.0",
    () => envIncludes("TERMINAL_NAME", "contour"),
    (floor) => atLeast(parseVersion(getEnv("TERMINAL_VERSION_TRIPLE")), floor),
  ),

  // Terminals that announce themselves with a standalone variable.
  ungated("DomTerm", () => hasEnv("DOMTERM")),
  ungated("Windows Terminal", () => hasEnv("WT_SESSION")),
  ungated("Konsole", () => hasEnv("KONSOLE_VERSION")),
];
