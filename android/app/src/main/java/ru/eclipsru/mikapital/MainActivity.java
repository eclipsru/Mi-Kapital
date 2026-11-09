package ru.eclipsru.mikapital;
import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import java.io.*;
import java.net.URL;
import java.util.regex.Pattern;

public final class MainActivity extends Activity {
  private WebView web; private NativeStore store; private Updater updater; private ValueCallback<Uri[]> fileCallback;
  private String pendingBackup; private PermissionRequest pendingAudioRequest; private static final int FILES=101; private static final int BACKUP=102; private static final int AUDIO=103; private static final int PAIR=49374;
  private volatile String initialRoute; private volatile String pendingPairing; private volatile boolean routeApplied; private boolean bootReady;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final Runnable bootWatchdog=()->{if(!bootReady&&updater.activeRoot()!=null){updater.quarantine();Toast.makeText(this,"Обновление не запустилось. Открыта рабочая версия; данные сохранены.",Toast.LENGTH_LONG).show();reload();}};
  private static String safeRoute(String route){return route!=null&&route.matches("(capital|income|debts|calculation|odd-jobs|resales|income/odd-jobs|income/resales)(\\?new=1)?")?route:null;}
  @Override public void onCreate(Bundle saved){
    super.onCreate(saved); getWindow().setStatusBarColor(0xff101217);getWindow().setNavigationBarColor(0xff101217);
    store=new NativeStore(this);updater=new Updater(this,store);
    if(getIntent()!=null)initialRoute=safeRoute(getIntent().getStringExtra("route"));
    web=new WebView(this);setContentView(web);WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);settings.setMediaPlaybackRequiresUserGesture(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);settings.setCacheMode(WebSettings.LOAD_DEFAULT);settings.setTextZoom(100);
    WebView.setWebContentsDebuggingEnabled(false);
    web.addJavascriptInterface(new Bridge(),"MiKapitalNative");
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();if("appassets.androidplatform.net".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/app/")){
          String relative=uri.getPath().substring(5);if(relative.isEmpty())relative="index.html";if(relative.contains("..")||relative.contains("\\"))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
          try{File root=updater.activeRoot();InputStream input=root==null?getAssets().open("web/"+relative):new FileInputStream(new File(root,relative));String type=relative.endsWith(".html")?"text/html":relative.endsWith(".js")?"text/javascript":relative.endsWith(".css")?"text/css":relative.endsWith(".svg")?"image/svg+xml":relative.endsWith(".woff2")?"font/woff2":relative.endsWith(".png")?"image/png":"application/octet-stream";java.util.Map<String,String> headers=new java.util.HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");return new WebResourceResponse(type,"UTF-8",200,"OK",headers,input);}catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream("Not found".getBytes()));}
        }return super.shouldInterceptRequest(view,request);
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("appassets.androidplatform.net".equals(uri.getHost()))return false;openExternal(uri.toString());return true;}
      @Override public void onPageFinished(WebView view,String url){if(!url.startsWith("https://appassets.androidplatform.net/app/"))return;if(!routeApplied){routeApplied=true;if(initialRoute!=null)evaluate("window.location.hash="+JSONObject.quote(initialRoute));}}
      @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()&&updater.activeRoot()!=null){updater.quarantine();reload();}}
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public void onPermissionRequest(PermissionRequest request){boolean audio=request.getResources().length==1&&PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0]);if(audio&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)runOnUiThread(()->request.grant(request.getResources()));else if(audio){pendingAudioRequest=request;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},AUDIO);}else request.deny();}
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;Intent intent=params.createIntent();intent.addCategory(Intent.CATEGORY_OPENABLE);String[] accepts=params.getAcceptTypes();intent.setType(accepts.length>0&&accepts[0].startsWith("image/")?"image/*":"*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{startActivityForResult(intent,FILES);}catch(Exception e){fileCallback=null;return false;}return true;}
    });
    web.loadUrl("https://appassets.androidplatform.net/app/index.html");
    handler.postDelayed(bootWatchdog,20000);
    CapitalWidget.updateAll(this);QuickWidget.updateAll(this);
  }
  public void evaluate(String js){runOnUiThread(()->web.evaluateJavascript(js,null));}
  public void openExternal(String url){try{if(!url.startsWith("https://github.com/"))return;startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){Toast.makeText(this,"Не удалось открыть браузер",Toast.LENGTH_SHORT).show();}}
  public void reload(){runOnUiThread(()->{routeApplied=false;bootReady=false;handler.removeCallbacks(bootWatchdog);handler.postDelayed(bootWatchdog,20000);web.clearCache(true);web.loadUrl("https://appassets.androidplatform.net/app/index.html");});}
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);String route=safeRoute(intent.getStringExtra("route"));if(route!=null){initialRoute=route;if(routeApplied)evaluate("window.location.hash="+JSONObject.quote(route));}}
  @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);WebChromeClient client=web.getWebChromeClient();if(code==AUDIO&&pendingAudioRequest!=null){final PermissionRequest request=pendingAudioRequest;pendingAudioRequest=null;runOnUiThread(()->{if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else request.deny();});}}
  @Override protected void onActivityResult(int code,int result,Intent data){
    super.onActivityResult(code,result,data);
    if(code==PAIR){IntentResult scan=IntentIntegrator.parseActivityResult(code,result,data);if(scan!=null&&scan.getContents()!=null){try{JSONObject pair=new JSONObject(scan.getContents());if(!"mi-kapital-pair".equals(pair.getString("type")))throw new Exception();String address=pair.getString("url");java.net.URL parsed=new java.net.URL(address);if(!parsed.getProtocol().equals("http")||!parsed.getHost().matches("^(192\\.168\\.|10\\.|172\\.(1[6-9]|2\\d|3[01])\\.).*"))throw new Exception();String token=pair.getString("token");if(!token.matches("[a-f0-9]{64}"))throw new Exception();JSONObject config=store.config();config.put("lanUrl",address);config.put("lanToken",token);store.saveConfig(config.toString());pendingPairing=new JSONObject().put("lanUrl",address).put("lanToken",token).toString();evaluate("window.dispatchEvent(new CustomEvent('mi-kapital-pair',{detail:{lanUrl:"+JSONObject.quote(address)+",lanToken:"+JSONObject.quote(token)+"}}))");Toast.makeText(this,"ПК подключён",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"Не удалось подключить ПК. Проверьте QR сопряжения и память телефона.",Toast.LENGTH_LONG).show();}}}
    if(code==FILES&&fileCallback!=null){Uri[] uris=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){uris=new Uri[data.getClipData().getItemCount()];for(int i=0;i<uris.length;i++)uris[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)uris=new Uri[]{data.getData()};}fileCallback.onReceiveValue(uris);fileCallback=null;}
    if(code==BACKUP&&pendingBackup!=null){String json=pendingBackup;pendingBackup=null;boolean ok=false;if(result==RESULT_OK&&data!=null&&data.getData()!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(json.getBytes("UTF-8"));ok=true;}catch(Exception ignored){}}final boolean success=ok;evaluate("window.dispatchEvent(new CustomEvent('mi-kapital-backup',{detail:"+success+"}))");}
  }
  @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);web.removeJavascriptInterface("MiKapitalNative");web.destroy();super.onDestroy();}
  public final class Bridge {
    @JavascriptInterface public String platform(){return "android";}
    @JavascriptInterface public String loadData(){String value=store.load();return value==null?"null":value;}
    @JavascriptInterface public String saveData(String json){try{store.save(json);return "{\"ok\":true}";}catch(Exception e){return "{\"ok\":false,\"message\":"+JSONObject.quote(e.getMessage()==null?"Не удалось сохранить данные":e.getMessage())+"}";}}
    @JavascriptInterface public String syncConfig(){return store.config().toString();}
    @JavascriptInterface public String saveSyncConfig(String json){try{store.saveConfig(json);return "{\"ok\":true}";}catch(Exception e){return "{\"ok\":false,\"message\":"+JSONObject.quote(e.getMessage()==null?"Не удалось сохранить настройки":e.getMessage())+"}";}}
    @JavascriptInterface public String consumePairing(){String value=pendingPairing;pendingPairing=null;return value==null?"null":value;}
    @JavascriptInterface public void routeChanged(String route){if(routeApplied)initialRoute=safeRoute(route);}
    @JavascriptInterface public String info(){return updater.stateJson();}
    @JavascriptInterface public void checkUpdates(){updater.check();}
    @JavascriptInterface public String installUpdate(){return updater.install();}
    @JavascriptInterface public void openReleases(){openExternal(Updater.REPO+"/releases/latest");}
    @JavascriptInterface public void bootReady(){handler.post(()->{bootReady=true;handler.removeCallbacks(bootWatchdog);});}
    @JavascriptInterface public void exportBackup(String json){pendingBackup=json;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");intent.putExtra(Intent.EXTRA_TITLE,"Mi-Kapital-backup.json");runOnUiThread(()->{try{startActivityForResult(intent,BACKUP);}catch(Exception e){pendingBackup=null;evaluate("window.dispatchEvent(new CustomEvent('mi-kapital-backup',{detail:false}))");Toast.makeText(MainActivity.this,"Не удалось открыть сохранение файла",Toast.LENGTH_SHORT).show();}});}
    @JavascriptInterface public String syncInfo(){return "null";}
    @JavascriptInterface public void scanPairing(){IntentIntegrator integrator=new IntentIntegrator(MainActivity.this);integrator.setPrompt("Наведите камеру на QR сопряжения в настройках ПК");integrator.setBeepEnabled(false);integrator.setOrientationLocked(true);integrator.setRequestCode(PAIR);runOnUiThread(()->{try{integrator.initiateScan();}catch(Exception e){Toast.makeText(MainActivity.this,"Не удалось открыть камеру для сканирования",Toast.LENGTH_SHORT).show();}});}
  }
}
