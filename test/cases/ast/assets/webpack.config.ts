import { resolve } from 'path';
import { AotPlugin } from '@ultimate/aot-loader';

export const config = {
  context: __dirname,
  entry: {
    app: './app/main.ts'
  },
  output: {
    filename: '[name].js',
    publicPath: '/build/',
    path: resolve(__dirname, 'build')
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
    new AotPlugin({
      entryModule: './app/app.module#AppModule',
      tsConfig: resolve(__dirname, './tsconfig.json')
    })
  ]
};
