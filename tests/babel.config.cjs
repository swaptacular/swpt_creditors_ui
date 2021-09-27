module.exports = {
  presets: [
    // Allows smart transpilation according to target environments
    ['@babel/preset-env', {targets: {node: 'current'}}],

    // Enabling Babel to understand TypeScript
    '@babel/preset-typescript',
  ],
}
