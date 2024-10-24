/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhouZiyu
 * @Date: 2024.07.30 21:22:18
 */
import { m as macro } from '@kitware/vtk.js/macros2.js';
import _defineProperty from '@babel/runtime/helpers/defineProperty';
import _toConsumableArray from '@babel/runtime/helpers/toConsumableArray';
import { s as subtract, l as add, m as normalize, d as dot, x as multiplyScalar, f as distance2BetweenPoints, O } from '@kitware/vtk.js/Common/Core/Math/index.js';
import { getNumberOfPlacedHandles, isHandlePlaced, calculateTextPosition, updateTextPosition, getPoint } from './helpers.js';
import Constants from '@kitware/vtk.js/Widgets/Widgets3D/LineWidget/Constants.js';
import vtkMath from '@kitware/vtk.js/Common/Core/Math.js';
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";


function widgetBehavior(publicAPI, model) {
  // const {dependingPoints} = model.behaviorParams
  const {store, selectedTeethType, name1, name2} = model.behaviorParams
  const state = model.widgetState;
  const centerHandle1 = state.getHandle1();
  const centerHandle2 = state.getHandle2();

  model.linkCenter = [0, 0, 0]; // 半径的中心
  model.linkDirection1 = [0, 0, 0];
  model.linkDirection2 = [0, 0, 0];
  let radius = 0;
  model.modifyLinkRatio = [0.01, 50]
  let newcenter1 = null;
  let newcenter2 = null;
  
  model._isDragging = false;
  model.previousPosition1 = null;
  model.previousPosition2 = null;
  model.classHierarchy.push('vtkLineWidgetProp');
  centerHandle1.setVisible(false);
  centerHandle2.setVisible(false);
  function isValidHandle(handle) {
    return handle === centerHandle1 || handle === centerHandle2;
  }
  function isPlaced() {
    return !!centerHandle1.getOrigin() && !!centerHandle2.getOrigin();
  }

  // 更新半径和中心
  function updateSphere(){
    const center1 = centerHandle1.getOrigin();
    if (!center1) return;
    const center2 = centerHandle2.getOrigin();
    if (!center2) return;
    vtkMath.add(center1, center2, model.linkCenter);
    vtkMath.multiplyScalar(model.linkCenter, 0.5);
    radius = Math.sqrt(vtkMath.distance2BetweenPoints(center1, center2)) / 2;
    // console.log('##center', model.linkCenter);
    // console.log('##R', radius);
    vtkMath.subtract(center1, model.linkCenter, model.linkDirection1);
    vtkMath.normalize(model.linkDirection1);
    vtkMath.subtract(center2, model.linkCenter, model.linkDirection2);
    vtkMath.normalize(model.linkDirection2);

    centerHandle1.setVisible(true);
    centerHandle2.setVisible(true);
    model._interactor.render();
  }

  // 当前鼠标经过的位置
  function currentWorldCoords(e) {
    const manipulator = model.activeState?.getManipulator?.() ?? model.manipulator;
    return manipulator.handleEvent(e, model._apiSpecificRenderWindow).worldCoords;
  }

  // 更新更改handle后的圆的半径和中心
  publicAPI.setCenter = (center1, center2) => {
    centerHandle1.setOrigin(center1);
    centerHandle2.setOrigin(center2);
    let centerDistance = Math.sqrt(vtkMath.distance2BetweenPoints(center1, center2));
    model.modifyLinkRange = [
      centerDistance * model.modifyLinkRatio[0],
      centerDistance * model.modifyLinkRatio[1],
    ];
    updateSphere();
    model._widgetManager.enablePicking();
  }

  // 计算移动handle1后的更新的handle1和handle2
  function calChangedCoord1(worldCoords){
    // console.log('##Mouse', 'handle1');
    var worldVector = [];
    vtkMath.subtract(worldCoords, model.linkCenter, worldVector);
    var projvector = [];
    vtkMath.projectVector(worldVector, model.linkDirection1, projvector);

    var movedCoord1 = [];
    var movedCoord2 = [];

    vtkMath.add(model.linkCenter, projvector, movedCoord1);
    vtkMath.subtract(model.linkCenter, projvector, movedCoord2);

    // 范围限制待定
    if(Math.sqrt(vtkMath.distance2BetweenPoints(model.linkCenter, movedCoord1))>model.modifyLinkRange[1]){
      var tmp = [...model.linkDirection1];
      vtkMath.multiplyScalar(tmp, model.modifyLinkRange[1]);
      vtkMath.add(model.linkCenter, tmp, movedCoord1);
      vtkMath.subtract(model.linkCenter, tmp, movedCoord2);
    }
    if(Math.sqrt(vtkMath.distance2BetweenPoints(model.linkCenter, movedCoord1))<model.modifyLinkRange[0]){
      var tmp = [...model.linkDirection1];
      vtkMath.multiplyScalar(tmp, model.modifyLinkRange[0]);
      vtkMath.add(model.linkCenter, tmp, movedCoord1);
      vtkMath.subtract(model.linkCenter, tmp, movedCoord2);
    }
    return [movedCoord1, movedCoord2]
  }

  function calChangedCoord2(worldCoords){
    // console.log('##test', 'handle2');
    var worldVector = [];
    vtkMath.subtract(worldCoords, model.linkCenter, worldVector);
    var projvector = [];
    vtkMath.projectVector(worldVector, model.linkDirection2, projvector);

    var movedCoord1 = [];
    var movedCoord2 = [];
    vtkMath.subtract(model.linkCenter, projvector, movedCoord1);
    vtkMath.add(model.linkCenter, projvector, movedCoord2);
    
    if(Math.sqrt(vtkMath.distance2BetweenPoints(model.linkCenter, movedCoord2))>model.modifyLinkRange[1]){
      var tmp = [...model.linkDirection2];
      vtkMath.multiplyScalar(tmp, model.modifyLinkRange[1]);
      vtkMath.subtract(model.linkCenter, tmp, movedCoord1);
      vtkMath.add(model.linkCenter, tmp, movedCoord2);
    }
    if(Math.sqrt(vtkMath.distance2BetweenPoints(model.linkCenter, movedCoord2))<model.modifyLinkRange[0]){
      var tmp = [...model.linkDirection2];
      vtkMath.multiplyScalar(tmp, model.modifyLinkRange[0]);
      vtkMath.subtract(model.linkCenter, tmp, movedCoord1);
      vtkMath.add(model.linkCenter, tmp, movedCoord2);
    }

    return [movedCoord1, movedCoord2]
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
    model.lockActiveState = null
    publicAPI.invokeEndInteractionEvent();
    return macro.EVENT_ABORT;
  };

  model.lockActiveState = null;
  publicAPI.handleMouseMove = e => {
    if (!model._isDragging) {
      model.activeState = null;
      return macro.VOID;
    }
    if (!model.activeState) throw Error('no activestate');
    var worldCoords = currentWorldCoords(e);

    if (!isValidHandle(model.activeState)){
      model.activeState = model.lockActiveState
    }
    if(model.activeState != model.lockActiveState &&  model.lockActiveState != null){
      model.activeState = model.lockActiveState
    }

    if (model.activeState == centerHandle1){
      model.lockActiveState = centerHandle1;
      [newcenter1, newcenter2] = calChangedCoord1(worldCoords);
      centerHandle1.setOrigin(newcenter1);
      centerHandle2.setOrigin(newcenter2);
      model.previousPosition1 = newcenter1;
      model.previousPosition2 = newcenter2;
      const points = [newcenter1, newcenter2];
      jumpToTrans(selectedTeethType, points, name1, name2);
      // store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
      //   reCalculateArch: true,
      // });
    }
    else if (model.activeState == centerHandle2) {
      model.lockActiveState = centerHandle2;
      [newcenter1, newcenter2] = calChangedCoord2(worldCoords);
      centerHandle1.setOrigin(newcenter1);
      centerHandle2.setOrigin(newcenter2);
      model.previousPosition1 = newcenter1;
      model.previousPosition2 = newcenter2;
      const points = [newcenter1, newcenter2];
      jumpToTrans(selectedTeethType, points, name1, name2);
      // store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
      //   reCalculateArch: true,
      // });
    }
    // 调整小球促进牙弓线重新计算
    store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			reCalculateArch: true,
		});
    updateSphere();
    
    
    return macro.VOID;
  };

  publicAPI.grabFocus = () => {
    centerHandle1.setVisible(true);
    centerHandle2.setVisible(true);
    centerHandle1.setOrigin([0,0,0]);
    centerHandle2.setOrigin([0,0,0]);
    model._isDragging = true;
    model.activeState = centerHandle1;
    model._interactor.render();
  };
  publicAPI.loseFocus = () => {
    model._isDragging = false;
    model.activeState = null;
  };

  function jumpToTrans(selectedTeethType, points, name1, name2){
    // 传出小球的调整后位置
    const point1 = points['0'];
    const point2 = points['1'];

    // 24.10.23修改：小球拖动后的位置先反变换再存入center
    const invMatrixRecord = store.state.actorHandleState.invMatrixRecord;
    vtkMatrixBuilder
				.buildFromDegree()
				.setMatrix(invMatrixRecord)
				.apply(point1)
				.apply(point2);

    if (selectedTeethType=='upper'){
      if (name1=='D0' && name2=='D1') {
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { D0: point1, D1: point2 },
          },
        });
      };
      if (name1=='UL2' && name2=='UR2'){
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { UL2: point1, UR2: point2 },
          },
        });
      };
      if (name1=='UL5' && name2=='UR5'){
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { UL5: point1, UR5: point2 },
          },
        });
      };
      if (name1=='UL7' && name2=='UR7'){
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { UL7: point1, UR7: point2 },
          },
        });
      }
    };
    if (selectedTeethType=='lower'){
      if (name1=='D0' && name2=='D1') {
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { D0: point1, D1: point2 },
          },
        });
      };
      if (name1=='LL2' && name2=='LR2'){
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { LL2: point1, LR2: point2 },
          },
        });
      };
      if (name1=='LL4' && name2=='LR4'){
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { LL4: point1, LR4: point2 },
          },
        });
      };
      if (name1=='LL7' && name2=='LR7'){
        store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
          [selectedTeethType]: {
            centers: { LL7: point1, LR7: point2 },
          },
        });
      }
    }
  }
}

export { widgetBehavior as default };
