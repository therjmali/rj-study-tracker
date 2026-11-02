package app.rjtracker.pro;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONObject;

/**
 * Foreground service that owns the running-timer notification.
 *
 * Why: a foreground-service notification is sorted to the top of the shade, which is where Android expands
 * the first notification by default; it also keeps the card alive when the app is swiped away and lets the
 * progress bar refresh without the web view. The service does no work of its own — the time itself is a
 * system chronometer, and the session state lives in the web layer (restored on launch).
 */
public class TimerService extends Service {
  static volatile boolean running = false;

  private static final long TICK_MS = 20_000L;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable ticker = new Runnable() {
    @Override
    public void run() {
      try {
        String raw = NativeNotifier.storedPayload(TimerService.this);
        if (raw == null) return;
        JSONObject p = new JSONObject(raw);
        if (!p.optBoolean("running") || p.optLong("totalMs") <= 0) return; // only countdown progress needs refreshing
        Notification n = NativeNotifier.buildTimerNotification(TimerService.this, p);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NativeNotifier.TIMER_ID, n);
        handler.postDelayed(this, TICK_MS);
      } catch (Throwable ignored) { /* the next update from the web layer repaints */ }
    }
  };

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void goForeground(Notification n) {
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NativeNotifier.TIMER_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    } else {
      startForeground(NativeNotifier.TIMER_ID, n);
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String json = intent != null ? intent.getStringExtra("payload") : null;
    if (json == null) json = NativeNotifier.storedPayload(this); // restarted by the system
    try {
      if (json == null) {
        goForeground(NativeNotifier.placeholder(this));
        stopSelf();
        return START_NOT_STICKY;
      }
      Notification n = NativeNotifier.buildTimerNotification(this, new JSONObject(json));
      goForeground(n);
      running = true;
      handler.removeCallbacks(ticker);
      handler.postDelayed(ticker, TICK_MS);
      return START_STICKY;
    } catch (Throwable t) {
      NativeNotifier.markForegroundFailed(this);
      try { goForeground(NativeNotifier.placeholder(this)); } catch (Throwable ignored) { /* nothing more to do */ }
      stopSelf();
      return START_NOT_STICKY;
    }
  }

  @Override
  public void onDestroy() {
    running = false;
    handler.removeCallbacksAndMessages(null);
    super.onDestroy();
  }
}
