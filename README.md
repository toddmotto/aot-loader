# Ultimate Angular AoT loader (beta)

[![Build Status][circle-badge]][circle-badge-url]
[![Dependency Status][david-badge]][david-badge-url]
[![devDependency Status][david-dev-badge]][david-dev-badge-url]
[![npm][npm-badge]][npm-badge-url]

**This is currently in beta - please report any issues you may have with it**

This loader allows you to compile and develop your Angular applications using AoT compilation, removing the need for you to include the Angular compiler when distributing your app, as well as making it super fast.

It code splits out your routes, making compilation time faster as well as making your application super-quick as you're no longer serving your entire application at once.

You can use the loader along side any CSS preprocessor you like, allowing you to use Sass and Less in your component files.

### Installation

To install, simply run the following:

```bash
yarn add --dev @ultimate/aot-loader

# OR

npm i --save-dev @ultimate/aot-loader
```

### Usage

You can see how to use the AoT loader in the [wiki here](https://github.com/UltimateAngular/aot-loader/wiki).

[circle-badge]: https://circleci.com/gh/UltimateAngular/aot-loader.svg?style=shield
[circle-badge-url]: https://circleci.com/gh/UltimateAngular/aot-loader
[david-badge]: https://david-dm.org/UltimateAngular/aot-loader.svg
[david-badge-url]: https://david-dm.org/UltimateAngular/aot-loader
[david-dev-badge]: https://david-dm.org/UltimateAngular/aot-loader/dev-status.svg
[david-dev-badge-url]: https://david-dm.org/UltimateAngular/aot-loader?type=dev
[npm-badge]: https://img.shields.io/npm/v/@ultimate/aot-loader.svg
[npm-badge-url]: https://www.npmjs.com/package/@ultimate/aot-loader
