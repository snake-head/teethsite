/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhouZiyu
 * @Date: 2024-07-30 21:32:10
 * @LastEditors: 
 * @LastEditTime: 
 */
import { e as distance2BeSpheretweenPoints } from '@kitware/vtk.js/Common/Core/Math/index.js';
import vtkAbstractWidgetFactory from '../Core/AbstractWidgetFactory.js';
import _defineProperty from '/node_modules/@babel/runtime/helpers/defineProperty';
import { f as distance2BetweenPoints } from '/node_modules/@kitware/vtk.js/Common/Core/Math/index.js';
import vtkPlanePointManipulator from '@kitware/vtk.js/Widgets/Manipulators/PlaneManipulator.js';
import vtkPolyLineRepresentation from '/node_modules/@kitware/vtk.js/Widgets/Representations/PolyLineRepresentation.js';
import { getPoint, updateTextPosition } from '@kitware/vtk.js/Widgets/Widgets3D/LineWidget/helpers.js';
import { m as macro } from '@kitware/vtk.js/macros2.js';
import widgetBehavior from './LineWidget/behavior.js';
import stateGenerator from './LineWidget/state.js';
// import generateState from './LineWidget/state.js';

import vtkLineHandleRepresentation from '../Representations/LineHandleRepresentation.js';


function vtkLineWidget(publicAPI, model){
  model.classHierarchy.push('vtkLineWidget');
  const superClass = {
    ...publicAPI
  };
  model.methodsToLink = ['scaleInPixels'];
  publicAPI.getRepresentationsForViewType = viewType => [{
    builder: vtkLineHandleRepresentation,
    labels: ['handle1'],
    initialValues: {
      activeColor: model.activeColor,
      activeScaleFactor: model.activeScaleFactor,
    }
  },
  {
    builder: vtkLineHandleRepresentation,
    labels: ['handle2'],
    initialValues: {
      activeColor: model.activeColor,
      activeScaleFactor: model.activeScaleFactor,
    }
  },
  {
    builder: vtkPolyLineRepresentation,
    labels: ['handle1', 'handle2'],
    initialValues: {
      lineThickness: 0.5,
      // behavior: Behavior.HANDLE,
      // pickable: true
    }
  }
];

  // --- Public methods -------------------------------------------------------

  publicAPI.getRadius = () => {
    const h1 = model.widgetState.getCenterHandle();
    return 1;
  };
  publicAPI.getDistance = function () {
    const p1 = getPoint(0, model.widgetState);
    const p2 = getPoint(1, model.widgetState);
    return p1 && p2 ? Math.sqrt(distance2BetweenPoints(p1, p2)) : 0;
  };
  publicAPI.setManipulator = manipulator => {
    superClass.setManipulator(manipulator);
    model.widgetState.getHandle1().setManipulator(manipulator);
    model.widgetState.getHandle2().setManipulator(manipulator);
  }

  // --------------------------------------------------------------------------
  // initialization
  // --------------------------------------------------------------------------
  publicAPI.setManipulator(model.manipulator || vtkPlanePointManipulator.newInstance({
    useCameraNormal: true
  }));
}
const defaultValues = initialValues => ({
  behavior: widgetBehavior,
  widgetState: stateGenerator(),
  ...initialValues
});
function extend(publicAPI, model) {
  let initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  Object.assign(model, defaultValues(initialValues));
  vtkAbstractWidgetFactory.extend(publicAPI, model, initialValues);
  macro.setGet(publicAPI, model, ['manipulator', 'widgetState']);
  vtkLineWidget(publicAPI, model);
} 
const newInstance = macro.newInstance(extend, 'vtkLineWidget'); 
var vtkLineWidget$1 = {
  newInstance,
  extend: extend
};

export { vtkLineWidget$1 as default, extend, newInstance };