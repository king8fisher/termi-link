import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isSupported } from "./termi-link";
import { TERMINALS, type Terminal } from "./terminals";

const readme = readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

type Env = Record<string, string>;

interface Row {
  terminal: string;
  /** The version cell, or `null` for an ungated (`—`) terminal. */
  floor: string | null;
}

interface Fixture {
  /**
   * The environment that selects this terminal: static when the terminal is
   * recognized by presence, a function of the version when it is gated, so the
   * version under test comes from the production floor rather than from a copy
   * of it. The map supplies environments only — the terminal set is iterated
   * from `TERMINALS`.
   */
  env: Env | ((version: string) => Env);
  /** The highest version that must still fail the gate. */
  below?: string;
}

/** The `## Supported terminals` table, as the README currently spells it. */
function parseSupportedTerminals(markdown: string): Row[] {
  const section = markdown.split(/^## /m).find((part) => part.startsWith("Supported terminals"));
  if (section === undefined) {
    throw new Error("README.md has no `## Supported terminals` section");
  }
  const rows: Row[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 2) continue;
    if (cells[0] === "Terminal") continue;
    if (/^:?-{3,}:?$/.test(cells[0])) continue;
    rows.push({ terminal: cells[0], floor: cells[1] === "—" ? null : cells[1] });
  }
  return rows;
}

/**
 * VTE packs its version as major * 10000 + minor * 100 + micro, so the floor
 * production states in dotted form has to be packed before it reaches
 * VTE_VERSION.
 */
function packVte(version: string): string {
  const [major = 0, minor = 0, micro = 0] = version.split(".").map(Number);
  return String(major * 10000 + minor * 100 + micro);
}

const FIXTURES: Record<string, Fixture> = {
  Alacritty: { env: { TERM: "alacritty" } },
  Contour: {
    env: (v) => ({ TERMINAL_NAME: "contour", TERMINAL_VERSION_TRIPLE: v }),
    below: "0.0.9",
  },
  DomTerm: { env: { DOMTERM: "1" } },
  Foot: { env: { TERM: "foot-extra" } },
  Ghostty: {
    env: (v) => ({ TERM_PROGRAM: "ghostty", TERM_PROGRAM_VERSION: v }),
    below: "0.9",
  },
  Hyper: {
    env: (v) => ({ TERM_PROGRAM: "Hyper", TERM_PROGRAM_VERSION: v }),
    below: "3.9",
  },
  iTerm2: {
    env: (v) => ({ TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: v }),
    below: "3.0",
  },
  "JetBrains IDEs": { env: { TERMINAL_EMULATOR: "JetBrains-JediTerm" } },
  kitty: { env: { TERM: "xterm-kitty" } },
  Konsole: { env: { KONSOLE_VERSION: "230804" } },
  mintty: {
    env: (v) => ({ TERM_PROGRAM: "mintty", TERM_PROGRAM_VERSION: v }),
    below: "2.9.6",
  },
  Rio: {
    env: (v) => ({ TERM_PROGRAM: "rio", TERM_PROGRAM_VERSION: v }),
    below: "0.0.27",
  },
  Tabby: { env: { TERM_PROGRAM: "Tabby" } },
  Terminology: {
    env: (v) => ({ TERM_PROGRAM: "terminology", TERM_PROGRAM_VERSION: v }),
    below: "1.1",
  },
  tmux: {
    env: (v) => ({
      TMUX: "/tmp/tmux-1000/default,1,0",
      TERM_PROGRAM: "tmux",
      TERM_PROGRAM_VERSION: v,
    }),
    below: "3.3",
  },
  "VS Code": {
    env: (v) => ({ TERM_PROGRAM: "vscode", TERM_PROGRAM_VERSION: v }),
    below: "1.71",
  },
  "VTE-based terminals": {
    env: (v) => ({ VTE_VERSION: packVte(v) }),
    below: "0.50.0",
  },
  WezTerm: {
    env: (v) => ({ TERM_PROGRAM: "WezTerm", TERM_PROGRAM_VERSION: v }),
    below: "20200619",
  },
  "Windows Terminal": { env: { WT_SESSION: "0b3f1e0e-0000-0000-0000-000000000000" } },
  "Xfce Terminal": { env: { COLORTERM: "xfce4-terminal" } },
  Zed: { env: { TERM_PROGRAM: "zed" } },
};

