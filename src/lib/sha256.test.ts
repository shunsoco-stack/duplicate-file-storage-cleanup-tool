import { describe, expect, it } from "vitest";
import { IncrementalSha256, sha256Hex } from "@/lib/sha256";

const encoder = new TextEncoder();

describe("IncrementalSha256", () => {
  it("matches the standard empty SHA-256 vector", () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the standard abc SHA-256 vector", () => {
    expect(sha256Hex(encoder.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces the same digest across arbitrary chunks", () => {
    const sha = new IncrementalSha256();
    sha.update(encoder.encode("The quick brown "));
    sha.update(encoder.encode("fox jumps over "));
    sha.update(encoder.encode("the lazy dog"));
    expect(sha.digestHex()).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });
});
