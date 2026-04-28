import type { Rectangle } from "../types/bareTypes";

export interface QuadTreeItem<T>
{
    bounds: Rectangle;
    value: T;
}

export class QuadTree<T>
{
    private items: QuadTreeItem<T>[] = [];
    private nodes: QuadTree<T>[] = [];

    constructor(
        private bounds: Rectangle,
        private maxItems: number = 8,
        private maxLevels: number = 5,
        private level: number = 0
    ) {}

    clear(): void
    {
        this.items.length = 0;

        for (const node of this.nodes) {
            node.clear();
        }

        this.nodes.length = 0;
    }

    insert(item: QuadTreeItem<T>): void
    {
        if (this.nodes.length > 0) {
            const index = this.getContainingChildIndex(item.bounds);

            if (index !== -1) {
                this.nodes[index].insert(item);
                return;
            }
        }

        this.items.push(item);

        if (this.items.length <= this.maxItems || this.level >= this.maxLevels) {
            return;
        }

        if (this.nodes.length === 0) {
            this.split();
        }

        for (let i = this.items.length - 1; i >= 0; i--) {
            const childIndex = this.getContainingChildIndex(this.items[i].bounds);

            if (childIndex === -1) {
                continue;
            }

            const childItem = this.items.splice(i, 1)[0];
            this.nodes[childIndex].insert(childItem);
        }
    }

    query(region: Rectangle): QuadTreeItem<T>[]
    {
        const results: QuadTreeItem<T>[] = [];
        this.queryInto(region, results);
        return results;
    }

    private queryInto(region: Rectangle, results: QuadTreeItem<T>[]): void
    {
        for (const item of this.items) {
            if (QuadTree.intersects(item.bounds, region)) {
                results.push(item);
            }
        }

        if (this.nodes.length === 0) {
            return;
        }

        const containingIndex = this.getContainingChildIndex(region);

        if (containingIndex !== -1) {
            this.nodes[containingIndex].queryInto(region, results);
            return;
        }

        for (const node of this.nodes) {
            if (QuadTree.intersects(node.bounds, region)) {
                node.queryInto(region, results);
            }
        }
    }

    private split(): void
    {
        const childWidth = this.bounds.width / 2;
        const childHeight = this.bounds.height / 2;
        const nextLevel = this.level + 1;
        const x = this.bounds.x;
        const y = this.bounds.y;

        this.nodes[0] = new QuadTree({ x: x + childWidth, y, width: childWidth, height: childHeight }, this.maxItems, this.maxLevels, nextLevel);
        this.nodes[1] = new QuadTree({ x, y, width: childWidth, height: childHeight }, this.maxItems, this.maxLevels, nextLevel);
        this.nodes[2] = new QuadTree({ x, y: y + childHeight, width: childWidth, height: childHeight }, this.maxItems, this.maxLevels, nextLevel);
        this.nodes[3] = new QuadTree({ x: x + childWidth, y: y + childHeight, width: childWidth, height: childHeight }, this.maxItems, this.maxLevels, nextLevel);
    }

    private getContainingChildIndex(region: Rectangle): number
    {
        const verticalMidpoint = this.bounds.x + this.bounds.width / 2;
        const horizontalMidpoint = this.bounds.y + this.bounds.height / 2;

        const fitsTop = region.y >= this.bounds.y && region.y + region.height <= horizontalMidpoint;
        const fitsBottom = region.y >= horizontalMidpoint && region.y + region.height <= this.bounds.y + this.bounds.height;
        const fitsLeft = region.x >= this.bounds.x && region.x + region.width <= verticalMidpoint;
        const fitsRight = region.x >= verticalMidpoint && region.x + region.width <= this.bounds.x + this.bounds.width;

        if (fitsTop && fitsRight) return 0;
        if (fitsTop && fitsLeft) return 1;
        if (fitsBottom && fitsLeft) return 2;
        if (fitsBottom && fitsRight) return 3;

        return -1;
    }

    static intersects(a: Rectangle, b: Rectangle): boolean
    {
        return a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
    }
}
