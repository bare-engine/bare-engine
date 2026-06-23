declare const __DEV__: boolean;
declare const __STRIP_GENERATED_ASSETS__: boolean;

declare module "*.frag" {
    const content: string;
    export default content;
}

declare module "*.vert" {
    const content: string;
    export default content;
}
