import { EditorScene } from '../scenes/editorScene';

/*
    EDITOR MODE HINTS UI
    Handles edit/stamp mode state, the Cancel Stamp button, the controls info popup,
    and the blue outline drawn inside the canvas while in stamp mode
*/

export type EditorMode = 'edit' | 'stamp';

export class EditorUIHintHandler {
    public scene: EditorScene;
    public mode: EditorMode = 'edit';

    private abortController: AbortController = new AbortController();
    private container: HTMLElement | null = null;
    private cancelStampBtn: HTMLButtonElement | null = null;
    private infoBtn: HTMLButtonElement | null = null;
    private infoPopup: HTMLElement | null = null;
    private stampOutlineEl: HTMLElement | null = null;

    private readonly hintsPerMode: Record<EditorMode, string[]> = {
        stamp: [
            'ctrl: ignore selection',
            'alt: disable grid',
            'shift: place multiple',
            'left click: add',
            'right click: cancel stamp / remove object'
        ],
        edit: [
            'ctrl: select object layer below',
            'alt: disable grid',
            'shift: select multiple',
            'left click: select',
            'right click: remove'
        ]
    };

    constructor(scene: EditorScene) {
        this.scene = scene;
    }

    Setup(): void {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const overlay = document.getElementById('editor-overlay') as HTMLElement;
        if (!overlay) {
            console.error('Editor overlay not found for hint UI');
            return;
        }

        // CLEAN UP ELEMENTS FROM A PREVIOUS SETUP
        this.RemoveElements();

        this.InjectStyles();

        // STAMP MODE OUTLINE - BLUE BORDER DRAWN INSIDE THE CANVAS
        this.stampOutlineEl = document.createElement('div');
        this.stampOutlineEl.id = 'stamp-mode-outline';
        overlay.appendChild(this.stampOutlineEl);

        // BOTTOM RIGHT BUTTONS
        this.container = document.createElement('div');
        this.container.id = 'editor-hints';

        this.cancelStampBtn = document.createElement('button');
        this.cancelStampBtn.id = 'cancel-stamp-btn';
        this.cancelStampBtn.textContent = 'Cancel';
        this.cancelStampBtn.addEventListener('click', () => {
            this.scene.editorControlsHandler.SetCurrentPreviewEntity(null);
        }, { signal });

        this.infoBtn = document.createElement('button');
        this.infoBtn.id = 'editor-info-btn';
        this.infoBtn.textContent = 'i';
        this.infoBtn.addEventListener('mouseenter', () => this.ShowInfoPopup(true), { signal });
        this.infoBtn.addEventListener('mouseleave', () => this.ShowInfoPopup(false), { signal });

        this.infoPopup = document.createElement('div');
        this.infoPopup.id = 'editor-hints-popup';
        this.infoPopup.style.display = 'none';

        this.container.appendChild(this.infoPopup);
        this.container.appendChild(this.cancelStampBtn);
        this.container.appendChild(this.infoBtn);
        overlay.appendChild(this.container);

        window.addEventListener('resize', () => this.UpdateStampOutline(), { signal });

        this.SetMode(this.scene.editorControlsHandler?.currentPreviewActive ? 'stamp' : 'edit');
    }

    SetMode(mode: EditorMode): void {
        this.mode = mode;

        if (!this.container)
            return; // NOT SET UP YET

        const isStamp = (mode == 'stamp');

        this.cancelStampBtn!.style.display = isStamp ? 'block' : 'none';
        this.stampOutlineEl!.style.display = isStamp ? 'block' : 'none';

        if (isStamp)
            this.UpdateStampOutline();

        this.UpdateContainerPosition();
        this.RenderHints(); // KEEP POPUP CONTENT IN SYNC WHEN MODE CHANGES WHILE OPEN
    }

    private ShowInfoPopup(show: boolean): void {
        if (!this.infoPopup)
            return;

        if (show)
            this.RenderHints();

        this.infoPopup.style.display = show ? 'block' : 'none';
    }

