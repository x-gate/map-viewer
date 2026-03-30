import { setEngine } from "./app/getEngine";
import { AssetPickerScreen } from "./app/screens/AssetPickerScreen";
import { userSettings } from "./app/utils/userSettings";
import { CreationEngine } from "./engine/engine";

/**
 * Importing these modules will automatically register there plugins with the engine.
 */
import "@pixi/sound";
// import "@esotericsoftware/spine-pixi-v8";
import "./crossgate";

// Create a new creation engine instance
const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "#1E1E1E",
    resizeOptions: { minWidth: 768, minHeight: 1024, letterbox: false },
  });

  userSettings.init();

  // Show the asset picker — user provides their own CrossGate files
  await engine.navigation.showScreen(AssetPickerScreen);
})();
