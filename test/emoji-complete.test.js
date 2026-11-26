import assert from "node:assert/strict";
import {
  extractEmojiQuery,
  filterEmoji,
  createEmojiAutocompleteProvider,
} from "../extensions/emoji-complete.js";

function createFallbackProvider(overrides = {}) {
  const calls = {
    getSuggestions: [],
    applyCompletion: [],
    shouldTriggerFileCompletion: [],
  };

  return {
    calls,
    triggerCharacters: ["@"],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      calls.getSuggestions.push({ lines, cursorLine, cursorCol, options });
      return overrides.suggestions ?? { items: [{ value: "fallback", label: "fallback" }], prefix: "@" };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      calls.applyCompletion.push({ lines, cursorLine, cursorCol, item, prefix });
      return { lines, cursorLine, cursorCol };
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      calls.shouldTriggerFileCompletion.push({ lines, cursorLine, cursorCol });
      return overrides.shouldTriggerFileCompletion ?? false;
    },
  };
}

describe("extractEmojiQuery", () => {
  describe("when the input has fewer than 2 shortcode characters", () => {
    it("should return null for a bare colon", () => {
      assert.equal(extractEmojiQuery(":"), null);
    });

    it("should return null for a single character after colon", () => {
      assert.equal(extractEmojiQuery(":t"), null);
    });
  });

  describe("when the input has at least 2 shortcode characters at a valid boundary", () => {
    it("should extract the query at the start of a line", () => {
      assert.equal(extractEmojiQuery(":th"), "th");
    });

    it("should extract the query after whitespace", () => {
      assert.equal(extractEmojiQuery("hello :roc"), "roc");
    });

    it("should extract the query after opening punctuation", () => {
      assert.equal(extractEmojiQuery("(:th"), "th");
      assert.equal(extractEmojiQuery('":th'), "th");
    });

    it("should allow digits, underscores, plus, and hyphens in shortcodes", () => {
      assert.equal(extractEmojiQuery(":+1"), "+1");
      assert.equal(extractEmojiQuery(":white_check_mark"), "white_check_mark");
    });
  });

  describe("when the colon is embedded inside another token", () => {
    it("should return null for URLs", () => {
      assert.equal(extractEmojiQuery("https://example"), null);
    });

    it("should return null for word-colon-word tokens", () => {
      assert.equal(extractEmojiQuery("foo:bar"), null);
    });

    it("should return null for timestamps", () => {
      assert.equal(extractEmojiQuery("12:30"), null);
    });

    it("should return null after a closing colon", () => {
      assert.equal(extractEmojiQuery(":thinking:"), null);
    });
  });
});

describe("filterEmoji", () => {
  describe("when querying with mixed case", () => {
    it("should match case-insensitively", () => {
      const lower = filterEmoji("thi");
      const upper = filterEmoji("THI");
      assert.deepEqual(upper, lower);
    });
  });

  describe("when matches span exact, prefix, substring, and fuzzy tiers", () => {
    let items;

    before(() => {
      items = filterEmoji("fire", 20);
    });

    it("should place the exact match first", () => {
      assert.equal(items[0].name, "fire");
    });

    it("should place prefix matches before substring matches", () => {
      const firstPrefixIdx = items.findIndex((i) => i.name !== "fire" && i.name.startsWith("fire"));
      const firstSubstringIdx = items.findIndex((i) => !i.name.startsWith("fire") && i.name.includes("fire"));
      assert.ok(firstPrefixIdx > 0);
      assert.ok(firstSubstringIdx > firstPrefixIdx);
    });

    it("should expose TUI autocomplete item fields directly", () => {
      assert.equal(items[0].value, "🔥");
      assert.equal(items[0].label, "🔥  :fire:");
    });
  });

  describe("when a query matches only by subsequence", () => {
    it("should return fuzzy subsequence matches", () => {
      const items = filterEmoji("thnk");
      assert.ok(items.some((i) => i.name === "thinking"));
    });
  });

  describe("when a query has more matches than the limit", () => {
    it("should cap the result count at the requested limit", () => {
      const items = filterEmoji("he", 5);
      assert.equal(items.length, 5);
    });
  });

  describe("when a query matches nothing", () => {
    it("should return an empty array", () => {
      assert.deepEqual(filterEmoji("zzzzzzzzz"), []);
    });
  });
});

