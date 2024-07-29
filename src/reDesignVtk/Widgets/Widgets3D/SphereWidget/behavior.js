/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2024-06-14 12:20:56
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2024-07-29 11:47:05
 */
import { m as macro } from '@kitware/vtk.js/macros2.js';
import { vec3 } from 'gl-matrix';
import * as vtkMath from "@kitware/vtk.js/Common/Core/Math";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";


function widgetBehavior(publicAPI, model) {
  const {dependingPoints, updatePosFunc, renderer, renderWindow, inverseMatrix} = model.behaviorParams
  const state = model.widgetState;
  const centerHandle = state.getCenterHandle();

  // Set while moving the center or border handle.
  model._isDragging = false;
  // The last world coordinate of the mouse cursor during dragging.
  model.previousPosition = null;
  model.classHierarchy.push('vtkSphereWidgetProp');
  centerHandle.setVisible(false);
  function isValidHandle(handle) {
    return handle === centerHandle;
  }
  function isPlaced() {
    return !!centerHandle.getOrigin();
  }

  // Update the sphereHandle parameters from {center,border}Handle.
  function updateSphere() {
    const center = centerHandle.getOrigin();
    if (!center) return;
    centerHandle.setVisible(true);
    model._interactor.render();
  }
  function currentWorldCoords(e) {
    const manipulator = model.activeState?.getManipulator?.() ?? model.manipulator;
    return manipulator.handleEvent(e, model._apiSpecificRenderWindow).worldCoords;
  }

  // Update the sphere's center and radius.  Example:
  // handle.setCenterAndRadius([1,2,3], 10);
  publicAPI.setCenterAndRadius = (newCenter, newRadius) => {
    centerHandle.setOrigin(newCenter);
      updateSphere();
      model._widgetManager.enablePicking();
  };
  publicAPI.setCenter = (newCenter) => {
    centerHandle.setOrigin(newCenter);
    updateSphere();
    model._widgetManager.enablePicking();
  }
  publicAPI.handleLeftButtonPress = e => {
    if (!isValidHandle(model.activeState)) {
      model.activeState = null;
      return macro.VOID;
    }
    model._isDragging = true;
    model._apiSpecificRenderWindow.setCursor('grabbing');
    model.previousPosition = [...currentWorldCoords(e)];
    publicAPI.invokeStartInteractionEvent();
    return macro.EVENT_ABORT;
  };
  publicAPI.handleLeftButtonRelease = e => {
    if (!model._isDragging) {
      model.activeState = null;
      return macro.VOID;
    }
    if (isPlaced()) {
      model.previousPosition = null;
      model._widgetManager.enablePicking();
      model._apiSpecificRenderWindow.setCursor('pointer');
      model._isDragging = false;
      model.activeState = null;
      state.deactivate();
    }
    publicAPI.invokeEndInteractionEvent();
    return macro.EVENT_ABORT;
  };
  function calNearestPoint(p) {
    if(!dependingPoints){
      return p;
    }
    
    const sizeDependingPoints = dependingPoints.length;

    let nearestPoints = [
        dependingPoints[0],
        dependingPoints[1],
        dependingPoints[2],
    ];
    let minDist = vtkMath.distance2BetweenPoints(nearestPoints, p);
    for (let idx = 3; idx < sizeDependingPoints; idx += 3) {
        const pi = [
            dependingPoints[idx],
            dependingPoints[idx + 1],
            dependingPoints[idx + 2],
        ];
        const dist = vtkMath.distance2BetweenPoints(pi, p);
        if (dist < minDist) {
            minDist = dist;
            nearestPoints = pi;
        }
    }
    return nearestPoints;
  }

  //假如仅对widget的actor做矩阵变换，拖动小球会出现落点和显示不一致的情况
  //这是因为显示位置发生变换，交互位置和显示位置保持一致，但鼠标拖动时，behavior中的worldcoords仍是真实世界的位置，该位置会在矩阵变换后显示
  //因此会观察到小球位置有一个突变，相当于做了两次矩阵变化
  //在这里引入逆矩阵，用于对worldcoords进行矩阵变换，抵消actor的矩阵变换
  function applyMatrixPoint(point){
    const {inverseMatrix} = model.behaviorParams
    const matTransformer = vtkMatrixBuilder.buildFromDegree().setMatrix(inverseMatrix);
    matTransformer.apply(point)
  }
  
  publicAPI.handleMouseMove = e => {
    if (!model._isDragging) {
      model.activeState = null;
      return macro.VOID;
    }
    if (!model.activeState) throw Error('no activestate');
    var worldCoords = currentWorldCoords(e);
    applyMatrixPoint(worldCoords)

    worldCoords = calNearestPoint(worldCoords)
    model.activeState.setOrigin(worldCoords);
    model.previousPosition = worldCoords;
    updateSphere();
    updatePosFunc(
      [...worldCoords],
      renderer,
      renderWindow
    );
    return macro.VOID;
  };
  publicAPI.grabFocus = () => {
    centerHandle.setVisible(true);
    centerHandle.setOrigin([0,0,0]);
    model._isDragging = true;
    model.activeState = centerHandle;
    model._interactor.render();
  };
  publicAPI.loseFocus = () => {
    model._isDragging = false;
    model.activeState = null;
  };
}
export { widgetBehavior as default };
