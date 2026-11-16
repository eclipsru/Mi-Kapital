package ru.eclipsru.mikapital;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
/** Returns the reminder category, or -1 when no reminder applies. */
public final class ReminderRules {
  static int debt(String date,boolean mine,long principal,long paid,LocalDate today){
    if(paid>=principal||date==null||date.isEmpty())return -1;
    try{long days=ChronoUnit.DAYS.between(today,LocalDate.parse(date));if(days>=0&&days<=3)return mine?0:1;if(days<0)return mine?2:3;}catch(Exception ignored){}return -1;
  }
  static boolean old(String date,int days,LocalDate today){try{return ChronoUnit.DAYS.between(LocalDate.parse(date.length()>10?date.substring(0,10):date),today)>=days;}catch(Exception ignored){return false;}}
  static boolean work(String date,LocalDate today){try{long days=ChronoUnit.DAYS.between(today,LocalDate.parse(date));return days>=0&&days<=3;}catch(Exception ignored){return false;}}
}
