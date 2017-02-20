import { createSourceFile, ScriptTarget, SourceFile } from 'typescript';

const dev = Math.floor(Math.random() * 100000);

export class Stats {
  atime = new Date();
  blksize = 512;
  btime = new Date();
  ctime = new Date();
  dev = dev;
  gid = process.env['GID'] || 0;
  ino = Math.floor(Math.random() * 100000);
  mtime = new Date();
  nlink = 1;
  rdev = 0;
  uid = process.env['UID'] || 0;
  size = 0;

  constructor(public name: string) {

  }

  isFile() { return false; }
  isDirectory() { return false; }
  isBlockDevice() { return false; }
  isCharacterDevice() { return false; }
  isSymbolicLink() { return false; }
  isFIFO() { return false; }
  isSocket() { return false; }

  get blocks() {
    return Math.ceil(this.size / this.blksize);
  }
}

export class File extends Stats {
  sourceFile: SourceFile;
  _size = 0;

  constructor(name: string, private contents: string) {
    super(name);
  }

  get content(): string {
    return this.contents;
  }

  set content(content: string) {
    this.mtime = new Date();
    this.contents = content;
  }

  getSourceFile(languageVersion: ScriptTarget, setParentNodes: boolean): SourceFile {
    if (!this.sourceFile) {
      this.sourceFile = createSourceFile(this.name, this.contents, languageVersion, setParentNodes);
    }
    return this.sourceFile;
  }

  isFile(): boolean {
    return true;
  }

  get size(): number {
    return this.contents ? this.contents.length : this._size;
  }

  set size(size: number) {
    this._size = size;
  }
}

export class Directory extends Stats {
  size = 1024;

  constructor(name: string) {
    super(name);
  }

  isDirectory() {
    return true;
  }
}
