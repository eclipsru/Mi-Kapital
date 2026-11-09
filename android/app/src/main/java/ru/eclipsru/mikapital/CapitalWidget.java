package ru.eclipsru.mikapital;
import android.appwidget.*;
import android.content.*;
import android.app.PendingIntent;
public final class CapitalWidget extends AppWidgetProvider {
  @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){updateAll(context);}
  public static void updateAll(Context context){WidgetData data=WidgetData.read(context);AppWidgetManager manager=AppWidgetManager.getInstance(context);for(int id:manager.getAppWidgetIds(new ComponentName(context,CapitalWidget.class))){android.widget.RemoteViews views=new android.widget.RemoteViews(context.getPackageName(),R.layout.widget_capital);views.setTextViewText(R.id.total,WidgetData.money(data.total));views.setTextViewText(R.id.details,"Остаток "+WidgetData.money(data.remainder)+" · Активы "+WidgetData.money(data.assets));views.setTextViewText(R.id.updated,data.updated+" · Я должен "+WidgetData.money(data.payable));Intent intent=new Intent(context,MainActivity.class).putExtra("route","capital");views.setOnClickPendingIntent(R.id.total,PendingIntent.getActivity(context,10,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));manager.updateAppWidget(id,views);}}
}
