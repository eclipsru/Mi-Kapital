package ru.eclipsru.mikapital;
import android.appwidget.*;
import android.content.*;
import android.app.PendingIntent;
import android.widget.RemoteViews;

/** A single-row widget; each instance keeps its own selected entry type. */
public final class QuickWidget extends AppWidgetProvider {
  private static final String CHANGE="ru.eclipsru.mikapital.QUICK_TYPE";
  private static final String[] TYPES={"expense","income","debt","product","work"};
  private static final String[] LABELS={"Расход","Доход","Долг","Товар","Работа"};
  @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){updateAll(context);}
  @Override public void onReceive(Context context,Intent intent){
    super.onReceive(context,intent);
    if(!CHANGE.equals(intent.getAction()))return;
    int id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);
    AppWidgetManager manager=AppWidgetManager.getInstance(context);
    boolean exists=false;for(int own:manager.getAppWidgetIds(new ComponentName(context,QuickWidget.class)))if(own==id)exists=true;
    if(!exists)return;
    SharedPreferences prefs=context.getSharedPreferences("quick-widget",Context.MODE_PRIVATE);
    int step=intent.getIntExtra("step",1)<0?-1:1;
    prefs.edit().putInt("type_"+id,Math.floorMod(prefs.getInt("type_"+id,0)+step,TYPES.length)).apply();
    update(context,manager,id);
  }
  @Override public void onDeleted(Context context,int[] ids){SharedPreferences.Editor editor=context.getSharedPreferences("quick-widget",Context.MODE_PRIVATE).edit();for(int id:ids)editor.remove("type_"+id);editor.apply();}
  public static void updateAll(Context context){AppWidgetManager manager=AppWidgetManager.getInstance(context);for(int id:manager.getAppWidgetIds(new ComponentName(context,QuickWidget.class)))update(context,manager,id);}
  private static void update(Context context,AppWidgetManager manager,int id){
    int type=Math.floorMod(context.getSharedPreferences("quick-widget",Context.MODE_PRIVATE).getInt("type_"+id,0),TYPES.length);
    RemoteViews views=new RemoteViews(context.getPackageName(),R.layout.widget_quick);
    views.setTextViewText(R.id.quick_type,LABELS[type]);
    for(int step:new int[]{-1,1}){
      Intent change=new Intent(context,QuickWidget.class).setAction(CHANGE).setData(android.net.Uri.parse("mikapital://widget/"+id+"/"+step)).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).putExtra("step",step);
      views.setOnClickPendingIntent(step<0?R.id.quick_previous:R.id.quick_next,PendingIntent.getBroadcast(context,id,change,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    }
    Intent open=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("quickEntry",true).putExtra("route","add?type="+TYPES[type]).setData(android.net.Uri.parse("mikapital://quick/"+id));
    PendingIntent action=PendingIntent.getActivity(context,id,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.quick_type,action);views.setOnClickPendingIntent(R.id.quick_add,action);
    manager.updateAppWidget(id,views);
  }
}
