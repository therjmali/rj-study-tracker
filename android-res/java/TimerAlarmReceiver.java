package app.rjtracker.pro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires when a timer should have finished — works even if the web view is asleep. */
public class TimerAlarmReceiver extends BroadcastReceiver {
  public static final String ACTION_ALARM = "app.rjtracker.pro.TIMER_ALARM";

  @Override
  public void onReceive(Context context, Intent intent) {
    String title = intent.getStringExtra("title");
    String body = intent.getStringExtra("body");
    String next = intent.getStringExtra("next");
    String nextLabel = intent.getStringExtra("nextLabel");
    NativeNotifier.showDone(context, title == null ? "Session finished" : title, body == null ? "" : body, next, nextLabel);
  }
}
