import type { Rectangle } from "../types/bareTypes";

export interface QuadTreeItem<T>
{
    bounds: Rectangle;
    value: T;
}

export interface QuadTreePair<T>
{
    p1: T;
    p2: T;
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

    queryInto(region: Rectangle, results: QuadTreeItem<T>[]): void
    {
        const regionRight = region.x + region.width;
        const regionBottom = region.y + region.height;

        for (const item of this.items) {
            const bounds = item.bounds;
            if (bounds.x < regionRight &&
                bounds.x + bounds.width > region.x &&
                bounds.y < regionBottom &&
                bounds.y + bounds.height > region.y) {
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
            const bounds = node.bounds;
            if (bounds.x < regionRight &&
                bounds.x + bounds.width > region.x &&
                bounds.y < regionBottom &&
                bounds.y + bounds.height > region.y) {
                node.queryInto(region, results);
            }
        }
    }

    getPairsInto(results: QuadTreePair<T>[]): void
    {
        // Pairs stored directly in this node.
        for (let i = 0; i < this.items.length - 1; i++) {
            const item1 = this.items[i];

            for (let j = i + 1; j < this.items.length; j++) {
                const item2 = this.items[j];
                if (QuadTree.intersects(item1.bounds, item2.bounds)) {
                    results.push({ p1: item1.value, p2: item2.value });
                }
            }
        }

        // Items retained by a parent straddle its split. Compare each one once
        // against potentially intersecting descendants.
        for (const item of this.items) {
            for (const node of this.nodes) {
                if (QuadTree.intersects(item.bounds, node.bounds)) {
                    node.getPairsAgainstItem(item, results);
                }
            }
        }

        // Objects fully contained by different children cannot overlap, so only
        // recurse within each child.
        for (const node of this.nodes) {
            node.getPairsInto(results);
        }
    }

    private getPairsAgainstItem(item: QuadTreeItem<T>, results: QuadTreePair<T>[]): void
    {
        for (const other of this.items) {
            if (QuadTree.intersects(item.bounds, other.bounds)) {
                results.push({ p1: item.value, p2: other.value });
            }
        }

        for (const node of this.nodes) {
            if (QuadTree.intersects(item.bounds, node.bounds)) {
                node.getPairsAgainstItem(item, results);
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
