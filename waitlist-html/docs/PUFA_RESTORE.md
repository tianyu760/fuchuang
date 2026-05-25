# 普法宣传模块恢复说明

## 恢复结论

原有实现**完整保留**于：

- `pufa.html` — 页面结构、Tab、视频弹窗、资源链接弹窗
- `js/pufa.js` — 全部 B 站视频 `items[]`、`articles[]`、`resourceMap` 超链接

此前仅在页头被加入了跳转到 `law-education.html` 的脚本，导致用户看不到原页面。已移除该跳转。

## 主入口

| 地址 | 说明 |
|------|------|
| **pufa.html** | 普法宣传主页面（恢复） |
| law-education.html | 仅兼容跳转 → pufa.html |

## 未删除的资源

- 15+ 条 B 站 `player.bilibili.com` iframe 配置
- `extraVideos` 备用 BV 号列表
- 10 篇科普文章 + `resourceMap` 官方法律网站链接（人社部、npc.gov.cn、12315 等）

## 兼容优化（不改变结构）

- `css/pufa-motion-addon.css` — 页面淡入、卡片 hover 阴影
- `js/pufa.js` — 可选 `POST /api/admin/track/visit` 统计（管理端/大屏用，不影响 UI）

## 与管理端 / 大屏关系

- 管理端「普法内容」仍走 `/api/law-education` JSON 数据（后台运营用）
- 用户可见的普法页**仍为** `pufa.html` + `pufa.js` 本地数据
- 二者互不覆盖
