# 发布与签名指南

本文档说明 Loop 的签名策略、Android 发布签名配置，以及如何打包发布到 GitHub Releases。

## 签名策略概览

| 平台 | 是否签名 | 说明 |
|---|---|---|
| **Android** | ✅ 必须签名 | 安装包必须签名。仓库用一个**自建的发布 keystore**，密钥不入库，CI 通过 Secret 注入 |
| **桌面 Windows** | ❌ 暂不签名 | 未签名，首次运行触发 SmartScreen 警告（见下方绕过方法） |
| **桌面 macOS** | ❌ 暂不签名 | 未签名/未公证，首次运行被 Gatekeeper 拦截（见下方绕过方法） |
| **桌面 Linux** | ❌ 无需签名 | AppImage / deb 一般无需签名 |
| **iOS** | — | 暂未脚手架，需 Apple 开发者账号（$99/年）后再补 |

**核心原则**：任何签名密钥 / 证书 / 口令**绝不提交到仓库**。它们只存在于本地和 GitHub Secrets。
仓库保留 `apps/mobile/android/keystore.properties.example` 模板与本文档；贡献者无密钥时也能正常构建（自动回退到 debug 签名，仅供开发侧载）。

---

## Android 发布签名

### 1. 生成发布 keystore（一次性）

> ⚠️ 妥善保管生成的 keystore 与口令。一旦丢失，将无法用同一签名更新已发布的 APK。

在 `apps/mobile/android/` 目录下执行：

```bash
keytool -genkeypair -v \
  -keystore app/release.keystore \
  -alias loop \
  -keyalg RSA -keysize 2048 -validity 10000
```

按提示设置 keystore 口令与 key 口令（可相同），并填写证书信息。

### 2. 本地构建签名 APK

```bash
# 在 apps/mobile/android/ 下，由模板创建真实配置
cp keystore.properties.example keystore.properties
# 编辑 keystore.properties，填入第 1 步的口令与 alias

cd apps/mobile/android
./gradlew assembleRelease
```

产物在 `app/build/outputs/apk/release/app-release.apk`。验证签名：

```bash
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

> 缺少 `keystore.properties` 时，release 构建会**自动回退到 debug 签名**——可成功构建，但仅供开发侧载，不能用于对外发布。

### 3. 配置 GitHub Secrets（供 CI 使用）

把 keystore 转成 base64：

```bash
# Linux / macOS
base64 -w0 apps/mobile/android/app/release.keystore
# macOS（无 -w0）
base64 apps/mobile/android/app/release.keystore | tr -d '\n'
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apps/mobile/android/app/release.keystore"))
```

在仓库 **Settings → Secrets and variables → Actions** 添加 4 个 Secret：

| Secret 名 | 值 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 上面输出的 base64 字符串 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 口令 |
| `ANDROID_KEY_ALIAS` | key alias（如 `loop`） |
| `ANDROID_KEY_PASSWORD` | key 口令 |

---

## 发布流程

1. 更新版本号 / changelog，提交并推送到主分支。
2. 打 tag 并推送：

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. `.github/workflows/release.yml` 自动触发：
   - 创建草稿 Release；
   - 构建并上传**已签名 Android APK**（版本名取自 tag，versionCode 取自 CI run number）；
   - 用 `tauri-action` 构建并上传 **macOS / Windows / Linux 未签名桌面安装包**；
   - 全部成功后取消草稿，正式发布。

> CI 中的 Android 原生构建依赖固定版本的 NDK / CMake（见 workflow），首次跑若失败多为构建环境问题，按日志调整 `sdkmanager` 安装项即可。

---

## 桌面端：用户首次运行如何放行未签名应用

由于桌面端暂未签名，请在下载页 / README 中告知用户：

- **Windows**：出现「Windows 已保护你的电脑 / 未知发布者」时，点击「更多信息」→「仍要运行」。
- **macOS**：提示「无法打开，因为无法验证开发者」时，在 Finder 中**右键点按 App →「打开」**确认一次；或终端执行
  `xattr -cr /Applications/Loop.app` 去除隔离属性后再打开。
- **Linux**：AppImage 下载后赋予可执行权限再运行：`chmod +x Loop_*.AppImage && ./Loop_*.AppImage`。

---

## 未来可选增强

- **Windows 代码签名**：开源项目可申请 [SignPath.io](https://signpath.io)（对 OSS 免费）或使用 Azure Trusted Signing，去除 SmartScreen 警告。
- **macOS 签名 + 公证**：需 Apple 开发者账号（$99/年），配置 Developer ID 签名与 notarization。
- **Tauri 自动更新**：启用 updater 插件时，需另生成一套独立的 **minisign 更新签名密钥**（与系统代码签名无关），用于签名更新产物。
