package app.rjtracker.pro;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Subject Mastery widget. Each widget instance shows the subjects the student picked (stored per widget id);
 * with no pick it follows the subject being studied. It shows as many rows as the widget is tall enough for.
 */
public class SubjectWidgetProvider extends AppWidgetProvider {

  static final String PREFS = "rj_widget_prefs";
  static final int MAX_ROWS = 5;

  private static final int[] ROW = {R.id.rj_subj_row1, R.id.rj_subj_row2, R.id.rj_subj_row3, R.id.rj_subj_row4, R.id.rj_subj_row5};
  private static final int[] BADGE = {R.id.rj_subj_badge1, R.id.rj_subj_badge2, R.id.rj_subj_badge3, R.id.rj_subj_badge4, R.id.rj_subj_badge5};
  private static final int[] NAME = {R.id.rj_subj_name1, R.id.rj_subj_name2, R.id.rj_subj_name3, R.id.rj_subj_name4, R.id.rj_subj_name5};
  private static final int[] PCT = {R.id.rj_subj_pct1, R.id.rj_subj_pct2, R.id.rj_subj_pct3, R.id.rj_subj_pct4, R.id.rj_subj_pct5};
  private static final int[] META = {R.id.rj_subj_meta1, R.id.rj_subj_meta2, R.id.rj_subj_meta3, R.id.rj_subj_meta4, R.id.rj_subj_meta5};
  private static final int[] BAR = {R.id.rj_subj_bar1, R.id.rj_subj_bar2, R.id.rj_subj_bar3, R.id.rj_subj_bar4, R.id.rj_subj_bar5};

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      updateAppWidget(context, appWidgetManager, appWidgetId);
    }
  }

  @Override
  public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
    updateAppWidget(context, appWidgetManager, appWidgetId);
  }

  @Override
  public void onDeleted(Context context, int[] appWidgetIds) {
    SharedPreferences.Editor ed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
    for (int id : appWidgetIds) ed.remove(selectionKey(id));
    ed.apply();
  }

  static String selectionKey(int appWidgetId) {
    return "subj_sel_" + appWidgetId;
  }

  /** Subject ids the student picked for this widget, in the order they picked them (empty = automatic). */
  static List<String> readSelection(Context context, int appWidgetId) {
    List<String> out = new ArrayList<String>();
    String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(selectionKey(appWidgetId), "");
    if (raw == null || raw.isEmpty()) return out;
    for (String part : raw.split(",")) {
      String id = part.trim();
      if (!id.isEmpty()) out.add(id);
    }
    return out;
  }

  static void saveSelection(Context context, int appWidgetId, List<String> ids) {
    StringBuilder sb = new StringBuilder();
    for (String id : ids) {
      if (sb.length() > 0) sb.append(',');
      sb.append(id);
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(selectionKey(appWidgetId), sb.toString()).apply();
  }

  static JSONObject readData(Context context) {
    try {
      String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("widget_data", null);
      return raw == null ? null : new JSONObject(raw);
    } catch (Exception e) {
      return null;
    }
  }

  /** Every subject the web app last pushed (for the picker). */
  static List<JSONObject> allSubjects(JSONObject root) {
    List<JSONObject> list = new ArrayList<JSONObject>();
    if (root == null) return list;
    JSONArray arr = root.optJSONArray("subjects");
    if (arr != null) {
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o != null) list.add(o);
      }
    }
    if (list.isEmpty()) {
      JSONObject active = root.optJSONObject("activeSubject");
      if (active != null) list.add(active);
    }
    return list;
  }

  private static List<JSONObject> chosen(Context context, JSONObject root, int appWidgetId) {
    List<JSONObject> all = allSubjects(root);
    List<JSONObject> out = new ArrayList<JSONObject>();
    for (String id : readSelection(context, appWidgetId)) {
      for (JSONObject s : all) {
        if (id.equals(s.optString("id"))) { out.add(s); break; }
      }
    }
    if (out.isEmpty() && root != null) {
      JSONObject active = root.optJSONObject("activeSubject");
      if (active != null) out.add(active);
      else if (!all.isEmpty()) out.add(all.get(0));
    }
    return out;
  }

  /** How many rows fit: header + padding take ~66dp, a row ~44dp. */
  static int rowsFor(int heightDp) {
    int rows = (heightDp - 66) / 44;
    if (rows < 1) rows = 1;
    if (rows > MAX_ROWS) rows = MAX_ROWS;
    return rows;
  }

  /** Brightens a dark subject colour so it stays readable on the dark widget. */
  static int readable(int color) {
    double lum = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
    if (lum >= 0.55) return color;
    int r = Color.red(color) + (255 - Color.red(color)) / 2;
    int g = Color.green(color) + (255 - Color.green(color)) / 2;
    int b = Color.blue(color) + (255 - Color.blue(color)) / 2;
    return Color.rgb(r, g, b);
  }

  private static int parseColor(String hex) {
    try {
      return readable(Color.parseColor(hex));
    } catch (Exception e) {
      return Color.parseColor("#CBBEFF");
    }
  }

  private static PendingIntent openIntent(Context context, int requestCode, String subjectId, String unitId) {
    Intent intent = new Intent(context, MainActivity.class);
    if (subjectId != null && !subjectId.isEmpty()) {
      intent.putExtra("rj_action", "open-unit");
      intent.putExtra("rj_subject", subjectId);
      if (unitId != null && !unitId.isEmpty()) intent.putExtra("rj_unit", unitId);
    }
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.rj_widget_subject);
    JSONObject root = readData(context);
    List<JSONObject> list = chosen(context, root, appWidgetId);

    int heightDp = 110;
    try {
      Bundle opts = appWidgetManager.getAppWidgetOptions(appWidgetId);
      if (opts != null) heightDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
    } catch (Throwable ignored) {}
    int rows = rowsFor(heightDp);
    int shown = Math.min(list.size(), rows);

    int sum = 0;
    for (JSONObject s : list) sum += Math.max(0, Math.min(100, s.optInt("percent", 0)));
    views.setTextViewText(R.id.rj_subj_summary, list.isEmpty() ? "—" : (sum / list.size()) + "% avg");

    int base = appWidgetId * 16;
    for (int i = 0; i < MAX_ROWS; i++) {
      if (i < shown) {
        JSONObject s = list.get(i);
        int pct = Math.max(0, Math.min(100, s.optInt("percent", 0)));
        int done = s.optInt("completedTopics", 0);
        int total = s.optInt("totalTopics", 0);
        String unit = s.optString("activeUnitName", "");
        String meta = total > 0 ? (done + " / " + total + " topics") : (pct + "% complete");
        if (!unit.isEmpty()) meta = meta + " · " + unit;
        views.setViewVisibility(ROW[i], View.VISIBLE);
        views.setTextViewText(BADGE[i], s.optString("shortName", "SUBJ"));
        views.setTextColor(BADGE[i], parseColor(s.optString("color", "#CBBEFF")));
        views.setTextViewText(NAME[i], s.optString("name", "Subject"));
        views.setTextViewText(PCT[i], pct + "%");
        views.setTextViewText(META[i], meta);
        views.setProgressBar(BAR[i], 100, pct, false);
        views.setOnClickPendingIntent(ROW[i], openIntent(context, base + i + 1, s.optString("id", ""), s.optString("activeUnitId", "")));
      } else {
        views.setViewVisibility(ROW[i], View.GONE);
      }
    }

    views.setViewVisibility(R.id.rj_subj_empty, list.isEmpty() ? View.VISIBLE : View.GONE);
    if (list.size() > shown && shown > 0) {
      views.setTextViewText(R.id.rj_subj_more, "+" + (list.size() - shown) + " more · resize taller");
      views.setViewVisibility(R.id.rj_subj_more, View.VISIBLE);
    } else {
      views.setViewVisibility(R.id.rj_subj_more, View.GONE);
    }

    views.setOnClickPendingIntent(R.id.rj_subj_header, openIntent(context, base + 15, null, null));
    appWidgetManager.updateAppWidget(appWidgetId, views);
  }

  public static void updateAll(Context context) {
    try {
      AppWidgetManager mgr = AppWidgetManager.getInstance(context);
      ComponentName cn = new ComponentName(context, SubjectWidgetProvider.class);
      int[] ids = mgr.getAppWidgetIds(cn);
      if (ids != null) {
        for (int id : ids) {
          updateAppWidget(context, mgr, id);
        }
      }
    } catch (Throwable ignored) {}
  }
}
