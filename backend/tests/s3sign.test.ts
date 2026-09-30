import { describe, expect, it } from "vitest";
import { presign, uriEncode } from "../src/utils/s3sign.ts";

describe("s3sign: توقيع SigV4 بالاستعلام", () => {
  it("يطابق المتجه الرسمي في توثيق AWS حرفياً", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presign({
      method: "GET",
      protocol: "https:",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      expiresSec: 86400,
      date: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
  });

  it("الترويسات الموقَّعة تدخل في التوقيع (content-type يغيّر النتيجة)", () => {
    const base = {
      method: "PUT" as const,
      protocol: "https:" as const,
      host: "h.example",
      path: "/b/k.png",
      region: "auto",
      service: "s3",
      accessKeyId: "AK",
      secretAccessKey: "SK",
      expiresSec: 600,
      date: new Date("2026-09-30T10:00:00Z"),
    };
    const a = presign({ ...base, signedHeaders: { "Content-Type": "image/png" } });
    const b = presign({ ...base, signedHeaders: { "Content-Type": "image/jpeg" } });
    expect(a).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
    expect(a).not.toBe(b);
  });

  it("uriEncode يرمّز !'()* ويترك - _ . ~", () => {
    expect(uriEncode("a b/!'()*-_.~")).toBe("a%20b%2F%21%27%28%29%2A-_.~");
  });
});
