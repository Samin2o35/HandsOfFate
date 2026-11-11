declare module 'cc/env' {
    /** True in the editor AND in its preview (Cocos 3.8). */
    export const EDITOR: boolean;
    /** True only in the real editor, not in its preview: use this for "don't run in the editor". */
    export const EDITOR_NOT_IN_PREVIEW: boolean;
    export const PREVIEW: boolean;
    export const BUILD: boolean;
    export const NATIVE: boolean;
}
