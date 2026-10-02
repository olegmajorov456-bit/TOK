package ru.tok.ispu;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
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

    private WebView webView;
    private SwipeRefreshLayout refreshLayout;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(0xFF08090D);
        window.setNavigationBarColor(0xFF08090D);

        webView = new WebView(this);
        setContentView(webView);

        configureWebView();
        configureBackNavigation();

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
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
        settings.setUserAgentString(
                settings.getUserAgentString() + " TOK-Android/1.1"
        );

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);\n        webView.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {\n            refreshLayout.setEnabled(scrollY == 0);\n        });

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
