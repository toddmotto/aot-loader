import { ModuleResolutionHostAdapter } from '@angular/compiler-cli';
import { extname } from 'path';
import { ModuleResolutionHost } from 'typescript';
import { Context, createContext, Script } from 'vm';

const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');

export class AotContext extends ModuleResolutionHostAdapter {
  childCompilers: {[x: string]: any} = {};
  compiler: any;
  compilation: any;
  context: Context = createContext(Object.assign({require}, global));
  resourceExtensions: string[] = [];

  constructor(host: ModuleResolutionHost) {
    super(host);
  }

  compileResource(fileName: string): Promise<any> {
    if (!this.childCompilers[fileName]) {
      this.childCompilers[fileName] = this.compilation.createChildCompiler(fileName, { filename: fileName });
      this.childCompilers[fileName].context = this.compiler.context;
      this.childCompilers[fileName].apply(new SingleEntryPlugin(this.childCompilers[fileName].context, fileName, fileName));
    }

    let existsInParent = this.compilation.assets[fileName];
    let childCompiler = this.childCompilers[fileName];

    childCompiler.plugin('compilation', function (compilation: any) {
      if (compilation.cache) {
        if (!compilation.cache[fileName]) {
          compilation.cache[fileName] = {};
        }
        compilation.cache = compilation.cache[fileName];
      }
    });

    return new Promise((resolve, reject) => {
      childCompiler.runAsChild((err: any, entries: any[], childCompilation: any) => {
        if (err) {
          reject(err);
        }
        if (!existsInParent) {
          delete this.compilation.assets[fileName];
        }
        resolve(childCompilation.assets[fileName].source());
      });
    });
  }

  async readResource(fileName: string): Promise<string> {
    const fileExtension = extname(fileName);
    if (!this.resourceExtensions.includes(fileExtension)) {
      this.resourceExtensions.push(fileExtension);
    }

    const source = await this.compileResource(fileName);

    try {
      const script = new Script(source, {filename: fileName});
      const result = script.runInContext(this.context);

      if (typeof result !== 'string') {
        const err = 'templateUrl and styleUrls need to be loaded as a string when using AoT compilation';
        throw new Error(`${err}\nAsset ${fileName} exported '${typeof result}' (try using raw-loader as the last loader)`);
      }

      return result;
    } catch (err) {
      throw err;
    }
  }
}