    private RenderHints(): void {
        if (!this.infoPopup)
            return;

        this.infoPopup.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'hint-popup-header';
        header.textContent = (this.mode == 'stamp' ? 'Stamp Mode' : 'Edit Mode');
        this.infoPopup.appendChild(header);

        for (const hint of this.GetHintsForMode(this.mode)) {
            const line = document.createElement('div');
            line.className = 'hint-popup-line';

            // BOLD THE KEY PART BEFORE THE COLON
            const colonI = hint.indexOf(':');
            const keyEl = document.createElement('b');
            keyEl.textContent = hint.substring(0, colonI + 1);
            line.appendChild(keyEl);
            line.append(hint.substring(colonI + 1));

            this.infoPopup.appendChild(line);
        }
    }

    private GetHintsForMode(mode: EditorMode): string[] {
        let hints = this.hintsPerMode[mode];

        // GRID HINTS ONLY APPLY WHEN THE GRID IS ON
        if (!this.scene.settingsData?.settings?.gridEnabled)
            hints = hints.filter(hint => hint != 'alt: disable grid' && hint != 'shift: place multiple');

        return hints;
    }

    private UpdateStampOutline(): void {
        if (!this.stampOutlineEl || this.mode != 'stamp')
            return;

        const rect = rapid.canvas.getBoundingClientRect();
        Object.assign(this.stampOutlineEl.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });
    }

    // KEEP THE BUTTONS LEFT OF THE LAYERS SIDEBAR WHEN IT'S SHOWING
    private UpdateContainerPosition(): void {
        if (!this.container)
            return;

        const layersSidebar = document.getElementById('layers-sidebar');
        const sidebarVisible = !!layersSidebar && layersSidebar.style.display != 'none' && layersSidebar.style.marginRight == '0px';

        this.container.style.right = sidebarVisible ? '230px' : '5px';
    }

    private InjectStyles(): void {
        const style = document.createElement('style');
        style.id = 'editor-hints-style';
        style.textContent = `
            #editor-hints {
                position: fixed;
                bottom: 5px;
                right: 5px;
                display: flex;
                align-items: center;
                gap: 8px;
                z-index: 6;
                font-family: Arial, sans-serif;
            }

            #cancel-stamp-btn {
                background-color: #ff4444;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                margin-bottom: 3px;
            }

            #cancel-stamp-btn:hover {
                background-color: #cc0000;
            }

            #editor-info-btn {
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background-color: #373737;
                color: white;
                border: none;
                cursor: pointer;
                font-size: 18px;
                font-style: italic;
                font-weight: bold;
                font-family: Georgia, serif;
            }

            #editor-info-btn:hover {
                background-color: #4f4f4f;
            }

            #editor-hints-popup {
                position: absolute;
                bottom: calc(100% + 8px);
                right: 0;
                width: 200px;
                padding: 10px;
                background-color: #242428EB;
                border-radius: 6px;
                color: white;
                font-size: 13px;
            }

            #editor-hints-popup .hint-popup-header {
                font-weight: bold;
                font-size: 14px;
                margin-bottom: 8px;
                border-bottom: 1px solid #ffffff15;
                padding-bottom: 4px;
            }

            #editor-hints-popup .hint-popup-line {
                color: #cccccc;
                margin-bottom: 4px;
            }

            #editor-hints-popup .hint-popup-line b {
                color: white;
            }

            #stamp-mode-outline {
                position: fixed;
                border: 3px solid #f32121;
                box-sizing: border-box;
                pointer-events: none;
                z-index: 4;
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    private RemoveElements(): void {
        document.getElementById('editor-hints')?.remove();
        document.getElementById('stamp-mode-outline')?.remove();
        document.getElementById('editor-hints-style')?.remove();

        this.container = null;
        this.cancelStampBtn = null;
        this.infoBtn = null;
        this.infoPopup = null;
        this.stampOutlineEl = null;
    }

    Clear(): void {
        this.abortController.abort();
        this.RemoveElements();
    }
}
