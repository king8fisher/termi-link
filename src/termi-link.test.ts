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
    const expectedNoHyperlink = 'Hello (https://example.com)';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });

  test('fallback set to false', () => {
    const input = terminalLink('Hello', 'https://example.com', { fallback: false });
    const expectedHyperlink = '\x1b]8;;https://example.com\x07Hello\x1b]8;;\x07';
    const expectedNoHyperlink = '';
    testAll(input, expectedHyperlink, expectedNoHyperlink);
  });
}

