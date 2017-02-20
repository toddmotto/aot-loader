# Ultimate Angular AoT loader

Compile and develop your Angular applications using AoT compilation, removing the need for you to include the Angular compiler when distributing your app, as well as making it super fast.

### Usage

To use, simply include the AoT loader as a loader for your TypeScript files. It'll also act as a TypeScript loader, respecting your configuration inside `tsconfig.json`.

You'll also need to use the `AoTPlugin` that is provided with the loader.

```js
const aotLoader = require('@ultimate/aot-loader');

module.exports = {
  entry: {
    app: ['./app/main.ts']
  },
  output: {
    filename: '[name].js',
    publicPath: '/build/',
    path: path.resolve(__dirname, 'build')
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loaders: ['@ultimate/aot-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  plugins: [
  	new aotLoader.AotPlugin({
      tsConfig: './tsconfig.json'
    })
  ]
};
```

Your `tsconfig.json` will need to have an `angularCompilerOptions` section, pointing to the output directory as well as your entry module (the one you bootstrap).

```json
{
  "angularCompilerOptions": {
    "entryModule": "./app/app.module#AppModule",
    "genDir": "./ngfactory"
  },
  "compilerOptions": {
    "baseUrl": "",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "module": "es2015",
    "moduleResolution": "node",
    "noEmit": true,
    "noEmitHelpers": true,
    "noImplicitAny": false,
    "rootDir": ".",
    "sourceMap": true,
    "skipLibCheck": true,
    "target": "es5"
  }
}
```

Outputted files will be cached in memory, so all the AoT generated files will not leak out into your app source code.
