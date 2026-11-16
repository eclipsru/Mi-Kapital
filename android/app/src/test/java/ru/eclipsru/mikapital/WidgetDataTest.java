package ru.eclipsru.mikapital;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class WidgetDataTest {
  private JSONObject data() throws Exception {
    return new JSONObject("{\"accounts\":[{\"id\":\"a\",\"kind\":\"cash\",\"openingKopecks\":100000}],\"incomes\":[],\"movements\":[],\"products\":[],\"debts\":[],\"updatedAt\":\"2026-11-10T10:00:00Z\"}");
  }
  @Test public void debtsAndExpensesNeverChangeCapital() throws Exception {
    JSONObject d=data();
    d.getJSONArray("movements").put(new JSONObject("{\"accountId\":\"a\",\"kind\":\"expense\",\"amountKopecks\":30000}"));
    for(String direction:new String[]{"i_owe","owed_to_me"}) {
      d.getJSONArray("debts").put(new JSONObject("{\"direction\":\""+direction+"\",\"initialAccountId\":\"a\",\"principalKopecks\":50000,\"payments\":[{\"accountId\":\"a\",\"amountKopecks\":10000}]}"));
      WidgetData result=WidgetData.calculate(d);
      assertEquals(100000,result.remainder);assertEquals(100000,result.total);assertEquals(40000,result.payable);
    }
  }
  @Test public void pocketPurchaseReturnsOnlyOnSaleWithInvestorAndCapitalShare() throws Exception {
    JSONObject d=data();
    JSONObject product=new JSONObject("{\"funding\":[{\"source\":\"pocket\",\"accountId\":\"a\",\"amountKopecks\":40000},{\"source\":\"capital\",\"accountId\":\"a\",\"amountKopecks\":60000}],\"investor\":{\"percentBasisPoints\":2000}}");
    d.getJSONArray("products").put(product);
    WidgetData result=WidgetData.calculate(d);assertEquals(40000,result.remainder);assertEquals(100000,result.assets);assertEquals(140000,result.total);
    product.put("sale",new JSONObject("{\"priceKopecks\":150000,\"accountId\":\"a\"}"));
    result=WidgetData.calculate(d);assertEquals(146000,result.remainder);assertEquals(0,result.assets);assertEquals(146000,result.total);
    product.getJSONObject("sale").put("priceKopecks",80000);
    assertEquals(120000,WidgetData.calculate(d).total);
  }
  @Test public void capitalExpenseAndPartialRepaymentMatchApp() throws Exception {
    JSONObject d=data();
    d.getJSONArray("movements").put(new JSONObject("{\"id\":\"e\",\"accountId\":\"a\",\"kind\":\"expense\",\"capitalDebt\":true,\"amountKopecks\":20000}"));
    JSONObject debt=new JSONObject("{\"capitalExpenseId\":\"e\",\"direction\":\"i_owe\",\"principalKopecks\":20000,\"payments\":[]}");
    d.getJSONArray("debts").put(debt);
    assertEquals(80000,WidgetData.calculate(d).total);
    debt.getJSONArray("payments").put(new JSONObject("{\"amountKopecks\":5000,\"accountId\":\"h\"}"));
    assertEquals(85000,WidgetData.calculate(d).total);
    assertEquals(15000,WidgetData.calculate(d).payable);
  }
  @Test public void jobsUseNetProfitShareAndAdjustmentsRemain() throws Exception {
    JSONObject d=data();
    d.getJSONArray("incomes").put(new JSONObject("{\"accountId\":\"a\",\"category\":\"Шабашки\",\"amountKopecks\":10000,\"costKopecks\":4000}"));
    d.getJSONArray("movements").put(new JSONObject("{\"accountId\":\"a\",\"kind\":\"adjustment\",\"amountKopecks\":-500}"));
    assertEquals(100400,WidgetData.calculate(d).total);
  }
}
