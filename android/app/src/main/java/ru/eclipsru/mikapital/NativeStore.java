package ru.eclipsru.mikapital;
import android.content.Context;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.UUID;

public final class NativeStore {
  private final Context context;
  private final Object lock = new Object();
  public NativeStore(Context context) { this.context = context.getApplicationContext(); }
  public File file(String name) { return new File(context.getFilesDir(), name); }
  public static String read(File file) throws IOException { return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8); }
  public static String read(InputStream input) throws IOException { ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count; while ((count = input.read(buffer)) != -1) out.write(buffer, 0, count); return out.toString("UTF-8"); }
  public void atomic(File file, String content) throws IOException {
    File parent = file.getParentFile(); if (parent != null) parent.mkdirs();
    File tmp = new File(parent, file.getName() + ".tmp");
    try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(content.getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
    if (file.exists()) { File backup = new File(parent, file.getName() + ".bak"); Files.copy(file.toPath(), backup.toPath(), StandardCopyOption.REPLACE_EXISTING); }
    if (!tmp.renameTo(file)) { Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING); }
  }
  public String load() {
    synchronized (lock) {
      for (File candidate : new File[]{file("capital-data.json"), file("capital-data.json.bak")}) {
        try { if (candidate.exists() && candidate.length() <= 15000000) { JSONObject data = new JSONObject(read(candidate)); if (valid(data)) return data.toString(); } } catch (Exception ignored) {}
      }
      return null;
    }
  }
  public void atomicBytes(File file, byte[] content) throws IOException { File parent=file.getParentFile();parent.mkdirs();File tmp=new File(parent,file.getName()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(content);out.getFD().sync();}if(!tmp.renameTo(file))Files.move(tmp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING); }
  public boolean valid(JSONObject data) {
    try {
      if (data.getInt("schemaVersion") != 1 || data.getString("updatedAt").isEmpty()) return false;
      for (String key : new String[]{"accounts","incomes","debts","movements"}) { JSONArray rows=data.getJSONArray(key); if(rows.length()>20000) return false; }
      return data.toString().getBytes(StandardCharsets.UTF_8).length <= 15000000;
    } catch (Exception e) { return false; }
  }
  public void save(String json) throws Exception {
    synchronized (lock) { JSONObject data = new JSONObject(json); if (!valid(data)) throw new IllegalArgumentException("Неверные данные"); atomic(file("capital-data.json"), data.toString()); }
    CapitalWidget.updateAll(context); QuickWidget.updateAll(context);
  }
  public JSONObject config() {
    try { return new JSONObject(read(file("sync-settings.json"))); }
    catch (Exception e) { JSONObject value = new JSONObject(); try { value.put("lanEnabled",true); value.put("lanPort",47653); value.put("lanToken",""); value.put("lanUrl",""); value.put("cloudEnabled",false); value.put("supabaseUrl",""); value.put("supabaseKey",""); value.put("email",""); } catch (Exception ignored) {} return value; }
  }
  public void saveConfig(String json) throws Exception { JSONObject value = new JSONObject(json); atomic(file("sync-settings.json"), value.toString()); }
  public String deviceId() { try { return read(file("device-id")); } catch (Exception e) { String id=UUID.randomUUID().toString(); try { atomic(file("device-id"),id); } catch (Exception ignored) {} return id; } }
  public static String hash(byte[] bytes) throws Exception { StringBuilder result=new StringBuilder(); for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x",b)); return result.toString(); }
  public static void deleteTree(File file) { if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)deleteTree(child);} file.delete(); }
  public static void copyTree(File from, File to) throws IOException { if(from.isDirectory()){to.mkdirs();for(String name:from.list())copyTree(new File(from,name),new File(to,name));}else Files.copy(from.toPath(),to.toPath(),StandardCopyOption.REPLACE_EXISTING); }
}
