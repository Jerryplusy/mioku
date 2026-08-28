import sharp from "sharp";
import { logger } from "mioku";

const IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const COMPRESS_MAX_WIDTH = 1280;
const COMPRESS_JPEG_QUALITY = 80;

export const QQ_IMAGE_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://qq.com/",
};

const FETCH_HEADERS = QQ_IMAGE_FETCH_HEADERS;

/**
 * 准备发给模型的图片 URL：体积超过 1MB 时压缩为 JPEG data URL，否则原样返回。
 * data URL（如 GIF 抽帧结果）与非 http(s) 链接直接放行。
 */
export async function prepareImageUrlForModel(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  if (!/^https?:\/\//i.test(url)) return url;

  const size = await probeImageSize(url);
  if (size !== null && size <= IMAGE_MAX_BYTES) return url;

  let buffer: Buffer;
  try {
    buffer = await downloadImageBuffer(url);
  } catch (err) {
    logger.warn(`[image-compress] download failed, using original: ${err}`);
    return url;
  }

  if (buffer.length <= IMAGE_MAX_BYTES) return url;

  try {
    const compressed = await sharp(buffer)
      .resize({ width: COMPRESS_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: COMPRESS_JPEG_QUALITY })
      .toBuffer();
    logger.info(
      `[image-compress] compressed ${buffer.length} -> ${compressed.length} bytes`,
    );
    return `data:image/jpeg;base64,${compressed.toString("base64")}`;
  } catch (err) {
    logger.warn(`[image-compress] compress failed, using original: ${err}`);
    return url;
  }
}

export async function prepareImageUrlsForModel(
  urls: string[],
): Promise<string[]> {
  return Promise.all(urls.map(prepareImageUrlForModel));
}

async function probeImageSize(url: string): Promise<number | null> {
  try {
    const head = await fetch(url, { method: "HEAD", headers: FETCH_HEADERS });
    if (!head.ok) return null;
    const len = head.headers.get("content-length");
    if (!len) return null;
    const n = Number(len);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function downloadImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
