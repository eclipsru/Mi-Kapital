package ru.eclipsru.mikapital;
import android.appwidget.*;
import android.content.*;
import android.app.PendingIntent;
public final class QuickWidget extends AppWidgetProvider {
  @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){updateAll(context);}
  public static void updateAll(Context context){AppWidgetManager manager=AppWidgetManager.getInstance(context);for(int id:manager.getAppWidgetIds(new ComponentName(context,QuickWidget.class))){android.widget.RemoteViews views=new android.widget.RemoteViews(context.getPackageName(),R.layout.widget_quick);int[] buttons={R.id.add_job,R.id.add_product,R.id.add_debt};String[] routes={"odd-jobs?new=1","resales?new=1","debts?new=1"};for(int i=0;i<3;i++){Intent intent=new Intent(context,MainActivity.class).putExtra("route",routes[i]);views.setOnClickPendingIntent(buttons[i],PendingIntent.getActivity(context,20+i,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));}manager.updateAppWidget(id,views);}}
}
