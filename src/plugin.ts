import { extname, dirname, join, relative, resolve, sep } from 'path';
import {
  AotCompiler,
  analyzeAndValidateNgModules,
  CompileNgModuleMetadata,
  createAotCompiler,
  StaticReflector,
  StaticSymbol
} from '@angular/compiler';
import {
  ClassDeclaration,
  CompilerOptions,
  createProgram,
  createSourceFile,
  Decorator,
  ImportDeclaration,
  resolveModuleName,
  ParsedCommandLine,
  parseJsonConfigFileContent,
  Program,
  ScriptTarget,
  SourceFile,
  SyntaxKind,
  sys
} from 'typescript';
import {
  byPropertyName,
  filterDuplicates,
  findNodes,
  getDecorator,
  getInitializer,
  getModule,
  getPropertyAssignments,
  objToMap
} from './transform/utils';

import { Host } from './host';
import { AotContext } from './context';
import { AngularCompilerOptions, AotCompilerHost } from './compiler';

export interface AotConfig {
  tsConfig: string;
}

export interface AnalyzedFile {
  srcUrl: string;
  directives: StaticSymbol[];
  pipes: StaticSymbol[];
  ngModules: StaticSymbol[];
  injectables: StaticSymbol[];
}

export interface GeneratedFile {
  genFileUrl: string;
  source: string;
  srcFileUrl: string;
}

const FILE_EXTENSION = /\.[^/.]+$/;
const INJECTOR = /(\w+?)Injector/;
const MODULE = /@NgModule/;
const NGSTYLE_SUFFIX = /(\.shim)?\.ngstyle\.ts$/;

export class AotPlugin {
  context: AotContext;

  files: string[] = [];

  // dependencies
  componentDependencies: Map<string, string[]> = new Map<string, string[]>();
  moduleDependencies: Map<string, string[]> = new Map<string, string[]>();

  // misc
  compilePromise: Promise<void> = Promise.resolve();
  ranInitialCompile = false;
  entryModule: { path: string, module: string };

  // timing
  prevTimestamps: Map<string, number> = new Map<string, number>();
  startTime = Date.now();

  // resources
  resources: Map<string, string[]> = new Map<string, string[]>();
  resourcesDependencies: Map<string, string[]> = new Map<string, string[]>();

  // cache
  sourceFileCache: Map<string, SourceFile> = new Map<string, SourceFile>();
  symbols: StaticSymbol[] = [];

  // tsconfig.json
  parsedConfig: ParsedCommandLine;
  tsConfig: {
    angularCompilerOptions?: AngularCompilerOptions;
    compilerOptions: CompilerOptions;
  };

  // compiler and compiler host
  aotCompiler: { compiler: AotCompiler, reflector: StaticReflector };
  host: Host;
  program: Program;
  ngCompilerHost: AotCompilerHost;

  constructor(private config: AotConfig) {
    if (!config.tsConfig) {
      throw new Error('tsconfig.json is required');
    }

    const tsConfigPath = resolve(process.cwd(), config.tsConfig);
    this.tsConfig = require(tsConfigPath);

    this.parsedConfig = parseJsonConfigFileContent(this.tsConfig, sys, dirname(tsConfigPath), null, tsConfigPath);

    const angularCompilerOptions = this.tsConfig.angularCompilerOptions;
    angularCompilerOptions.basePath = angularCompilerOptions.basePath || dirname(tsConfigPath);
    angularCompilerOptions.genDir = join(angularCompilerOptions.basePath, angularCompilerOptions.genDir || '__generated');

    const [path, module] = angularCompilerOptions.entryModule.split('#');
    this.entryModule = {path, module};

    this.host = new Host(this.parsedConfig.options, angularCompilerOptions.basePath);
    this.context = new AotContext(this.host);

    this.program = createProgram(this.parsedConfig.fileNames, this.parsedConfig.options, this.host, this.program);

    this.ngCompilerHost = new AotCompilerHost(this.program, angularCompilerOptions, this.context, this.sourceFileCache);
    this.aotCompiler = createAotCompiler(this.ngCompilerHost, {});
  }

