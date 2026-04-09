/**
 * 截图选项
 */
export interface ScreenshotOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  quality?: number;
  type?: "png" | "jpeg" | "webp";
  waitTime?: number;
}

/**
 * 截图服务接口
 */
export interface ScreenshotService {
  screenshot(htmlContent: string, options?: ScreenshotOptions): Promise<string>;
  screenshotFromUrl(url: string, options?: ScreenshotOptions): Promise<string>;
  cleanupTemp(olderThanMs?: number): Promise<number>;
}
