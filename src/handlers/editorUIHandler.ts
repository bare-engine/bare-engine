import { Entity, LayerInfo, SettingsData, BareEvent, SaveData } from '../types/bareTypes';
import { assetsHandler } from "./assetsHandler";
import { events, MakePath } from "../main";
import { FlashShader } from "../shaders/flashShader";
import { TweenTo } from "../controllers/tweenController";
import { EditorScene } from '../scenes/editorScene';

/*
    BUILD SETUP/CONTROLS UI
    Handles editor UI setup, sidebar population, and UI interactions
*/

export class EditorUIHandler {
    private flashShader:FlashShader;

    private isMinimized: boolean = false;
    private lastMinimize: number = 0;
    private editorScene: EditorScene;

    private data: SettingsData;
    private gridToggleEl: HTMLElement | null = null;
    private gridSizeInputEl: HTMLInputElement | null = null;
    private gridModalEl: HTMLElement | null = null;
    private readonly showIcon = '👁️';
    private readonly hideIcon = '❌';

    constructor(editorScene: EditorScene) {
        this.editorScene = editorScene;

        this.flashShader = new FlashShader()
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
        if (this.data == data)
            return;

        this.data = data;
        this.PopulateSidebar(data);
        this.PopulateLayers(data);
        this.SyncSettingsUI(this.editorScene.gridActive, this.editorScene.gridSize);
    }

