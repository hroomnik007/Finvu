import { describe, expect, it } from "vitest";
import { parseImageDataUrl } from "./avatarStorage";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("parseImageDataUrl", () => {
  it("decodes supported image types and maps them to an extension", () => {
    expect(parseImageDataUrl(`data:image/png;base64,${b64("x")}`)?.ext).toBe("png");
    expect(parseImageDataUrl(`data:image/jpeg;base64,${b64("x")}`)?.ext).toBe("jpg");
    expect(parseImageDataUrl(`data:image/webp;base64,${b64("x")}`)?.ext).toBe("webp");
    expect(parseImageDataUrl(`data:image/gif;base64,${b64("x")}`)?.ext).toBe("gif");
  });

  it("returns the decoded bytes", () => {
    expect(parseImageDataUrl(`data:image/png;base64,${b64("hello")}`)?.buffer.toString()).toBe("hello");
  });

  it("rejects other types, non-base64 and empty payloads", () => {
    expect(parseImageDataUrl(`data:image/svg+xml;base64,${b64("<svg/>")}`)).toBeNull();
    expect(parseImageDataUrl(`data:text/html;base64,${b64("<b/>")}`)).toBeNull();
    expect(parseImageDataUrl("data:image/png,rawdata")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64,")).toBeNull();
    expect(parseImageDataUrl("not a data url")).toBeNull();
  });
});
