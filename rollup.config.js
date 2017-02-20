export default {
  context: 'this',
  entry: 'dist/index.js',
  dest: 'dist/bundle/ultimate.aot.umd.js',
  format: 'umd',
  moduleName: 'ultimate.aot',
  indent: true,
  globals: {
    'typescript': 'ts'
  }
};
