import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "Mioku",
  description: "基于 mioki 的 AI 优先机器人框架",
  cleanUrls: true,
  lastUpdated: true,
  appearance: true,
  head: [
    ["meta", { name: "theme-color", content: "#79d8cf" }],
    ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
    ["link", { rel: "icon", href: "/favicon.ico" }],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
    ],
    [
      "link",
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
    ],
    ["link", { rel: "manifest", href: "/site.webmanifest" }],
  ],
  themeConfig: {
    logo: "/images/home/miku-logo.png",
    siteTitle: "Mioku",
    search: {
      provider: "local",
    },
    nav: [
      { text: "快速入门", link: "/guide/introduction" },
      { text: "开发者", link: "/developer/overview" },
      { text: "类型文档", link: "/reference/ctx" },
      { text: "插件市场", link: "/guide/plugin-market" },
      { text: "关于", link: "/about" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "使用指南",
          items: [
            { text: "Mioku 简介", link: "/guide/introduction" },
            { text: "快速开始", link: "/guide/quick-start" },
            { text: "WebUI", link: "/guide/webui" },
            { text: "部署方式", link: "/guide/deployment" },
            { text: "配置文件", link: "/guide/configuration" },
            { text: "插件市场", link: "/guide/plugin-market" },
          ],
        },
      ],
      "/developer/": [
        {
          text: "开始开发",
          items: [{ text: "开发约定", link: "/developer/overview" }],
        },
        {
          text: "插件开发",
          items: [
            { text: "插件入门", link: "/developer/plugin-start" },
            { text: "插件进阶", link: "/developer/plugin-advanced" },
            { text: "在插件中使用AI", link: "/developer/plugin-ai" },
          ],
        },
        {
          text: "服务开发",
          items: [{ text: "开发服务入门", link: "/developer/service-start" }],
        },
        {
          text: "AI 协作",
          items: [{ text: "借助 AI 开发", link: "/developer/ai-copilot" }],
        },
      ],
      "/reference/": [
        {
          text: "参考",
          items: [
            { text: "ctx", link: "/reference/ctx" },
            { text: "event", link: "/reference/event" },
            { text: "napcat-sdk", link: "/reference/napcat-sdk" },
            { text: "mioki-api", link: "/reference/mioki-api" },
            { text: "config.md", link: "/reference/config-page" },
            { text: "mioku-service", link: "/reference/mioku-services" },
            { text: "config", link: "/reference/config-files" },
            { text: "config-service", link: "/reference/config-service" },
            { text: "ai-service", link: "/reference/ai-service" },
            { text: "help-service", link: "/reference/help-service" },
            {
              text: "screenshot-service",
              link: "/reference/screenshot-service",
            },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/Jerryplusy/mioku" },
    ],
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    lastUpdated: {
      text: "最后更新于",
      formatOptions: {
        dateStyle: "short",
        timeStyle: "short",
      },
    },
    footer: {
      message: "Released under the MIT License with love.",
      copyright: `Copyright © ${new Date().getFullYear()} Jerryplusy`,
    },
  },
});
