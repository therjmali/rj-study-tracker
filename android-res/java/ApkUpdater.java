package app.rjtracker.pro;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * In-app updater: downloads the new APK from this project's GitHub releases, verifies it
 * (SHA-256 when the release publishes one, package name, higher version, same signing key),
 * then hands it to Android's installer. Android itself still asks the student to confirm.
 */
final class ApkUpdater {

  interface Listener {
    void onEvent(String state, long done, long total, String error);
  }

  private static final String ALLOWED_PREFIX = "https://github.com/therjmali/rj-study-tracker/releases/download/";
  private static final long MAX_BYTES = 120L * 1024L * 1024L;
  private static volatile boolean running = false;

  private ApkUpdater() {}

  static File updateFile(Context ctx) {
    File dir = new File(ctx.getCacheDir(), "updates");
    if (!dir.exists()) dir.mkdirs();
    return new File(dir, "rj-update.apk");
  }

  static void download(final Context ctx, final String url, final String sha256, final Listener listener) {
    if (running) return;
    if (url == null || !url.startsWith(ALLOWED_PREFIX)) {
      listener.onEvent("error", 0, 0, "Blocked: the update link is not from the official release page.");
      return;
    }
    running = true;
    Thread t = new Thread(new Runnable() {
      @Override public void run() {
        try {
          fetch(ctx, url, sha256, listener);
        } catch (Throwable e) {
          listener.onEvent("error", 0, 0, message(e));
        } finally {
          running = false;
        }
      }
    }, "rj-updater");
    t.start();
  }

  private static void fetch(Context ctx, String url, String expectedSha, Listener listener) throws Exception {
    File out = updateFile(ctx);
    if (out.exists()) out.delete();
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    long total = 0;
    long done = 0;
    HttpURLConnection c = open(url);
    try {
      int code = c.getResponseCode();
      if (code != 200) throw new Exception("Download failed (HTTP " + code + ").");
      total = c.getContentLengthLong();
      if (total > MAX_BYTES) throw new Exception("The update file is unexpectedly large.");
      listener.onEvent("downloading", 0, total, null);
      InputStream in = c.getInputStream();
      OutputStream os = new FileOutputStream(out);
      try {
        byte[] buf = new byte[64 * 1024];
        long lastTick = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
          os.write(buf, 0, n);
          md.update(buf, 0, n);
          done += n;
          if (done > MAX_BYTES) throw new Exception("The update file is unexpectedly large.");
          long now = System.currentTimeMillis();
          if (now - lastTick > 120) {
            lastTick = now;
            listener.onEvent("downloading", done, total, null);
          }
        }
      } finally {
        os.close();
        in.close();
      }
    } finally {
      c.disconnect();
    }

    String got = hex(md.digest());
    if (expectedSha != null && expectedSha.length() == 64 && !expectedSha.equalsIgnoreCase(got)) {
      out.delete();
      throw new Exception("The download is corrupted (checksum mismatch). Please try again.");
    }
    listener.onEvent("verifying", done, total, null);
    verifyArchive(ctx, out);
    listener.onEvent("ready", done, total, null);
    install(ctx, listener);
  }

  /** https only, redirects only to GitHub hosts, at most 6 hops. */
  private static HttpURLConnection open(String start) throws Exception {
    String u = start;
    for (int i = 0; i < 6; i++) {
      URL url = new URL(u);
      String host = url.getHost();
      boolean githubHost = host != null && (host.equals("github.com") || host.endsWith(".github.com") || host.endsWith(".githubusercontent.com"));
      if (!"https".equals(url.getProtocol()) || !githubHost) throw new Exception("Blocked: the download was redirected to an untrusted address.");
      HttpURLConnection c = (HttpURLConnection) url.openConnection();
      c.setInstanceFollowRedirects(false);
      c.setConnectTimeout(15000);
      c.setReadTimeout(30000);
      c.setRequestProperty("User-Agent", "RJ-Tracker-Updater");
      int code = c.getResponseCode();
      if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
        String loc = c.getHeaderField("Location");
        c.disconnect();
        if (loc == null) throw new Exception("The download link is broken.");
        u = new URL(url, loc).toString();
        continue;
      }
      return c;
    }
    throw new Exception("Too many redirects.");
  }

  @SuppressWarnings("deprecation")
  private static long versionCodeOf(PackageInfo p) {
    return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : (long) p.versionCode;
  }

  @SuppressWarnings("deprecation")
  private static Signature[] signersOf(PackageInfo p) {
    if (Build.VERSION.SDK_INT >= 28) {
      if (p.signingInfo == null) return null;
      return p.signingInfo.hasMultipleSigners() ? p.signingInfo.getApkContentsSigners() : p.signingInfo.getSigningCertificateHistory();
    }
    return p.signatures;
  }

  @SuppressWarnings("deprecation")
  private static void verifyArchive(Context ctx, File f) throws Exception {
    PackageManager pm = ctx.getPackageManager();
    int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    PackageInfo archive = pm.getPackageArchiveInfo(f.getAbsolutePath(), flags);
    if (archive == null) throw new Exception("The downloaded file is not a valid app package.");
    if (!ctx.getPackageName().equals(archive.packageName)) throw new Exception("The downloaded file belongs to a different app.");
    PackageInfo current = pm.getPackageInfo(ctx.getPackageName(), flags);
    if (versionCodeOf(archive) <= versionCodeOf(current)) throw new Exception("You already have this version or a newer one.");
    Signature[] a = signersOf(archive);
    Signature[] b = signersOf(current);
    if (a == null || b == null || a.length == 0 || b.length == 0) return; // cannot tell here; Android enforces it at install
    boolean match = false;
    for (Signature x : a) {
      for (Signature y : b) {
        if (x.equals(y)) match = true;
      }
    }
    if (!match) throw new Exception("The update is signed with a different key, so Android would reject it.");
  }

  /** Opens Android's installer for the already-downloaded, already-verified file. */
  static void install(Context ctx, Listener listener) {
    File f = updateFile(ctx);
    if (!f.exists()) {
      listener.onEvent("error", 0, 0, "The update file is missing. Download it again.");
      return;
    }
    if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
      listener.onEvent("needs_permission", 0, 0, null);
      return;
    }
    try {
      Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
      Intent i = new Intent(Intent.ACTION_VIEW);
      i.setDataAndType(uri, "application/vnd.android.package-archive");
      i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(i);
      listener.onEvent("installing", 0, 0, null);
    } catch (Exception e) {
      listener.onEvent("error", 0, 0, "Could not open the installer: " + message(e));
    }
  }

  static void openPermissionSettings(Context ctx) {
    if (Build.VERSION.SDK_INT < 26) return;
    Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    ctx.startActivity(i);
  }

  private static String hex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) sb.append(String.format("%02x", b & 0xff));
    return sb.toString();
  }

  private static String message(Throwable t) {
    String m = t.getMessage();
    return (m == null || m.isEmpty()) ? t.getClass().getSimpleName() : m;
  }
}
