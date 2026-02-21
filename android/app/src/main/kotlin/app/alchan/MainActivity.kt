package app.alchan

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout

    // Firebase Hosting URL - 웹앱 배포하면 자동으로 최신 버전 로드
    private val APP_URL = "https://inconomysu-class.web.app"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 상태바를 투명하게 (엣지-투-엣지)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0a0a12")
        window.navigationBarColor = Color.parseColor("#0a0a12")

        // SwipeRefresh + WebView 레이아웃
        swipeRefresh = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(Color.parseColor("#6366f1"))
            setProgressBackgroundColorSchemeColor(Color.parseColor("#1e1e3a"))
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0a0a12"))
        }

        swipeRefresh.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        setContentView(swipeRefresh)

        // SwipeRefresh → 웹페이지 새로고침
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        setupWebView()

        // 상태 복원 또는 초기 로드
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(APP_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(false)
            displayZoomControls = false
            builtInZoomControls = false
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = false
            // 알찬 앱임을 식별 (웹앱에서 감지 가능)
            userAgentString = "${userAgentString} AlchanApp/1.0 Android"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                swipeRefresh.isRefreshing = false
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                return when {
                    // 앱 도메인은 WebView에서 처리
                    url.startsWith("https://inconomysu-class.web.app") ||
                    url.startsWith("https://inconomysu-class.firebaseapp.com") -> false
                    // tel:, mailto: 등 처리
                    url.startsWith("tel:") || url.startsWith("mailto:") -> {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    }
                    // 그 외 외부 URL → 브라우저
                    else -> {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    }
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    // 오프라인 페이지 로드
                    view.loadUrl("file:///android_asset/offline.html")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // 카메라 권한 자동 허용 (QR 코드 스캔 등)
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }
}
