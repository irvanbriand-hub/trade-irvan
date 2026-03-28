/**
 * Formula parser for Research Screener.
 * Tokenizes, validates, and parses custom screening formulas.
 */

// ========== TOKEN TYPES ==========
export type TokenType = 
  | "KEYWORD" | "FUNCTION" | "NUMBER" | "OPERATOR" | "COMPARISON" 
  | "LOGIC" | "LPAREN" | "RPAREN" | "COMMA" | "UNKNOWN" | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

export interface ParseError {
  line: number;
  col: number;
  message: string;
  suggestion?: string;
}

// ========== KNOWN IDENTIFIERS ==========
export const PRICE_VOLUME_KEYWORDS = [
  "open", "high", "low", "close", "volume", "value",
];

export const PREV_KEYWORDS = [
  "prev_open", "prev_high", "prev_low", "prev_close", "prev_volume",
  "prev_2_close", "prev_3_close", "prev_2_high", "prev_2_low",
];

export const BOLLINGER_KEYWORDS = [
  "bb_top", "bb_mid", "bb_bottom", "bb_bandwidth",
];

export const MACD_KEYWORDS = [
  "macd", "macd_signal", "macd_histogram",
];

export const STOCH_KEYWORDS = [
  "stoch_k", "stoch_d",
];

export const OSCILLATOR_KEYWORDS = [
  "rsi", "adx", "pdx", "ndx",
];

export const FUNCTION_NAMES = [
  "sma", "ema", "sma_vol", "bb_top", "bb_bottom", "bb_mid",
  "macd", "macd_signal", "macd_histogram",
  "stoch_k", "stoch_d", "rsi",
  "hhv", "llv", "cross",
];

export const ALL_KEYWORDS = [
  ...PRICE_VOLUME_KEYWORDS, ...PREV_KEYWORDS, ...BOLLINGER_KEYWORDS,
  ...MACD_KEYWORDS, ...STOCH_KEYWORDS, ...OSCILLATOR_KEYWORDS,
];

const TYPO_MAP: Record<string, string> = {
  colse: "close", clsoe: "close", closee: "close",
  opne: "open", openn: "open",
  hgih: "high", hihg: "high",
  vlume: "volume", volme: "volume", volumee: "volume",
  vallue: "value", valuee: "value",
  ma: "sma", maa: "sma",
  ema_vol: "sma_vol",
  prev_closee: "prev_close",
  bb_tpp: "bb_top", bb_btm: "bb_bottom",
  macdd: "macd", rsis: "rsi",
};

// ========== TOKENIZER ==========
export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  const lines = formula.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let i = 0;
    while (i < line.length) {
      // Skip whitespace
      if (/\s/.test(line[i])) { i++; continue; }
      
      // Skip comments
      if (line[i] === "/" && line[i + 1] === "/") break;

      const col = i + 1;

      // Numbers
      if (/\d/.test(line[i]) || (line[i] === "." && i + 1 < line.length && /\d/.test(line[i + 1]))) {
        let num = "";
        while (i < line.length && (/\d/.test(line[i]) || line[i] === ".")) {
          num += line[i]; i++;
        }
        tokens.push({ type: "NUMBER", value: num, line: lineIdx + 1, col });
        continue;
      }

      // Identifiers (keywords, functions)
      if (/[a-zA-Z_]/.test(line[i])) {
        let ident = "";
        while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
          ident += line[i]; i++;
        }
        const lower = ident.toLowerCase();
        if (["and", "or", "not"].includes(lower)) {
          tokens.push({ type: "LOGIC", value: lower.toUpperCase(), line: lineIdx + 1, col });
        } else if (FUNCTION_NAMES.includes(lower) && i < line.length && line[i] === "(") {
          tokens.push({ type: "FUNCTION", value: lower, line: lineIdx + 1, col });
        } else if ([...ALL_KEYWORDS, ...FUNCTION_NAMES].includes(lower)) {
          tokens.push({ type: "KEYWORD", value: lower, line: lineIdx + 1, col });
        } else if (lower === "true" || lower === "false") {
          tokens.push({ type: "NUMBER", value: lower === "true" ? "1" : "0", line: lineIdx + 1, col });
        } else {
          tokens.push({ type: "UNKNOWN", value: lower, line: lineIdx + 1, col });
        }
        continue;
      }

      // Multi-char operators
      if (i + 1 < line.length) {
        const two = line[i] + line[i + 1];
        if ([">=", "<=", "==", "!="].includes(two)) {
          tokens.push({ type: "COMPARISON", value: two, line: lineIdx + 1, col });
          i += 2; continue;
        }
      }

      // Single-char operators
      if ("><=".includes(line[i])) {
        tokens.push({ type: "COMPARISON", value: line[i], line: lineIdx + 1, col });
        i++; continue;
      }
      if ("+-*/".includes(line[i])) {
        tokens.push({ type: "OPERATOR", value: line[i], line: lineIdx + 1, col });
        i++; continue;
      }
      if (line[i] === "(") {
        tokens.push({ type: "LPAREN", value: "(", line: lineIdx + 1, col });
        i++; continue;
      }
      if (line[i] === ")") {
        tokens.push({ type: "RPAREN", value: ")", line: lineIdx + 1, col });
        i++; continue;
      }
      if (line[i] === ",") {
        tokens.push({ type: "COMMA", value: ",", line: lineIdx + 1, col });
        i++; continue;
      }

      tokens.push({ type: "UNKNOWN", value: line[i], line: lineIdx + 1, col });
      i++;
    }
  }

  tokens.push({ type: "EOF", value: "", line: lines.length, col: 0 });
  return tokens;
}

