# 坚果云 WebDAV 根地址 PUT 404 ObjectNotFound

**Issue**：[#681](https://github.com/poco-ai/Agentero/issues/681)

**影响面**：设置页「同步」WebDAV 后端，服务器地址指向坚果云官方根地址 `https://dav.jianguoyun.com/dav/`

## 问题

保存配置后首次同步报错（原始响应体直接进 Toast）：

```text
PUT vault.json: 404 Not Found <d:error ... ObjectNotFound ...
The resource of this location does not exist
```

两个缺陷叠加：

1. **环境**：坚果云 WebDAV 根 `/dav/` 可以 PROPFIND 列表（集合"存在"、MKCOL 它返回 403 被按「已存在/受保护」容忍），但**不允许在根下直接创建文件**——PUT 一律 404 `ObjectNotFound`。而根地址恰是坚果云官方文档给出、用户最可能复制的地址。
2. **代码**：`probe_conditional_writes` 的首次 `.sync-probe-<uuid>` 试写也 404，但 `Err` 落进 catch-all 分支被当成「探测无结论 → 按支持处理」，连接测试假通过、坏配置被静默保存；错误直到 `sync_configure` 之后调度器立即触发的首次同步才暴露——一次同步的第一个远端写就是 `vault.json`（`ensure_remote_identity`）。

## 修复

- `probe_conditional_writes` 重排为两步：先做**无条件 PUT 试写**，失败即上抛并带上目标目录 URL（`cannot write to <dir>: PUT …: 404 …`）；第二步用过期 etag 的 `If-Match` 判条件写支持。fail open 只保留给「无结论」情形，不再吞掉硬错误。
- `test_connection` 以 `conditional_writes=true` 构造探测客户端：探测测的是服务器行为，不再沿用持久化的旧结论（重存配置时旧结论会被重新评估）。
- 坚果云根地址归一化为专用文件夹 `agentero/`（`config.rs::normalize_webdav_url`，纯函数）：`normalized()` 于保存路径（表单回显实际地址）与 `WebdavClient::new` 于读取路径（旧配置无需重存即自愈）共用；固定名称保证多设备解析到同一目录。
- 文档：`docs/backend/sync.md` WebDAV 小节（目录模型 / 连接测试 / 条件写 / 兼容性实测）。
