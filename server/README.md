# 独立采集服务（可选）

使用 Node.js 20+，无需 npm 依赖。

```bash
cd server
ALLOWED_ORIGIN=http://localhost:8000 DATA_DIR=./data PORT=3000 node server.js
```

前端 `config.js` 配置 `submitEndpoint: "http://localhost:3000/api/submit"`。

Railway 部署：将仓库 `server` 设置为 root directory，启动命令 `npm start`，设置 `ALLOWED_ORIGIN=https://<username>.github.io`（根据实际 GitHub Pages origin）、`DATA_DIR=/data`，并给 `/data` 挂载持久化卷。获得公网地址后，在前端 `config.js` 设置 `https://.../api/submit`。

提供 `POST /api/start`（分配最少使用的列表，并绑定匿名participant/session）与 `POST /api/submit`（同session覆盖式保存、逐块断点备份）。不提供公开下载原始数据端点；管理员应通过持久卷安全导出。**此简易服务未提供完整的生产级防滥用/身份验证、备份或机构审批机制；正式大规模收集前须加固。**

隐私：不要把 `server/data` 加入 GitHub，也不要把被试数据写入仓库。CORS不是身份认证；公网接口建议配合反滥用限速、安全日志与监控。
