import { existsSync } from 'fs';
import { basename, dirname, join } from 'path';
import {
  CompilerOptions,
  CompilerHost,
  createCompilerHost,
  ScriptTarget,
  SourceFile
} from 'typescript';

import { Directory, File } from './file';

const isWindows = process.platform.startsWith('win');

export class Host implements CompilerHost {
  compilation: any;
  compiler: any;
  directories: {[name: string]: Directory} = {};
  host: CompilerHost = createCompilerHost(this.options, true);
  files: {[name: string]: File} = {};

  constructor(private options: CompilerOptions, private basePath: string) {
  }

  directoryExists(directoryName: string): boolean {
    return !!this.directories[directoryName] || this.host.directoryExists(directoryName);
  }

  fileExists(fileName: string): boolean {
    if (!existsSync(fileName)) {
      delete this.files[fileName];
      return false;
    }
    return !!this.files[fileName] || this.host.fileExists(fileName);
  }

  getCanonicalFileName(fileName: string): string {
    return this.host.getCanonicalFileName(fileName);
  }

  getCurrentDirectory(): string {
    return this.basePath;
  }

  getDefaultLibFileName(options: CompilerOptions): string {
    return this.host.getDefaultLibFileName(options);
  }

  getDirectories(path: string): string[] {
    path = this.resolveFileName(path);

    let directories: string[];

    try {
      directories = this.host.getDirectories(path);
    } catch (e) {
      directories = [];
    }

    let directoryKeys = Object.keys(this.directories);
    let subDirectories = directoryKeys
      .filter((directory) => dirname(directory) === path)
      .map((path) => basename(path));

    return [...directories, ...subDirectories];
  }

  getFiles(path: string): string[] {
    path = this.resolveFileName(path);

    return Object.keys(this.files)
      .filter((fileName) => dirname(fileName) === path)
      .map((path) => basename(path));
  }

  getNewLine(): string {
    return this.host.getNewLine();
  }

  getSourceFile(fileName: string, languageVersion: ScriptTarget, onError?: (message: string) => void): SourceFile {
    fileName = this.resolveFileName(fileName);
    if (this.files[fileName]) {
      return this.files[fileName].getSourceFile(languageVersion, true);
    }
    return this.host.getSourceFile(fileName, languageVersion, onError);
  }

  readFile(fileName: string): string {
    fileName = this.resolveFileName(fileName);
    if (this.files[fileName]) {
      return this.files[fileName].content;
    }
    return this.host.readFile(fileName);
  }

  resolveFileName(fileName: string): string {
    const path = fileName.replace(/\\/g, '/');

    if (path[0] === '.') {
      return join(this.getCurrentDirectory(), path);
    }
    if (path[0] === '/' || path.match(/^\w:\//)) {
      return path;
    }
    return join(this.basePath, path);
  }

  useCaseSensitiveFileNames(): boolean {
    return this.host.useCaseSensitiveFileNames();
  }

  get writeFile(): (fileName: string, data: string) => void {
    return (fileName: string, data: string) => {
      fileName = this.resolveFileName(fileName);

      this.files[fileName] = new File(fileName, data);

      let path = dirname(fileName);
      const paths: string[] = [];
      while (path && !this.directories[path]) {
        paths.push(path);
        this.directories[path] = new Directory(path);
        path = dirname(path);
      }

      const { fileSystem } = this.compiler.resolvers.normal;

      const filePath = isWindows ? fileName.replace(/\//g, '\\') : fileName;
      fileSystem._statStorage.data[filePath] = [null, this.files[fileName]];
      fileSystem._readFileStorage.data[filePath] = [null, this.files[fileName].content];

      for (let i = 0; i < paths.length; i++) {
        const dirName = paths[i];

        const stats = this.directories[dirName];
        const dirs = this.getDirectories(dirName);
        const files = this.getFiles(dirName);
        const dirPath = isWindows ? dirName.replace(/\//g, '\\') : dirName;

        fileSystem._statStorage.data[dirPath] = [null, stats];
        fileSystem._readdirStorage.data[dirPath] = [null, files.concat(dirs)];
      }
    };
  }
}