    PopulateSidebar(data: SettingsData): void {
        const sidebarContent = document.querySelector('.sidebar-content') as HTMLElement;
        if (!sidebarContent) {
            console.error('Sidebar content not found');
            return;
        }

        // Clear existing content
        sidebarContent.innerHTML = '';

        // Process each category
        data.categories?.forEach((categoryGroup, index) => {
            Object.keys(categoryGroup).forEach(categoryName => {
                const categoryData = categoryGroup[categoryName];
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
                
                // Get category image path
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
                
                const categoryTitle = document.createElement('span');
                categoryTitle.textContent = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
                
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
                        const entity = bare.ConstructEntity(entityId);
                        if (entity) {
                            const childEntity = document.createElement('div');
                            childEntity.className = 'child-entity';
                            childEntity.onpointerdown = (e) => {
                                this.editorScene.SelectEntity(entity, childEntity);
                                this.editorScene.editorControlsHandler.SetCurrentPreviewEntity(entity);
                            };
                            childEntity.onclick = (e) => {
                                e.stopPropagation();
                            };
                            
                            // Get entity image path
                            const entityImagePath = this.GetEntityImagePath(entity);
                            if (entityImagePath) {
                                const img = document.createElement('img');
                                img.src = entityImagePath;
                                img.id = entityId;
                                img.style.width = '100%';
                                img.style.height = '100%';
                                img.style.objectFit = 'contain';
                                img.style.borderRadius = '3px';
                                childEntity.appendChild(img);
                            } else {
                                childEntity.textContent = '📦'; // Fallback icon
                                childEntity.style.display = 'flex';
                                childEntity.style.alignItems = 'center';
                                childEntity.style.justifyContent = 'center';
                            }

                            childrenContainer.appendChild(childEntity);
                        }
                    });
                }
                else
                if (typeof categoryData.entries === 'string') 
                {
                    const entity = this.editorScene.GetTilesheetEntity(categoryData.entries);
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
                                this.editorScene.SelectEntity(entity, childEntity);
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
                    }
                }
                
                categoryElement.appendChild(categoryHeader);
                categoryElement.appendChild(childrenContainer);
                sidebarContent.appendChild(categoryElement);
            });
        });

        // IF ONLY 1 CATEGORY, EXPAND IT
        if (sidebarContent.children.length === 1)
            (sidebarContent.children[0] as HTMLElement).click();
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
        document.getElementById('layers-sidebar')!.style.display = (visible ? 'block' : 'none');

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
            layerNameSpan.textContent = layerName;

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

    private UpdateLayerInfo(layerName: string, show: boolean)
    {
        this.data.layersInfo ??= {};

        const existingInfo = this.data.layersInfo[layerName] as LayerInfo | undefined;
        const layerIndex = bare.layerNames.indexOf(layerName);

        this.data.layersInfo[layerName] = { ...existingInfo, showInEditor: show };

        if (layerIndex !== -1)
            bare.layerInfos[layerIndex] = { ...bare.layerInfos[layerIndex], showInEditor: show };
    }

    private PersistLayerVisibility(layerName: string, show: boolean)
    {
        const updatedRaw = bare.currentSettingsHandler.UpdateRaw((raw) => {
            raw.layersInfo ??= {};
            const existingInfo = raw.layersInfo[layerName] as LayerInfo | undefined;

            if (show && existingInfo?.showInEditor !== undefined && raw.layersInfo[layerName])
                delete raw.layersInfo[layerName].showInEditor;

            if (!show)
                raw.layersInfo[layerName] = { ...existingInfo, showInEditor: show };
        });
        
        bare.SaveEntityData(updatedRaw);
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

        events.emit(BareEvent.editor_layerSelected, { layerName: layerElement.id });
    }

    public SelectLayerItemByInt(layerI: int): void {
        const layerName = bare.layerInfos[layerI].name;
        var layerElement = document.getElementById(layerName)!;
        this.SelectLayerItem(layerElement);
    }

    private FlashObjectsInLayer(layerName: string): void {
        var objs = objectController.GetLayerByName(layerName);

        var flash = this.flashShader;

        objs.forEach((obj) => {
            flash.start(obj, 600, 0);

            TweenTo(obj, 1, { onUpdate: () => {
                flash.update(obj);
            }});
        });
    }

    private GetCategoryImagePath(imageId: string): string | null {
        const entity = bare.ConstructEntity(imageId);

        if (entity)
            return assetsHandler.GetFullImagePath(MakePath(entity.imagePath!, entity.name));
        
        return null;
    }

    private GetEntityImagePath(entity: Entity): string | null {
        return assetsHandler.GetFullImagePath(MakePath(entity.imagePath!, entity.name));
    }

    SetupEditorControls(): void {
        // EDITOR BUTTON
        const editorButton = document.getElementById('close-editor-btn') as HTMLButtonElement;
        editorButton.addEventListener('click', (event: MouseEvent) => {
            event.preventDefault();

            if (SaveData.currentLevelStr != '')
                trace('Saving current level...'); //levelController.LoadCurrentLevel();
            else
                bare.Restart(); // THERE IS NO LEVEL, JUST RESTART. THIS HAPPENS FOR HITBOX EDITOR
        });

        // MINIMIZE BUTTON HOVER
        const sidebar = document.getElementById('left-sidebar')!;
        const minimizeBtn = document.getElementById('minimize-btn')! as HTMLButtonElement;
        minimizeBtn.addEventListener('mouseenter', () => {
            var timeSinceLastMinimize = new Date().getTime() - this.lastMinimize;
            if (timeSinceLastMinimize < 300)
                return;
            this.lastMinimize = new Date().getTime();
            this.isMinimized = !this.isMinimized;
            
            if (this.isMinimized) {
                document.getElementById('entity-settings-sidebar')!.style.display = 'none';
                document.getElementById('layers-sidebar')!.style.display = 'none';

                sidebar.classList.add('minimized');
                minimizeBtn.innerHTML = '🔺';
            } else {
                document.getElementById('entity-settings-sidebar')!.style.display = 'block';
                document.getElementById('layers-sidebar')!.style.display = 'block';
                
                sidebar.classList.remove('minimized');
                minimizeBtn.innerHTML = '🔻';
            }
        });

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
                el.addEventListener(evt, stop, { passive: false }));
            el.addEventListener('keydown', stop);
        };
        guardInput(this.gridSizeInputEl);

        // Open modal when settings button is clicked
        settingsBtn.addEventListener('click', function(): void {
            // Set modal grid size to current editorScene value
            me.SyncSettingsUI(me.editorScene.gridActive, me.editorScene.gridSize);
            me.gridModalEl!.style.display = 'block';
        });

        // Close modal when X is clicked
        closeBtn.addEventListener('click', function(): void {
            me.gridModalEl!.style.display = 'none';
        });

        // Close modal when clicking outside of it
        window.addEventListener('click', function(event: MouseEvent): void {
            if (event.target === me.gridModalEl) {
                me.gridModalEl!.style.display = 'none';
            }
        });
        // Keep modal interactions local so they don't bubble into game handlers
        this.gridModalEl.addEventListener('pointerdown', ev => ev.stopPropagation());
        this.gridModalEl.addEventListener('wheel', ev => ev.stopPropagation(), { passive: false });

        // Toggle switch functionality
        this.gridToggleEl!.addEventListener('click', () => {
            me.ToggleGrid(true);
        });

        // Prevent modal from closing when clicking inside modal content
        const modalContent = document.querySelector('.modal-content') as HTMLElement;
        modalContent.addEventListener('click', function(event: MouseEvent): void {
            event.stopPropagation();
        });

        // Update editorScene.gridSize when grid size input changes
        const handleGridSizeChange = (value: string, commit: boolean = false) => {
            if (value.trim() === '') {
                if (commit)
                    this.SyncSettingsUI(this.editorScene.gridActive, this.editorScene.gridSize);
                return;
            }

            const newGridSize = parseInt(value, 10);
            if (!isNaN(newGridSize) && newGridSize > 0) {
                me.editorScene.gridSize = newGridSize;

                if (commit) {
                    me.SyncSettingsUI(me.editorScene.gridActive, me.editorScene.gridSize);
                    void me.editorScene.PersistSettings();
                }
            } else if (commit) {
                me.SyncSettingsUI(me.editorScene.gridActive, me.editorScene.gridSize);
            }
        };

        this.gridSizeInputEl!.addEventListener('input', function(this: HTMLInputElement): void {
            handleGridSizeChange(this.value, false);
        });

        this.gridSizeInputEl!.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter')
                handleGridSizeChange(this.gridSizeInputEl!.value, true);
        });

        // Also update on blur event to handle when user leaves the input
        this.gridSizeInputEl!.addEventListener('blur', function(this: HTMLInputElement): void {
            handleGridSizeChange(this.value, true);
        });
    }

    ToggleGrid(persist: boolean = false)
    {
        this.editorScene.gridActive = !this.editorScene.gridActive;
        this.SyncSettingsUI(this.editorScene.gridActive, this.editorScene.gridSize);

        if (persist)
            void this.editorScene.PersistSettings();
    }

    SyncSettingsUI(gridEnabled: boolean, gridSize: number): void
    {
        if (this.gridToggleEl)
            this.gridToggleEl.classList.toggle('active', gridEnabled);

        if (this.gridSizeInputEl)
            this.gridSizeInputEl.value = gridSize.toString();
    }

    private ToggleEditorPanels(show: boolean): void {
        const panelSelectors = ['#left-sidebar', '#layers-sidebar', '#entity-settings-sidebar'];
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

    Close(): void
    {
        const editorOverlay = document.getElementById('editor-overlay') as HTMLElement;
        
        if (!editorOverlay) {
            console.error('Editor overlay not found');
            return;
        }
        
        editorOverlay.style.display = 'none';
    }
} 
