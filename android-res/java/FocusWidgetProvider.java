package app.rjtracker.pro;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class FocusWidgetProvider extends AppWidgetProvider {

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateAppWidget(context, appWidgetManager, appWidgetId);
    }
  }

  public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.rj_widget_focus);

    SharedPreferences prefs = context.getSharedPreferences("rj_widget_prefs", Context.MODE_PRIVATE);
    String raw = prefs.getString("widget_data", null);

    String timerDisplay = "25:00";
    String timerStatus = "Focus Ready";
    int streak = 0;
    boolean isRunning = false;

    if (raw != null) {
      try {
        JSONObject obj = new JSONObject(raw);
        streak = obj.optInt("streakDays", 0);
        isRunning = obj.optBoolean("activeTimer", false);
        String td = obj.optString("timerDisplay", "");
        if (!td.isEmpty()) timerDisplay = td;
        timerStatus = isRunning ? "● In Progress" : "Focus Ready";
      } catch (Exception ignored) {}
    }

    views.setTextViewText(R.id.rj_widget_focus_timer, timerDisplay);
    views.setTextViewText(R.id.rj_widget_focus_status, timerStatus);
    views.setTextViewText(R.id.rj_widget_focus_streak, "🔥 " + streak + "d");

    Intent intent = new Intent(context, MainActivity.class);
    intent.putExtra("rj_action", "timer-open");
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent = PendingIntent.getActivity(
        context,
        1,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.rj_widget_focus_root, pendingIntent);

    appWidgetManager.updateAppWidget(appWidgetId, views);
  }

  public static void updateAll(Context context) {
    try {
      AppWidgetManager mgr = AppWidgetManager.getInstance(context);
      ComponentName cn = new ComponentName(context, FocusWidgetProvider.class);
      int[] ids = mgr.getAppWidgetIds(cn);
      if (ids != null && ids.length > 0) {
        for (int id : ids) {
          updateAppWidget(context, mgr, id);
        }
      }
    } catch (Throwable ignored) {}
  }
}
