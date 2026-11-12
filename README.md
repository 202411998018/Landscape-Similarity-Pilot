# Landscape Similarity Pilot｜自然风景三元组实验

浏览器三图选异实验，沿用 Attention-lab 的匿名ID、练习、正式试次、反应时、本地保存和数据导出思路。**注意：尚未连接集中数据收集服务；GitHub Pages 本身不能保存被试数据。**

## 包含
- 93张中国/日本/美国/挪威自然风景图片（从用户提供刺激包整理）。
- 20份预生成的互补试次表，列表各300题（3 × 100），含270主试次、18重复、12个 attention_probe（注意探测试次）（这些 attention 试次仅用于探索，不应直接用于排除被试）。
- 加载列表后额外呈现6个练习试次，正式采样的300题（3 × 100）不变。注意练习图来自正式候选池，因此可能出现重复，不进入正式分析。
- 每题400ms注视、三图呈现至作答，键盘1/2/3或鼠标。无国家、地点文字提示。
- 完成试次自动写入浏览器 localStorage（适合小规模 pilot，正式收集建议加 IndexedDB）；按3个区块（每区块100题）休息，支持恢复和 CSV/JSON 导出。
- `config.js` 可设置独立服务器的提交接口。默认为空，不会尝试提交到课程HW2。

## 本地启动
```bash
python -m http.server 8000
```
浏览器访问 http://localhost:8000；**不要直接双击 `index.html`**，因为浏览器可能禁止通过 `file://` 加载JSON列表。

## GitHub Pages
新建仓库，将本文件夹内容放入仓库根目录，然后 Settings → Pages → Deploy from a branch → main / (root)。
免费GitHub Pages仅托管前端及静态图片；不能接收或保存被试提交数据。

## 收集数据
1. **初期测试**：被试在结束时手动导出JSON，研究者集中收集。注意不要提交原始参与数据到公开GitHub。
2. **正式pilot**：运行 `server/` 的独立收集服务（例如 Railway），然后配置 `config.js` 的 `submitEndpoint`。自动分配由服务器完成，按区块与最终结果提交（带session ID去重）；浏览器本地仍保留备份。
3. 服务端若启用同源校验，应将实验GitHub Pages域名配置为 `ALLOWED_ORIGIN`。持久化数据目录需要挂载持久卷，不能依赖临时容器文件系统。

## 数据字段
列表与数据记录包含 `trial_role` (main/repeat/attention_probe/practice)、`trial_type` (AAA/AAB/ABC)、图片ID、实际左右位置、odd_image、selected_pair、RT、timestamp、session、block、屏幕尺寸。完成页不显示正确率或群体结果。

## 重要的部署前检查
- 当前为pilot试用版。正式收集前应逐题人工核查 attention 试次，不要直接据此排除被试。
- 自动分配没有服务器时采用匿名编号哈希，**不能保证20份列表在不同被试间严格均衡**；服务器部署后按最少分配数量轮换。
- 应开展浏览器兼容性、页面加载失败、网络中断恢复和数据完整性测试。
- 大图片较多：GitHub Pages可能有仓库/带宽限制。实际部署时可考虑将刺激图像托管在专用静态存储。
- 被试隐私与伦理审批请遵循你的机构要求；仅收集必要数据，务必告知研究者联系方式、保存期限及退出机制。
