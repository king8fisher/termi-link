import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isSupported } from "./termi-link";
import { TERMINALS, type Terminal } from "./terminals";

// The table lives in the long half of the documentation; the front page carries
// only a pointer to it, so there is one copy to keep in step with production.
const SOURCE = "README.details.md";
const readme = readFileSync(path.resolve(__dirname, "..", SOURCE), "utf8");

type Env = Record<string, string>;

interface Row {
  terminal: string;
  /** The version cell, or `null` for an ungated (`—`) terminal. */
  floor: string | null;
  /** The variable names the `Environment` cell spells, in the order it spells them. */
  variables: string[];
}

/**
 * The environment variables an `Environment` cell names. A backticked span is a
 * variable when it is `NAME` or `NAME=value`; the sample values the cell also
 * backticks (`contour`, `alacritty-direct`) are lower-case and do not match.
 */
function parseVariables(cell: string): string[] {
  const names = new Set<string>();
  for (const [, span] of cell.matchAll(/`([^`]+)`/g)) {
    const name = /^([A-Z][A-Z0-9_]*)(=|$)/.exec(span);
    if (name) names.add(name[1]);
  }
  return [...names];
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

/** The `## Supported terminals` table, as the document currently spells it. */
function parseSupportedTerminals(markdown: string): Row[] {
  const section = markdown.split(/^## /m).find((part) => part.startsWith("Supported terminals"));
  if (section === undefined) {
    throw new Error(`${SOURCE} has no \`## Supported terminals\` section`);
  }
  const rows: Row[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 4) continue;
    if (cells[0] === "Terminal") continue;
    if (/^:?-{3,}:?$/.test(cells[0])) continue;
    rows.push({
      terminal: cells[0],
      floor: cells[1] === "—" ? null : cells[1],
      variables: parseVariables(cells[2]),
    });
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

// Every variable supportsHyperlinks() inspects: the union of what each terminal
// declares, plus the force variable, which belongs to no terminal. Derived
// rather than hand-listed so a terminal added with a new variable cannot leave
// this suite running in an environment it never cleared — a row must not
// inherit the terminal the suite happens to be running in and pass for the
// wrong reason.
const DETECTION_ENV_VARS = [
  "TERMI_LINK_HYPERLINK",
  ...new Set(TERMINALS.flatMap((terminal) => terminal.variables)),
];

function clearDetectionEnv(): void {
  for (const name of DETECTION_ENV_VARS) {
    delete process.env[name];
  }
}

/**
 * Every `process.env` key `run` touches, recorded by standing a proxy in for the
 * environment. Reading is the only thing detection does with `process.env`, so
 * this is the whole of what an entry consults.
 */
function recordEnvReads(env: Env, run: () => void): Set<string> {
  const seen = new Set<string>();
  const saved = process.env;
  process.env = new Proxy(
    { ...env },
    {
      get(target, key) {
        if (typeof key === "string") seen.add(key);
        return target[key as keyof typeof target];
      },
      has(target, key) {
        if (typeof key === "string") seen.add(key);
        return key in target;
      },
    },
  );
  try {
    run();
  } finally {
    process.env = saved;
  }
  return seen;
}

function fixtureEnv(fixture: Fixture, version: string | null): Env {
  return typeof fixture.env === "function" ? fixture.env(version ?? "") : fixture.env;
}

function applyFixture(fixture: Fixture, version: string | null): void {
  for (const [name, value] of Object.entries(fixtureEnv(fixture, version))) {
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

  test.each(TERMINALS)("the documented environment for $name is what it reads", (terminal) => {
    const row = rows.find((candidate) => candidate.terminal === terminal.name);
    expect(row, `${terminal.name} has no row in the README table`).toBeDefined();
    expect([...(row?.variables ?? [])].sort()).toEqual([...terminal.variables].sort());
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

  // Clearing only what this terminal declares, rather than the whole union, is
  // what makes `variables` a claim about this entry: a variable its fixture sets
  // and its detection reads but its own list omits survives the clear and keeps
  // the answer `true`, even when some other entry happens to declare it.
  test.each(withFixture)("$name is undetectable once its variables are cleared", (terminal) => {
    applyFixture(FIXTURES[terminal.name], terminal.floor);
    expect(isSupported()).toBe(true);
    for (const name of terminal.variables) {
      delete process.env[name];
    }
    expect(isSupported()).toBe(false);
  });

  // The other direction, and the one the clearing test cannot see: a variable
  // read behind a short-circuit its fixture satisfies. Detection runs twice —
  // once under the fixture, once under an empty environment — because `&&` hides
  // the second half of a gate that passes and `||` hides the second half of one
  // that fails, so the two runs between them reach both.
  test.each(withFixture)("$name reads no variable it does not declare", (terminal) => {
    const env = fixtureEnv(FIXTURES[terminal.name], terminal.floor);
    const exercise = () => {
      terminal.claims();
      terminal.supported();
    };
    const read = new Set([...recordEnvReads(env, exercise), ...recordEnvReads({}, exercise)]);
    const declared = new Set(terminal.variables);
    expect([...read].filter((name) => !declared.has(name))).toEqual([]);
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
