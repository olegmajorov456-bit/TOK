package ru.tok.ispu;

import android.app.DownloadManager;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {
    private static final String START_URL = "https://tok-ispu.pages.dev/";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String RELEASE_API = "https://api.github.com/repos/olegmajorov456-bit/TOK/releases/latest";
    private static final String APK_ASSET_NAME = "TOK-Android.apk";
    private long updateDownloadId = -1L;
    private BroadcastReceiver updateReceiver;

    private WebView webView;
    private SwipeRefreshLayout refreshLayout;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(0xFF08090D);
        window.setNavigationBarColor(0xFF08090D);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);

        webView = new WebView(this);
        setContentView(webView);

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(types);
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(types, Insets.NONE)
                    .build();
        });
        ViewCompat.requestApplyInsets(webView);

        configureWebView();
        configureBackNavigation();

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
        new Handler(Looper.getMainLooper()).postDelayed(this::checkForUpdates, 2200);
    }


    private void checkForUpdates() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(RELEASE_API).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "TOK-Android");
                if (connection.getResponseCode() != 200) return;
                InputStream stream = connection.getInputStream();
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int count;
                while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
                stream.close();
                byte[] bytes = output.toByteArray();
                JSONObject release = new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                String tag = release.optString("tag_name", "");
                String apkUrl = "";
                org.json.JSONArray assets = release.optJSONArray("assets");
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.getJSONObject(i);
                        if (APK_ASSET_NAME.equals(asset.optString("name"))) { apkUrl = asset.optString("browser_download_url", ""); break; }
                    }
                }
                String installedVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                if (!apkUrl.isEmpty() && !tag.equals("android-v" + installedVersion)) {
                    String finalApkUrl = apkUrl; String finalTag = tag;
                    runOnUiThread(() -> showUpdateDialog(finalTag, finalApkUrl));
                }
            } catch (Exception ignored) { }
            finally { if (connection != null) connection.disconnect(); }
        }).start();
    }

    private void showUpdateDialog(String tag, String apkUrl) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this).setTitle("Доступно обновление ТОК")
            .setMessage("Найдена новая версия " + tag.replace("android-v", "") + ". Обновить приложение сейчас? Удалять текущую версию не нужно.")
            .setNegativeButton("Позже", (dialog, which) -> { })
            .setPositiveButton("Обновить", (dialog, which) -> downloadUpdate(apkUrl, tag)).show();
    }

    private void downloadUpdate(String apkUrl, String tag) {
        try {
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("Обновление ТОК"); request.setDescription("Скачивание " + tag);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true); request.setAllowedOverRoaming(true);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "TOK-update.apk");
            updateDownloadId = manager.enqueue(request);
            updateReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != updateDownloadId) return;
                    try { unregisterReceiver(this); } catch (Exception ignored) { }
                    updateReceiver = null;
                    try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(updateDownloadId))) {
                        if (cursor != null && cursor.moveToFirst() && cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL) {
                            installUpdate(new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "TOK-update.apk"));
                        } else showUpdateError("Не удалось скачать обновление. Попробуй ещё раз.");
                    } catch (Exception e) { showUpdateError("Не удалось проверить скачанный файл."); }
                }
            };
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(updateReceiver, filter);
            new AlertDialog.Builder(this).setTitle("Скачиваем обновление").setMessage("APK скачивается в фоне. Когда загрузка завершится, Android предложит установить его.").setPositiveButton("Понятно", null).show();
        } catch (Exception e) { showUpdateError("Не удалось начать загрузку обновления."); }
    }

    private void installUpdate(File apk) {
        try {
            if (!apk.exists() || apk.length() < 100000) { showUpdateError("Файл обновления повреждён. Попробуй скачать его заново."); return; }
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                new AlertDialog.Builder(this).setTitle("Разреши установку обновлений")
                    .setMessage("Android нужно разрешить установку обновлений ТОК из этого источника. После разрешения вернись в приложение и запусти проверку ещё раз.")
                    .setNegativeButton("Отмена", null)
                    .setPositiveButton("Настройки", (dialog, which) -> startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())))).show();
                return;
            }
            startActivity(intent);
        } catch (Exception e) { showUpdateError("Не удалось открыть установщик Android."); }
    }

    private void showUpdateError(String message) {
        runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) new AlertDialog.Builder(this).setTitle("Обновление ТОК").setMessage(message).setPositiveButton("ОК", null).show(); });
    }
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(
                settings.getUserAgentString() + " TOK-Android/1.5"
        );

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view,
                    WebResourceRequest request
            ) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();

                if ("http".equalsIgnoreCase(scheme)
                        || "https".equalsIgnoreCase(scheme)) {
                    String url = uri.toString();
                    if (url.toLowerCase().contains(".apk")) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        } catch (Exception ignored) {
                        }
                        return true;
                    }
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No compatible external application.
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("(function(){if(window.__tokKeyboardFix)return;window.__tokKeyboardFix=true;var root=document.documentElement;var initialViewportHeight=window.visualViewport?window.visualViewport.height:window.innerHeight;function sync(){var vv=window.visualViewport;var h=vv?Math.max(0,initialViewportHeight-vv.height):0;root.classList.toggle('tok-keyboard-open',h>120);root.style.setProperty('--tok-keyboard-height',h+'px');}if(window.visualViewport){window.visualViewport.addEventListener('resize',sync);window.visualViewport.addEventListener('scroll',sync);}window.addEventListener('resize',sync);document.addEventListener('focusin',function(e){if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){setTimeout(sync,100);setTimeout(sync,350);}});document.addEventListener('focusout',function(){setTimeout(sync,150);});sync();})();", null);
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    view.loadDataWithBaseURL(
                            START_URL,
                            "<html><body style='background:#08090d;color:#fff;font-family:sans-serif;text-align:center;padding:60px 24px'>"
                                    + "<h2 style='color:#e83c6d'>Нет соединения</h2>"
                                    + "<p>Проверь интернет и попробуй открыть ТОК ещё раз.</p>"
                                    + "<button onclick='location.reload()' style='background:#e83c6d;color:white;border:0;border-radius:14px;padding:14px 22px;font-size:16px'>Повторить</button>"
                                    + "</body></html>",
                            "text/html",
                            "UTF-8",
                            null
                    );
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (uploadCallback != null) {
                    uploadCallback.onReceiveValue(null);
                }

                uploadCallback = callback;

                try {
                    Intent chooserIntent = params.createIntent();
                    chooserIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    chooserIntent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    uploadCallback = null;
                    return false;
                }
            }
        });
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            finish();
                        }
                    }
                }
        );
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != FILE_CHOOSER_REQUEST || uploadCallback == null) {
            return;
        }

        Uri[] result = null;

        if (resultCode == RESULT_OK && data != null) {
            if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            } else if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];

                for (int i = 0; i < count; i++) {
                    result[i] = data.getClipData().getItemAt(i).getUri();
                }
            }
        }

        uploadCallback.onReceiveValue(result);
        uploadCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (uploadCallback != null) {
            uploadCallback.onReceiveValue(null);
            uploadCallback = null;
        }

        if (updateReceiver != null) { try { unregisterReceiver(updateReceiver); } catch (Exception ignored) { } updateReceiver = null; }
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }
}