describe("createEmojiAutocompleteProvider", () => {
  describe("when initialized over an existing provider", () => {
    let provider;

    before(() => {
      const fallback = createFallbackProvider();
      provider = createEmojiAutocompleteProvider(fallback);
    });

    it("should preserve existing trigger characters and add colon", () => {
      assert.deepEqual(provider.triggerCharacters, ["@", ":"]);
    });
  });

  describe("getSuggestions", () => {
    describe("when cursor is in a matching emoji shortcode", () => {
      let fallback;
      let result;

      before(async () => {
        fallback = createFallbackProvider();
        const provider = createEmojiAutocompleteProvider(fallback);
        result = await provider.getSuggestions(["hello :thi"], 0, 10, { signal: new AbortController().signal });
      });

      it("should return matching emoji items with the colon prefix", () => {
        assert.equal(result.prefix, ":thi");
        assert.ok(result.items.some((i) => i.name === "thinking"));
      });

      it("should not invoke the fallback provider", () => {
        assert.equal(fallback.calls.getSuggestions.length, 0);
      });
    });

    describe("when cursor is in an emoji shortcode with no matches", () => {
      let fallback;
      let result;

      before(async () => {
        fallback = createFallbackProvider();
        const provider = createEmojiAutocompleteProvider(fallback);
        result = await provider.getSuggestions([":zzzzzzzzz"], 0, 10, { signal: new AbortController().signal });
      });

      it("should return null to close the menu", () => {
        assert.equal(result, null);
      });

      it("should not fall through to the fallback provider", () => {
        assert.equal(fallback.calls.getSuggestions.length, 0);
      });
    });

    describe("when cursor is outside an emoji shortcode", () => {
      let fallback;
      let result;

      before(async () => {
        fallback = createFallbackProvider();
        const provider = createEmojiAutocompleteProvider(fallback);
        result = await provider.getSuggestions(["/mod"], 0, 4, { signal: new AbortController().signal });
      });

      it("should delegate to the fallback provider", () => {
        assert.equal(fallback.calls.getSuggestions.length, 1);
        assert.equal(result.items[0].value, "fallback");
      });
    });
  });

  describe("applyCompletion", () => {
    describe("when completing an emoji at the end of a line", () => {
      let result;

      before(() => {
        const provider = createEmojiAutocompleteProvider(createFallbackProvider());
        result = provider.applyCompletion(
          ["ship it :roc"],
          0,
          12,
          { value: "🚀", label: "🚀  :rocket:" },
          ":roc",
        );
      });

      it("should replace the shortcode with the emoji and a trailing space", () => {
        assert.deepEqual(result.lines, ["ship it 🚀 "]);
      });

      it("should place the cursor after the inserted emoji and space", () => {
        assert.equal(result.cursorLine, 0);
        assert.equal(result.cursorCol, "ship it 🚀 ".length);
      });
    });

    describe("when text after the cursor already starts with whitespace", () => {
      let result;

      before(() => {
        const provider = createEmojiAutocompleteProvider(createFallbackProvider());
        result = provider.applyCompletion(
          ["hello :thi world"],
          0,
          10,
          { value: "🤔", label: "🤔  :thinking:" },
          ":thi",
        );
      });

      it("should not insert a duplicate space", () => {
        assert.deepEqual(result.lines, ["hello 🤔 world"]);
      });

      it("should place the cursor right after the inserted emoji", () => {
        assert.equal(result.cursorCol, "hello 🤔".length);
      });
    });

    describe("when editing a line inside a multi-line prompt", () => {
      let originalLines;
      let result;

      before(() => {
        const provider = createEmojiAutocompleteProvider(createFallbackProvider());
        originalLines = ["first line", "second :thi", "third line"];
        result = provider.applyCompletion(
          originalLines,
          1,
          11,
          { value: "🤔", label: "🤔  :thinking:" },
          ":thi",
        );
      });

      it("should update only the active line without mutating the input array", () => {
        assert.deepEqual(result.lines, ["first line", "second 🤔 ", "third line"]);
        assert.deepEqual(originalLines, ["first line", "second :thi", "third line"]);
        assert.equal(result.cursorLine, 1);
      });
    });

    describe("when completing a non-emoji prefix", () => {
      let fallback;

      before(() => {
        fallback = createFallbackProvider();
        const provider = createEmojiAutocompleteProvider(fallback);
        provider.applyCompletion(["/mod"], 0, 4, { value: "model", label: "model" }, "/mod");
      });

      it("should delegate to the fallback provider", () => {
        assert.equal(fallback.calls.applyCompletion.length, 1);
      });
    });
  });

  describe("shouldTriggerFileCompletion", () => {
    it("should delegate to the fallback provider", () => {
      const fallback = createFallbackProvider({ shouldTriggerFileCompletion: false });
      const provider = createEmojiAutocompleteProvider(fallback);
      assert.equal(provider.shouldTriggerFileCompletion(["foo"], 0, 3), false);
      assert.equal(fallback.calls.shouldTriggerFileCompletion.length, 1);
    });
  });
});