  apply(compiler: any) {
    this.context.compiler = compiler;
    this.host.compiler = compiler;

    // compiler.watchFileSystem.watcher

    let errors: string[] = [];
    compiler.plugin('make', async (compilation: any, callback: any) => {
      errors = [];
      compilation.aotPlugin = this;
      this.context.compilation = compilation;
      this.host.compilation = compilation;

      if (!this.ranInitialCompile) {
        // if we haven't compiled yet, we need to go through all the possible files
        // in order to resolve the metadata for the whole codebase
        try {
          this.compilePromise = this.compileFiles(this.parsedConfig.fileNames);
          await this.compilePromise;
          this.ranInitialCompile = true;
        } catch (err) {
          errors.push(err);
        }
      }

      // manually keep track of file changes so we only recompile the changed files
      let changedFiles = Object.keys(compilation.fileTimestamps)
        .filter((file) => (this.prevTimestamps.get(file) || this.startTime) < (compilation.fileTimestamps[file] || Infinity));

      let extraFiles: string[] = [];
      for (const changedFile of changedFiles) {
        if (this.resources.has(changedFile)) {
          extraFiles = filterDuplicates([...extraFiles, ...this.resources.get(changedFile)]);
        }
      }

      changedFiles = changedFiles
        .filter((file) => !this.resources.has(file))
        .concat(extraFiles);

      this.prevTimestamps = new Map(objToMap<number>(compilation.fileTimestamps));

      const files = changedFiles.length ? changedFiles : this.parsedConfig.fileNames;

      try {
        this.createSourceFiles(files, compilation);

        if (changedFiles.length) {
          // compile files if we've got newly updated files
          this.compilePromise = this.compileFiles(changedFiles);
          await this.compilePromise;
        }
      } catch (err) {
        errors.push(err);
      }

      callback();
    });

    compiler.plugin('after-emit', (compilation: any, callback: any) => {
      if (errors.length) {
        // add files to the file dependencies so webpack watches them
        compilation.fileDependencies = compilation.fileDependencies.concat(this.files);
        compilation.errors = compilation.errors.concat(errors);
      }
      callback();
    });

    compiler.plugin('after-resolvers', (compiler: any) => {
      compiler.resolvers.normal.plugin('before-resolve', async (request: any, callback: () => void) => {
        // we force all resolves to wait for the compilation to finish, except for ones for
        // resources (styleUrls, templateUrl), otherwise we end up with outdated files
        const requestExtension = extname(request.request);
        if (!this.context.resourceExtensions.includes(requestExtension)) {
          try {
            await this.compilePromise;
          } catch (err) {
            return callback();
          }
        }
        callback();
      });
    });
  }

  calculateEmitPath(filePath: string): string {
    let root = this.tsConfig.angularCompilerOptions.basePath;
    for (const eachRootDir of this.tsConfig.compilerOptions.rootDirs || []) {
      if (relative(eachRootDir, filePath).indexOf('.') !== 0) {
        root = eachRootDir;
      }
    }

    let relativePath: string = relative(root, filePath);
    while (relativePath.startsWith('..' + sep)) {
      relativePath = relativePath.substr(3);
    }

    return join(this.tsConfig.angularCompilerOptions.genDir, relativePath);
  }

