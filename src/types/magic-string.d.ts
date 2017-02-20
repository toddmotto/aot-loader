declare class MagicString {
  constructor(contents: string);
  append(contents: string);
  generateMap: (options: any) => any;
  prepend(contents: string);
  prependLeft(index: number, contents: string);
  prependRight(index: number, contents: string);
  overwrite(start: number, end: number, contents: string, store?: boolean);
}

declare module 'magic-string' {
  export default MagicString;
}
