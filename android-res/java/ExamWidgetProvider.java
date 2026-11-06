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

public class ExamWidgetProvider extends AppWidgetProvider {

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateAppWidget(context, appWidgetManager, appWidgetId);
    }
  }

  public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.rj_widget_exam);

    SharedPreferences prefs = context.getSharedPreferences("rj_widget_prefs", Context.MODE_PRIVATE);
    String raw = prefs.getString("widget_data", null);

    String title = "Upcoming Exam";
    String examDate = "Target Date";
    String daysLeftStr = "D-Day";
    String paceStr = "⚡ Target: 3 topics / day";

    if (raw != null) {
      try {
        JSONObject obj = new JSONObject(raw);
        JSONObject exam = obj.optJSONObject("examTarget");
        if (exam != null) {
          title = exam.optString("title", "Final Exam");
          examDate = exam.optString("date", "Upcoming");
          int days = exam.optInt("daysRemaining", 0);
          if (days > 0) {
            daysLeftStr = days + " Days Left";
          } else if (days == 0) {
            daysLeftStr = "TODAY!";
          } else {
            daysLeftStr = "Exam Done";
          }
          String p = exam.optString("targetPace", "");
          if (!p.isEmpty()) {
            paceStr = p;
          }
        }
      } catch (Exception ignored) {}
    }

    views.setTextViewText(R.id.rj_widget_exam_title, title);
    views.setTextViewText(R.id.rj_widget_exam_date, examDate);
    views.setTextViewText(R.id.rj_widget_exam_days, daysLeftStr);
    views.setTextViewText(R.id.rj_widget_exam_pace, paceStr);

    Intent intent = new Intent(context, MainActivity.class);
    intent.putExtra("rj_action", "open-exam");
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent = PendingIntent.getActivity(
        context,
        3,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.rj_widget_exam_root, pendingIntent);

    appWidgetManager.updateAppWidget(appWidgetId, views);
  }

  public static void updateAll(Context context) {
    try {
      AppWidgetManager mgr = AppWidgetManager.getInstance(context);
      ComponentName cn = new ComponentName(context, ExamWidgetProvider.class);
      int[] ids = mgr.getAppWidgetIds(cn);
      if (ids != null && ids.length > 0) {
        for (int id : ids) {
          updateAppWidget(context, mgr, id);
        }
      }
    } catch (Throwable ignored) {}
  }
}
