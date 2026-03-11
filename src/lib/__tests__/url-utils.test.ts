import { describe, it, expect } from "vitest";
import { normalizeComparableUrl } from "../url-utils";

describe("normalizeComparableUrl", () => {
  it("returns null for null input", () => {
    expect(normalizeComparableUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeComparableUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeComparableUrl("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeComparableUrl("   ")).toBeNull();
  });

  it("lowercases URLs", () => {
    expect(normalizeComparableUrl("HTTPS://LINKEDIN.COM/in/JohnDoe")).toBe(
      "https://linkedin.com/in/JohnDoe".toLowerCase()
    );
  });

  it("strips trailing slashes", () => {
    expect(normalizeComparableUrl("https://linkedin.com/in/johndoe/")).toBe(
      "https://linkedin.com/in/johndoe"
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizeComparableUrl("https://linkedin.com/in/johndoe///")).toBe(
      "https://linkedin.com/in/johndoe"
    );
  });

  it("strips query parameters", () => {
    expect(normalizeComparableUrl("https://linkedin.com/in/johndoe?ref=search")).toBe(
      "https://linkedin.com/in/johndoe"
    );
  });

  it("strips hash fragments", () => {
    expect(normalizeComparableUrl("https://linkedin.com/in/johndoe#about")).toBe(
      "https://linkedin.com/in/johndoe"
    );
  });

  it("handles URLs with all extras", () => {
    expect(
      normalizeComparableUrl("https://LinkedIn.com/in/JohnDoe/?ref=nav&foo=bar#about")
    ).toBe("https://linkedin.com/in/johndoe");
  });

  it("trims whitespace", () => {
    expect(normalizeComparableUrl("  https://github.com/user  ")).toBe(
      "https://github.com/user"
    );
  });

  it("handles non-URL strings gracefully", () => {
    const result = normalizeComparableUrl("not-a-url");
    expect(result).toBe("not-a-url");
  });

  it("same URL with different trailing slashes match", () => {
    const a = normalizeComparableUrl("https://linkedin.com/in/johndoe");
    const b = normalizeComparableUrl("https://linkedin.com/in/johndoe/");
    expect(a).toBe(b);
  });

  it("same URL with different query params match", () => {
    const a = normalizeComparableUrl("https://github.com/user");
    const b = normalizeComparableUrl("https://github.com/user?tab=repos");
    expect(a).toBe(b);
  });
});
