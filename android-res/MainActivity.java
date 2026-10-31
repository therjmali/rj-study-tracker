package app.rjtracker.pro;

import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Base64;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Edge-to-edge is enforced on modern Android, which lets web content draw underneath
 * the status bar and gesture bar. We take control of the insets here: the content view
 * is padded by the system bars / cut-out / keyboard, so the web app always sits in the
 * safe area, and the web layer can recolour the bars to match its theme.
 */
public class MainActivity extends BridgeActivity {

  private static final int DEFAULT_BG = Color.parseColor("#ECDFC8");

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

    final View content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
      Insets bars = insets.getInsets(
          WindowInsetsCompat.Type.systemBars()
              | WindowInsetsCompat.Type.displayCutout()
              | WindowInsetsCompat.Type.ime());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return WindowInsetsCompat.CONSUMED;
    });

    applyBars(DEFAULT_BG, true);

    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().addJavascriptInterface(new BarsBridge(), "RJNative");
    }
  }

  private void applyBars(int color, boolean darkIcons) {
    getWindow().getDecorView().setBackgroundColor(color);
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setAppearanceLightStatusBars(darkIcons);
    controller.setAppearanceLightNavigationBars(darkIcons);
  }

  /** Pins a launcher shortcut that opens this app with a custom icon (Android 8+). */
  private boolean pinCustomShortcut(String base64Png, String label) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
    byte[] bytes = Base64.decode(base64Png, Base64.DEFAULT);
    Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
    if (bmp == null) return false;
    ShortcutManager sm = getSystemService(ShortcutManager.class);
    if (sm == null || !sm.isRequestPinShortcutSupported()) return false;
    Intent launch = new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN);
    ShortcutInfo info = new ShortcutInfo.Builder(this, "rj-custom-" + System.currentTimeMillis())
        .setShortLabel(label)
        .setLongLabel(label)
        .setIcon(Icon.createWithBitmap(bmp))
        .setIntent(launch)
        .build();
    return sm.requestPinShortcut(info, null);
  }

  /** Called from JavaScript: window.RJNative.setBars("#ecdfc8", true) */
  public class BarsBridge {
    @JavascriptInterface
    public boolean pinShortcut(String base64Png, String label) {
      try {
        return pinCustomShortcut(base64Png, label);
      } catch (Exception e) {
        return false;
      }
    }

    @JavascriptInterface
    public void setBars(String hex, boolean darkIcons) {
      try {
        final int color = Color.parseColor(hex);
        runOnUiThread(() -> applyBars(color, darkIcons));
      } catch (IllegalArgumentException ignored) {
        // malformed colour: keep current bars
      }
    }
  }
}
