/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2024-06-14 12:20:56
 * @LastEditors: ZhouZiyu
 * @LastEditTime: 2024-07-30 21:22:40
 */

import vtkStateBuilder from '@kitware/vtk.js/Widgets/Core/StateBuilder.js';

// separately from the rest of the widget state.

const linePosState = vtkStateBuilder.createBuilder().addField({
  name: 'posOnLine',
  initialValue: 1
}).build();
function stateGenerator() {
  return vtkStateBuilder.createBuilder()
  .addStateFromMixin({
    labels: ['handle1'],
    mixins: ['origin', 'color3', 'scale1', 'visible', 'manipulator', 'shape'],
    name: 'handle1',
    initialValues: {
      scale1: 4,
      visible: true,
      color3: [64, 64, 204],
    }
  }).addStateFromMixin({
    labels: ['handle2'],
    mixins: ['origin', 'color3', 'scale1', 'visible', 'manipulator', 'shape'],
    name: 'handle2',
    initialValues: {
      scale1: 4,
      visible: true,
      color3: [64, 64, 204],
    }
  }).addStateFromMixin({
    labels: ['SVGtext'],
    mixins: ['origin', 'color3', 'text', 'visible'],
    name: 'text',
    initialValues: {
      /* text is empty to set a text filed in the SVGLayer and to avoid
       * displaying text before positioning the handles */
      text: ''
    }
  }).addStateFromInstance({
    name: 'positionOnLine',
    instance: linePosState
  }).addField({
    name: 'lineThickness'
  }).build();
}

export { stateGenerator as default };
