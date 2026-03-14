---
title: '你好，世界'
description: '我的第一篇博客文章'
pubDate: 'Mar 14 2026'
heroImage: '../../assets/blog-placeholder-1.jpg'
---

这是我的第一篇博客文章。

## 为什么写博客

<!-- TODO: 写下你开始写博客的原因 -->

记录学习过程，分享技术心得。

## 最近在做什么

<!-- TODO: 写下你目前的学习/工作方向 -->

正在深入学习 RTOS 相关知识，包括任务调度、IPC 机制、内存管理等。
为此还做了一个 [RTOS 可视化仿真器](/RTOS_sim/)，欢迎体验！

## 文章写法参考

Astro 博客使用 Markdown 格式写文章，支持：

- **粗体**、*斜体*、`代码`
- [链接](https://example.com)
- 代码块：

```c
// 示例 C 代码
void vTaskFunction(void *pvParameters) {
    for (;;) {
        // 任务逻辑
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
```

把新文章的 `.md` 文件放到 `src/content/blog/` 目录即可自动显示。
