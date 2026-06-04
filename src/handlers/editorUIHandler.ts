import { Entity, LayerInfo, SettingsData, BareEvent, SaveData, Category } from '../types/bareTypes';
import { assetsHandler } from "./assetsHandler";
import { FlashShader } from "../shaders/flashShader";
import { TweenTo } from "../controllers/tweenController";
import { EditorScene } from '../scenes/editorScene';
import { objectController } from '../controllers/objectController';
import { Color, RenderTexture, Texture, TextureFilterMode } from '../libraries/new-rapid-render';
import { MakePath, MakePathForEntity } from '../globals';
import { SaveDataHandler } from './SaveDataHandler';

/*
    BUILD SETUP/CONTROLS UI
    Handles editor UI setup, sidebar population, and UI interactions
*/

export class EditorUIHandler {
    static lastLoadedSettingsData:SettingsData;
    private static readonly textureFrameUrlCache = new Map<string, string>();
    private static readonly textureFrameLoadCache = new Map<string, Promise<string>>();
    private static readonly imageLoadCache = new Map<string, Promise<HTMLImageElement>>();

    private abortController: AbortController = new AbortController();
    private isMinimized: boolean = false;
    private lastMinimize: number = 0;
    public scene: EditorScene;

    private data: SettingsData;
    private gridToggleEl: HTMLElement | null = null;
    private gridSizeInputEl: HTMLInputElement | null = null;
    private gridModalEl: HTMLElement | null = null;
    private readonly showIcon = '👁️';
    private readonly hideIcon = '❌';

    get settings() { return this.scene.settingsData.settings; };

    constructor(scene: EditorScene) {
        this.scene = scene;
    }

    private ApplyTextureBackgroundStyle(element: HTMLElement, texture: Texture): void {
        element.style.backgroundSize = 'contain';
        element.style.backgroundRepeat = 'no-repeat';
        element.style.backgroundPosition = 'center';
        element.style.imageRendering = rapid.textureFilter === TextureFilterMode.LINEAR ? 'auto' : 'pixelated';
    }

    private GetTextureFrameCacheKey(texture: Texture): string | null {
        const base = texture.base;
        const frame = texture.frame;
        if (!base?.uid || !frame) return null;

        return `${base.uid}|${base.width}x${base.height}|${frame.x},${frame.y},${frame.w},${frame.h}`;
    }

