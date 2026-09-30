import { describe, expect, it } from "vitest";
import { createR2Client } from "../src/utils/r2Client.ts";
import * as K from "../src/utils/attachmentKeys.ts";

function fakeFetch(state: { status: number }) {
  const calls: { url: string; method: string }[] = [];
  const fn = async (url: string, init: { method: string }) => {
    calls.push({ url, method: init.method });
    const h: Record<string, string> = { "content-length": "1234", "content-type": "image/PNG" };
    return { status: state.status, ok: state.status >= 200 && state.status < 300, headers: { get: (n: string) => h[n] ?? null } };
  };
  return { fn, calls };
}
const cfg = { accountId: "acc", accessKeyId: "AK", secretAccessKey: "SK", bucket: "bkt" };
const now = new Date("2026-09-30T10:20:30Z");

describe("r2Client", () => {
  it("presignPut: عنوان R2 الافتراضي، path-style، content-type موقَّع، صلاحية 10 دقائق", () => {
    const c = createR2Client(cfg, fakeFetch({ status: 200 }).fn);
    const put = c.presignPut("tasks/u1/11111111-1111-1111-1111-111111111111.png", "image/png", now);
    expect(put.url).toMatch(/^https:\/\/acc\.r2\.cloudflarestorage\.com\/bkt\/tasks\/u1\/11111111-1111-1111-1111-111111111111\.png\?/);
    expect(put.url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
    expect(put.url).toContain("X-Amz-Expires=600");
    expect(put.headers).toEqual({ "Content-Type": "image/png" });
  });

  it("presignGet: يثبت داخل الساعة الواحدة ويتغير بعدها (لأجل كاش المتصفح)", () => {
    const c = createR2Client(cfg, fakeFetch({ status: 200 }).fn);
    const a = c.presignGet("k/x.png", new Date("2026-09-30T10:01:00Z"));
    expect(c.presignGet("k/x.png", new Date("2026-09-30T10:59:00Z"))).toBe(a);
    expect(c.presignGet("k/x.png", new Date("2026-09-30T11:01:00Z"))).not.toBe(a);
    expect(a).toContain("X-Amz-Date=20260930T100000Z");
    expect(a).toContain("X-Amz-Expires=7200");
  });

  it("endpoint بديل يُستعمل بدل عنوان R2", () => {
    const c = createR2Client({ ...cfg, endpoint: "http://127.0.0.1:9000" }, fakeFetch({ status: 200 }).fn);
    expect(c.presignGet("k/x.png", now)).toMatch(/^http:\/\/127\.0\.0\.1:9000\/bkt\/k\/x\.png\?/);
  });

  it("head: موجود / غير موجود / خطأ", async () => {
    const st = { status: 200 };
    const { fn, calls } = fakeFetch(st);
    const c = createR2Client(cfg, fn);
    expect(await c.head("k/x.png", now)).toEqual({ exists: true, size: 1234, contentType: "image/png" });
    expect(calls.at(-1)!.method).toBe("HEAD");
    st.status = 404;
    expect(await c.head("k/x.png", now)).toEqual({ exists: false });
    st.status = 500;
    await expect(c.head("k/x.png", now)).rejects.toThrow(/HEAD/);
  });

  it("remove: 2xx و404 نجاح، 403 والأخطاء الشبكية false ولا يرمي", async () => {
    const st = { status: 204 };
    const { fn, calls } = fakeFetch(st);
    const c = createR2Client(cfg, fn);
    expect(await c.remove("k", now)).toBe(true);
    expect(calls.at(-1)!.method).toBe("DELETE");
    st.status = 404;
    expect(await c.remove("k", now)).toBe(true);
    st.status = 403;
    expect(await c.remove("k", now)).toBe(false);
    const boom = createR2Client(cfg, async () => {
      throw new Error("net");
    });
    expect(await boom.remove("k")).toBe(false);
  });
});

describe("attachmentKeys", () => {
  const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("build/parse ذهاباً وإياباً", () => {
    const key = K.buildObjectKey("tasks", "cku1_x-Y", UUID, "image/jpeg");
    expect(key).toBe(`tasks/cku1_x-Y/${UUID}.jpg`);
    expect(K.parseObjectKey(key)).toEqual({ scope: "tasks", ownerId: "cku1_x-Y", uuid: UUID, ext: "jpg" });
  });

  it("يرفض مفاتيح خبيثة أو بشكل خاطئ", () => {
    const bad = [
      "../x.png",
      "tasks/u/../../x.png",
      `tasks/u/${UUID}.svg`,
      `other/u/${UUID}.png`,
      `tasks//${UUID}.png`,
      `tasks/u/${UUID.toUpperCase()}.png`,
      `tasks/u/${UUID}.png\n`,
    ];
    for (const k of bad) expect(K.parseObjectKey(k), k).toBeNull();
  });

  it("keysOf/removedKeys متسامحة مع القيم التالفة", () => {
    const before = [{ id: "1", name: "a", dataUrl: "data:image/png;base64,AA" }, { id: "2", name: "b", objectKey: "k1" }, { id: "3", name: "c", objectKey: "k2" }];
    expect(K.keysOf(before)).toEqual(["k1", "k2"]);
    expect(K.removedKeys(before, [before[1]])).toEqual(["k2"]);
    expect(K.keysOf(null)).toEqual([]);
    expect(K.keysOf("x")).toEqual([]);
    expect(K.keysOf([null, 1, { objectKey: 5 }])).toEqual([]);
  });

  it("serializeAttachmentsWith: القديم كما هو، الجديد بـ url، وأي حقل زائد يُحذف", () => {
    const raw = [{ id: "1", name: "a", dataUrl: "data:image/png;base64,AA" }, { id: "4", name: "d", objectKey: "k3", mimeType: "image/png", size: 5, junk: "x" }];
    const out = K.serializeAttachmentsWith(raw, (k) => `https://u/${k}`) as Record<string, unknown>[];
    expect(out[0].dataUrl).toBe("data:image/png;base64,AA");
    expect(out[1].url).toBe("https://u/k3");
    expect("junk" in out[1]).toBe(false);
    const none = K.serializeAttachmentsWith([{ id: "x", name: "n", objectKey: "k" }], () => undefined)[0] as Record<string, unknown>;
    expect("url" in none).toBe(false);
  });
});
