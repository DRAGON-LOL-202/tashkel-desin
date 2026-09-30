// توقيع AWS SigV4 بطريقة الـ presigned URL (استعلام الرابط)، بدون أي اعتماديات خارجية.
// يعمل مع Cloudflare R2 وأي خدمة متوافقة مع S3. دالة صرفة: لا تقرأ البيئة ولا الشبكة.
// مُتحقَّق منها بمتجه الاختبار الرسمي في توثيق AWS (انظر tests/s3sign.test.ts).
import { createHash, createHmac } from "node:crypto";

export interface PresignParams {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  protocol: "https:" | "http:";
  /** قيمة ترويسة Host (مع المنفذ إن لم يكن افتراضياً) */
  host: string;
  /** المسار الخام يبدأ بـ "/"، ويُرمَّز كل مقطع فيه هنا */
  path: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  /** وقت التوقيع (يُقرَّب للثانية) */
  date: Date;
  /** ترويسات إضافية تدخل في التوقيع (مثل content-type)؛ يجب أن يرسلها العميل بنفس القيمة */
  signedHeaders?: Record<string, string>;
}

// RFC 3986: يبقى A-Z a-z 0-9 - _ . ~ ، والباقي يُرمَّز
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const sha256Hex = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

export function presign(p: PresignParams): string {
  const iso = p.date.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20130524T000000Z
  const dateStamp = iso.slice(0, 8);
  const scope = `${dateStamp}/${p.region}/${p.service}/aws4_request`;

  const headers: Record<string, string> = { host: p.host };
  for (const [k, v] of Object.entries(p.signedHeaders ?? {})) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");

  const path = p.path
    .split("/")
    .map((seg) => uriEncode(seg))
    .join("/");

  const query: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${p.accessKeyId}/${scope}`],
    ["X-Amz-Date", iso],
    ["X-Amz-Expires", String(p.expiresSec)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalQuery = query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [p.method, path, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", iso, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${p.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, p.region);
  const kService = hmac(kRegion, p.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `${p.protocol}//${p.host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
