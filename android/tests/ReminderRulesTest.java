package ru.eclipsru.mikapital;
import java.time.LocalDate;
public final class ReminderRulesTest {
  public static void main(String[] args){
    LocalDate now=LocalDate.parse("2026-11-10");
    check(ReminderRules.debt("2026-11-10",true,100,0,now)==0);
    check(ReminderRules.debt("2026-11-13",false,100,99,now)==1);
    check(ReminderRules.debt("2026-11-14",true,100,0,now)==-1);
    check(ReminderRules.debt("2026-11-09",true,100,0,now)==2);
    check(ReminderRules.debt("2026-11-09",false,100,0,now)==3);
    check(ReminderRules.debt("2026-11-09",false,100,100,now)==-1);
    check(ReminderRules.debt("not-a-date",true,100,0,now)==-1);
    check(ReminderRules.old("2026-10-27T12:00:00Z",14,now));check(!ReminderRules.old("2026-10-28",14,now));
    check(ReminderRules.old("2026-10-11",30,now));check(!ReminderRules.old("",30,now));check(!ReminderRules.old("2026-11-11",1,now));
    check(ReminderRules.work("2026-11-13",now));check(!ReminderRules.work("2026-11-09",now));check(!ReminderRules.work("",now));
  }
  static void check(boolean value){if(!value)throw new AssertionError("Reminder rule failed");}
}
