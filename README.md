# Ultimate Angular AoT loader (beta)

**This is currently in beta - please report any issues you may have with it**

Compile and develop your Angular applications using AoT compilation, removing the need for you to include the Angular compiler when distributing your app, as well as making it super fast.

### Installation

To install, simply run the following:

```bash
yarn add --dev @ultimate/aot-loader

# OR

npm i --save-dev @ultimate/aot-loader
```

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

### Code splitting

The loader will also automatically split out any routes for you that you have defined using `loadChildren`, meaning your application will load and compile faster.

To take advantage of this, configure your routes like so:

```js
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Routes, RouterModule } from '@angular/router';

import { AppComponent } from './app.component';

export const ROUTER_CONFIG: Routes = [
  { path: '', loadChildren: './containers/home/home.module#HomeModule' },
  { path: 'about', loadChildren: './containers/about/about.module#AboutModule' },
  { path: 'contact', loadChildren: './containers/contact/contact.module#ContactModule' }
];

@NgModule({
  imports: [
    BrowserModule,
    RouterModule,
    RouterModule.forRoot(ROUTER_CONFIG)
  ],
  bootstrap: [
    AppComponent
  ],
  declarations: [
    AppComponent
  ]
})
export class AppModule {}
```

### Sass, Less, etc

You can use any CSS preprocessor with the loader. Just set up your loaders how you would normally and use `raw-loader` as the last loader.

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
        test: /\.scss$/,
        loaders: ['raw-loader', 'sass-loader']
      },
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

Example component:

```js
import { Component } from '@angular/core';

@Component({
  selector: 'example-component',
  styleUrls: ['example-component.scss'],
  template: `
    <div class="example-component">
      <h3 class="example-component__title">This is an example component!</h3>
      <p class="example-component__description">Wooo!!!</p>
    </div>
  `
})
export class ExampleComponent {
}
```

And `example-component.scss` may look something like this:

```scss
.example-component {
  &__title {
    font-size: 24px;
    margin: 0;
  }
  
  &__description {
    font-size: 16px;
    line-height: 23px;
  }
}
```

### External HTML templates

To use external HTML templates for your components, simply add `raw-loader` as the loader for all HTML files:
 
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
        test: /\.html$/,
        loaders: ['raw-loader']
      },
      {
        test: /\.scss$/,
        loaders: ['raw-loader', 'sass-loader']
      },
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

Example component:

```js
import { Component } from '@angular/core';

@Component({
  selector: 'example-component',
  templateUrl: 'home.component.html'
})
export class ExampleComponent {
}
```
