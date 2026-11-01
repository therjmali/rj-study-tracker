package app.rjtracker.pro;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.text.DateFormat;
import java.util.Date;

/**
 * Notification helpers shared by MainActivity (live timer), TimerActionReceiver (buttons)
 * and TimerAlarmReceiver (session finished).
 *
 * The running-timer notification is a custom layout (compact + expanded) with a live system
 * chronometer, so it keeps counting with the screen off and without the web view being alive.
 */
final class NativeNotifier {
  static final String CHANNEL_TIMER = "rj_timer_live_v2";
  static final String CHANNEL_TIMER_LEGACY = "rj_timer";
  static final String CHANNEL_DONE = "rj_timer_done";
  static final String CHANNEL_SAVED = "rj_timer_saved";
  static final String ACTION_TIMER = "app.rjtracker.pro.TIMER_ACTION";
  static final int TIMER_ID = 4701;
  static final int DONE_ID = 4702;
  static final int SAVED_ID = 4703;
  static final int ALARM_REQUEST = 4721;

  private static final String PREFS = "rj_native";
  private static final String KEY_PAYLOAD = "timer_payload";
  private static final String KEY_PENDING = "pending_actions";
  private static final String ICON_FILE = "rj_custom_icon.png";
  private static final int ACCENT = 0xFFB4452B;

  private NativeNotifier() {}

  /* ───────────────────────────── channels ───────────────────────────── */

  static void ensureChannels(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;

    // The old low-importance channel always collapsed the card under "Silent"; it cannot be upgraded in
    // place, so the live timer moved to a new default-importance (but silent, no vibration) channel.
    nm.deleteNotificationChannel(CHANNEL_TIMER_LEGACY);

    NotificationChannel timer = new NotificationChannel(CHANNEL_TIMER, "Live timer", NotificationManager.IMPORTANCE_DEFAULT);
    timer.setDescription("Live Focus Timer card with Pause, Stop & Save and Notes");
    timer.setShowBadge(false);
    timer.setSound(null, null);
    timer.enableVibration(false);
    timer.enableLights(false);
    timer.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(timer);

    NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Timer finished", NotificationManager.IMPORTANCE_HIGH);
    done.setDescription("Alerts when a focus session or break ends");
    done.enableVibration(true);
    nm.createNotificationChannel(done);

    NotificationChannel saved = new NotificationChannel(CHANNEL_SAVED, "Session saved", NotificationManager.IMPORTANCE_LOW);
    saved.setDescription("Quiet receipt after a study session is saved");
    saved.setShowBadge(false);
    nm.createNotificationChannel(saved);
  }

  /* ───────────────────────────── intents ───────────────────────────── */

