package app.rjtracker.pro;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Native glue for the web app:
 *  - safe-area insets + theme-coloured system bars (edge-to-edge is enforced on modern Android)
 *  - live timer notification with quick actions, and a finish alarm that works with the screen off
 *  - saving backup files to Downloads or a folder the student picked, with retention
 *  - pinned home-screen shortcut with a custom icon
 */
public class MainActivity extends BridgeActivity {

  private static final int DEFAULT_BG = Color.parseColor("#ECDFC8");
  private static final int ALARM_REQUEST = 4721;

  private ActivityResultLauncher<Uri> folderPicker;

  private final BroadcastReceiver actionReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      dispatchAction(intent.getStringExtra("id"));
    }
  };

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

    folderPicker = registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), uri -> {
      if (uri == null) {
        js("window.dispatchEvent(new CustomEvent('rj:folder-picked',{detail:{cancelled:true}}))");
        return;
      }
      try {
        getContentResolver().takePersistableUriPermission(uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      } catch (Exception ignored) {
        // already persisted or not offered
      }
      String name = prettyTreeName(uri);
      js("window.dispatchEvent(new CustomEvent('rj:folder-picked',{detail:{uri:" + q(uri.toString()) + ",name:" + q(name) + "}}))");
    });

    NativeNotifier.ensureChannels(this);
    ContextCompat.registerReceiver(this, actionReceiver, new IntentFilter(NativeNotifier.ACTION_TIMER), ContextCompat.RECEIVER_NOT_EXPORTED);

    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().addJavascriptInterface(new RJBridge(), "RJNative");
    }
    handleLaunchIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleLaunchIntent(intent);
  }

  @Override
  protected void onDestroy() {
    try { unregisterReceiver(actionReceiver); } catch (Exception ignored) { /* not registered */ }
    if (isFinishing()) {
      NativeNotifier.cancelTimer(this);
      cancelAlarm();
    }
    super.onDestroy();
  }

  /* ───────────────────────────── helpers ───────────────────────────── */

  private void applyBars(int color, boolean darkIcons) {
    getWindow().getDecorView().setBackgroundColor(color);
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setAppearanceLightStatusBars(darkIcons);
    controller.setAppearanceLightNavigationBars(darkIcons);
  }

  private static String q(String s) {
    if (s == null) return "null";
    StringBuilder sb = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\') sb.append('\\').append(c);
      else if (c == '\n') sb.append("\\n");
      else if (c < 0x20) sb.append(' ');
      else sb.append(c);
    }
    return sb.append('"').toString();
  }

  private void js(final String script) {
    if (getBridge() == null || getBridge().getWebView() == null) return;
    final WebView wv = getBridge().getWebView();
    wv.post(() -> wv.evaluateJavascript(script, null));
  }

  private void dispatchAction(String id) {
    if (id == null) return;
    String safe = id.replaceAll("[^A-Za-z0-9_\\-]", "");
    // Queue first so an action that arrives before the page is ready is not lost.
    js("(window.__rjPending=window.__rjPending||[]).push('" + safe + "');"
        + "window.dispatchEvent(new CustomEvent('rj:native-action',{detail:{id:'" + safe + "'}}))");
  }

  private void handleLaunchIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getStringExtra("rj_action");
    if (action != null) {
      intent.removeExtra("rj_action");
      dispatchAction(action);
    }
  }

  private String prettyTreeName(Uri tree) {
    try {
      String id = DocumentsContract.getTreeDocumentId(tree);
      String[] parts = id.split(":", 2);
      String volume = "primary".equals(parts[0]) ? "Internal storage" : parts[0];
      return parts.length > 1 && !parts[1].isEmpty() ? volume + "/" + parts[1] : volume;
    } catch (Exception e) {
      return "Selected folder";
    }
  }

  private void cancelAlarm() {
    AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;
    Intent i = new Intent(this, TimerAlarmReceiver.class).setAction(TimerAlarmReceiver.ACTION_ALARM);
    am.cancel(PendingIntent.getBroadcast(this, ALARM_REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
  }

  private static String ok(String where) {
    return "{\"ok\":true,\"where\":" + q(where) + "}";
  }

  private static String fail(String msg) {
    return "{\"ok\":false,\"error\":" + q(msg) + "}";
  }

  /* ───────────────────────────── JS bridge ───────────────────────────── */

  public class RJBridge {

    /** window.RJNative.setBars("#ecdfc8", true) */
    @JavascriptInterface
    public void setBars(String hex, boolean darkIcons) {
      try {
        final int color = Color.parseColor(hex);
        runOnUiThread(() -> applyBars(color, darkIcons));
      } catch (IllegalArgumentException ignored) {
        // malformed colour: keep current bars
      }
    }

    @JavascriptInterface
    public boolean pinShortcut(String base64Png, String label) {
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        byte[] bytes = Base64.decode(base64Png, Base64.DEFAULT);
        Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bmp == null) return false;
        ShortcutManager sm = getSystemService(ShortcutManager.class);
        if (sm == null || !sm.isRequestPinShortcutSupported()) return false;
        Intent launch = new Intent(MainActivity.this, MainActivity.class).setAction(Intent.ACTION_MAIN);
        ShortcutInfo info = new ShortcutInfo.Builder(MainActivity.this, "rj-custom-" + System.currentTimeMillis())
            .setShortLabel(label)
            .setLongLabel(label)
            .setIcon(Icon.createWithBitmap(bmp))
            .setIntent(launch)
            .build();
        return sm.requestPinShortcut(info, null);
      } catch (Exception e) {
        return false;
      }
    }

    /* ── live timer ── */

    @JavascriptInterface
    public void timerShow(String title, String text, double whenMs, boolean countDown, boolean running, String actions) {
      try {
        NativeNotifier.showTimer(MainActivity.this, title, text, (long) whenMs, countDown, running, actions);
      } catch (Exception ignored) { /* notifications are best-effort */ }
    }

    @JavascriptInterface
    public void timerAlarm(double atMs, String title, String body, String nextAction, String nextLabel) {
      try {
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(MainActivity.this, TimerAlarmReceiver.class)
            .setAction(TimerAlarmReceiver.ACTION_ALARM)
            .putExtra("title", title).putExtra("body", body)
            .putExtra("next", nextAction).putExtra("nextLabel", nextLabel);
        PendingIntent fire = PendingIntent.getBroadcast(MainActivity.this, ALARM_REQUEST, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent show = NativeNotifier.openApp(MainActivity.this, 4714, null);
        // setAlarmClock is exact, survives Doze and needs no special permission.
        am.setAlarmClock(new AlarmManager.AlarmClockInfo((long) atMs, show), fire);
      } catch (Exception ignored) { /* best-effort */ }
    }

    @JavascriptInterface
    public void timerClear() {
      try {
        NativeNotifier.cancelTimer(MainActivity.this);
        cancelAlarm();
      } catch (Exception ignored) { /* best-effort */ }
    }

    @JavascriptInterface
    public void timerCancelAlarm() {
      try { cancelAlarm(); } catch (Exception ignored) { /* best-effort */ }
    }

    @JavascriptInterface
    public void timerDone(String title, String body, String nextAction, String nextLabel) {
      try {
        cancelAlarm();
        NativeNotifier.showDone(MainActivity.this, title, body, nextAction, nextLabel);
      } catch (Exception ignored) { /* best-effort */ }
    }

    /* ── backup files ── */

    @JavascriptInterface
    public void pickFolder() {
      runOnUiThread(() -> folderPicker.launch(null));
    }

    /** Writes a file into the chosen folder (tree URI) or Downloads/<subFolder>. Returns {ok, where|error}. */
    @JavascriptInterface
    public String saveFile(String name, String mime, String base64, String treeUri, String subFolder) {
      try {
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        ContentResolver cr = getContentResolver();

        if (treeUri != null && !treeUri.isEmpty()) {
          Uri tree = Uri.parse(treeUri);
          Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
          Uri doc = DocumentsContract.createDocument(cr, parent, mime, name);
          if (doc == null) return fail("Could not create the file in the chosen folder. Pick the folder again.");
          try (OutputStream os = cr.openOutputStream(doc)) {
            if (os == null) return fail("Could not open the file for writing.");
            os.write(bytes);
          }
          return ok(prettyTreeName(tree) + "/" + name);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          ContentValues v = new ContentValues();
          v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
          v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
          v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + subFolder);
          v.put(MediaStore.MediaColumns.IS_PENDING, 1);
          Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
          if (uri == null) return fail("Could not create the file in Downloads.");
          try (OutputStream os = cr.openOutputStream(uri)) {
            if (os == null) return fail("Could not open the file for writing.");
            os.write(bytes);
          }
          v.clear();
          v.put(MediaStore.MediaColumns.IS_PENDING, 0);
          cr.update(uri, v, null, null);
          return ok("Download/" + subFolder + "/" + name);
        }

        // Android 8/9: app-specific external folder (no storage permission needed).
        File dir = new File(getExternalFilesDir(null), subFolder);
        if (!dir.exists() && !dir.mkdirs()) return fail("Could not create the backup folder.");
        File out = new File(dir, name);
        try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(bytes); }
        return ok(out.getAbsolutePath());
      } catch (Throwable t) {
        return fail(t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
      }
    }

    /** Keeps the newest `keep` files whose name starts with `prefix`; returns how many were deleted. */
    @JavascriptInterface
    public int pruneBackups(String treeUri, String subFolder, String prefix, int keep) {
      int deleted = 0;
      try {
        ContentResolver cr = getContentResolver();
        if (treeUri != null && !treeUri.isEmpty()) {
          Uri tree = Uri.parse(treeUri);
          Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
          List<String[]> rows = new ArrayList<>();
          try (Cursor c = cr.query(children, new String[]{
              DocumentsContract.Document.COLUMN_DOCUMENT_ID,
              DocumentsContract.Document.COLUMN_DISPLAY_NAME,
              DocumentsContract.Document.COLUMN_LAST_MODIFIED}, null, null, null)) {
            while (c != null && c.moveToNext()) {
              String n = c.getString(1);
              if (n != null && n.startsWith(prefix)) rows.add(new String[]{c.getString(0), String.valueOf(c.getLong(2))});
            }
          }
          Collections.sort(rows, (a, b) -> Long.compare(Long.parseLong(b[1]), Long.parseLong(a[1])));
          for (int i = Math.max(keep, 0); i < rows.size(); i++) {
            try {
              if (DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, rows.get(i)[0]))) deleted++;
            } catch (Exception ignored) { /* skip files we cannot delete */ }
          }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          String rel = Environment.DIRECTORY_DOWNLOADS + "/" + subFolder + "/";
          List<Long> ids = new ArrayList<>();
          try (Cursor c = cr.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
              new String[]{MediaStore.MediaColumns._ID},
              MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
              new String[]{rel, prefix + "%"},
              MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
            while (c != null && c.moveToNext()) ids.add(c.getLong(0));
          }
          for (int i = Math.max(keep, 0); i < ids.size(); i++) {
            try {
              deleted += cr.delete(ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ids.get(i)), null, null);
            } catch (Exception ignored) { /* skip */ }
          }
        } else {
          File dir = new File(getExternalFilesDir(null), subFolder);
          File[] files = dir.listFiles((d, n) -> n.startsWith(prefix));
          if (files != null) {
            java.util.Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (int i = Math.max(keep, 0); i < files.length; i++) if (files[i].delete()) deleted++;
          }
        }
      } catch (Throwable ignored) { /* retention is best-effort */ }
      return deleted;
    }
  }
}
