# Screenshot Service

网页截图服务，使用 Puppeteer 进行网页截图，支持 HTML 与 Markdown 渲染

## ScreenshotService

> 网页截图服务接口

### screenshot

> 从 HTML 内容生成截图

```typescript
screenshot(htmlContent, options?): Promise<string>
```

> - `htmlContent`: HTML 内容
> - `options?`: ScreenshotOptions 对象
>   返回: `string` - 截图文件路径

### screenshotFromUrl

> 从 URL 生成截图

```typescript
screenshotFromUrl(url, options?): Promise<string>
```

> - `url`: 网页 URL
> - `options?`: ScreenshotOptions 对象
>   返回: `string` - 截图文件路径

### screenshotMarkdown

> 从 Markdown 内容渲染并生成截图

```typescript
screenshotMarkdown(markdownContent, options?): Promise<string>
```

> - `markdownContent`: Markdown 文本内容
> - `options?`: MarkdownScreenshotOptions 对象
>   返回: `string` - 截图文件路径

### cleanupTemp

> 清理临时文件

```typescript
cleanupTemp(olderThanMs?): Promise<number>
```

> - `olderThanMs?`: 删除指定毫秒前的文件，默认 3600000
>   返回: `number` - 删除的文件数量

---

## ScreenshotOptions

> 截图选项

```typescript
interface ScreenshotOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  quality?: number;
  type?: "png" | "jpeg" | "webp";
  waitTime?: number;
}
```

> - `width?`: 视图宽度，默认 1920
> - `height?`: 视图高度，默认 1080
> - `fullPage?`: 是否截取完整页面，默认 false
> - `quality?`: 图片质量 1-100，仅 jpeg/webp
> - `type?`: 输出图片格式，默认 png
> - `waitTime?`: 超时时间（毫秒）

## MarkdownScreenshotOptions

> Markdown 截图选项，继承 ScreenshotOptions

```typescript
interface MarkdownScreenshotOptions extends ScreenshotOptions {
  themeMode?: "auto" | "light" | "dark";
}
```

> - `themeMode?`: 主题模式，默认 `auto`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface ScreenshotService {
  screenshot(htmlContent: string, options?: ScreenshotOptions): Promise<string>;
  screenshotMarkdown(
    markdownContent: string,
    options?: MarkdownScreenshotOptions
  ): Promise<string>;
  screenshotFromUrl(url: string, options?: ScreenshotOptions): Promise<string>;
  cleanupTemp(olderThanMs?: number): Promise<number>;
}
```

</details>
