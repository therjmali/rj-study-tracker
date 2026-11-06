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

public class StudyWidgetProvider extends AppWidgetProvider {

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateAppWidget(context, appWidgetManager, appWidgetId);
    }
  }

  public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.rj_widget_study);

    SharedPreferences prefs = context.getSharedPreferences("rj_widget_prefs", Context.MODE_PRIVATE);
    String raw = prefs.getString("widget_data", null);

    String studyTime = "0h 00m";
    String topicsStr = "0 / 5 Topics";
    int topicsPercent = 0;
    int streak = 0;
    int syllabusPercent = 0;

    if (raw != null) {
      try {
        JSONObject obj = new JSONObject(raw);
        int todayMins = obj.optInt("todayMinutes", 0);
        int h = todayMins / 60;
        int m = todayMins % 60;
        studyTime = h + "h " + String.format(java.util.Locale.US, "%02dm", m);

        int topicsDone = obj.optInt("todayTopics", 0);
        int targetTopics = obj.optInt("targetTopics", 5);
        if (targetTopics <= 0) targetTopics = 5;
        topicsStr = topicsDone + " / " + targetTopics + " Topics";
        topicsPercent = Math.min(100, Math.round((topicsDone * 100.0f) / targetTopics));

        streak = obj.optInt("streakDays", 0);
        syllabusPercent = Math.min(100, Math.max(0, obj.optInt("syllabusPercent", 0)));
      } catch (Exception ignored) {}
    }

    views.setTextViewText(R.id.rj_widget_study_time, studyTime);
    views.setTextViewText(R.id.rj_widget_topics_text, topicsStr);
    views.setTextViewText(R.id.rj_widget_streak_badge, "🔥 " + streak + "d");
    views.setTextViewText(R.id.rj_widget_syllabus_text, syllabusPercent + "% Complete");
    views.setProgressBar(R.id.rj_widget_progress_bar, 100, topicsPercent, false);

    Intent intent = new Intent(context, MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent = PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.rj_widget_study_root, pendingIntent);

    appWidgetManager.updateAppWidget(appWidgetId, views);
  }

  public static void updateAll(Context context) {
    try {
      AppWidgetManager mgr = AppWidgetManager.getInstance(context);
      ComponentName cn = new ComponentName(context, StudyWidgetProvider.class);
      int[] ids = mgr.getAppWidgetIds(cn);
      if (ids != null && ids.length > 0) {
        for (int id : ids) {
          updateAppWidget(context, mgr, id);
        }
      }
    } catch (Throwable ignored) {}
  }
}
