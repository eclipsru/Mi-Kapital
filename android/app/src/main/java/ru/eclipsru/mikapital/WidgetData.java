package ru.eclipsru.mikapital;
import android.content.Context;
import org.json.*;
import java.util.*;
public final class WidgetData {
  public long total,remainder,assets,payable; public String updated="Нажмите, чтобы открыть";
  public static long share(long amount,long bps){return amount<=0?0:(amount*bps+5000)/10000;}
  public static WidgetData read(Context context){
    String raw=new NativeStore(context).load();
    if(raw==null)return new WidgetData();
    try{return calculate(new JSONObject(raw));}catch(Exception e){WidgetData result=new WidgetData();result.updated="Откройте приложение для проверки данных";return result;}
  }
  static WidgetData calculate(JSONObject d){
    WidgetData result=new WidgetData();
    try{
      Map<String,Long> balances=new HashMap<>();Set<String> liquid=new HashSet<>();
      JSONArray accounts=d.getJSONArray("accounts");for(int i=0;i<accounts.length();i++){JSONObject a=accounts.getJSONObject(i);balances.put(a.getString("id"),a.getLong("openingKopecks"));if(a.getString("kind").equals("cash")||a.getString("kind").equals("bank"))liquid.add(a.getString("id"));}
      long jobReceipts=0,jobCapital=0,capitalSpent=0,capitalReturned=0;
      JSONArray incomes=d.getJSONArray("incomes");for(int i=0;i<incomes.length();i++){JSONObject x=incomes.getJSONObject(i);String id=x.getString("accountId");balances.put(id,balances.getOrDefault(id,0L)+x.getLong("amountKopecks"));if(x.getString("category").equals("Шабашки")&&liquid.contains(id)){long amount=x.getLong("amountKopecks");jobReceipts+=amount;jobCapital+=share(amount-x.optLong("costKopecks",0),1500);}}
      JSONArray movements=d.getJSONArray("movements");for(int i=0;i<movements.length();i++){JSONObject x=movements.getJSONObject(i);String id=x.getString("accountId");if(x.optBoolean("capitalDebt",false))capitalSpent+=x.getLong("amountKopecks");if(!x.getString("kind").equals("expense"))balances.put(id,balances.getOrDefault(id,0L)+x.getLong("amountKopecks"));}
      JSONArray products=d.optJSONArray("products");if(products==null)products=new JSONArray();
      for(int i=0;i<products.length();i++){JSONObject p=products.getJSONObject(i);long cost=0;JSONArray funding=p.getJSONArray("funding");for(int j=0;j<funding.length();j++){JSONObject f=funding.getJSONObject(j);long amount=f.getLong("amountKopecks");cost+=amount;if(!f.getString("source").equals("capital"))continue;String id=f.getString("accountId");balances.put(id,balances.getOrDefault(id,0L)-amount);}JSONObject sale=p.optJSONObject("sale");if(sale==null){result.assets+=cost;continue;}long revenue=sale.getLong("priceKopecks"),profit=revenue-cost;long investor=share(Math.max(0,profit),p.optJSONObject("investor")==null?0:p.getJSONObject("investor").optLong("percentBasisPoints",0));long earned=share(Math.max(0,profit-investor),1500);long returned=profit<0?revenue:cost+earned;String id=sale.getString("accountId");balances.put(id,balances.getOrDefault(id,0L)+returned);}
      JSONArray debts=d.getJSONArray("debts");for(int i=0;i<debts.length();i++){JSONObject x=debts.getJSONObject(i);boolean owe=x.getString("direction").equals("i_owe");long principal=x.getLong("principalKopecks"),paid=0;JSONArray payments=x.getJSONArray("payments");for(int j=0;j<payments.length();j++){JSONObject p=payments.getJSONObject(j);long amount=p.getLong("amountKopecks");paid+=amount;}if(owe)result.payable+=principal-paid;if(x.has("capitalExpenseId"))capitalReturned+=paid;}
      for(String id:liquid)result.remainder+=balances.getOrDefault(id,0L);result.remainder+=jobCapital-jobReceipts-capitalSpent+capitalReturned;result.total=result.remainder+result.assets;result.updated="Обновлено "+new java.text.SimpleDateFormat("HH:mm",Locale.getDefault()).format(new java.util.Date(d.getString("updatedAt").isEmpty()?System.currentTimeMillis():java.time.Instant.parse(d.getString("updatedAt")).toEpochMilli()));
    }catch(Exception e){result.updated="Откройте приложение для проверки данных";}return result;
  }
  public static String money(long kopecks){return String.format(Locale.forLanguageTag("ru-RU"), "%,.0f ₽", kopecks/100.0).replace('\u00a0',' ');}
}
