import { describe, expect, it } from "vitest";
import arabicMessages from "../../messages/ar.json";
import englishMessages from "../../messages/en.json";

function collectLeafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogs", () => {
  it("keeps English and Arabic translation keys synchronized", () => {
    expect(collectLeafKeys(arabicMessages).sort()).toEqual(
      collectLeafKeys(englishMessages).sort(),
    );
  });

  it("does not contain empty translated values", () => {
    for (const messages of [englishMessages, arabicMessages]) {
      const values = collectLeafKeys(messages).map((key) => {
        const segments = key.split(".");
        let current: unknown = messages;
        for (const segment of segments) {
          if (typeof current !== "object" || current === null) return undefined;
          current = (current as Record<string, unknown>)[segment];
        }
        return current;
      });

      expect(values.every((value) => typeof value === "string" && value.trim())).toBe(
        true,
      );
    }
  });
});
