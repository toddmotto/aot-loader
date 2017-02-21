import { expect } from 'chai';
import { CallExpression, ImportDeclaration, PropertyAccessExpression, SyntaxKind } from 'typescript';

import * as path from 'path';
import * as webpack from 'webpack';

import { createSource, findNodes, getModule } from '../utils';
import { config } from './assets/webpack.config';

const run = async () => {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err);
      }

      if (stats.hasErrors()) {
        reject(stats.toString());
      }

      resolve(stats);
    });
  });
};

describe('AST code swapping', async () => {
  let sourceFile;
  let imports;
  let calls;

  before(async () => {
    sourceFile = createSource(await run(), path.resolve(__dirname, './assets/app/main.ts'));
    calls = findNodes<CallExpression>(sourceFile, SyntaxKind.CallExpression);
    imports = findNodes<ImportDeclaration>(sourceFile, SyntaxKind.ImportDeclaration).map(getModule);
  });

  it('should change @angular/platform-browser-dynamic import to @angular/platform', () => {
    expect(imports).to.include('@angular/platform-browser');
  });

  it('should change ./app.module import to its ngfactory', () => {
    expect(imports).to.include('./../ngfactory/app/app.module.ngfactory');
  });

  it('should change bootstrapModule to bootstrapModuleFactory', () => {
    const bootstraps = calls
      .filter((node) => node.expression.kind === SyntaxKind.PropertyAccessExpression)
      .map((node) => node.expression as PropertyAccessExpression)
      .filter((expression) => expression.name.kind === SyntaxKind.Identifier)
      .map((call) => call.name.text);

    expect(bootstraps).to.include('bootstrapModuleFactory');
  });

  it('should change platformBrowserDynamic to platformBrowser', () => {
    const bootstraps = calls
      .filter((node) => node.expression.kind === SyntaxKind.PropertyAccessExpression)
      .map((node) => node.expression as PropertyAccessExpression)
      .reduce((previous, next) => previous.concat(findNodes<CallExpression>(next, SyntaxKind.CallExpression, sourceFile)), [])
      .filter((call) => call.expression.kind === SyntaxKind.Identifier)
      .map((call) => call.expression.text);

    expect(bootstraps).to.include('platformBrowser');
  });

  it('should change AppModule to AppModuleNgFactory', () => {
    const bootstrappedModules = calls
      .filter((node) => node.expression.kind === SyntaxKind.PropertyAccessExpression)
      .map((node) => node.expression as PropertyAccessExpression)
      .filter((expression) => expression.name.kind === SyntaxKind.Identifier)
      .filter((expression) => expression.name.text === 'bootstrapModuleFactory');

    const modules = calls
      .filter((call) => bootstrappedModules.some((bootstrap) => bootstrap === call.expression))
      .map((call) => call.arguments[0].text);

    expect(modules).to.include('AppModuleNgFactory');
  });
});
