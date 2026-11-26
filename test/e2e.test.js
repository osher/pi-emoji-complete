import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

describe("pi-emoji-complete package end-to-end", () => {
  describe("when loaded through its package.json pi manifest", () => {
    let provider;
    let initialSuggestions;
    let narrowedSuggestions;
    let applied;

    before(async () => {
      const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
      const entryPath = resolve(rootDir, pkg.pi.extensions[0]);
      const { default: registerExtension } = await import(pathToFileURL(entryPath).href);

      const handlers = new Map();
      const fakePi = {
        on(event, handler) {
          handlers.set(event, handler);
        },
      };

      const baseProvider = {
        triggerCharacters: ["@"],
        async getSuggestions() {
          return null;
        },
        applyCompletion(lines, cursorLine, cursorCol) {
          return { lines, cursorLine, cursorCol };
        },
      };

      registerExtension(fakePi);

      const sessionStart = handlers.get("session_start");
      assert.ok(sessionStart, "extension should register a session_start handler");

      await sessionStart(
        {},
        {
          ui: {
            addAutocompleteProvider(wrap) {
              provider = wrap(baseProvider);
            },
          },
        },
      );

      const signal = new AbortController().signal;
      initialSuggestions = await provider.getSuggestions([":th"], 0, 3, { signal });
      narrowedSuggestions = await provider.getSuggestions([":thi"], 0, 4, { signal });
      applied = provider.applyCompletion(
        [":thi"],
        0,
        4,
        narrowedSuggestions.items[0],
        narrowedSuggestions.prefix,
      );
    });

    it("should register colon as a trigger character", () => {
      assert.ok(provider.triggerCharacters.includes(":"));
    });

    it("should return multiple candidates on initial two-letter shortcode", () => {
      assert.ok(initialSuggestions.items.length > 1);
      assert.equal(initialSuggestions.prefix, ":th");
    });

    it("should narrow candidates as more characters are typed", () => {
      assert.ok(narrowedSuggestions.items.length < initialSuggestions.items.length);
      assert.equal(narrowedSuggestions.items[0].value, "🤔");
    });

    it("should replace the shortcode with the chosen emoji on apply", () => {
      assert.deepEqual(applied.lines, ["🤔 "]);
      assert.equal(applied.cursorCol, "🤔 ".length);
    });
  });
});
