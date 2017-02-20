import MagicString from 'magic-string';
import { basename } from 'path';
import { RawSourceMap, SourceMapConsumer, SourceMapGenerator } from 'source-map';
import {
  ArrayLiteralExpression,
  CallExpression,
  createSourceFile,
  Identifier,
  ImportDeclaration,
  NamedImports,
  Node,
  NodeArray,
  ObjectLiteralExpression,
  PropertyAccessExpression,
  PropertyAssignment,
  ScriptTarget,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  transpileModule
} from 'typescript';

import { AotPlugin } from '../plugin';
import {
  byPropertyName,
  findNodes,
  flatten,
  getInitializer,
  getPropertyAssignments,
  normalizePath,
  removeUnnamedImports
} from './utils';

const loadChildrenTemplate =
  ([p, m]: string[]) => `loadChildren:()=>__TROPMI__('${p}.ngfactory').then((r)=>r.${m}NgFactory)`;

export class TransformFile {
  edited = false;
  sourceString: string;
  sourceText: MagicString;

  constructor(public resourcePath: string,
              public source: string,
              public aotPlugin: AotPlugin,
              public generateSourceMap: boolean,
              public sourceFile?: SourceFile) {
    if (!sourceFile) {
      this.sourceFile = createSourceFile(this.resourcePath, this.source, ScriptTarget.Latest);
    }

    this.sourceString = this.sourceFile.getFullText(this.sourceFile);
    this.sourceText = new MagicString(this.sourceString);
  }

  convertBootstrap(moduleName: string) {
    const calls = findNodes<CallExpression>(this.sourceFile, SyntaxKind.CallExpression);

    const bootstraps = calls
      .filter((node) => node.expression.kind === SyntaxKind.PropertyAccessExpression)
      .map((node) => node.expression as PropertyAccessExpression);

    const bootstrappedModules = bootstraps
      .filter((expression) => expression.name.kind === SyntaxKind.Identifier)
      .filter((expression) => expression.name.text === 'bootstrapModule');

    bootstrappedModules.forEach((bootstrap) => this.replaceNode(bootstrap.name, 'bootstrapModuleFactory'));
    bootstraps
      .reduce((previous, next) => previous.concat(findNodes<CallExpression>(next, SyntaxKind.CallExpression, this.sourceFile)), [])
      .filter((call) => call.expression.kind === SyntaxKind.Identifier)
      .filter((call) => (call.expression as Identifier).text === 'platformBrowserDynamic')
      .forEach((call) => this.replaceNode(call.expression, 'platformBrowser'));

    calls
      .filter((call) => bootstrappedModules.some((bootstrap) => bootstrap === call.expression))
      .forEach((call) => this.replaceNode(call.arguments[0], moduleName + 'NgFactory'));
  }

  convertLoadChildren() {
    const assignments = getPropertyAssignments(this.sourceFile)
      .filter(byPropertyName('loadChildren'));

    for (const node of assignments) {
      this.replaceNode(node, loadChildrenTemplate(getInitializer(node).split('#')));
    }
  }

  convertImport(from: {name: string, module: string}, to: {name: string, module: string}) {
    const imports = findNodes<ImportDeclaration>(this.sourceFile, SyntaxKind.ImportDeclaration);

    const fromImports = imports
      .filter((dec) => dec.moduleSpecifier.kind === SyntaxKind.StringLiteral)
      .filter((dec) => (dec.moduleSpecifier as StringLiteral).text === from.module)
      .filter(removeUnnamedImports);

    let needsImport = true;
    if (fromImports.length) {
      for (let i = 0; i < fromImports.length; i++) {
        let fromImport = fromImports[i];
        const namedBindings = (fromImport.importClause.namedBindings as NamedImports);
        const elements = namedBindings.elements;

        if (elements.some((element) => element.name.text === from.name)) {
          if (elements.length > 1) {
            let start = 0;
            let end = 0;
            for (let n = 0; n < elements.length; n++) {
              const element = elements[n];
              if (element.name.text === from.name) {
                start = (n > 0) ? elements[n - 1].getEnd() : element.getStart(this.sourceFile);
                end = (n > 0) ? element.getEnd() : elements[n + 1].getStart(this.sourceFile);
                break;
              }
            }

            this.sourceText.overwrite(start, end, '');
          } else {
            needsImport = false;
            this.replaceNode(fromImport.moduleSpecifier, `'${to.module}'`);
            this.replaceNode(elements[0], to.name);

            break;
          }
        }
      }
    }

    if (needsImport) {
      const toImports = imports
        .filter((dec) => dec.moduleSpecifier.kind === SyntaxKind.StringLiteral)
        .filter((dec) => (dec.moduleSpecifier as StringLiteral).text === to.module)
        .filter(removeUnnamedImports);

      if (toImports.length) {
        for (let i = 0; i < toImports.length; i++) {
          const toImport = toImports[i];
          const namedBindings = (toImport.importClause.namedBindings as NamedImports);
          const elements = namedBindings.elements;
          const hasImport = elements.some((element) => element.name.text === to.name);

          if (hasImport) {
            break;
          }

          this.sourceText.prependRight(elements[elements.length - 1].getEnd(), `, ${to.name}`);
        }
      } else {
        this.sourceText.prependRight(imports[imports.length - 1].getEnd(), `import {${to.name}} from '${to.module}';`);
      }
    }
  }

  getResources(): string[] {
    const properties = getPropertyAssignments(this.sourceFile);

    let resources: StringLiteral[] = [];
    const styleUrlsProperty = properties.find(byPropertyName('styleUrls'));
    if (styleUrlsProperty) {
      resources = resources.concat((styleUrlsProperty.initializer as ArrayLiteralExpression).elements as NodeArray<StringLiteral>);
    }

    const templateUrlProperty = properties.find(byPropertyName('templateUrl'));
    if (templateUrlProperty) {
      resources.push(templateUrlProperty.initializer as StringLiteral);
    }

    return resources.map(normalizePath);
  }

  replaceNode(node: Node, contents: string) {
    this.edited = true;
    const store = node.kind === SyntaxKind.Identifier;
    this.sourceText.overwrite(node.getStart(this.sourceFile), node.getEnd(), contents, store);
  }

  transpile(): { outputText: string, sourceMap: RawSourceMap } {
    const result = transpileModule(this.sourceText.toString(), {
      compilerOptions: {
        ...this.aotPlugin.parsedConfig.options,
        inlineSources: true,
        inlineSourceMap: false,
        sourceMap: true,
        sourceRoot: this.aotPlugin.parsedConfig.options.baseUrl
      },
      fileName: this.resourcePath
    });

    let sourceMap = JSON.parse(result.sourceMapText);

    if (this.edited && this.generateSourceMap) {
      const consumer = new SourceMapConsumer(sourceMap);
      const generator = SourceMapGenerator.fromSourceMap(consumer);

      const textSourceMap = this.sourceText.generateMap({
        file: basename(this.resourcePath.replace(/\.ts$/, '.js')),
        source: this.resourcePath,
        includeAll: true
      });

      generator.applySourceMap(new SourceMapConsumer(textSourceMap), this.resourcePath);

      sourceMap = generator.toJSON();
      sourceMap.sources = [this.resourcePath];
      sourceMap.file = basename(this.resourcePath, '.ts') + '.js';
      sourceMap.sourcesContent = [this.sourceString];
    }

    return {
      outputText: result.outputText,
      sourceMap: sourceMap
    };
  }
}