  /** Opens the app and hands `action` to the web layer (applied with the moment the user tapped). */
  static PendingIntent openApp(Context ctx, int requestCode, String action) {
    Intent open = new Intent(ctx, MainActivity.class)
        .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    if (action != null) open.putExtra("rj_action", action);
    return PendingIntent.getActivity(ctx, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  /** Background button: handled by the manifest-declared TimerActionReceiver, so it works with the app closed. */
  static PendingIntent actionBroadcast(Context ctx, String id) {
    Intent i = new Intent(ctx, TimerActionReceiver.class).setAction(ACTION_TIMER).putExtra("id", id);
    return PendingIntent.getBroadcast(ctx, 5000 + Math.abs(id.hashCode() % 900), i,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  /* ───────────────────────────── pending actions queue ───────────────────────────── */

  private static SharedPreferences prefs(Context ctx) {
    return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  /** Remember a tapped button together with the moment it was tapped. Survives the app being closed. */
  static synchronized void queueAction(Context ctx, String id, long at) {
    try {
      SharedPreferences p = prefs(ctx);
      JSONArray arr = new JSONArray(p.getString(KEY_PENDING, "[]"));
      JSONArray next = new JSONArray();
      int start = Math.max(0, arr.length() - 19);
      for (int i = start; i < arr.length(); i++) next.put(arr.get(i));
      next.put(new JSONObject().put("id", id).put("at", at));
      p.edit().putString(KEY_PENDING, next.toString()).apply();
    } catch (Exception ignored) { /* best-effort */ }
  }

  /** Returns the queued actions as JSON and clears the queue. */
  static synchronized String takePending(Context ctx) {
    SharedPreferences p = prefs(ctx);
    String s = p.getString(KEY_PENDING, "[]");
    p.edit().remove(KEY_PENDING).commit();
    return s == null ? "[]" : s;
  }

  /* ───────────────────────────── custom icon ───────────────────────────── */

  static File iconFile(Context ctx) {
    return new File(ctx.getFilesDir(), ICON_FILE);
  }

  static Bitmap loadCustomIcon(Context ctx, int maxPx) {
    try {
      File f = iconFile(ctx);
      if (!f.exists()) return null;
      BitmapFactory.Options o = new BitmapFactory.Options();
      o.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(f.getAbsolutePath(), o);
      int sample = 1;
      while (o.outWidth / (sample * 2) >= maxPx) sample *= 2;
      BitmapFactory.Options d = new BitmapFactory.Options();
      d.inSampleSize = sample;
      return BitmapFactory.decodeFile(f.getAbsolutePath(), d);
    } catch (Throwable t) {
      return null;
    }
  }

  /* ───────────────────────────── the rich running-timer card ───────────────────────────── */

  private static String fmtClock(long ms, boolean ceil) {
    long totalSec = ceil ? (ms + 999) / 1000 : ms / 1000;
    if (totalSec < 0) totalSec = 0;
    long h = totalSec / 3600, m = (totalSec % 3600) / 60, s = totalSec % 60;
    if (h > 0) return String.format("%d:%02d:%02d", h, m, s);
    return String.format("%02d:%02d", m, s);
  }

  private static String fmtTime(Context ctx, long ms) {
    if (ms <= 0) return "—";
    try {
      DateFormat f = android.text.format.DateFormat.getTimeFormat(ctx);
      return f.format(new Date(ms));
    } catch (Throwable t) {
      return "—";
    }
  }

  private static void bindIcon(Context ctx, RemoteViews rv, Bitmap custom) {
    if (custom != null) rv.setImageViewBitmap(R.id.rj_icon, custom);
    else rv.setImageViewResource(R.id.rj_icon, R.mipmap.ic_launcher_round);
  }

  /** Live chronometer while running; a plain text time while paused (a frozen Chronometer would drift). */
  private static void bindTime(RemoteViews rv, int chronoId, int pausedId, boolean running, boolean countDown,
                               long anchorMs, long valueMs) {
    if (running) {
      long wall = System.currentTimeMillis();
      long real = SystemClock.elapsedRealtime();
      long base = countDown ? real + (anchorMs - wall) : real - (wall - anchorMs);
      rv.setChronometerCountDown(chronoId, countDown);
      rv.setChronometer(chronoId, base, null, true);
      rv.setViewVisibility(chronoId, android.view.View.VISIBLE);
      rv.setViewVisibility(pausedId, android.view.View.GONE);
    } else {
      rv.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false);
      rv.setViewVisibility(chronoId, android.view.View.GONE);
      rv.setViewVisibility(pausedId, android.view.View.VISIBLE);
      rv.setTextViewText(pausedId, fmtClock(valueMs, countDown));
    }
  }

  static void showTimerRich(Context ctx, JSONObject p) throws Exception {
    ensureChannels(ctx);
    boolean running = p.optBoolean("running");
    boolean countDown = p.optBoolean("countDown");
    long anchor = p.optLong("anchorMs");
    long value = p.optLong("valueMs");
    long started = p.optLong("startedAtMs");
    String mode = p.optString("mode", "stopwatch");
    String modeLabel = p.optString("modeLabel", "Timer");
    String activity = p.optString("activity", "Free study");
    String headline = p.optString(running ? "headlineRunning" : "headlinePaused", modeLabel);
    String stopLabel = p.optString("stopLabel", "Stop & Save");
    String statusText = running ? "Running" : "Paused";

    String sub;
    if (running) {
      sub = countDown ? "Ends at " + fmtTime(ctx, anchor) + " · " + activity : activity + " · Running";
    } else {
      sub = activity + " · Paused";
    }
    String startedLine;
    if (running && countDown) startedLine = "Ends at " + fmtTime(ctx, anchor) + "   •   Remaining time";
    else if (running) startedLine = "Started at " + fmtTime(ctx, started > 0 ? started : anchor) + "   •   Elapsed time";
    else startedLine = "Paused   •   Tap Resume to continue";

    Bitmap custom = loadCustomIcon(ctx, 96);
    int chipTextColor = running ? 0xFF1E9E55 : 0xFFC77700;

    /* compact */
    RemoteViews small = new RemoteViews(ctx.getPackageName(), R.layout.rj_notif_collapsed);
    bindIcon(ctx, small, custom);
    bindTime(small, R.id.rj_time, R.id.rj_time_paused, running, countDown, anchor, value);
    small.setTextViewText(R.id.rj_sub, sub);
    small.setTextViewText(R.id.rj_btn_toggle, running ? "Pause" : "Resume");
    small.setTextViewText(R.id.rj_btn_stop, "Save");
    small.setOnClickPendingIntent(R.id.rj_btn_toggle, actionBroadcast(ctx, "timer-toggle"));
    small.setOnClickPendingIntent(R.id.rj_btn_stop, openApp(ctx, 4730, "timer-stop"));

    /* expanded */
    RemoteViews big = new RemoteViews(ctx.getPackageName(), R.layout.rj_notif_expanded);
    bindIcon(ctx, big, custom);
    bindTime(big, R.id.rj_time, R.id.rj_time_paused, running, countDown, anchor, value);
    big.setTextViewText(R.id.rj_status_chip, (running ? "● " : "❚❚ ") + statusText);
    big.setTextColor(R.id.rj_status_chip, chipTextColor);
    big.setInt(R.id.rj_status_chip, "setBackgroundResource", running ? R.drawable.rj_bg_chip_running : R.drawable.rj_bg_chip_paused);
    big.setTextViewText(R.id.rj_started, startedLine);
    big.setTextViewText(R.id.rj_btn_toggle, running ? "⏸ Pause" : "▶ Resume");
    big.setTextViewText(R.id.rj_btn_stop, "⏹ " + stopLabel);
    big.setOnClickPendingIntent(R.id.rj_btn_toggle, actionBroadcast(ctx, "timer-toggle"));
    big.setOnClickPendingIntent(R.id.rj_btn_stop, openApp(ctx, 4730, "timer-stop"));
    big.setOnClickPendingIntent(R.id.rj_btn_notes, openApp(ctx, 4731, "timer-notes"));

    big.setTextViewText(R.id.rj_d_activity, activity);
    big.setTextViewText(R.id.rj_d_start, fmtTime(ctx, started > 0 ? started : (running && !countDown ? anchor : 0)));
    bindTime(big, R.id.rj_d_time, R.id.rj_d_time_paused, running, countDown, anchor, value);
    big.setTextViewText(R.id.rj_d_time_label, countDown ? "Remaining" : "Duration");
    big.setTextViewText(R.id.rj_d_status_icon, running ? "🟢" : "🟠");
    big.setTextViewText(R.id.rj_d_status, statusText);
    big.setOnClickPendingIntent(R.id.rj_f_report, openApp(ctx, 4732, "open-report"));
    big.setOnClickPendingIntent(R.id.rj_f_history, openApp(ctx, 4733, "open-history"));
    big.setOnClickPendingIntent(R.id.rj_f_settings, openApp(ctx, 4734, "open-settings"));

    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_TIMER)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(ACCENT)
        .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
        .setCustomContentView(small)
        .setCustomBigContentView(big)
        .setContentTitle(headline)
        .setContentText(sub)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory("stopwatch")
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(openApp(ctx, 4711, "timer-open"));

    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.notify(TIMER_ID, b.build());
  }

  /** Full update from the web layer: persist, post the card, and (re)arm or cancel the end alarm. */
  static void updateTimer(Context ctx, String json) throws Exception {
    JSONObject p = new JSONObject(json);
    prefs(ctx).edit().putString(KEY_PAYLOAD, json).apply();
    try {
      showTimerRich(ctx, p);
    } catch (Throwable richFailed) {
      // Some launchers refuse custom layouts: fall back to a standard notification with action buttons.
      showTimerPlain(ctx, p);
    }
    boolean running = p.optBoolean("running");
    boolean countDown = p.optBoolean("countDown");
    if (running && countDown) {
      scheduleAlarm(ctx, p.optLong("anchorMs") + 1500, p.optString("endTitle", ""), p.optString("endBody", ""),
          p.optString("nextId", ""), p.optString("nextLabel", ""));
    } else {
      cancelAlarm(ctx);
    }
  }

  /** Standard (non-custom) fallback so the timer is never invisible. */
  private static void showTimerPlain(Context ctx, JSONObject p) {
    ensureChannels(ctx);
    boolean running = p.optBoolean("running");
    boolean countDown = p.optBoolean("countDown");
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_TIMER)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(ACCENT)
        .setContentTitle(p.optString(running ? "headlineRunning" : "headlinePaused", "Timer"))
        .setContentText(p.optString("activity", ""))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory("stopwatch")
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(openApp(ctx, 4711, "timer-open"));
    if (running) {
      long wall = System.currentTimeMillis();
      b.setShowWhen(true).setWhen(p.optLong("anchorMs")).setUsesChronometer(true).setChronometerCountDown(countDown);
      if (!countDown && p.optLong("anchorMs") > wall) b.setWhen(wall);
    } else {
      b.setShowWhen(false).setUsesChronometer(false);
    }
    b.addAction(0, running ? "Pause" : "Resume", actionBroadcast(ctx, "timer-toggle"));
    b.addAction(0, p.optString("stopLabel", "Stop & Save"), openApp(ctx, 4730, "timer-stop"));
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.notify(TIMER_ID, b.build());
  }

  /**
   * Pause / resume from the notification while the web layer may not be running: flip the stored state,
   * redraw the card immediately and move the end alarm. The web layer replays the same tap (with its
   * timestamp) from the pending queue, so both sides end up identical.
   */
  static void applyToggle(Context ctx, long at) {
    try {
      String raw = prefs(ctx).getString(KEY_PAYLOAD, null);
      if (raw == null) return;
      JSONObject p = new JSONObject(raw);
      boolean running = p.optBoolean("running");
      boolean countDown = p.optBoolean("countDown");
      long anchor = p.optLong("anchorMs");
      long value = p.optLong("valueMs");

      if (running) {
        if (countDown && anchor <= at) return;          // already finished — the alarm announces it
        long v = countDown ? Math.max(0, anchor - at) : Math.max(0, at - anchor);
        p.put("running", false).put("valueMs", v).put("anchorMs", 0);
      } else {
        p.put("running", true).put("valueMs", 0).put("anchorMs", countDown ? at + value : at - value);
        if (p.optLong("startedAtMs") <= 0) p.put("startedAtMs", countDown ? at : at - value);
      }
      updateTimer(ctx, p.toString());
    } catch (Throwable ignored) { /* the web layer will repaint when it starts */ }
  }

  /* ───────────────────────────── alarm ───────────────────────────── */

  static void scheduleAlarm(Context ctx, long atMs, String title, String body, String nextAction, String nextLabel) {
    try {
      AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
      if (am == null) return;
      Intent i = new Intent(ctx, TimerAlarmReceiver.class)
          .setAction(TimerAlarmReceiver.ACTION_ALARM)
          .putExtra("title", title).putExtra("body", body)
          .putExtra("next", nextAction).putExtra("nextLabel", nextLabel);
      PendingIntent fire = PendingIntent.getBroadcast(ctx, ALARM_REQUEST, i,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      PendingIntent show = openApp(ctx, 4714, "timer-open");
      // setAlarmClock is exact, survives Doze and needs no special permission.
      am.setAlarmClock(new AlarmManager.AlarmClockInfo(atMs, show), fire);
    } catch (Exception ignored) { /* best-effort */ }
  }

  static void cancelAlarm(Context ctx) {
    try {
      AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
      if (am == null) return;
      Intent i = new Intent(ctx, TimerAlarmReceiver.class).setAction(TimerAlarmReceiver.ACTION_ALARM);
      am.cancel(PendingIntent.getBroadcast(ctx, ALARM_REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    } catch (Exception ignored) { /* best-effort */ }
  }

  /* ───────────────────────────── legacy simple timer (older web bundles) ───────────────────────────── */

  /** Ongoing timer notification with a live system chronometer. actions = "id:Label,id:Label". */
  static void showTimer(Context ctx, String title, String text, long whenMs, boolean countDown, boolean running, String actions) {
    ensureChannels(ctx);
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_TIMER)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(ACCENT)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(true)
        .setCategory("stopwatch")
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(openApp(ctx, 4711, null));
    if (running) b.setWhen(whenMs).setUsesChronometer(true).setChronometerCountDown(countDown);
    else b.setUsesChronometer(false).setShowWhen(false);
    if (actions != null && !actions.isEmpty()) {
      for (String part : actions.split(",")) {
        int c = part.indexOf(':');
        if (c <= 0) continue;
        b.addAction(0, part.substring(c + 1), actionBroadcast(ctx, part.substring(0, c)));
      }
    }
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.notify(TIMER_ID, b.build());
  }

  /* ───────────────────────────── finished / saved ───────────────────────────── */

  static void showDone(Context ctx, String title, String text, String nextAction, String nextLabel) {
    ensureChannels(ctx);
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_DONE)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(ACCENT)
        .setContentTitle(title)
        .setContentText(text)
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setDefaults(Notification.DEFAULT_ALL)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setContentIntent(openApp(ctx, 4712, "timer-open"));
    Bitmap custom = loadCustomIcon(ctx, 128);
    if (custom != null) b.setLargeIcon(custom);
    if (nextAction != null && !nextAction.isEmpty()) {
      b.addAction(0, nextLabel == null || nextLabel.isEmpty() ? "Continue" : nextLabel, openApp(ctx, 4713, nextAction));
    }
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.cancel(TIMER_ID);
      nm.notify(DONE_ID, b.build());
    }
  }

  static void showSaved(Context ctx, String title, String text) {
    ensureChannels(ctx);
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_SAVED)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(ACCENT)
        .setContentTitle(title)
        .setContentText(text)
        .setAutoCancel(true)
        .setTimeoutAfter(20000)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .setContentIntent(openApp(ctx, 4735, "open-history"));
    Bitmap custom = loadCustomIcon(ctx, 128);
    if (custom != null) b.setLargeIcon(custom);
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.notify(SAVED_ID, b.build());
  }

  static void cancelTimer(Context ctx) {
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.cancel(TIMER_ID);
    prefs(ctx).edit().remove(KEY_PAYLOAD).apply();
  }
}
