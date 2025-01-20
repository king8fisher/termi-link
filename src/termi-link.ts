
// Interface for version information
interface Version {
  major: number;
  minor: number;
  patch: number;
}

// Environment variables that indicate hyperlink support
const ENVIRONMENT_VARIABLES = [
  'DOMTERM',
  'WT_SESSION',
  'KONSOLE_VERSION',
];

// Parse version string into Version object
function parseVersion(version: string): Version {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return { major, minor, patch };
}

// Check if environment variable exists
function hasEnv(name: string): boolean {
  return process.env[name] !== undefined;
}

// Get environment variable value
function getEnv(name: string): string {
  return process.env[name] || '';
}

// Check if environment variable matches any of the given values
function matchesEnv(name: string, values: string[]): boolean {
  return hasEnv(name) && values.includes(getEnv(name));
}

// Check if any of the environment variables exist
function checkAllEnvs(vars: string[]): boolean {
  return vars.some(v => hasEnv(v));
}

// Check if terminal supports hyperlinks
function supportsHyperlinks(): boolean {
  // Force hyperlinks if environment variable is set
  if (matchesEnv('FORCE_HYPERLINK', ['1', 'true', 'always', 'enabled'])) {
    return true;
  }
  if (matchesEnv('FORCE_NO_HYPERLINK', ['1', 'true', 'always', 'enabled'])) {
    return false;
  }

  // VTE-based terminals
  if (hasEnv('VTE_VERSION')) {
    const v = parseVersion(getEnv('VTE_VERSION'));
    return v.major > 5000;
  }

  // Terminals with TERM_PROGRAM variable
  if (hasEnv('TERM_PROGRAM')) {
    const v = parseVersion(getEnv('TERM_PROGRAM_VERSION'));
    const term = getEnv('TERM_PROGRAM');

    switch (term) {
      case 'iTerm.app':
        return v.major > 3 || (v.major === 3 && v.minor >= 1);
      case 'WezTerm':
        return v.major >= 20200620;
      case 'vscode':
        return v.major > 1 || (v.major === 1 && v.minor >= 72);
      case 'ghostty':
        return v.major >= 1;
      case 'terminology':
        return v.major >= 1 && v.minor >= 2;
      case 'Hyper':
        return v.major >= 3;
      case 'alacritty':
        return v.major >= 0 && v.minor >= 11;
      case 'kitty':
        return v.major >= 0 && v.minor >= 19;
      default:
        return false;
    }
  }

  // Check TERM variable
  if (matchesEnv('TERM', ['xterm-kitty', 'alacritty', 'alacritty-direct', 'xterm-ghostty'])) {
    return true;
  }

  // Check COLORTERM variable
  if (matchesEnv('COLORTERM', ['xfce4-terminal'])) {
    return true;
  }

  // Check JetBrains terminals
  if (matchesEnv('TERMINAL_EMULATOR', ['JetBrains-JediTerm'])) {
    return true;
  }

  // Check standalone environment variables
  if (checkAllEnvs(ENVIRONMENT_VARIABLES)) {
    return true;
  }

  return false;
}

/**
 * Creates a clickable terminal link, optionally color-colored
 * @param text The text to display, if an empty string `""` is passed, the text will be the same as the url, and in the fallback case, the link will be the only thing displayed.
 * @param url The URL to link to
 * @param options Optional parameters
 * @param options.fallback Override the default fallback or disable fallback. When function provided, it receives the `text` and `url` as parameters and is expected to return a string.
If set to `false`, there will be an empty string returned when a terminal is unsupported.
 * @returns Formatted terminal link string
 */
export function terminalLink(text: string, url: string, options?: {
  fallback?: false | ((text: string, url: string) => string)
} | undefined): string {
  const { fallback = null } = options || {};
  //const textColor = parseColor(color);
  if (supportsHyperlinks()) {
    //return `\x1b]8;;${url}\x07${textColor}${text || url}\x1b]8;;\x07\u001b[0m`;
    return `\x1b]8;;${url}\x07${text || url}\x1b]8;;\x07\u001b[0m`;
  }
  if (fallback == null) {
    if (!text) {
      return `${url}\u001b[0m`;
    }
    //return `${textColor}${text} (${url})\u001b[0m`;
    return `${text} (${url})\u001b[0m`;
  } else if (fallback === false) {
    return ``;
  } else {
    return fallback(text, url);
  }
}

/**
 * Checks if the terminal supports hyperlinks.
 * @returns boolean indicating hyperlink support
 */
export function isSupported(): boolean {
  return supportsHyperlinks();
}
