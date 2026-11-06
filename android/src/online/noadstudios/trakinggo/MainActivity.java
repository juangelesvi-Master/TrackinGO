package online.noadstudios.trakinggo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * Traking GO para Android: abre el portal en pantalla completa.
 * Para cambiar de servidor solo hay que cambiar PORTAL y volver a compilar.
 */
public class MainActivity extends Activity {

    static final String PORTAL = "https://trackingo.noadstudios.online/";
    static final String HOST = Uri.parse(PORTAL).getHost();

    static final int PICK_FILE = 1;
    static final int SAVE_FILE = 2;

    WebView web;
    ValueCallback<Uri[]> pendingChooser;
    byte[] pendingBytes;

    // Los reportes (Excel y PDF) se arman en la página como "blob". El WebView no sabe
    // descargarlos, así que la página nos los pasa en base64 y los guardamos aquí.
    static final String DOWNLOAD_HOOK =
        "(function(){if(window.__tgHook)return;window.__tgHook=1;" +
        "function send(a){var h=a.href||'';if(!a.download||!(h.indexOf('blob:')==0||h.indexOf('data:')==0))return false;" +
        "fetch(h).then(function(r){return r.blob()}).then(function(b){var f=new FileReader();" +
        "f.onload=function(){TrakingGO.saveFile(String(f.result),a.download,b.type||'application/octet-stream')};f.readAsDataURL(b)});return true}" +
        "var P=HTMLAnchorElement.prototype,c=P.click,d=P.dispatchEvent;" +
        "P.click=function(){if(!send(this))return c.apply(this,arguments)};" +
        "P.dispatchEvent=function(e){if(e&&e.type=='click'&&send(this))return true;return d.apply(this,arguments)};" +
        "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[download]');if(a&&send(a))e.preventDefault()},true)})()";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(0xFF0F62FE);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " TrakingGOApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "TrakingGO");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String disposition, String mime, long length) {
                if (url.startsWith("http")) openOutside(Uri.parse(url));
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(PORTAL);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No hay una app para abrir este enlace.", Toast.LENGTH_SHORT).show();
        }
    }

    class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            // Las páginas del portal se quedan en la app; lo demás (mapas, WhatsApp, correo) se abre afuera.
            if (HOST.equals(uri.getHost())) return false;
            openOutside(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            view.evaluateJavascript(DOWNLOAD_HOOK, null);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            view.evaluateJavascript(DOWNLOAD_HOOK, null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            // Sin internet o el servidor no contesta.
            if (req.isForMainFrame()) showOffline(view);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse res) {
            // Servidor apagado: Cloudflare contesta con un error 5xx.
            if (req.isForMainFrame() && res.getStatusCode() >= 500) showOffline(view);
        }
    }

    /** Página "Server offline": se reintenta sola cada 30 segundos. */
    void showOffline(WebView view) {
        String html = "<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
            "<body style='margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;" +
            "background:linear-gradient(160deg,#0f62fe,#0a3fa8);color:#fff;font-family:sans-serif;text-align:center'><div style='max-width:380px'>" +
            "<div style='width:84px;height:84px;margin:0 auto 20px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center'>" +
            "<svg viewBox='0 0 24 24' width='44' height='44'><path fill='#fff' d='M4 4h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 10h9.5a6 6 0 0 0 0 6H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zm2-7.5a1 1 0 1 0 0 1 1 1 0 0 0 0-1zM18 13a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1.4 1.9-.7.7 1.4 1.4-1.4 1.4.7.7 1.4-1.4 1.4 1.4.7-.7-1.4-1.4 1.4-1.4-.7-.7-1.4 1.4z'/></svg></div>" +
            "<h1 id='t' style='margin:0 0 10px;font-size:30px'>Server offline</h1>" +
            "<p id='m' style='line-height:1.5'>Estamos trabajando para restablecer el servicio. Pronto estará disponible de nuevo.</p>" +
            "<p>Gracias por tu paciencia.</p>" +
            "<button onclick=\"location.href='" + PORTAL + "'\" style='margin-top:22px;padding:13px 32px;border:0;border-radius:10px;" +
            "background:#fff;color:#0f62fe;font-size:16px;font-weight:bold'>Reintentar</button>" +
            "<p style='font-size:13px;opacity:.75;margin-top:18px'>Revisando cada 30 segundos…</p></div>" +
            "<script>if(navigator.onLine===false){document.getElementById('t').textContent='Sin internet';" +
            "document.getElementById('m').textContent='Tu celular no tiene conexión. Revisa tu internet.'}" +
            "setTimeout(function(){location.href='" + PORTAL + "'},30000)</script></body></html>";
        view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    class Chrome extends WebChromeClient {
        // Subir archivos desde la página (por ejemplo, el logo de una empresa).
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingChooser != null) pendingChooser.onReceiveValue(null);
            pendingChooser = callback;
            try {
                startActivityForResult(params.createIntent(), PICK_FILE);
            } catch (ActivityNotFoundException e) {
                pendingChooser = null;
                return false;
            }
            return true;
        }
    }

    class Bridge {
        @JavascriptInterface
        public void saveFile(String dataUrl, final String name, final String mime) {
            int comma = dataUrl.indexOf(',');
            pendingBytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    // Le preguntamos a la persona dónde guardarlo (Descargas, Drive, etc.).
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, SAVE_FILE);
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "No se pudo guardar el archivo.", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK_FILE) {
            if (pendingChooser != null) pendingChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingChooser = null;
        } else if (request == SAVE_FILE) {
            byte[] bytes = pendingBytes;
            pendingBytes = null;
            if (result != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(bytes);
                Toast.makeText(this, "Archivo guardado.", Toast.LENGTH_SHORT).show();
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(data.getData(), getContentResolver().getType(data.getData()));
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivity(view);
                } catch (ActivityNotFoundException ignored) {
                    // Sin visor instalado: el archivo ya quedó guardado.
                }
            } catch (Exception e) {
                Toast.makeText(this, "No se pudo guardar el archivo.", Toast.LENGTH_SHORT).show();
            }
        } else {
            super.onActivityResult(request, result, data);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
