// Emoji autocomplete for Pi editor
// - Trigger: :<query> (2+ chars at start of line or after whitespace/opening punctuation)
// - Navigation: up/down arrows, Tab or Enter to insert emoji, Esc to cancel
// - Live filtering as you type or backspace

import { nameToEmoji } from "./name-to-emoji.js";

const EMOJI_ITEMS = Object.entries(nameToEmoji).map(([name, emoji]) => ({
  name,
  value: emoji,
  label: `${emoji}  :${name}:`,
}));

const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 20;
const SHORTCODE_RE = /(?:^|[\s([{"'`]):([a-zA-Z0-9_+-]+)$/;

export function extractEmojiQuery(textBeforeCursor) {
  const match = textBeforeCursor.match(SHORTCODE_RE);
  if (!match) return null;
  const query = match[1];
  if (!query || query.length < MIN_QUERY_LENGTH) return null;
  return query;
}

function isSubsequence(query, target) {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

export function filterEmoji(query, limit = MAX_SUGGESTIONS) {
  const q = query.toLowerCase();
  const exact = [];
  const prefix = [];
  const substring = [];
  const fuzzy = [];

  for (const item of EMOJI_ITEMS) {
    const name = item.name;
    if (name === q) {
      exact.push(item);
      if (exact.length >= limit) break;
    } else if (name.startsWith(q)) {
      if (prefix.length < limit) prefix.push(item);
    } else if (exact.length + prefix.length < limit) {
      if (name.includes(q)) {
        if (substring.length < limit) substring.push(item);
      } else if (
        exact.length + prefix.length + substring.length === 0 &&
        fuzzy.length < limit &&
        isSubsequence(q, name)
      ) {
        fuzzy.push(item);
      }
    }
  }

  const direct = [...exact, ...prefix, ...substring];
  return (direct.length > 0 ? direct : fuzzy).slice(0, limit);
}

export function createEmojiAutocompleteProvider(current) {
  const triggerCharacters = [...(current.triggerCharacters ?? []), ":"];

  return {
    triggerCharacters,

    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const query = extractEmojiQuery(textBeforeCursor);

      if (query === null) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const items = filterEmoji(query);
      if (items.length === 0) {
        return null;
      }

      return {
        items,
        prefix: `:${query}`,
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (!prefix.startsWith(":")) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      }

      const currentLine = lines[cursorLine] ?? "";
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      const needsTrailingSpace = afterCursor.length === 0 || !/^\s/.test(afterCursor);
      const inserted = needsTrailingSpace ? `${item.value} ` : item.value;

      const newLines = [...lines];
      newLines[cursorLine] = `${beforePrefix}${inserted}${afterCursor}`;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + inserted.length,
      };
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

export default function (pi) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) => createEmojiAutocompleteProvider(current));
  });
}