    private LoadCachedImage(src: string): Promise<HTMLImageElement> {
        let imageLoad = EditorUIHandler.imageLoadCache.get(src);
        if (imageLoad)
            return imageLoad;

        imageLoad = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                EditorUIHandler.imageLoadCache.delete(src);
                reject(new Error(`Failed to load editor texture image: ${src}`));
            };
            img.src = src;
        });

        EditorUIHandler.imageLoadCache.set(src, imageLoad);
        return imageLoad;
    }

    private LoadTextureFrameBackground(texture: Texture): Promise<string> {
        const cacheKey = this.GetTextureFrameCacheKey(texture);
        const base = texture.base;
        const frame = texture.frame;

        if (!cacheKey || !base?.uid || !frame)
            return Promise.resolve('');

        const cachedUrl = EditorUIHandler.textureFrameUrlCache.get(cacheKey);
        if (cachedUrl)
            return Promise.resolve(cachedUrl);

        let frameLoad = EditorUIHandler.textureFrameLoadCache.get(cacheKey);
        if (frameLoad)
            return frameLoad;

        frameLoad = this.LoadCachedImage(base.uid)
            .then((img) => {
                const canvas = document.createElement('canvas');
                canvas.width = frame.w;
                canvas.height = frame.h;

                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);

                const frameUrl = canvas.toDataURL();
                EditorUIHandler.textureFrameUrlCache.set(cacheKey, frameUrl);
                EditorUIHandler.textureFrameLoadCache.delete(cacheKey);
                return frameUrl;
            })
            .catch((error) => {
                EditorUIHandler.textureFrameLoadCache.delete(cacheKey);
                throw error;
            });

        EditorUIHandler.textureFrameLoadCache.set(cacheKey, frameLoad);
        return frameLoad;
    }

    private SetTextureBackground(element: HTMLElement, texture: Texture): void {
        const base = texture.base;
        if (!base?.uid) return;

        this.ApplyTextureBackgroundStyle(element, texture);

        if (!texture.frame) {
            element.style.backgroundImage = `url(${base.uid})`;
            return;
        }

        element.style.backgroundImage = '';

        this.LoadTextureFrameBackground(texture)
            .then((frameUrl) => {
                if (!frameUrl) return;

                element.style.backgroundImage = `url(${frameUrl})`;
                this.ApplyTextureBackgroundStyle(element, texture);
            })
            .catch((error) => console.error(error));
    }

    async LoadEditorPage(): Promise<void> {
        const overlay = document.getElementById('editor-overlay') as HTMLElement;
        const container = document.getElementById('editor-content') as HTMLElement;

        if (!overlay || !container) {
            console.error('Editor overlay or content container not found');
            return;
        }

        try {
            const res: Response = await fetch('editor.html');
            const html: string = await res.text();

            const temp: HTMLDivElement = document.createElement('div');
            temp.innerHTML = html;

            while (temp.firstChild) {
                const child = temp.firstChild as HTMLElement;
                if (child.tagName === 'SCRIPT') {
                    const script: HTMLScriptElement = document.createElement('script');
                    const scriptElement = child as HTMLScriptElement;
                    if (scriptElement.src) {
                        script.src = scriptElement.src;
                    } else {
                        script.textContent = scriptElement.textContent;
                    }
                    document.body.appendChild(script);
                    temp.removeChild(child);
                } else {
                    container.appendChild(child);
                }
            }

        } catch (error) {
            console.error('Failed to load editor:', error);
        }
    }

    PopulateWithData(data: SettingsData): void
    {
        this.data = data;
        
        // COMMENT OUT, SINCE THE return KEEPS childEntity.onpointerdown ON THE PREVIOUS this.scene
        /*if (EditorUIHandler.lastLoadedSettingsData)
        if (data.name == EditorUIHandler.lastLoadedSettingsData.name)
            return;
        EditorUIHandler.lastLoadedSettingsData = data;*/

        this.PopulateSidebar(data);
        this.PopulateLayers(data);
        this.SyncSettingsUI();
    }

    PopulateSidebar(data: SettingsData): void {
        const sidebarContent = document.querySelector('.sidebar-content') as HTMLElement;
        if (!sidebarContent) {
            console.error('Sidebar content not found');
            return;
        }

        // Clear existing content
        sidebarContent.innerHTML = '';

        var categoriesFinal: Record<string, Category>  = {};
        var allEntityNames = Object.keys(data.entities);

        for (const [categoryName, categoryData] of Object.entries(data.categories))
        {
            categoriesFinal[categoryName] = categoryData;

            if (categoryData.entries)
            {
                for (const entityName of categoryData.entries)
                {
                    var i = allEntityNames.indexOf(entityName);
                    if (i != -1)
                        allEntityNames.splice(i, 1);
                }
            }
        }

        // IF ANY ENTRIES LEFT, ADD THEM TO UNCATEGORIZED
        if (allEntityNames.length > 0)
            categoriesFinal["uncategorized"] = {...data.categories.uncategorized, entries: allEntityNames};

        // Process each category
        var categoriesEntries = Object.entries(categoriesFinal)
        for (const [categoryName, categoryData] of categoriesEntries)
        {
            if (!categoryData || !categoryData.entries || categoryData.entries.length === 0) return;

            // Create category container
            const categoryElement = document.createElement('div');
            categoryElement.className = 'entity-item';
            categoryElement.onclick = () => this.ToggleEntity(categoryElement);

            // Create category header
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'entity-header';
            
            const categoryIcon = document.createElement('div');
            categoryIcon.className = 'entity-image';
            
            // Get category image from loaded texture or fallback to path
            const texture = assetsHandler.HasTexture(categoryData.image)
                ? assetsHandler.GetTexture(categoryData.image)
                : null;
            if (texture?.base?.uid) {
                this.SetTextureBackground(categoryIcon, texture);
            } else {
                if (categoryData.image)
                {
                    const categoryImagePath = this.GetCategoryImagePath(categoryData.image);
                    if (categoryImagePath) {
                        const img = document.createElement('img');
                        img.src = categoryImagePath;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'contain';
                        categoryIcon.appendChild(img);
                    } else {
                        categoryIcon.textContent = '📦'; // Fallback icon
                    }
                }
                else
                {
                    categoryIcon.style.display = 'none';
                }
            }
            
            const categoryTitle = document.createElement('span');
            categoryTitle.textContent = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

            if (categoryIcon.style.display == 'none')
            {
                categoryTitle.style.padding = '10px';
            }
            
            const expandArrow = document.createElement('span');
            expandArrow.className = 'expand-arrow';
            expandArrow.textContent = '▶';

            categoryHeader.appendChild(categoryIcon);
            categoryHeader.appendChild(categoryTitle);
            categoryHeader.appendChild(expandArrow);
            
            // Create children container
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'entity-children';

            // Add entities for this category
            if (Array.isArray(categoryData.entries)) 
            {
                categoryData.entries.forEach(entityId => {
                    const entity = this.scene.ConstructEntity(entityId);
                    if (entity) {
                        const childEntity = document.createElement('div');
                        childEntity.className = 'child-entity';
                        childEntity.onpointerdown = (e) => {
                            this.scene.SelectEntity(entity, childEntity);
                            this.scene.editorControlsHandler.SetCurrentPreviewEntity(entity);
                        };
                        childEntity.onclick = (e) => {
                            e.stopPropagation();
                        };
                        
                        // Get entity image from loaded texture or fallback to path
                        const texKey = MakePathForEntity(entity);
                        const entityTex = assetsHandler.HasTexture(texKey) ? assetsHandler.GetTexture(texKey) : null;

                        if (entityTex?.base?.uid) {
                            childEntity.id = entityId;
                            childEntity.style.borderRadius = '3px';
                            this.SetTextureBackground(childEntity, entityTex);
                        } else {
                            const entityImagePath = this.GetEntityImagePath(entity);
                            if (entityImagePath && entityImagePath !== 'images/whitePixel.webp') {
                                const img = document.createElement('img');
                                img.src = entityImagePath;
                                img.id = entityId;
                                img.style.width = '100%';
                                img.style.height = '100%';
                                img.style.objectFit = 'contain';
                                img.style.borderRadius = '3px';
                                childEntity.appendChild(img);
                            } else {
                                if (!window.textureNotFoundString)
                                {
                                    var rt = new RenderTexture(rapid, { width: 128, height: 128, clearColor: Color.fromHex("#fc0000") });
                                    //var rt = new RenderTexture(128, 128, true, Color.fromHex("#fc0000")); // Fallback tex
                                    const pixels = rt.GetPixels();
                                    const canvas = document.createElement('canvas');
                                    canvas.width = 128;
                                    canvas.height = 128;
                                    const ctx = canvas.getContext('2d')!;
                                    const imageData = new ImageData(new Uint8ClampedArray(pixels), 128, 128);
                                    ctx.putImageData(imageData, 0, 0);
                                    var img = canvas.toDataURL();
                                    window.textureNotFoundString = img;
                                }

                                childEntity.style.backgroundImage = `url(${window.textureNotFoundString})`;
                                childEntity.style.backgroundSize = 'contain';
                                childEntity.style.backgroundRepeat = 'no-repeat';
                                childEntity.style.backgroundPosition = 'center';
                            }
                        }

                        if (categoryData.showLabels)
                        {
                            const childEntityItem = document.createElement('div');
                            childEntityItem.className = 'child-entity-item';

                            const categoryLabel = document.createElement('div');
                            categoryLabel.className = 'category-label';
                            const labelText = entity.name ?? entityId;
                            categoryLabel.textContent = labelText;

                            childEntityItem.appendChild(childEntity);
                            childEntityItem.appendChild(categoryLabel);
                            childrenContainer.appendChild(childEntityItem);
                        }
                        else
                        {
                            childrenContainer.appendChild(childEntity);
                        }
                    }
                });
            }
            else
            if (typeof categoryData.entries === 'string') 
            {
                // COMMENTED OUT TILESHEET CODE FOR NOW - CAN GET BACK TO LATER - TODO
                /*const entity = this.scene.GetTilesheetEntity(categoryData.entries);
                const entityImagePath = this.GetEntityImagePath(entity)!;

                var tilesheetImg = document.createElement('img');
                tilesheetImg.src = entityImagePath;

                tilesheetImg.onload = () => {
                    var numberOfTiles = entity.numberOfTiles!;

                    var tilesheetWidth = tilesheetImg.naturalWidth;
                    var tilesheetHeight = tilesheetImg.naturalHeight;
                    const totalArea = tilesheetWidth * tilesheetHeight;
                    const areaPerTile = totalArea / numberOfTiles;
                    var tileSize = Math.sqrt(areaPerTile);
                    
                    const tilesPerRow = tilesheetWidth / tileSize;

                    const parentWidth = 40;
                    const parentHeight = 40;
                    const scaleX = parentWidth / tileSize;
                    const scaleY = parentHeight / tileSize;
                    const scale = Math.min(scaleX, scaleY);

                    for (var i = 0; i < numberOfTiles; i++)
                    {
                        // Calculate tile position in grid
                        const tileX = i % tilesPerRow;
                        const tileY = Math.floor(i / tilesPerRow);
                        
                        // Calculate pixel positions
                        const pixelX = tileX * tileSize;
                        const pixelY = tileY * tileSize;
                        
                        const childEntity = document.createElement('div');
                        childEntity.className = 'child-entity';
                        childEntity.onpointerdown = (e) => {
                            this.scene.SelectEntity(entity, childEntity);
                        };
                        childEntity.onclick = (e) => {
                            e.stopPropagation();
                        };
                        
                        const img = document.createElement('img');
                        img.src = entityImagePath;
                        img.style.width = `${tileSize}px`;
                        img.style.height = `${tileSize}px`;
                        img.style.objectFit = 'none';
                        img.style.objectPosition = `-${pixelX}px -${pixelY}px`;
                        img.style.transform = `scale(${scale})`;
                        img.style.transformOrigin = 'top left';
                        img.style.borderRadius = '3px';
                        childEntity.appendChild(img);
                        
                        childrenContainer.appendChild(childEntity);
                    }
                }*/
            }
            
            categoryElement.appendChild(categoryHeader);
            categoryElement.appendChild(childrenContainer);

            // START EXANDED IF ONLY ENTRY
            if (categoryData.expanded === undefined && categoriesEntries.length == 1)
                categoryData.expanded = true;
            
            if (categoryData.expanded === true)
                categoryElement.classList.add('expanded');

            sidebarContent.appendChild(categoryElement);
        }

        // IF ONLY 1 CATEGORY, EXPAND IT
        if (sidebarContent.children.length === 1)
            (sidebarContent.children[0] as HTMLElement).classList.add('expanded');
    }

    public PopulateLayers(data: SettingsData): void {
        const layersContent = document.querySelector('#layers-sidebar .sidebar-content') as HTMLElement;
        const layerTemplate = document.querySelector('#layer-template') as HTMLElement;

        // Clear any previously populated layers but keep the template
        layersContent.querySelectorAll('.layer-item').forEach((layerEl) => {
            if (layerEl !== layerTemplate)
                layerEl.remove();
        });

        var visible = (data.layers.length > 1);
        document.getElementById('layers-sidebar')!.style.marginRight = visible ? '0px' : '-1000px'; // HACKY WAY TO HIDE SIDEBAR, DISPLAY GETS TOGGLED AT OTHER OffPointers

        data.layers.forEach((layerName) => {
            const info = data.layersInfo?.[layerName] as LayerInfo | undefined;
            if (!info?.doSave)
                return;

            const shouldShow = this.GetLayerVisibilitySetting(layerName);
            
            // Clone the template
            const layerElement = layerTemplate.cloneNode(true) as HTMLElement;
            
            // Update the cloned element
            layerElement.style.display = 'block'; // Show the cloned element
            layerElement.id = layerName; // Set unique ID
            
            // Update the layer name
            const layerNameSpan = layerElement.querySelector('.layer-name') as HTMLElement;
            layerNameSpan.textContent = layerName.charAt(0).toUpperCase() + layerName.slice(1); // UPPERCASE FIRST LETTER

            // SELECT
            layerElement.onpointerdown = (e) => {
                this.FlashObjectsInLayer(layerName);
                this.SelectLayerItem(layerElement);
            };
            layerElement.onclick = (e) => {
                e.stopPropagation();
            };
            
            // VIEW
            const layerShowHideBtn = layerElement.querySelector('#showHide-btn') as HTMLElement;
            layerShowHideBtn.innerHTML = (shouldShow ? this.showIcon : this.hideIcon);
            layerShowHideBtn.onpointerdown = (e) => {
                const nextShow = !this.GetLayerVisibilitySetting(layerName);
                this.SetLayerVisibility(layerName, nextShow, layerShowHideBtn);
                e.stopPropagation();
            };
            layerShowHideBtn.onclick = (e) => {
                e.stopPropagation();
            };
            
            // EDIT
            /*const layerEditBtn = layerElement.querySelector('#edit-btn') as HTMLElement;

            // Add event listeners
            layerEditBtn.onpointerdown = (e) => {
                this.SelectLayerItem(layerElement);
                e.stopPropagation();
            };
            layerEditBtn.onclick = (e) => {
                e.stopPropagation();
            };*/

            // Add it
            layersContent.appendChild(layerElement);
        });
    }

    ProcessCurrentData()
    {
        const showHideBtns = document.querySelectorAll('#showHide-btn');
        showHideBtns.forEach((btn) => {
            const layerName = btn.parentElement!.id;
            if (layerName == 'layer-template')
                return;
            const shouldShow = this.GetLayerVisibilitySetting(layerName);
            this.SetLayerVisibility(layerName, shouldShow, btn as HTMLElement, false);
        });
    }

    private GetLayerVisibilitySetting(layerName: string): boolean {
        const info = this.data?.layersInfo?.[layerName] as LayerInfo | undefined;
        return info?.showInEditor !== false;
    }

    private SetLayerVisibility(layerName: string, show: boolean, button?: HTMLElement, persist: boolean = true)
    {
        if (button)
            button.innerHTML = show ? this.showIcon : this.hideIcon;

        const objs = objectController.GetLayerByName(layerName);
        objs.forEach((obj) => {
            obj.visibleInEditor = show;
        });

        this.UpdateLayerInfo(layerName, show);

        if (persist)
            this.PersistLayerVisibility(layerName, show);
    }

    // THIS SHOULD NOT BE BAKED INTO SETTINGS DATA - TODO: IN LOCALHOST
    private UpdateLayerInfo(layerName: string, show: boolean)
    {
        this.data.layersInfo ??= {};

        const existingInfo = this.data.layersInfo[layerName] as LayerInfo | undefined;
        const layerIndex = this.scene.layerNames.indexOf(layerName);

        this.data.layersInfo[layerName] = { ...existingInfo, showInEditor: show };

        if (layerIndex !== -1)
        {
            const layerInfo = this.scene.settingsData.layersInfo[layerName];
           layerInfo[layerIndex] = { ...layerInfo[layerIndex], showInEditor: show };
        }
    }

    private async PersistLayerVisibility(layerName: string, show: boolean)
    {
        const updatedRaw = await this.scene.settingsHandler.UpdateRaw((raw) => {
            raw.layersInfo ??= {};
            const existingInfo = raw.layersInfo[layerName] as LayerInfo | undefined;

            if (show && existingInfo?.showInEditor !== undefined && raw.layersInfo[layerName])
                delete raw.layersInfo[layerName].showInEditor;

            if (!show)
                raw.layersInfo[layerName] = { ...existingInfo, showInEditor: show };
        });
        
        this.scene.SaveEntityData(updatedRaw);
    }

    private ToggleEntity(element: HTMLElement): void {
        element.classList.toggle('expanded');
    }

    public SelectUIEntity(entity: Entity, element: HTMLElement | null = null): void {
        console.log('Selected entity:', entity);
        
        // Update settings panel with selected entity
        const idInput = document.querySelector('.setting-input[placeholder*="ID"]') as HTMLInputElement;
        const pathInput = document.querySelector('.setting-input[placeholder*="path"]') as HTMLInputElement;
        
        if (idInput) idInput.value = entity.name;
        if (pathInput) pathInput.value = entity.imagePath!;

        (window as any).renderComponents?.(entity);
        
        // highlighting the selected entity
        const selectedEntity = document.querySelector('.selected-entity');
        if (selectedEntity)
            selectedEntity.classList.remove('selected-entity');

        if (!element)
            element = document.getElementById(entity.name);

        if (element && selectedEntity != element)
        {
            element.classList.add('selected-entity');

            // TODO: JUMP TO ENTITY IN EDITOR AND OPEN TAB
        }
    }

    public SelectLayerItem(layerElement: HTMLElement): void {
        // if already selected
        //if (layerElement.classList.contains('selected-layer'))
        //    return;

        const selectedLayer = document.querySelector('.selected-layer');
        if (selectedLayer)
            selectedLayer.classList.remove('selected-layer');

        layerElement.classList.add('selected-layer');

        //const layerName = layerElement.id;
        //this.FlashObjectsInLayer(layerName);

        bare.SendEvent(BareEvent.editor_layerSelected, { layerName: layerElement.id });
    }

    public SelectLayerItemByInt(layerI: int): void {
        var layerName = this.scene.layerNames[layerI];

        if (!layerName)
            return;

        var layerElement = document.getElementById(layerName);
        if (!layerElement)
            return;

        this.SelectLayerItem(layerElement);
    }

    private FlashObjectsInLayer(layerName: string): void {
        var objs = objectController.GetLayerByName(layerName);
        for (var obj of objs)
        {
            obj.AddShader(FlashShader, { duration: 600, fadePreDuration: 0 });
        }
    }

    private GetCategoryImagePath(imageId: string): string | null {
        const entity = this.scene.ConstructEntity(imageId);

        if (entity)
            return assetsHandler.GetFullImagePath(MakePathForEntity(entity));
        
        return null;
    }

    private GetEntityImagePath(entity: Entity): string | null {
        return assetsHandler.GetFullImagePath(MakePathForEntity(entity));
    }

    SetupEditorControls(): Promise<void> {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        // EDITOR BUTTON
        const editorButton = document.getElementById('close-editor-btn') as HTMLButtonElement;
        editorButton.addEventListener('click', (event: MouseEvent) => {
            event.preventDefault();
            this.scene.Close();
        }, { signal });

        // MINIMIZE BUTTON HOVER
        const minimizeBtn = document.getElementById('minimize-btn')! as HTMLButtonElement;
        minimizeBtn.addEventListener('mouseenter', async () => {
            var timeSinceLastMinimize = new Date().getTime() - this.lastMinimize;
            if (timeSinceLastMinimize < 300)
                return;

            this.lastMinimize = new Date().getTime();
            this.SetMinimize(!this.isMinimized);

            // SAVE MINIMIZED
            SaveData.minimized = this.isMinimized;
            SaveDataHandler.Save();
        }, { signal });

        var me = this;

        // Modal functionality
        this.gridModalEl = document.getElementById('gridModal') as HTMLElement;
        const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
        const closeBtn = document.querySelector('.modal-close') as HTMLElement;
        this.gridToggleEl = document.getElementById('gridToggle') as HTMLElement;
        this.gridSizeInputEl = document.getElementById('gridSizeInput') as HTMLInputElement;

        if (!this.gridModalEl || !settingsBtn || !closeBtn || !this.gridToggleEl || !this.gridSizeInputEl) {
            console.error('Settings modal elements not found');
            return;
        }

        // THIS WASN'T NEEDED AT SOME POINT, TODO
        const guardInput = (el: HTMLElement) => {
            const stop = (ev: Event) => ev.stopPropagation();
            ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'mousedown', 'mouseup', 'wheel'].forEach(evt =>
                el.addEventListener(evt, stop, { passive: false, signal }));
            el.addEventListener('keydown', stop, { signal });
        };
        guardInput(this.gridSizeInputEl);

        // Open modal when settings button is clicked
        settingsBtn.addEventListener('click', function(): void {
            // Set modal grid size to current editorScene value
            me.SyncSettingsUI();
            me.gridModalEl!.style.display = 'block';
        }, { signal });

        // Close modal when X is clicked
        closeBtn.addEventListener('click', function(): void {
            me.gridModalEl!.style.display = 'none';
        }, { signal });

        // Close modal when clicking outside of it
        window.addEventListener('click', function(event: MouseEvent): void {
            if (event.target === me.gridModalEl) {
                me.gridModalEl!.style.display = 'none';
            }
        }, { signal });
        // Keep modal interactions local so they don't bubble into game handlers
        this.gridModalEl.addEventListener('pointerdown', ev => ev.stopPropagation(), { signal });
        this.gridModalEl.addEventListener('wheel', ev => ev.stopPropagation(), { passive: false, signal });

        // Toggle switch functionality
        this.gridToggleEl!.addEventListener('click', () => {
            me.ToggleGrid();
        }, { signal });

        // Prevent modal from closing when clicking inside modal content
        const modalContent = document.querySelector('.modal-content') as HTMLElement;
        modalContent.addEventListener('click', function(event: MouseEvent): void {
            event.stopPropagation();
        }, { signal });

        // Update editorScene.gridSize when grid size input changes
        const handleGridSizeChange = async (value: string) => {
            const newGridSize = parseInt(value, 10);
            if (newGridSize > 0)
            {
                me.settings.gridSize = newGridSize;
                me.SyncSettingsUI();

                const updatedRaw = await this.scene.settingsHandler.UpdateRaw((raw) => {
                    raw.settings ??= {gridEnabled: false, gridSize: 64}; //
                    raw.settings.gridSize = newGridSize;
                });
                this.scene.SaveEntityData(updatedRaw);
            }
        };

        this.gridSizeInputEl!.addEventListener('input', function(this: HTMLInputElement): void {
            handleGridSizeChange(this.value);
        }, { signal });

        this.gridSizeInputEl!.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter')
                handleGridSizeChange(this.gridSizeInputEl!.value);
        }, { signal });

        // Also update on blur event to handle when user leaves the input
        this.gridSizeInputEl!.addEventListener('blur', function(this: HTMLInputElement): void {
            handleGridSizeChange(this.value);
        }, { signal });
    }

    SetMinimize(minimize: boolean)
    {
        this.isMinimized = minimize;

        const sidebar = document.getElementById('left-sidebar')!;

        if (!sidebar)
            return; // PROBABLY WE'RE AT CLEAR() WITHIN INIT()

        const minimizeBtn = document.getElementById('minimize-btn')! as HTMLButtonElement;
        
        if (this.isMinimized) {
            document.getElementById('layers-sidebar')!.style.display = 'none';

            sidebar.classList.add('minimized');
            minimizeBtn.innerHTML = '🔺';
        } else {
            document.getElementById('layers-sidebar').style.display = 'block';

            sidebar.classList.remove('minimized');
            minimizeBtn.innerHTML = '🔻';
        }
    }

    async ToggleGrid()
    {
        this.settings.gridEnabled = !this.settings.gridEnabled;
        this.SyncSettingsUI();

        // SAVE
        const updatedRaw = await this.scene.settingsHandler.UpdateRaw((raw) => {
            raw.settings ??= {gridEnabled: false, gridSize: 64};
            raw.settings.gridEnabled = this.settings.gridEnabled;
        });
        this.scene.SaveEntityData(updatedRaw);
    }

    SyncSettingsUI(): void
    {
        var gridEnabled = this.settings.gridEnabled;
        var gridSize = this.settings.gridSize;
        var minimized = SaveData.minimized;

        if (this.gridToggleEl)
            this.gridToggleEl.classList.toggle('active', gridEnabled);

        if (this.gridSizeInputEl)
            this.gridSizeInputEl.value = gridSize.toString();

        if (minimized)
            this.SetMinimize(true); // DEFAULT IS INMINIZED AT, GETS SET AT CLOSE
    }

    private ToggleEditorPanels(show: boolean): void {
        const panelSelectors = ['#left-sidebar', '#layers-sidebar'];
        panelSelectors.forEach(selector => {
            const el = document.querySelector(selector) as HTMLElement | null;
            if (!el) return;
            el.style.display = show ? '' : 'none';
        });

        // Keep the top-left controls window visible at all times
        const controls = document.getElementById('editor-controls-window') as HTMLElement | null;
        if (controls) {
            controls.style.display = 'flex';
        }

        // Close modal when hiding UI
        if (!show) {
            if (this.gridModalEl)
                this.gridModalEl.style.display = 'none';
        }
    }

    Hide()
    {
        const overlay = document.getElementById('editor-overlay') as HTMLElement;
        if (!overlay) return;

        // Hide all editor panels except the controls window
        overlay.style.display = 'block';
        this.ToggleEditorPanels(false);
    }

    Show()
    {
        const overlay = document.getElementById('editor-overlay') as HTMLElement;
        if (!overlay) return;

        overlay.style.display = 'block';
        this.ToggleEditorPanels(true);

        if (this.isMinimized)
            this.SetMinimize(true);//
    }

    IsShowing(): boolean {
        const overlay = document.getElementById('editor-overlay') as HTMLElement;
        return overlay.style.display === 'block';
    }

    OpenEditor(): void
    {
        const overlay = document.getElementById('editor-overlay') as HTMLElement;
        overlay.style.display = 'block';
    }

    Clear(): void
    {
        this.SetMinimize(false);

        this.abortController.abort();

        const editorOverlay = document.getElementById('editor-overlay') as HTMLElement;
        
        if (!editorOverlay) {
            console.error('Editor overlay not found');
            return;
        }
        
        editorOverlay.style.display = 'none';
    }
} 
