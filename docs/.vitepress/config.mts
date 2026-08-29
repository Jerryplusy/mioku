import { defineConfig } from "vitepress";
import typedocSidebar from "../reference/api/typedoc-sidebar.json";

export default defineConfig({
  lang: "zh-CN",
  title: "Mioku",
  description: "AI 优先的插件式机器人框架",
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
    logo: "/images/home/cong.png",
    siteTitle: "Mioku",
    search: {
      provider: "local",
    },
    nav: [
      { text: "使用指南", link: "/guide/introduction" },
      { text: "开发者", link: "/developer/overview" },
      { text: "深入", link: "/advanced/event-bus" },
      { text: "类型参考", link: "/reference/" },
      { text: "插件市场", link: "/guide/market" },
      { text: "关于", link: "/about" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "使用指南",
          items: [
            { text: "认识 Mioku", link: "/guide/introduction" },
            { text: "快速开始", link: "/guide/quick-start" },
            { text: "适配器", link: "/guide/adapters" },
            { text: "配置文件", link: "/guide/configuration" },
            { text: "插件市场", link: "/guide/market" },
            { text: "WebUI", link: "/guide/webui" },
            { text: "部署方式", link: "/guide/deployment" },
          ],
        },
      ],
      "/developer/": [
        {
          text: "开发文档",
          items: [{ text: "架构总览", link: "/developer/overview" }],
        },
        {
          text: "插件开发",
          items: [
            { text: "第一个插件", link: "/developer/first-plugin" },
            { text: "事件处理", link: "/developer/events" },
            { text: "消息与消息段", link: "/developer/message" },
            { text: "操作 Bot", link: "/developer/bot" },
            { text: "定时任务与生命周期", link: "/developer/cron-lifecycle" },
            { text: "配置与数据存储", link: "/developer/config-data" },
            { text: "权限与访问控制", link: "/developer/permissions" },
            { text: "插件间通信", link: "/developer/communicate" },
            { text: "使用 AI 服务", link: "/developer/ai" },
            { text: "发布插件", link: "/developer/publish" },
          ],
        },
        {
          text: "服务开发",
          items: [{ text: "开发服务", link: "/developer/service-dev" }],
        },
        {
          text: "适配器开发",
          items: [
            { text: "开发适配器", link: "/developer/adapter-dev" },
            { text: "能力系统", link: "/developer/capability-dev" },
          ],
        },
      ],
      "/advanced/": [
        {
          text: "深入机制",
          items: [
            { text: "事件总线", link: "/advanced/event-bus" },
            { text: "包发现与加载", link: "/advanced/loader" },
            { text: "驱动器", link: "/advanced/driver" },
            { text: "运行时生命周期", link: "/advanced/runtime" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "API 参考",
          items: [{ text: "类型文档导读", link: "/reference/" }],
        },
        {
          text: "auto generated",
          items: typedocSidebar,
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/mioku-lab/mioku" },
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
