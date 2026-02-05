type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

function loadOptionalJson5(): { parse: (raw: string) => unknown } | null {
  try {
    // Avoid static resolution in bundlers
    // eslint-disable-next-line no-eval
    const req = eval("require");
    const mod = req("json5");
    if (mod && typeof mod.parse === "function") {
      return mod as { parse: (raw: string) => unknown };
    }
  } catch {
    // optional
  }
  return null;
}

function stripComments(input: string): string {
  let out = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

function stripTrailingCommas(input: string): string {
  let out = "";
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) {
        j += 1;
      }
      const next = input[j];
      if (next === "}" || next === "]") {
        continue;
      }
    }

    out += ch;
  }

  return out;
}

function parseJsonFallback(raw: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    // try sanitizing
  }

  try {
    const sanitized = stripTrailingCommas(stripComments(raw));
    return { ok: true, value: JSON.parse(sanitized) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function parseOpenClawConfig(raw: string): ParseResult {
  const json5 = loadOptionalJson5();
  if (json5) {
    try {
      return { ok: true, value: json5.parse(raw) };
    } catch {
      // fall through
    }
  }
  return parseJsonFallback(raw);
}
