package app.bside;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.bside.discovery.DiscoveryPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The Discovery plugin lives in this module rather than an npm package, so it
        // is registered here instead of through capacitor.plugins.json.
        registerPlugin(DiscoveryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
