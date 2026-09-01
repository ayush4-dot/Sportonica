package com.sportonica.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A real app's layout doesn't pinch-zoom/pan like a webpage. The web
        // layer already locks this via a native-only viewport meta tag
        // (CapacitorBridge.tsx); disable it here too at the WebView level
        // so it holds regardless of how the page's meta tag is applied.
        this.bridge.getWebView().getSettings().setBuiltInZoomControls(false);
        this.bridge.getWebView().getSettings().setSupportZoom(false);
        this.bridge.getWebView().getSettings().setDisplayZoomControls(false);
    }
}
