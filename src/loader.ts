import { dirname, join, normalize, relative, resolve } from 'path';
import { SourceFile } from 'typescript';

import { AotPlugin } from './plugin';
import { TransformFile } from './transform/file';

export async function aotLoader(source: string, map: string) {
  this.cacheable();
  const callback = this.async();

  const aotPlugin = (this._compilation.aotPlugin as AotPlugin);

  try {
    await aotPlugin.compilePromise;
  } catch (err) {
    return callback(null, '');
  }

  let sourceFile: SourceFile;
  if (aotPlugin.sourceFileCache.has(this.resourcePath)) {
    sourceFile = aotPlugin.sourceFileCache.get(this.resourcePath);
  }

  const isGenerated = /\.(ngfactory|ngstyle)(\.|$)/.test(this.resourcePath);

  const transformFile = new TransformFile(this.resourcePath, source, aotPlugin, !isGenerated, sourceFile);

  if (source.match(/bootstrapModule/ig)) {
    const { angularCompilerOptions } = aotPlugin.tsConfig;

    const basePath = normalize(angularCompilerOptions.basePath);
    const genDir = normalize(angularCompilerOptions.genDir);
    const dirName = normalize(dirname(this.resourcePath));

    const genRelativeToBase = relative(basePath, genDir);
    const fileRelativeToBase = relative(basePath, dirName);
    const genRelativeToFile = relative(fileRelativeToBase, genRelativeToBase);

    const entryModule = aotPlugin.entryModule;
    const genToEntryFile = join(genRelativeToFile, entryModule.path + '.ngfactory');
    const fileToEntryFile = join(fileRelativeToBase, entryModule.path);
    const normalPath = './' + fileToEntryFile.replace(/\\/g, '/');
    const factoryPath = './' + genToEntryFile.replace(/\\/g, '/');

    transformFile.convertBootstrap(entryModule.module);
    transformFile.convertImport(
      { name: 'platformBrowserDynamic', module: '@angular/platform-browser-dynamic' },
      { name: 'platformBrowser', module: '@angular/platform-browser' }
    );
    transformFile.convertImport(
      { name: entryModule.module, module: normalPath },
      { name: `${entryModule.module}NgFactory`, module: factoryPath }
    );
  }

  if (/\.ngfactory(\.|$)/.test(this.resourcePath) && /loadChildren/.test(source)) {
    transformFile.convertLoadChildren();
  }

  if (/templateUrl/.test(source) || /styleUrls/.test(source)) {
    const resources = transformFile
      .getResources()
      .map((resource) => resolve(dirname(this.resourcePath), resource));

    for (let i = 0; i < resources.length; i++) {
      this.addDependency(resources[i]);
    }

    aotPlugin.registerResources(this.resourcePath, resources);
  }

  let transpiledModule = transformFile.transpile();

  let sourceMap = transpiledModule.sourceMap;
  const compiledSource = transpiledModule.outputText.replace(/__TROPMI__/g, 'import');

  callback(null, compiledSource, sourceMap);
}
