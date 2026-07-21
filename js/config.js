/* ================================================================
   config.js — 全局配置（V3 新增）
   唯一配置入口，后续自托管部署时只改这个文件
   ================================================================ */

const CONFIG = {
  // PocketBase 后端
  pocketbase: {
    // 本地开发用 localhost，部署时改为实际地址
    url: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8090'
      : 'https://4a6e4e108af9b1a9-115-192-251-55.serveousercontent.com',
  },

  // Agent WebSocket（PWA 内嵌对话窗口 + 人设管理）
  agent: {
    wsUrl: 'ws://localhost:8080/ws/chat',  // Mac Mini 部署时改为实际 IP
    enabled: true,
  },
};
