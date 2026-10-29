package expo.modules.chatshortcut

import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android home-screen shortcut ("Add to home"): asks the system to
// pin a shortcut that opens one exact chat when tapped. Android
// itself shows the confirmation dialog — the app never pins silently.
// Pinned shortcuts need API 26+; older phones report false.
class ChatShortcutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatShortcut")

    AsyncFunction("requestPinShortcut") { label: String, uri: String ->
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
          return@AsyncFunction false
        }
        val context = appContext.reactContext ?: return@AsyncFunction false
        val manager = context.getSystemService(ShortcutManager::class.java) ?: return@AsyncFunction false
        if (!manager.isRequestPinShortcutSupported) {
          return@AsyncFunction false
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
          setClassName(context.packageName, "${context.packageName}.MainActivity")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        val info = ShortcutInfo.Builder(context, "chat-${System.currentTimeMillis()}")
          .setShortLabel(label)
          .setLongLabel(label)
          .setIcon(Icon.createWithResource(context, context.applicationInfo.icon))
          .setIntent(intent)
          .build()
        manager.requestPinShortcut(info, null)
      } catch (e: Exception) {
        false
      }
    }
  }
}
