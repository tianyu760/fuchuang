/**
 * 管理端专用启动入口（默认端口 3003）
 * 用法：npm run start:admin  或  根目录 npm run server:admin
 */
process.env.PORT = process.env.PORT || '3003';
require('./multimodal-server.js');
