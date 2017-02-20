# Ultimate Angular AoT loader (beta)

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
