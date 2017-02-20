import { CompilerHost, CompilerHostContext } from '@angular/compiler-cli';
import { CompilerOptions, Program, SourceFile } from 'typescript';

export interface AngularCompilerOptions extends CompilerOptions {
  basePath?: string;
  genDir?: string;
  entryModule?: string;
  debug?: boolean;
}

export class AotCompilerHost extends CompilerHost {
  constructor(protected program: Program,
              protected options: AngularCompilerOptions,
              protected context: CompilerHostContext,
              protected sourceFileCache: Map<string, SourceFile>) {
    super(program, options, context);
  }

  getSourceFile(fileName: string): SourceFile {
    if (this.sourceFileCache.has(fileName)) {
      return this.sourceFileCache.get(fileName);
    }
    return super.getSourceFile(fileName);
  }
}
