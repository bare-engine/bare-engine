declare const __DEV__: boolean;

declare module "*.frag" {
    const content: string;
    export default content;
}

declare module "*.vert" {
    const content: string;
    export default content;
}
