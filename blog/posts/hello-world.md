# 你好，世界

这是我的第一篇博客文章。

## 为什么写博客

记录学习过程，分享技术心得。

## 最近在做什么

正在深入学习 RTOS 相关知识，包括任务调度、IPC 机制、内存管理等。
为此还做了一个 [RTOS 可视化仿真器](/RTOS_sim/)，欢迎体验！

## 代码示例

```c
// FreeRTOS 任务函数示例
void vTaskFunction(void *pvParameters) {
    for (;;) {
        // 任务逻辑
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
```

> 写新文章时，在 `blog/posts/` 目录下新建 `.md` 文件即可。