// ========== VALIDATOR ==========
export function validateFormula(formula: string): { valid: boolean; errors: ParseError[] } {
  if (!formula.trim()) {
    return { valid: false, errors: [{ line: 1, col: 1, message: "Formula tidak boleh kosong" }] };
  }

  const tokens = tokenize(formula);
  const errors: ParseError[] = [];

  // Check unknown tokens (typo detection)
  for (const tok of tokens) {
    if (tok.type === "UNKNOWN") {
      const suggestion = TYPO_MAP[tok.value];
      if (suggestion) {
        errors.push({
          line: tok.line, col: tok.col,
          message: `'${tok.value}' tidak dikenal`,
          suggestion: `Maksud kamu '${suggestion}'?`,
        });
      } else {
        // Try fuzzy match
        const allIds = [...ALL_KEYWORDS, ...FUNCTION_NAMES];
        const closest = allIds.find(k => levenshtein(k, tok.value) <= 2);
        errors.push({
          line: tok.line, col: tok.col,
          message: `'${tok.value}' tidak dikenal`,
          suggestion: closest ? `Maksud kamu '${closest}'?` : undefined,
        });
      }
    }
  }

  // Check balanced parentheses
  let parenDepth = 0;
  for (const tok of tokens) {
    if (tok.type === "LPAREN") parenDepth++;
    if (tok.type === "RPAREN") parenDepth--;
    if (parenDepth < 0) {
      errors.push({ line: tok.line, col: tok.col, message: "Tanda ')' berlebihan tanpa '(' pembuka" });
      parenDepth = 0;
    }
  }
  if (parenDepth > 0) {
    errors.push({ line: tokens[tokens.length - 1].line, col: 1, message: `${parenDepth} tanda '(' belum ditutup` });
  }

  // Check function parameters
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "FUNCTION") {
      const funcName = tokens[i].value;
      // Find matching closing paren and count args
      let depth = 0;
      let argCount = 0;
      let hasArgs = false;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "LPAREN") depth++;
        if (tokens[j].type === "RPAREN") {
          depth--;
          if (depth === 0) {
            if (hasArgs) argCount++;
            break;
          }
        }
        if (depth === 1 && tokens[j].type !== "LPAREN") {
          hasArgs = true;
          if (tokens[j].type === "COMMA") argCount++;
        }
      }
      
      // Validate arg counts
      const singleArgFuncs = ["sma", "ema", "sma_vol", "rsi", "hhv", "llv"];
      if (singleArgFuncs.includes(funcName) && argCount === 0 && !hasArgs) {
        errors.push({
          line: tokens[i].line, col: tokens[i].col,
          message: `${funcName}() membutuhkan parameter angka, contoh: ${funcName}(20)`,
        });
      }
    }
  }

  // Check double operators
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (
      (a.type === "OPERATOR" && b.type === "OPERATOR") ||
      (a.type === "COMPARISON" && b.type === "COMPARISON") ||
      (a.type === "LOGIC" && b.type === "LOGIC")
    ) {
      errors.push({
        line: b.line, col: b.col,
        message: `Operator ganda '${a.value} ${b.value}'`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// Simple Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

// ========== SYNTAX HIGHLIGHTING ==========
export interface HighlightSpan {
  text: string;
  className: string;
}

export function highlightFormula(line: string): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  let i = 0;

  while (i < line.length) {
    if (/\s/.test(line[i])) {
      let ws = "";
      while (i < line.length && /\s/.test(line[i])) { ws += line[i]; i++; }
      spans.push({ text: ws, className: "" });
      continue;
    }

    if (line[i] === "/" && line[i + 1] === "/") {
      spans.push({ text: line.slice(i), className: "text-muted-foreground italic" });
      break;
    }

    if (/\d/.test(line[i]) || (line[i] === "." && i + 1 < line.length && /\d/.test(line[i + 1]))) {
      let num = "";
      while (i < line.length && (/\d/.test(line[i]) || line[i] === ".")) { num += line[i]; i++; }
      spans.push({ text: num, className: "text-orange-400" });
      continue;
    }

    if (/[a-zA-Z_]/.test(line[i])) {
      let ident = "";
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) { ident += line[i]; i++; }
      const lower = ident.toLowerCase();
      if (["and", "or", "not"].includes(lower)) {
        spans.push({ text: ident, className: "text-blue-400 font-bold" });
      } else if (FUNCTION_NAMES.includes(lower)) {
        spans.push({ text: ident, className: "text-emerald-400" });
      } else if (ALL_KEYWORDS.includes(lower)) {
        spans.push({ text: ident, className: "text-sky-300" });
      } else {
        spans.push({ text: ident, className: "text-red-400 bg-red-500/10 rounded px-0.5" });
      }
      continue;
    }

    if ("><=!".includes(line[i])) {
      let op = line[i]; i++;
      if (i < line.length && line[i] === "=") { op += "="; i++; }
      spans.push({ text: op, className: "text-yellow-400" });
      continue;
    }

    if ("+-*/".includes(line[i])) {
      spans.push({ text: line[i], className: "text-yellow-400" });
      i++; continue;
    }

    spans.push({ text: line[i], className: "text-foreground" });
    i++;
  }

  return spans;
}
