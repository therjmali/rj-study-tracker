package app.rjtracker.pro;

import android.app.ActivityManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
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
import java.lang.ref.WeakReference;
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
  private static final String SHORTCUT_ID = "rj-custom-icon";

  /** The live activity (if any), so the manifest-declared receiver can wake the web view. */
  private static WeakReference<MainActivity> current = new WeakReference<>(null);

  private ActivityResultLauncher<Uri> folderPicker;

  /** Tell the web layer to pull the native action queue. No-op when the app is not running. */
  static void wakeWebView() {
    MainActivity a = current.get();
    if (a != null) a.js("window.dispatchEvent(new Event('rj:native-wake'))");
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Phones stay in portrait; tablets and foldables rotate freely (respecting the user's rotation lock)
    // and fill the whole screen instead of being letterboxed into a portrait strip.
    boolean largeScreen = getResources().getConfiguration().smallestScreenWidthDp >= 600;
    setRequestedOrientation(largeScreen
        ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER
        : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

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

    current = new WeakReference<>(this);
    NativeNotifier.ensureChannels(this);

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
  public void onDestroy() {
    // The timer notification and its end alarm deliberately OUTLIVE the activity: the web layer persists the
    // running session and restores it on launch, so closing the app mid-session must not cancel anything.
    if (current.get() == this) current = new WeakReference<>(null);
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

  private static String clean(String v) {
    return v == null ? "" : v.replaceAll("[^A-Za-z0-9_\\-]", "");
  }

  /** Queue a button / shortcut tap with its timestamp (and the topic it refers to), then wake the web layer. */
  private void dispatchAction(String id, String subjectId, String unitId, String topicId) {
    String safe = clean(id);
    if (safe.isEmpty()) return;
    NativeNotifier.queueAction(this, safe, System.currentTimeMillis(), clean(subjectId), clean(unitId), clean(topicId));
    js("window.dispatchEvent(new Event('rj:native-wake'))");
  }

  private void handleLaunchIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getStringExtra("rj_action");
    if (action != null) {
      String s = intent.getStringExtra("rj_subject");
      String u = intent.getStringExtra("rj_unit");
      String t = intent.getStringExtra("rj_topic");
      intent.removeExtra("rj_action");
      intent.removeExtra("rj_subject");
      intent.removeExtra("rj_unit");
      intent.removeExtra("rj_topic");
      dispatchAction(action, s, u, t);
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

  private ShortcutInfo buildShortcut(String label, Icon icon) {
    Intent launch = new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN);
    return new ShortcutInfo.Builder(this, SHORTCUT_ID)
        .setShortLabel(label)
        .setLongLabel(label)
        .setIcon(icon)
        .setIntent(launch)
        .build();
  }

  private boolean hasPinnedShortcut(ShortcutManager sm) {
    try {
      for (ShortcutInfo info : sm.getPinnedShortcuts()) {
        if (SHORTCUT_ID.equals(info.getId())) return true;
      }
    } catch (Exception ignored) { /* treat as not pinned */ }
    return false;
  }

  /** Recent-apps card icon. */
  private void applyTaskIcon(final String label, final Bitmap bmp) {
    runOnUiThread(() -> {
      try {
        setTaskDescription(new ActivityManager.TaskDescription(label, bmp));
      } catch (Throwable ignored) { /* cosmetic only */ }
    });
  }

  /** Re-post the running timer card so it picks up a new icon straight away. */
  private void refreshTimerCard() {
    try {
      android.content.SharedPreferences p = getSharedPreferences("rj_native", MODE_PRIVATE);
      String raw = p.getString("timer_payload", null);
      if (raw != null) NativeNotifier.updateTimer(this, raw);
    } catch (Throwable ignored) { /* cosmetic only */ }
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
        // Stable id: pinning again (or later icon changes) updates the SAME home-screen icon in place.
        return sm.requestPinShortcut(buildShortcut(label, Icon.createWithBitmap(bmp)), null);
      } catch (Exception e) {
        return false;
      }
    }

    /**
     * Stores the custom icon and applies it everywhere Android allows: the pinned home-screen shortcut is
     * updated in place, the recent-apps card and the timer notification use it. Android does not let an
     * installed app replace its own launcher-drawer icon with an arbitrary picture.
     * Returns "updated" | "needs-pin" | "unsupported" | "error".
     */
    @JavascriptInterface
    public String setCustomIcon(String base64Png, String label) {
      try {
        byte[] bytes = Base64.decode(base64Png, Base64.DEFAULT);
        Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bmp == null) return "error";
        try (FileOutputStream fos = new FileOutputStream(NativeNotifier.iconFile(MainActivity.this))) {
          fos.write(bytes);
        }
        applyTaskIcon(label, bmp);
        refreshTimerCard();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "unsupported";
        ShortcutManager sm = getSystemService(ShortcutManager.class);
        if (sm == null) return "unsupported";
        if (hasPinnedShortcut(sm)) {
          List<ShortcutInfo> one = new ArrayList<>();
          one.add(buildShortcut(label, Icon.createWithBitmap(bmp)));
          sm.updateShortcuts(one);
          return "updated";
        }
        return sm.isRequestPinShortcutSupported() ? "needs-pin" : "unsupported";
      } catch (Throwable t) {
        return "error";
      }
    }

    @JavascriptInterface
    public String clearCustomIcon() {
      try {
        File f = NativeNotifier.iconFile(MainActivity.this);
        if (f.exists()) f.delete();
        applyTaskIcon("RJ Tracker", BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher));
        refreshTimerCard();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          ShortcutManager sm = getSystemService(ShortcutManager.class);
          if (sm != null && hasPinnedShortcut(sm)) {
            List<ShortcutInfo> one = new ArrayList<>();
            one.add(buildShortcut("RJ Tracker", Icon.createWithResource(MainActivity.this, R.mipmap.ic_launcher)));
            sm.updateShortcuts(one);
          }
        }
        return "cleared";
      } catch (Throwable t) {
        return "error";
      }
    }

    /* ── live timer ── */

    /** Rich timer card + end alarm in one call. `json` is built by src/platform/timerNotify.ts. */
    @JavascriptInterface
    public void timerUpdate(String json) {
      try {
        NativeNotifier.updateTimer(MainActivity.this, json);
      } catch (Exception ignored) { /* notifications are best-effort */ }
    }

    /** Buttons tapped while the app was closed (or the page was not ready), as JSON [{id, at}]. Clears the queue. */
    @JavascriptInterface
    public String takePendingActions() {
      return NativeNotifier.takePending(MainActivity.this);
    }

    @JavascriptInterface
    public void timerShow(String title, String text, double whenMs, boolean countDown, boolean running, String actions) {
      try {
        NativeNotifier.showTimer(MainActivity.this, title, text, (long) whenMs, countDown, running, actions);
      } catch (Exception ignored) { /* notifications are best-effort */ }
    }

    @JavascriptInterface
    public void timerAlarm(double atMs, String title, String body, String nextAction, String nextLabel) {
      NativeNotifier.scheduleAlarm(MainActivity.this, (long) atMs, title, body, nextAction, nextLabel);
    }

    @JavascriptInterface
    public void timerClear() {
      try {
        NativeNotifier.cancelTimer(MainActivity.this);
        NativeNotifier.cancelAlarm(MainActivity.this);
      } catch (Exception ignored) { /* best-effort */ }
    }

    @JavascriptInterface
    public void timerCancelAlarm() {
      NativeNotifier.cancelAlarm(MainActivity.this);
    }

    @JavascriptInterface
    public void timerDone(String title, String body, String nextAction, String nextLabel) {
      try {
        NativeNotifier.cancelAlarm(MainActivity.this);
        NativeNotifier.showDone(MainActivity.this, title, body, nextAction, nextLabel);
      } catch (Exception ignored) { /* best-effort */ }
    }

    @JavascriptInterface
    public void timerSaved(String title, String body) {
      try {
        NativeNotifier.showSaved(MainActivity.this, title, body);
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
