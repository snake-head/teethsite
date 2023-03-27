// module.exports = {
//   presets: [
//     '@vue/cli-plugin-babel/preset'
//   ]
// }

// module.exports = {
//   presets: [
//     '@vue/cli-plugin-babel/preset',
//     ["@babel/preset-env", { "modules": false }]
//   ],
//   "plugins": [
//     [
//       "component",
//       {
//         "libraryName": "element-plus",
//         "styleLibraryName": "theme-chalk"
//       }
//     ]
//   ],
// }

module.exports = {
  presets: [
    '@vue/cli-plugin-babel/preset',
  ],
  plugins: [
    [
      "import",
      {
        libraryName: 'element-plus',
        customStyleName: (name) => {
          return `element-plus/lib/theme-chalk/${name}.css`;
        },
      },
    ],
  ],
};