---
name: read-feishu-form-results
description: >-
  读取飞书问卷（多维表格表单/收集表）所有用户的提交明细。用户给出
  /share/base/form/ 问卷链接（或问卷分享 token），要求读取、
  统计提交结果/答卷/明细时使用（不导出文件）。
metadata:
  version: "1.1.0"
---

# 读取飞书问卷提交结果

## 目的

从问卷分享链接读出全部提交明细（每人对每题的答案、提交时间）。本机实测可用路径：全局 `lark-cli`（独立飞书 CLI 工具）以**用户身份**走多维表格 API。核心链路：share token → `+form-detail` 解析出结果 Base → `+table-list` 定位结果表 → `+record-list` stdout 直读全量记录，全程不落盘。

## 何时使用

- 用户给出 `https://<tenant>.feishu.cn/share/base/form/<token>` 链接，要求读取提交结果/答卷/明细
- 用户要求统计问卷各选项人数、查看提交名单

不适用：多维表格结果页 URL（`/base/…?table=…`）直接给表坐标的，跳过第 1 步即可；用户要**填写/提交**问卷的走 `lark-cli skills read lark-base` 的 Form submit 流程。

## 约束

- 全程 `--as user`。本项目 `.env` 里的机器人应用凭证缺 `bitable:app:readonly` scope（报 `99991672`），且结果 Base 未共享给应用，**不要**尝试应用身份。
- 不要走匿名抓取：问卷分享页 HTML 和前端接口 `api/bitable/form/external/list_submitted_records` 都要求登录态（`code:5 Login Required`），实测无匿名通路。
- 明细含姓名等个人信息：**不导出、不落盘**——不建 `.tmp/`、不传 `--output`、不写任何中间文件，记录 stdout 直读、统计在管道内完成；不要提交到 Git、不外发。
- 只读任务：不要调用 `+form-submit` 或任何写接口。

## 步骤

### 1. 解析问卷链接 → 结果 Base 与题目

```bash
lark-cli base +form-detail --share-token <share_token> --as user
```

share_token 取链接 `/share/base/form/` 后的部分。返回 `data.base_token`（结果 Base）、`data.name`（问卷名）、`data.description`（问卷说明，常含截止时间）和 `data.questions[]`（每题 `id` = field_id、`title`、`type`、`required`、`options`、`filter` 条件显示逻辑）。

不确定链接类型时先 `lark-cli base +url-resolve --url '<url>' --as user`，`input_type: form_share_url` 即本流程。

### 2. 定位结果表

```bash
lark-cli base +table-list --base-token <base_token> --as user
```

选 `records_count` 最大、名为「收集表」「数据表」或问卷名的表；「选项」「填写校验」等辅助表跳过。结果 Base 通常还有「提交人」（created_by）、「提交时间」（datetime）两个系统列。

### 3. stdout 直读全量记录（无文件）

```bash
lark-cli base +record-list --base-token <base_token> --table-id <table_id> \
  --as user --format json --limit 200
```

`--limit 200`（json 格式单页上限，ndjson 的 2000 不适用于 json）取一页；stdout 返回 `data.data`（按 `data.fields` 列顺序的行矩阵）、`data.record_id_list`、`data.has_more`。`has_more: true` 时按 `--offset` 递增（200、400…）逐页拉取，在管道里合并后统计——**不要**用 `--output`/ndjson 落盘，也不要把整页记录粘进回复。问卷结果通常几十到几百行，1–2 页内取完。

### 4. 管道内统计（Python，注意中文编码）

列名是**结果表列名**（如「单选」「单选 2」），不是问卷题目名；用第 1 步 `questions[].id`（field_id）对照 `data.field_id_list` 做映射。Windows 控制台 GBK 会乱码：Python 加 `PYTHONIOENCODING=utf-8` 即可直接 print 中文（本机实测有效），无需写临时文件再读回：

```bash
lark-cli base +record-list --base-token <base_token> --table-id <table_id> \
  --as user --format json --limit 200 | PYTHONIOENCODING=utf-8 python -c "
import json, sys
from collections import Counter
payload = json.load(sys.stdin)['data']
idx = {n: i for i, n in enumerate(payload['fields'])}
def get(r, col):
    v = r[idx[col]]
    if isinstance(v, list):
        # 空 list = 未填（含条件题不适用），必须返回 None，str([]) 会变成真值 '[]' 污染统计
        if not v:
            return None
        item = v[0]
        return item['name'] if isinstance(item, dict) else str(item)
    return v if (v is None or isinstance(v, str)) else str(v)
rows = payload['data']
c = Counter(get(r, '<列名>') or '(空)' for r in rows)
print('rows:', len(rows), 'has_more:', payload['has_more'])
print(dict(c))
"
```

`has_more: true` 时先完成分页合并再统计。需要明细表时由 Python 直接打印 Markdown 表格，不经过中间文件。

统计「未填」前先看 `+form-detail` 返回的 `questions[].filter`（条件显示逻辑）和 `data.description`（问卷说明，含截止时间）：条件题对不满足条件的提交者不可见，「未填」≠ 漏答，应报告为「不适用」而非异常。交叉校验（各题人数之和是否自洽）能发现假异常。

最后把统计、明细表和异常项（非默认选项、重复提交）报告给用户。全程不产生本地文件。

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| `code 99991672 ... bitable:app:readonly` | 用了应用身份；改 `--as user` |
| `code:5 Login Required` / 302 到 404 | 匿名调前端接口或页面，无此通路；走本文 lark-cli 链路 |
| 统计出现 `"[]": 22` 这类键 | `get()` 把空 list 变成了字符串 `"[]"`；空 list 必须返回 None（见第 4 步样例注释） |
| 某题大量「未填」 | 先查 `questions[].filter`：条件题对部分人不可见，报告为「不适用」而非漏答异常 |
| 某列整列都是 null（如「文本 4」） | 结果表存在但问卷未启用的隐藏题目，正常，报告时忽略 |
| 统计输出乱码 | Windows 控制台 GBK；给 Python 加 `PYTHONIOENCODING=utf-8`，不要写临时文件绕行 |
| 提交数超过 200 | json 格式单页上限 200（ndjson 的 2000 不适用）；看 `has_more`，用 `--offset` 翻页在管道内合并，仍不落盘 |
| 问卷在别的租户（`isCrossTenant`） | 只要当前账号对结果 Base 有权限即可读取；无权限时报权限错误，需所有者共享 |
