export type ReplacerFunction = (key: string, value: any) => any
export type ReplacerArray = any[]
export type Replacer = ReplacerFunction | ReplacerArray

export declare function stringify(value: any, replacer?: Replacer, space?: string | number): string
