package ru.eclipsru.mikapital;

import android.app.*;
import android.content.*;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;
import java.time.LocalDate;
import java.util.concurrent.TimeUnit;
import org.json.*;

/** Local reminders use only the most recently saved on-device database. WorkManager may delay them. */
public final class ReminderWorker extends Worker {
  private static final String PREFS="reminders", CHANNEL="reminders-v1";
  static final String[] KEYS={"my_due","their_due","my_overdue","their_overdue","work","past_work","preparing","listed"};
  private static final String[] TITLES={"Срок ваших долгов", "Вам должны вернуть", "Просрочены ваши долги", "Просрочены долги перед вами", "Запланированные работы", "Проверьте прошедшие планы", "Товары на подготовке", "Товары давно на продаже"};
  public ReminderWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
  static synchronized void schedule(Context context){
    SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE); boolean enabled=false;
    NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    for(int i=0;i<KEYS.length;i++){boolean on=prefs.getBoolean(KEYS[i],false);enabled|=on;if(!on){notifications.cancel(100+i);prefs.edit().remove("sent_"+KEYS[i]).apply();}}
    WorkManager manager=WorkManager.getInstance(context);
    if(!enabled){manager.cancelUniqueWork("reminders-periodic");manager.cancelUniqueWork("reminders-refresh");return;}
    manager.enqueueUniquePeriodicWork("reminders-periodic",ExistingPeriodicWorkPolicy.KEEP,new PeriodicWorkRequest.Builder(ReminderWorker.class,1,TimeUnit.HOURS).build());
    manager.enqueueUniqueWork("reminders-refresh",ExistingWorkPolicy.REPLACE,new OneTimeWorkRequest.Builder(ReminderWorker.class).build());
  }
  static boolean allowed(Context context){NotificationManager nm=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);NotificationChannel channel=nm.getNotificationChannel(CHANNEL);return nm.areNotificationsEnabled()&&(channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);}
  static JSONObject settings(Context context){
    JSONObject result=new JSONObject();SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    try{for(String key:KEYS)result.put(key,p.getBoolean(key,false));result.put("allowed",allowed(context));}catch(Exception ignored){}return result;
  }
  static synchronized void saveSettings(Context context,String json)throws Exception{
    JSONObject value=new JSONObject(json);SharedPreferences.Editor editor=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit();
    for(String key:KEYS){if(!(value.opt(key) instanceof Boolean))throw new IllegalArgumentException("Неверные настройки уведомлений");editor.putBoolean(key,value.getBoolean(key));}editor.apply();schedule(context);
  }
  @NonNull @Override public Result doWork(){
    synchronized(ReminderWorker.class){return checkReminders();}
  }
  private Result checkReminders(){
    Context context=getApplicationContext();SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    NotificationManager nm=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    if(Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Напоминания",NotificationManager.IMPORTANCE_DEFAULT));
    String raw=new NativeStore(context).load();if(raw==null)return Result.success();
    try{
      JSONObject data=new JSONObject(raw);LocalDate today=LocalDate.now();int[] count=new int[KEYS.length];
      JSONArray debts=data.getJSONArray("debts");
      for(int i=0;i<debts.length();i++){
        JSONObject d=debts.getJSONObject(i);long paid=0;JSONArray payments=d.getJSONArray("payments");for(int j=0;j<payments.length();j++)paid+=payments.getJSONObject(j).getLong("amountKopecks");
        int category=ReminderRules.debt(d.optString("dueDate",""),"i_owe".equals(d.optString("direction")),d.getLong("principalKopecks"),paid,today);if(category>=0)count[category]++;
      }
      JSONArray plans=data.optJSONArray("workPlans");if(plans!=null)for(int i=0;i<plans.length();i++){
        String date=plans.getJSONObject(i).optString("date","");
        if(ReminderRules.work(date,today))count[4]++;else if(ReminderRules.old(date,1,today))count[5]++;
      }
      JSONArray products=data.optJSONArray("products");if(products!=null)for(int i=0;i<products.length();i++){
        JSONObject product=products.getJSONObject(i);if(product.optJSONObject("sale")!=null)continue;
        boolean listed="listed".equals(product.optString("status","preparing"));
        String date=listed?product.optString("listedAt",product.optString("statusChangedAt","")):product.optString("preparingStartedAt",product.optString("createdAt",product.optString("purchaseDate","")));
        if(ReminderRules.old(date,listed?30:14,today))count[listed?7:6]++;
      }
      Intent open=new Intent(context,MainActivity.class);open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
      for(int i=0;i<KEYS.length;i++){
        int id=100+i;if(!prefs.getBoolean(KEYS[i],false)||count[i]==0){nm.cancel(id);continue;}
        if(!allowed(context)||today.toString().equals(prefs.getString("sent_"+KEYS[i],"")))continue;
        open.putExtra("route",i>=6?"resales":i>=4?"odd-jobs":"debts");PendingIntent intent=PendingIntent.getActivity(context,100+i,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new NotificationCompat.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(TITLES[i]).setContentText("Есть записи, требующие внимания. Откройте приложение.").setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(intent).build();
        try{nm.notify(id,notification);prefs.edit().putString("sent_"+KEYS[i],today.toString()).apply();}catch(SecurityException ignored){}
      }
    }catch(Exception e){return Result.retry();}return Result.success();
  }
}