// Every variable supportsHyperlinks() inspects. Re-declared rather than imported
// from src/termi-link.test.ts, which exports nothing: a row must not inherit the
// terminal the suite happens to be running in and pass for the wrong reason.
const DETECTION_ENV_VARS = [
  "TERMI_LINK_HYPERLINK",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "TERM",
  "COLORTERM",
  "VTE_VERSION",
  "DOMTERM",
  "WT_SESSION",
  "KONSOLE_VERSION",
  "TERMINAL_EMULATOR",
  "TERMINAL_NAME",
  "TERMINAL_VERSION_TRIPLE",
  "TMUX",
];

function clearDetectionEnv(): void {
  for (const name of DETECTION_ENV_VARS) {
    delete process.env[name];
  }
}

function applyFixture(fixture: Fixture, version: string | null): void {
  const env = typeof fixture.env === "function" ? fixture.env(version ?? "") : fixture.env;
  for (const [name, value] of Object.entries(env)) {
    process.env[name] = value;
  }
}

const rows = parseSupportedTerminals(readme);
const documented = new Set(rows.map((row) => row.terminal));
const detected = new Set(TERMINALS.map((terminal) => terminal.name));

// The terminal set under test is production's, never this file's: a terminal
// added to TERMINALS without a fixture fails the coverage test below rather
// than being silently dropped from these lists.
const withFixture = TERMINALS.filter((terminal) => terminal.name in FIXTURES);
const gated = withFixture.filter(
  (terminal): terminal is Terminal & { floor: string } => terminal.floor !== null,
);
const ungated = withFixture.filter((terminal) => terminal.floor === null);
const withBelow = gated.filter((terminal) => FIXTURES[terminal.name]?.below !== undefined);

describe("supported-terminal table", () => {
  test("every terminal detection recognizes is documented", () => {
    const undocumented = TERMINALS.map((terminal) => terminal.name).filter(
      (name) => !documented.has(name),
    );
    expect(undocumented).toEqual([]);
  });

  test("every documented terminal is one detection recognizes", () => {
    const unrecognized = rows.map((row) => row.terminal).filter((name) => !detected.has(name));
    expect(unrecognized).toEqual([]);
  });

  test("every terminal detection recognizes has a fixture", () => {
    const missing = TERMINALS.map((terminal) => terminal.name).filter(
      (name) => !(name in FIXTURES),
    );
    expect(missing).toEqual([]);
  });

  test.each(TERMINALS)("the documented version for $name is its floor", (terminal) => {
    const row = rows.find((candidate) => candidate.terminal === terminal.name);
    expect(row, `${terminal.name} has no row in the README table`).toBeDefined();
    expect(row?.floor).toBe(terminal.floor);
  });
});

describe("the documented floors match detection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearDetectionEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("clearing neutralizes an environment that forces support", () => {
    for (const name of DETECTION_ENV_VARS) {
      process.env[name] = "1";
    }
    expect(isSupported()).toBe(true);
    clearDetectionEnv();
    expect(isSupported()).toBe(false);
  });

  // The clearing list is hand-written while the terminal set is not, so a
  // terminal keyed off a variable the list omits would survive clearing and
  // answer for every other case in this suite. Checking each fixture against
  // the list is what ties the two together.
  test.each(withFixture)("clearing neutralizes $name", (terminal) => {
    applyFixture(FIXTURES[terminal.name], terminal.floor);
    expect(isSupported()).toBe(true);
    clearDetectionEnv();
    expect(isSupported()).toBe(false);
  });

  test.each(gated)("$name is supported at $floor", (terminal) => {
    applyFixture(FIXTURES[terminal.name], terminal.floor);
    expect(isSupported()).toBe(true);
  });

  test.each(withBelow)("$name is unsupported below $floor", (terminal) => {
    const fixture = FIXTURES[terminal.name];
    applyFixture(fixture, fixture.below as string);
    expect(isSupported()).toBe(false);
  });

  test.each(ungated)("$name is supported by presence", (terminal) => {
    applyFixture(FIXTURES[terminal.name], null);
    expect(isSupported()).toBe(true);
  });
});
