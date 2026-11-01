package app.rjtracker.pro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/** Notification helpers shared by MainActivity (live timer) and TimerAlarmReceiver (session finished). */
final class NativeNotifier {
  static final String CHANNEL_TIMER = "rj_timer";
  static final String CHANNEL_DONE = "rj_timer_done";
  static final String ACTION_TIMER = "app.rjtracker.pro.TIMER_ACTION";
  static final int TIMER_ID = 4701;
  static final int DONE_ID = 4702;

  private NativeNotifier() {}

  static void ensureChannels(Context ctx) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;

    NotificationChannel timer = new NotificationChannel(CHANNEL_TIMER, "Running timer", NotificationManager.IMPORTANCE_LOW);
    timer.setDescription("Live Pomodoro / stopwatch with quick actions");
    timer.setShowBadge(false);
    nm.createNotificationChannel(timer);

    NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Timer finished", NotificationManager.IMPORTANCE_HIGH);
    done.setDescription("Alerts when a focus session or break ends");
    done.enableVibration(true);
    nm.createNotificationChannel(done);
  }

  static PendingIntent openApp(Context ctx, int requestCode, String action) {
    Intent open = new Intent(ctx, MainActivity.class)
        .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    if (action != null) open.putExtra("rj_action", action);
    return PendingIntent.getActivity(ctx, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  static PendingIntent actionBroadcast(Context ctx, String id) {
    Intent i = new Intent(ACTION_TIMER).setPackage(ctx.getPackageName()).putExtra("id", id);
    return PendingIntent.getBroadcast(ctx, 5000 + Math.abs(id.hashCode() % 900), i,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  /** Ongoing timer notification with a live system chronometer. actions = "id:Label,id:Label". */
  static void showTimer(Context ctx, String title, String text, long whenMs, boolean countDown, boolean running, String actions) {
    ensureChannels(ctx);
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_TIMER)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(0xFFB4452B)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setShowWhen(true)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(openApp(ctx, 4711, null));

    if (running) {
      b.setWhen(whenMs).setUsesChronometer(true).setChronometerCountDown(countDown);
    } else {
      b.setUsesChronometer(false).setShowWhen(false);
    }

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

  static void showDone(Context ctx, String title, String text, String nextAction, String nextLabel) {
    ensureChannels(ctx);
    NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_DONE)
        .setSmallIcon(R.drawable.ic_stat_rj)
        .setColor(0xFFB4452B)
        .setContentTitle(title)
        .setContentText(text)
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setDefaults(Notification.DEFAULT_ALL)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setContentIntent(openApp(ctx, 4712, null));
    if (nextAction != null && !nextAction.isEmpty()) {
      b.addAction(0, nextLabel == null || nextLabel.isEmpty() ? "Continue" : nextLabel, openApp(ctx, 4713, nextAction));
    }
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) {
      nm.cancel(TIMER_ID);
      nm.notify(DONE_ID, b.build());
    }
  }

  static void cancelTimer(Context ctx) {
    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.cancel(TIMER_ID);
  }
}
