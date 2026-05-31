# Crabbit!

零依赖、纯前端生活管理应用，localStorage 本地存储，下载即用。

## 功能模块

| 模块 | 说明 |
|------|------|
| 打卡 | 每日任务管理 + GitHub 风格热力图统计 |
| 待办 | 三级优先级 + 截止时间 + 分类管理 |
| 记账 | 收支记录 + 计算器 + 分类统计 + SVG 趋势图 |
| 身材管理 | 体重/腰围/臂围/胸围/臀围多维度 SVG 折线图 |
| 吃喝拉撒 | 饮食记录（千焦/宏量）+ 喝水记录（人体灌水动画）+ 排便记录（布里斯托分类） |
| 睡眠记录 | 主睡眠/小憩 + 时钟表盘可视化 + 周统计 |

## 版本

| 分支 | 版本 | 说明 |
|------|------|------|
| `main` | v1.x | 单 HTML 文件，localStorage 存储，下载即用 |
| `v2` | v2.2.0 | 模块化架构 + 通用数据引擎 + Remix Icons，6 大功能模块 |

## 快速开始

1. 用 VS Code Live Server 打开 `index.html`（端口 5500）
2. 或直接部署到 GitHub Pages / Vercel 等静态托管
3. **当前认证已绕过**，应用以本地访客模式运行，所有数据存入 localStorage

## 技术栈

- **前端**：HTML5 / CSS3 / Vanilla JS（零框架、零构建步骤）
- **图标**：[Remix Icon](https://remixicon.com) v4（CDN）
- **后端**：Supabase（PostgreSQL + Auth + RLS，当前云实例已失效，规划自托管迁移）
- **SDK**：@supabase/supabase-js v2（CDN）
- **主题色**：`#6b7db3`（低饱和度钢蓝）

## 许可证

MIT
