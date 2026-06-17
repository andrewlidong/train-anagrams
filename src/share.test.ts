import { describe, it, expect } from "vitest";
import { readWordFromUrl, wordShareUrl } from "./share";

describe("readWordFromUrl", () => {
  it("reads and normalizes the word param", () => {
    expect(readWordFromUrl("?word=face")).toBe("FACE");
    expect(readWordFromUrl("?word=Ja-zz!")).toBe("JAZZ");
  });
  it("returns null when absent or empty", () => {
    expect(readWordFromUrl("")).toBeNull();
    expect(readWordFromUrl("?word=123")).toBeNull();
  });
});

describe("wordShareUrl", () => {
  it("sets the word param on the href", () => {
    expect(wordShareUrl("https://x.io/train-anagrams/", "face")).toBe(
      "https://x.io/train-anagrams/?word=FACE",
    );
  });
  it("replaces an existing word param", () => {
    expect(wordShareUrl("https://x.io/?word=CAB", "bed")).toBe("https://x.io/?word=BED");
  });
});