  async compileFiles(files: string[], checkDependencies: boolean = true): Promise<void> {
    this.files = this.removeDeletedFiles(filterDuplicates(this.files.concat(files)));
    // store the compilation in a Promise so we can delay other parts of the build
    // until this has finished
    const compiler = (this.aotCompiler.compiler as any);
    const reflector = (this.aotCompiler.reflector as any);

    function loadMetadata(ngModule: CompileNgModuleMetadata) {
      return compiler._metadataResolver
        .loadNgModuleDirectiveAndPipeMetadata(ngModule.type.reference, false);
    }

    // loop through the changed files and get their canonical file name
    files = files.map((file) => this.ngCompilerHost.getCanonicalFileName(file));

    // remove any symbols for deleted files
    this.symbols = this.symbols
      .filter((symbol) => this.removeDeletedFiles([symbol.filePath]).length);

    // clear the cache for our files
    for (const file of files) {
      compiler._summaryResolver.summaryCache.delete(file);
      compiler._summaryResolver.loadedFilePaths.delete(file);
      compiler._symbolResolver.metadataCache.delete(file);
      compiler._symbolResolver.resolvedFilePaths.delete(file);
    }

    // filter out any non-source files
    const sourceFiles = files
      .filter((fileName) => this.ngCompilerHost.isSourceFile(fileName));

    // resolve the symbols for our source files
    for (const sourceFile of sourceFiles) {
      const symbols = compiler._symbolResolver.getSymbolsOf(sourceFile);
      for (const symbol of symbols) {
        const resolvedSymbol = compiler._symbolResolver.resolveSymbol(symbol);
        const symbolMetadata = resolvedSymbol.metadata;
        if (symbolMetadata && symbolMetadata.__symbolic !== 'error') {
          this.symbols.push(resolvedSymbol.symbol);
        }
      }
    }

    // analyze and validate the ngModules for the files that are being compiled
    let { ngModuleByPipeOrDirective: ngModule, files: filesToCompile, ngModules } =
      analyzeAndValidateNgModules(this.symbols, this.ngCompilerHost, compiler._metadataResolver);

    if (this.ranInitialCompile) {
      // we've already ran the first compilation, so we want to restrict the compilation
      // to just the changed files, not all files
      filesToCompile = filesToCompile
        .filter((file) => files.includes(file.srcUrl));
    }

    // clear the different caches that may contain the changed files
    const cachedItems = ['directives', 'pipes', 'ngModules'];
    for (const analyzedFile of filesToCompile) {
      for (const item of cachedItems) {
        (analyzedFile as any)[item].forEach((item: StaticSymbol) => {
          compiler._metadataResolver.clearCacheFor(item);
          reflector.annotationCache.delete(item);
          reflector.propertyCache.delete(item);
          reflector.parameterCache.delete(item);
          reflector.methodCache.delete(item);
        });
      }
    }

    // wait for the metadata collection of all the ngModules to complete
    await Promise.all(ngModules.map(loadMetadata));

    let generatedFiles: GeneratedFile[] = [];
    for (const file of filesToCompile) {
      // attempt to compile the file, reject the build promise if it fails
      const { directives, injectables, ngModules, pipes, srcUrl } = file;
      const compiledFile = compiler._compileSrcFile(srcUrl, ngModule, directives, pipes, ngModules, injectables);
      generatedFiles = generatedFiles.concat(compiledFile);
    }

    for (const generatedFile of generatedFiles) {
      const { genFileUrl, source, srcFileUrl } = generatedFile;
      const emitPath = this.calculateEmitPath(genFileUrl);
      const emitFileName = emitPath.replace(FILE_EXTENSION, '');
      if (/ngsummary\.json$/.test(emitPath)) {
        continue;
      }
      const sourceFile = createSourceFile(emitPath, source, ScriptTarget.Latest);
      this.sourceFileCache.set(emitPath, sourceFile);

      const classes = findNodes<ClassDeclaration>(sourceFile, SyntaxKind.ClassDeclaration);
      const isModule = classes.some((declaration) => INJECTOR.test(declaration.name.text));
      if (!isModule) {
        const localDependencies = this.findLocalDependencies(sourceFile)
          .filter((path) => /ngfactory$/.test(path))
          .map((path) => join(dirname(emitPath), path));

        for (const path of localDependencies) {
          if (!this.componentDependencies.has(path)) {
            this.componentDependencies.set(path, []);
          }
          const dependencies = this.componentDependencies.get(path);
          if (!dependencies.includes(srcFileUrl)) {
            this.componentDependencies.set(path, this.removeDeletedFiles([...dependencies, srcFileUrl]));
          }
        }
      }

      const shouldCompileDependencies = checkDependencies && this.ranInitialCompile;
      const isComponentDependency = this.componentDependencies.has(emitFileName);
      const hasComponentDependency = this.moduleDependencies.has(srcFileUrl);

      if (shouldCompileDependencies) {
        if (isComponentDependency) {
          await this.compileFiles(this.componentDependencies.get(emitFileName), false);
        }
        if (hasComponentDependency) {
          await this.compileFiles(this.moduleDependencies.get(srcFileUrl));
        }
      }

      this.host.writeFile(emitPath, generatedFile.source);
    }
  }

