(function () {
    const { metro, plugin } = vendetta;
    const { findByProps, findByStoreName } = metro;
    const { FluxDispatcher } = metro.common;
    const storage = plugin.storage;

    // Default requested gain. Change it in the plugin settings.
    if (typeof storage.gainDb !== "number") storage.gainDb = 100;

    let originalVolume = null;

    // Discord's mic "input volume" is a percentage (100 = unity gain).
    // gain(dB) -> percent = 100 * 10^(dB/20)
    const dbToVolume = db => 100 * Math.pow(10, db / 20);

    function setInputVolume(volume) {
        // Only touches YOUR microphone input level. Output volume and
        // per-user volumes are never modified.
        try {
            const actions = findByProps("setInputVolume");
            if (actions && typeof actions.setInputVolume === "function") {
                actions.setInputVolume(volume);
                return true;
            }
        } catch (e) {}
        try {
            FluxDispatcher.dispatch({ type: "AUDIO_SET_INPUT_VOLUME", volume });
            return true;
        } catch (e) {}
        return false;
    }

    function apply() {
        try {
            if (originalVolume === null) {
                const store = findByStoreName("MediaEngineStore");
                const current = store && store.getInputVolume && store.getInputVolume();
                originalVolume = typeof current === "number" ? current : 100;
            }
            setInputVolume(dbToVolume(Number(storage.gainDb) || 0));
        } catch (e) {
            console.error("[MicBoost] apply failed", e);
        }
    }

    // The engine can reset its volume when a voice connection is (re)established.
    function onRtc(e) {
        if (e && e.state === "RTC_CONNECTED") setTimeout(apply, 500);
    }

    function Settings() {
        const React = metro.common.React;
        const Forms = vendetta.ui && vendetta.ui.components && vendetta.ui.components.Forms;
        const [text, setText] = React.useState(String(storage.gainDb));
        if (!Forms || !Forms.FormInput) return null;
        return React.createElement(
            React.Fragment,
            null,
            React.createElement(Forms.FormInput, {
                title: "Mic gain (dB)",
                value: text,
                keyboardType: "numeric",
                onChange: v => {
                    setText(v);
                    const n = parseFloat(v);
                    if (!Number.isNaN(n)) {
                        storage.gainDb = n;
                        apply();
                    }
                }
            }),
            React.createElement(
                Forms.FormText,
                { style: { padding: 16 } },
                "Boosts only your own microphone input. 6 dB is about 2x, 20 dB is 10x. Very high values clip into noise."
            )
        );
    }

    return {
        onLoad() {
            apply();
            FluxDispatcher.subscribe("RTC_CONNECTION_STATE", onRtc);
        },
        onUnload() {
            FluxDispatcher.unsubscribe("RTC_CONNECTION_STATE", onRtc);
            if (originalVolume !== null) setInputVolume(originalVolume);
            originalVolume = null;
        },
        settings: Settings
    };
})()
