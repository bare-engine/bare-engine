everything webpack does:

- Inject preload tags for all assets in public/assets/initial/ into the HTML (<img>, <link>, <script> depending on file type) with load tracking attributes

- Prevent reload when saving settingsData.json (inconsitent)

- Add this.scene. or this. before any controllers/handlers from list. eg:
	levelHandler.LoadLevel() -> this.scene.levelHandler.LoadLevel()
	
- Add this.scene.tweenController. before TweenTo()
	TweenTo() -> this.scene.tweenController.TweenTo()
	
- Rewrite bare and events identifiers based on inheritance:
	bare -> this.scene (or this.)
	events -> this.scene.events
	
- Auto-inject AddClass() calls in constructors for used controllers. eg:
	a class uses componentController, add this.AddClass(ComponentController) after super() of Scene added in StartBare(...
	also auto-adds imports detected classes detected
	
- Add .name to GameObject instanciation. eg: 
	this.globalProgresObj = new GlobalProgressUI(uiScene);
	this.globalProgresObj.name ||= "globalProgresObj" // <-

- Preserve Component constructor parameter names during minification — tells Terser to never mangle them so reflection/debugging works

- Generate TypeScript layer enum from settingsData.json layers array → src/generated/layers.ts with CONSTANT_CASE names

- Watch texture pack images directory and auto-run npm run build:assets on changes, with smart reload suppression during builds
	events → this.events or this.scene.events
