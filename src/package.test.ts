import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
) as Record<string, unknown>;

function record(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

/** Every string a nested condition object bottoms out in, at any depth. */
function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap(stringLeaves);
  }
  return [];
}

/** `./dist/index.mjs` -> `dist`, the name that has to appear in `files`. */
function publishedRoot(entryPoint: string): string {
  return entryPoint.replace(/^\.\//, "").split("/")[0];
}

const scripts = record(manifest.scripts);
const exportsMap = record(manifest.exports);
const rootExport = record(exportsMap["."]);

describe("package manifest", () => {
  test("prepare builds, so npm pack and git installs get a dist", () => {
    expect(scripts.prepare).toBeTypeOf("string");
    expect(scripts.prepare).toContain("tsup");
  });

  test("exports declares both an import and a require condition", () => {
    expect(Object.keys(rootExport)).toEqual(expect.arrayContaining(["import", "require"]));
  });

  test("each condition carries its own types, listed first", () => {
    for (const condition of ["import", "require"]) {
      const keys = Object.keys(record(rootExport[condition]));
      expect(keys).toContain("types");
      expect(keys[0]).toBe("types");
    }
  });

  test("the types conditions are split per format, not hoisted", () => {
    expect(rootExport.types).toBeUndefined();
    expect(record(rootExport.import).types).toMatch(/\.d\.mts$/);
    expect(record(rootExport.require).types).toMatch(/\.d\.ts$/);
  });

  test("main, module and types remain for resolvers predating exports", () => {
    expect(manifest.main).toBeTypeOf("string");
    expect(manifest.module).toBeTypeOf("string");
    expect(manifest.types).toBeTypeOf("string");
  });

  test("every entry point lives under a published directory", () => {
    const published = new Set((manifest.files as string[]).map(publishedRoot));
    const entryPoints = [
      manifest.main,
      manifest.module,
      manifest.types,
      ...stringLeaves(rootExport),
    ];
    for (const entryPoint of entryPoints) {
      expect(entryPoint).toBeTypeOf("string");
      expect(published).toContain(publishedRoot(entryPoint as string));
    }
  });

  test("the declared node floor is at least 18", () => {
    const floor = record(manifest.engines).node;
    expect(floor).toBeTypeOf("string");
    const major = /(\d+)/.exec(floor as string);
    expect(major).not.toBeNull();
    expect(Number((major as RegExpExecArray)[1])).toBeGreaterThanOrEqual(18);
  });

  test("the package type is commonjs, matching the require entry points", () => {
    expect(manifest.type).toBe("commonjs");
  });

  test("sideEffects is the boolean false", () => {
    expect(manifest.sideEffects).toBe(false);
  });

  test("the repository url is a fully-qualified git url", () => {
    expect(record(manifest.repository).url).toMatch(/^git\+/);
  });
});
