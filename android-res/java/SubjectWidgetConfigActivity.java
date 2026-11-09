package app.rjtracker.pro;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Shown when a Subject widget is added (and again from the launcher's "reconfigure" action):
 * the student ticks the subjects this widget should display. Looks like a Vyxel bottom sheet.
 */
public class SubjectWidgetConfigActivity extends Activity {

  private static final int SHEET = Color.parseColor("#1B1C22");
  private static final int ROW_BG = Color.parseColor("#22232A");
  private static final int ROW_ON = Color.parseColor("#2A2650");
  private static final int INK = Color.parseColor("#E4E1E9");
  private static final int INK_DIM = Color.parseColor("#CAC4CF");
  private static final int VIOLET = Color.parseColor("#CBBEFF");
  private static final int ON_VIOLET = Color.parseColor("#360091");

  private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
  private final List<JSONObject> subjects = new ArrayList<JSONObject>();
  private final List<String> selected = new ArrayList<String>();
  private final List<TextView> checks = new ArrayList<TextView>();
  private final List<LinearLayout> rowViews = new ArrayList<LinearLayout>();
  private float density = 1f;

  private int dp(int v) {
    return Math.round(v * density);
  }

  private GradientDrawable shape(int fill, int radiusDp, int strokeColor, int strokeDp) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(fill);
    d.setCornerRadius(dp(radiusDp));
    if (strokeDp > 0) d.setStroke(dp(strokeDp), strokeColor);
    return d;
  }

  private TextView text(String value, int sp, int color, boolean bold) {
    TextView t = new TextView(this);
    t.setText(value);
    t.setTextSize(sp);
    t.setTextColor(color);
    if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    return t;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setResult(RESULT_CANCELED);
    density = getResources().getDisplayMetrics().density;

    Intent intent = getIntent();
    Bundle extras = intent == null ? null : intent.getExtras();
    if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish();
      return;
    }

    subjects.addAll(SubjectWidgetProvider.allSubjects(SubjectWidgetProvider.readData(this)));
    selected.addAll(SubjectWidgetProvider.readSelection(this, widgetId));

    FrameLayout scrim = new FrameLayout(this);
    scrim.setBackgroundColor(Color.parseColor("#99000000"));
    scrim.setOnClickListener(new View.OnClickListener() {
      @Override public void onClick(View v) {
        finish();
      }
    });

    LinearLayout sheet = new LinearLayout(this);
    sheet.setOrientation(LinearLayout.VERTICAL);
    sheet.setPadding(dp(20), dp(18), dp(20), dp(20));
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(SHEET);
    float r = dp(28);
    bg.setCornerRadii(new float[] {r, r, r, r, 0f, 0f, 0f, 0f});
    sheet.setBackground(bg);
    sheet.setClickable(true);

    FrameLayout.LayoutParams sheetLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
    scrim.addView(sheet, sheetLp);

    sheet.addView(text("Choose subjects", 20, INK, true));
    TextView sub = text(subjects.isEmpty()
        ? "Open RJ Tracker once so your subjects can be shown here."
        : "Tick the subjects this widget should show. Leave all unticked to follow the subject you are studying.", 12, INK_DIM, false);
    LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    subLp.topMargin = dp(4);
    subLp.bottomMargin = dp(12);
    sheet.addView(sub, subLp);

    if (!subjects.isEmpty()) {
      ScrollView scroll = new ScrollView(this);
      LinearLayout list = new LinearLayout(this);
      list.setOrientation(LinearLayout.VERTICAL);
      scroll.addView(list, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
      int maxH = Math.round(getResources().getDisplayMetrics().heightPixels * 0.5f);
      LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0);
      scrollLp.weight = 0f;
      scrollLp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
      sheet.addView(scroll, scrollLp);
      scroll.setMinimumHeight(0);
      limitHeight(scroll, maxH);

      for (int i = 0; i < subjects.size(); i++) {
        addRow(list, subjects.get(i));
      }
    }

    LinearLayout bar = new LinearLayout(this);
    bar.setOrientation(LinearLayout.HORIZONTAL);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    barLp.topMargin = dp(14);
    sheet.addView(bar, barLp);

    if (!subjects.isEmpty()) {
      bar.addView(chip("Auto", new View.OnClickListener() {
        @Override public void onClick(View v) {
          selected.clear();
          refresh();
        }
      }));
      bar.addView(chip("All", new View.OnClickListener() {
        @Override public void onClick(View v) {
          selected.clear();
          for (JSONObject s : subjects) selected.add(s.optString("id"));
          refresh();
        }
      }));
    }
    View spacer = new View(this);
    bar.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));

    TextView done = text("Done", 14, ON_VIOLET, true);
    done.setGravity(Gravity.CENTER);
    done.setPadding(dp(28), dp(12), dp(28), dp(12));
    done.setBackground(shape(VIOLET, 24, 0, 0));
    done.setOnClickListener(new View.OnClickListener() {
      @Override public void onClick(View v) {
        save();
      }
    });
    bar.addView(done);

    setContentView(scrim);
    refresh();
  }

  private void limitHeight(final ScrollView scroll, final int maxPx) {
    scroll.getViewTreeObserver().addOnGlobalLayoutListener(new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
      @Override public void onGlobalLayout() {
        if (scroll.getHeight() > maxPx) {
          ViewGroup.LayoutParams lp = scroll.getLayoutParams();
          lp.height = maxPx;
          scroll.setLayoutParams(lp);
        }
      }
    });
  }

  private TextView chip(String label, View.OnClickListener click) {
    TextView t = text(label, 13, VIOLET, true);
    t.setGravity(Gravity.CENTER);
    t.setPadding(dp(16), dp(10), dp(16), dp(10));
    t.setBackground(shape(ROW_BG, 20, 0, 0));
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    lp.rightMargin = dp(8);
    t.setLayoutParams(lp);
    t.setOnClickListener(click);
    return t;
  }

  private void addRow(LinearLayout parent, final JSONObject s) {
    final String id = s.optString("id");
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.CENTER_VERTICAL);
    row.setPadding(dp(12), dp(10), dp(12), dp(10));
    LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    rowLp.bottomMargin = dp(6);

    TextView check = text("", 14, ON_VIOLET, true);
    check.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams checkLp = new LinearLayout.LayoutParams(dp(26), dp(26));
    checkLp.rightMargin = dp(12);
    row.addView(check, checkLp);

    LinearLayout col = new LinearLayout(this);
    col.setOrientation(LinearLayout.VERTICAL);
    String shortName = s.optString("shortName", "");
    String name = s.optString("name", "Subject");
    col.addView(text(shortName.isEmpty() ? name : shortName + " · " + name, 14, INK, true));
    int pct = Math.max(0, Math.min(100, s.optInt("percent", 0)));
    int total = s.optInt("totalTopics", 0);
    col.addView(text(pct + "% complete" + (total > 0 ? " · " + s.optInt("completedTopics", 0) + "/" + total + " topics" : ""), 11, INK_DIM, false));
    row.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

    row.setOnClickListener(new View.OnClickListener() {
      @Override public void onClick(View v) {
        if (selected.contains(id)) selected.remove(id);
        else selected.add(id);
        refresh();
      }
    });
    parent.addView(row, rowLp);
    rowViews.add(row);
    checks.add(check);
  }

  private void refresh() {
    for (int i = 0; i < subjects.size() && i < rowViews.size(); i++) {
      boolean on = selected.contains(subjects.get(i).optString("id"));
      rowViews.get(i).setBackground(shape(on ? ROW_ON : ROW_BG, 18, on ? VIOLET : ROW_BG, on ? 1 : 0));
      TextView c = checks.get(i);
      c.setText(on ? "✓" : "");
      c.setBackground(shape(on ? VIOLET : Color.TRANSPARENT, 13, on ? VIOLET : INK_DIM, on ? 0 : 2));
    }
  }

  private void save() {
    SubjectWidgetProvider.saveSelection(this, widgetId, selected);
    AppWidgetManager mgr = AppWidgetManager.getInstance(this);
    SubjectWidgetProvider.updateAppWidget(this, mgr, widgetId);
    Intent result = new Intent();
    result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
    setResult(RESULT_OK, result);
    finish();
  }
}