  createSourceFiles(files: string[], compilation: any) {
    const { fileSystem } = compilation.resolvers.normal;
    for (const file of files) {
      // we cache the source file here as it can be used in multiple places
      const source = fileSystem.readFileSync(file).toString();
      const sourceFile = createSourceFile(file, source, ScriptTarget.Latest);
      this.sourceFileCache.set(file, sourceFile);

      const decorators = findNodes<Decorator>(sourceFile, SyntaxKind.Decorator);
      const isModule = decorators.some((decorator) => getDecorator(decorator) === 'NgModule');
      if (isModule) {
        const {loadChildren, fileDependencies} = this.getModuleDependencies(sourceFile, file);
        this.createSourceFiles(loadChildren, compilation);
        if (!compilation.fileDependencies) {
          compilation.fileDependencies = [];
        }
        compilation.fileDependencies = compilation.fileDependencies.concat(fileDependencies);
      }
    }
  }

  getModuleDependencies(sourceFile: SourceFile, file: string) {
    const fileDependencies: string[] = [];
    const localDependenciesSearch = this.findLocalDependencies(sourceFile);
    const localDependencies = localDependenciesSearch
      .map((path) => resolveModuleName(path, file, this.parsedConfig.options, this.host))
      .map((resolved, index) => {
        if (!resolved.resolvedModule) {
          throw new Error(`Error: ${file} attempted to import ${localDependenciesSearch[index]}, but it doesn't exist`);
        }
        return resolved.resolvedModule.resolvedFileName;
      });

    for (const path of localDependencies) {
      if (!this.moduleDependencies.has(file)) {
        this.moduleDependencies.set(file, []);
      }
      const dependencies = this.moduleDependencies.get(file);
      if (!dependencies.includes(path)) {
        fileDependencies.push(path);
        this.moduleDependencies.set(file, this.removeDeletedFiles([...dependencies, path]));
      }
    }

    const loadChildren = getPropertyAssignments(sourceFile)
      .filter(byPropertyName('loadChildren'))
      .map((child) => getInitializer(child).split('#'))
      .map(([path]) => resolveModuleName(path, file, this.parsedConfig.options, this.host))
      .map((resolved) => resolved.resolvedModule.resolvedFileName);

    for (const child of loadChildren) {
      const dependencies = this.moduleDependencies.get(file);
      if (!dependencies.includes(child)) {
        fileDependencies.push(child);
        this.moduleDependencies.set(file, this.removeDeletedFiles([...dependencies, child]));
      }
    }

    return {loadChildren, fileDependencies};
  }

  findLocalDependencies(sourceFile: SourceFile) {
    return findNodes<ImportDeclaration>(sourceFile, SyntaxKind.ImportDeclaration)
      .map((dec) => getModule(dec))
      .filter((path) => path.charAt(0) === '.');
  }

  registerResources(from: string, resources: string[]) {
    const dependencies = this.resourcesDependencies.get(from);
    if (dependencies) {
      for (const dependency of dependencies) {
        if (this.resources.has(dependency)) {
          const dependencies = this.resources.get(dependency)
            .filter((dependency) => dependency !== from);
          this.resources.set(dependency, this.removeDeletedFiles(dependencies));
        }
      }
    }

    this.resourcesDependencies.set(from, [...resources]);
    for (const resource of resources) {
      if (!this.resources.has(resource)) {
        this.resources.set(resource, []);
      }

      const resources = this.resources.get(resource);
      if (!resources.includes(from)) {
        this.resources.set(resource, this.removeDeletedFiles([...resources, from]));
      }
    }
  }

  removeDeletedFiles(files: string[]) {
    return files.filter((file) => this.host.fileExists(file));
  }
}
