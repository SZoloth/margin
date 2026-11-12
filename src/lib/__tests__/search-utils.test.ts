import { describe, it, expect } from "vitest";
import { sanitizeFtsQuery } from "../search-utils";

describe("sanitizeFtsQuery", () => {
  it("appends * for prefix matching", () => {
    expect(sanitizeFtsQuery("hello")).toBe('"hello"*');
  });

  it("handles multi-word queries", () => {
    expect(sanitizeFtsQuery("hello world")).toBe('"hello"* "world"*');
  });

  it("strips special FTS5 operators", () => {
    expect(sanitizeFtsQuery("hello OR")).toBe('"hello"*');
    expect(sanitizeFtsQuery("NOT this AND that")).toBe('"this"* "that"*');
    expect(sanitizeFtsQuery("NEAR something")).toBe('"something"*');
  });

  it("handles empty/whitespace input", () => {
    expect(sanitizeFtsQuery("")).toBe("");
    expect(sanitizeFtsQuery("   ")).toBe("");
  });

  it("escapes double quotes", () => {
    expect(sanitizeFtsQuery('say "hello"')).toBe('"say"* "hello"*');
  });

  it("handles special characters without crashing", () => {
    expect(sanitizeFtsQuery("c++")).toBe('"c"*');
    expect(sanitizeFtsQuery("hello-world")).toBe('"hello-world"*');
    expect(sanitizeFtsQuery("+++")).toBe("");
    expect(sanitizeFtsQuery("---")).toBe("");
  });
});
