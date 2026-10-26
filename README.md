# ustgz-booking-sport

港科广（HKUST-GZ）体育场馆预订系统的抢订助手，一个 Tampermonkey（油猴）脚本。

在[场馆预订页面](https://venue-frontend.hkust-gz.edu.cn/venue-h5/)右下角加一个面板，支持**网球场**和**羽毛球场**：点选时段和场地，到放号时间自动抢订，或者持续捡漏等别人退订。

脚本直接复用页面自身的登录状态，不需要复制 Cookie / Token，也不需要打开开发者工具。

## 安装

1. 在 Chrome / Edge 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展。
2. 新版 Chrome 需要在 `chrome://extensions` 右上角打开 **开发者模式**，否则油猴脚本不会运行。
3. 点击安装脚本：
   **[ustgz-booking.user.js](https://raw.githubusercontent.com/sooo66/ustgz-booking-sport/main/ustgz-booking.user.js)**
   Tampermonkey 会弹出安装页，点「安装」。

   也可以手动：Tampermonkey → 添加新脚本 → 粘贴 `ustgz-booking.user.js` 全部内容 → 保存。

脚本带了 `@updateURL`，仓库更新后 Tampermonkey 会自动检查升级。

## 使用

1. 登录预订系统，打开任意场馆详情页，右下角会出现「抢订助手」面板（点标题栏可收起）。
2. 在面板里选择：

   | 选项 | 说明 |
   |---|---|
   | 场馆 | 网球 / 羽毛球 |
   | 日期 | 今天 / 明天（系统只开放提前 1 天预订） |
   | 时段 | 点选 07–21 点的格子，**点击顺序即优先级**（右上角橙色数字）。绿色 = 可订（余 N），灰色 = 已满；已满的也能选，用来捡漏 |
   | 场地 | 点选场地号，同样按点击顺序为优先级；**不选 = 任意场地** |
   | 等到放号时间 | 勾选后倒计时到放号时间（系统配置为每天 **12:00:00** 放出次日场地），到点前 1.5 秒开始抢；不勾选则立即开始 |

3. 点「开始抢订」。面板会实时显示查询次数和状态，成功后弹出桌面通知，到「我的预约」里确认即可。点「停止」随时结束。

设置会自动保存在浏览器里，下次打开不用重新选。

### 抢订逻辑

- 按「时段优先级 × 场地优先级」依次尝试可订的格子，订到一个就停。
- 放号后前 60 秒每 0.3 秒查询一次，之后降为每 3 秒一次（捡漏模式），直到成功或手动停止。
- 提交失败的格子不会重复尝试；提示达到预约上限（系统每天限订 1 场）时自动停止。
- 等待放号期间每 5 分钟发一次查询，尽量保持登录不过期。

## 注意事项

- 抢订期间**页面必须保持打开**，电脑不能休眠。
- 登录过期后脚本会提示查询失败，重新登录并刷新页面即可。
- 预订成功后如需取消，请在系统「我的预约」里操作（注意取消时限）。
- 仅用于个人预订，请合理使用，不要设置过高的请求频率。

## 接口说明

供参考，均为 `POST https://venue-frontend.hkust-gz.edu.cn/venue-user-center` 下的 JSON 接口：

| 接口 | 参数 | 用途 |
|---|---|---|
| `/venueInfo/queryVenueInfoForPage` | `{pageNum, pageSize}` | 场馆列表 |
| `/venueInfo/queryVenueInfoByVenueId` | `{venueId, queryTime: "YYYY-MM-DD"}` | 某天各场地时段状态，`reserveStatus`: 0 可订 / 1 已订 / 2 锁定 |
| `/venueInfo/appointmentVenueInfo` | `{childId, venueId, startTime: "YYYY-MM-DD HH:MM", endTime, lockerRoom}` | 提交预订 |

场馆 ID：网球场 `1008`，羽毛球场 `1005`。返回体中 `code` 为字符串 `"200"` 表示成功。
