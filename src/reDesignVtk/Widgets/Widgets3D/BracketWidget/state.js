/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2024-05-10 11:05:17
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2024-05-22 19:46:18
 */
import vtkStateBuilder from '@kitware/vtk.js/Widgets/Core/StateBuilder.js';

const colorConfig = {
  teeth: [255, 255, 255],
  bracket: {
      default: [234, 230, 140],
      hover: [25, 204, 25],
      active: [204, 25, 25],
  },
};

// Defines the structure of the widget state.
// See https://kitware.github.io/vtk-js/docs/concepts_widgets.html.
function stateGenerator() {
    return vtkStateBuilder.createBuilder()
    // The handle used only for during initial placement.
    .addStateFromMixin({
      labels: ['centerHandle'],
      mixins: ['origin', 'color3', 'scale1', 'visible', 'manipulator'],
      name: 'centerHandle',
      initialValues: {
        scale1: 1,
        color3: colorConfig.bracket.default,
        visible: true,
      }
    }).build();
  }
  
  export { stateGenerator as default };
  