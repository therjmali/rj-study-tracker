package app.rjtracker.pro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Notification buttons that must not open the app (Pause / Resume).
 * Declared in the manifest, so it runs even when the app process was killed.
 */
public class TimerActionReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String id = intent.getStringExtra("id");
    if (id == null || id.isEmpty()) return;
    long at = System.currentTimeMillis();

    // 1. Remember the tap with its timestamp — the web layer replays it when it is (or becomes) alive.
    NativeNotifier.queueAction(context, id, at);
    // 2. Redraw the card right now so the button feels instant, even with no web view running.
    if ("timer-toggle".equals(id)) NativeNotifier.applyToggle(context, at);
    // 3. If the web view is alive, tell it to pull the queue.
    MainActivity.wakeWebView();
  }
}
