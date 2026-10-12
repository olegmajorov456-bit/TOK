package ru.tok.ispu;

import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
import android.content.pm.PackageManager;
import android.view.Window;
import android.widget.FrameLayout;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
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
    private static final long UPDATE_PROMPT_COOLDOWN_MS = 24L * 60L * 60L * 1000L;
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);

        // Apply Android system-bar insets to a native container, not directly to
        // WebView. This keeps the HTML viewport below the status bar and above
        // the gesture/navigation area on Android 15+ edge-to-edge devices.
        FrameLayout appRoot = new FrameLayout(this);
        appRoot.setBackgroundColor(0xFF08090D);
        webView = new WebView(this);
        webView.setBackgroundColor(0xFF08090D);
        appRoot.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(appRoot);

        ViewCompat.setOnApplyWindowInsetsListener(appRoot, (view, insets) -> {
            int types = WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout();
            Insets bars = insets.getInsets(types);
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(types, Insets.NONE)
                    .build();
        });
        ViewCompat.requestApplyInsets(appRoot);

        configureWebView();
        createNotificationChannel();
        requestNotificationPermissionIfNeeded();
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
                String targetVersion = tag.startsWith("android-v") ? tag.substring("android-v".length()) : tag;
                String dismissedTag = getSharedPreferences("tok_update_preferences", MODE_PRIVATE)
                        .getString("dismissed_release_tag", "");
                if (!apkUrl.isEmpty() && compareVersions(targetVersion, installedVersion) > 0 && !tag.equals(dismissedTag)) {
                    String finalApkUrl = apkUrl;
                    String finalTag = tag;
                    runOnUiThread(() -> showUpdateDialog(finalTag, finalApkUrl));
                }
            } catch (Exception ignored) { }
            finally { if (connection != null) connection.disconnect(); }
        }).start();
    }


    private int compareVersions(String candidate, String installed) {
        String[] left = candidate.replaceAll("[^0-9.]", "").split("\\.");
        String[] right = installed.replaceAll("[^0-9.]", "").split("\\.");
        int length = Math.max(left.length, right.length);
        for (int i = 0; i < length; i++) {
            int a = 0;
            int b = 0;
            try { if (i < left.length && !left[i].isEmpty()) a = Integer.parseInt(left[i]); } catch (NumberFormatException ignored) { }
            try { if (i < right.length && !right[i].isEmpty()) b = Integer.parseInt(right[i]); } catch (NumberFormatException ignored) { }
            if (a != b) return Integer.compare(a, b);
        }
        return 0;
    }

    private void showUpdateDialog(String tag, String apkUrl) {
        if (isFinishing() || isDestroyed()) return;

        // A failed/cancelled installer must not spam the same prompt on every launch.
        // A newer release tag remains eligible immediately; successful updates are
        // also filtered by compareVersions() before reaching this method.
        android.content.SharedPreferences preferences =
                getSharedPreferences("tok_update_preferences", MODE_PRIVATE);
        long now = System.currentTimeMillis();
        String lastPromptedTag = preferences.getString("last_prompted_release_tag", "");
        long lastPromptedAt = preferences.getLong("last_prompted_release_at", 0L);
        if (tag.equals(lastPromptedTag) && now - lastPromptedAt < UPDATE_PROMPT_COOLDOWN_MS) return;

        preferences.edit()
                .putString("last_prompted_release_tag", tag)
                .putLong("last_prompted_release_at", now)
                .apply();

        new AlertDialog.Builder(this).setTitle("Доступно обновление ТОК")
            .setMessage("Найдена новая версия " + tag.replace("android-v", "") + ". Обновить приложение сейчас? Удалять текущую версию не нужно.")
            .setNegativeButton("Позже", (dialog, which) ->
                    preferences.edit().putString("dismissed_release_tag", tag).apply())
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

    private static final String TOK_NOTIFICATION_CHANNEL = "tok_activity";

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    TOK_NOTIFICATION_CHANNEL, "Уведомления ТОК", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Новые сообщения и симпатии в ТОК");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 2207);
        }
    }

    private static class TokNotificationBridge {
        private final MainActivity activity;
        TokNotificationBridge(MainActivity activity) { this.activity = activity; }

        @JavascriptInterface
        public void showNotification(String title, String body) {
            activity.runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33
                        && activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
                Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? new Notification.Builder(activity, TOK_NOTIFICATION_CHANNEL)
                        : new Notification.Builder(activity);
                builder.setSmallIcon(ru.tok.ispu.R.drawable.ic_tok_heart)
                        .setContentTitle(title == null || title.isEmpty() ? "ТОК" : title.substring(0, Math.min(title.length(), 80)))
                        .setContentText(body == null ? "" : body.substring(0, Math.min(body.length(), 180)))
                        .setAutoCancel(true)
                        .setCategory(Notification.CATEGORY_MESSAGE)
                        .setPriority(Notification.PRIORITY_HIGH);
                NotificationManager manager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
            });
        }
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
        String appVersion = "0";
        try {
            appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) { }
        settings.setUserAgentString(settings.getUserAgentString() + " TOK-Android/" + appVersion);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new TokNotificationBridge(this), "TOKNative");

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
                view.evaluateJavascript("(function(){"
                        + "if(window.__tokKeyboardFix)return;"
                        + "window.__tokKeyboardFix=true;"
                        + "var root=document.documentElement;"
                        + "var initialHeight=Math.max(window.innerHeight||0,root.clientHeight||0);"
                        + "var inputSelector='input,textarea,select,[contenteditable=true]';"
                        + "function sync(){"
                        + "var vv=window.visualViewport;"
                        + "var layoutHeight=window.innerHeight||root.clientHeight;"
                        + "var visibleHeight=vv?vv.height:layoutHeight;"
                        + "var offsetTop=vv?(vv.offsetTop||0):0;"
                        + "var overlap=Math.max(0,layoutHeight-visibleHeight-offsetTop);"
                        + "var heightLoss=Math.max(0,initialHeight-layoutHeight);"
                        + "var visualLoss=Math.max(0,initialHeight-visibleHeight);"
                        + "var active=document.activeElement;"
                        + "var focused=!!(active&&active.matches&&active.matches(inputSelector));"
                        + "var keyboardOpen=focused&&(overlap>100||heightLoss>120||visualLoss>120);"
                        + "root.classList.toggle('tok-keyboard-open',keyboardOpen);"
                        + "root.style.setProperty('--tok-keyboard-overlap',keyboardOpen?overlap+'px':'0px');"
                        + "root.style.setProperty('--tok-visual-viewport-height',(visibleHeight||layoutHeight)+'px');"
                        + "}"
                        + "if(window.visualViewport){"
                        + "window.visualViewport.addEventListener('resize',sync);"
                        + "window.visualViewport.addEventListener('scroll',sync);"
                        + "}"
                        + "window.addEventListener('resize',sync);"
                        + "document.addEventListener('focusin',function(e){"
                        + "if(e.target&&e.target.matches&&e.target.matches(inputSelector)){"
                        + "setTimeout(sync,50);setTimeout(sync,180);setTimeout(sync,350);setTimeout(sync,600);"
                        + "}"
                        + "});"
                        + "document.addEventListener('focusout',function(){setTimeout(sync,120);setTimeout(sync,280);});"
                        + "sync();"
                        + "})();", null);
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
