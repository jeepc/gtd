package com.loop

import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Loop"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    applyImmersiveTheme(resources.configuration)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // 主题切换后重新适配。JS 端 Appearance.setColorScheme() → AppCompatDelegate
    // .setDefaultNightMode() 会触发本回调（manifest 已声明处理 uiMode 变更），
    // 此时 newConfig 反映的是 app 强制的明暗（不是系统的）。
    applyImmersiveTheme(newConfig)
  }

  /**
   * 让原生窗口/系统栏跟随 app 当前明暗。RN 的 enableEdgeToEdge() 只在 onCreate 跑一次，
   * 且按"系统"明暗写死导航栏外观、并强制开启导航栏对比度蒙层；当 app 内强制深色而系统为
   * 浅色时，就会出现：① 3 键导航底部白条；② 页面切换动画透出白色窗口背景闪烁。这里按
   * 当前（已被 AppCompat 应用的）明暗接管：
   *   1. 窗口背景换成对应明暗色 —— 消除切换时的白闪；
   *   2. 关闭导航栏对比度蒙层 —— 手势条/3 键直接画在 app 深色背景上，真正沉浸；
   *   3. 状态栏/导航栏图标明暗按背景反色。
   */
  private fun applyImmersiveTheme(config: Configuration) {
    val isDark =
        (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    // 按当前明暗重新解析 @color/window_bg（day=#fff / night=#0b0b0c）。
    window.setBackgroundDrawableResource(R.color.window_bg)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // RN enableEdgeToEdge 默认设为 true，导致 3 键导航有半透明蒙层（浅色下发白）。
      window.isNavigationBarContrastEnforced = false
    }

    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = !isDark
      isAppearanceLightNavigationBars = !isDark
    }
  }
}
