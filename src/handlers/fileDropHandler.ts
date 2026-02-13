export class FileDropHandler
{
    private dropZone: HTMLElement;
    private onFileDrop: (file: File) => Promise<void>;

    constructor(dropZone: HTMLElement, onFileDrop: (file: File) => Promise<void>) {
        this.dropZone = dropZone;
        this.onFileDrop = onFileDrop;
        this.setupDropZone();
    }

    private setupDropZone() {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, this.preventDefaults, false);
        });

        // Visual feedback
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => this.highlight(), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => this.unhighlight(), false);
        });

        // Handle drop
        this.dropZone.addEventListener('drop', (e: DragEvent) => this.handleDrop(e), false);
    }

    private preventDefaults(e: Event) {
        e.preventDefault();
        e.stopPropagation();
    }

    private highlight() {
        this.dropZone.classList.add('drag-over');
    }

    private unhighlight() {
        this.dropZone.classList.remove('drag-over');
    }

    private async handleDrop(e: DragEvent) {
        const dt = e.dataTransfer;
        if (!dt || dt.files.length === 0) return;

        const file = dt.files[0];
        
        // Validate it's a JSON file
        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            console.error('Please drop a JSON file');
            return;
        }

        await this.onFileDrop(file);
    }
}