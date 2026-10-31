package app.rjtracker.pro;

import android.graphics.Color;
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

  /** Called from JavaScript: window.RJNative.setBars("#ecdfc8", true) */
  public class BarsBridge {
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
