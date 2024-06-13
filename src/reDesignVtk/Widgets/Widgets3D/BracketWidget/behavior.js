/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2024-05-10 11:05:05
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2024-05-30 20:02:24
 */
import { m as macro } from '@kitware/vtk.js/macros2.js';
import { vec3 } from 'gl-matrix';

function widgetBehavior(publicAPI, model, {store, name}) {
    const state = model.widgetState;
    const centerHandle = state.getCenterHandle();
  
    // Set while moving the center or border handle.
    model._isDragging = false;
    // The last world coordinate of the mouse cursor during dragging.
    model.previousPosition = null;
    model.classHierarchy.push('vtkBracketWidgetProp');
    centerHandle.setVisible(false);
    function isValidHandle(handle) {
      return handle === centerHandle;
    }
    function isPlaced() {
      return !!centerHandle.getOrigin();
    }
  
    // Update the bracketHandle parameters from {center,border}Handle.
    function updateBracket() {
        var center = centerHandle.getOrigin();
        if (!center) return;
        centerHandle.setVisible(true);
        model._interactor.render();
    }
    function currentWorldCoords(e) {
      const manipulator = model.activeState?.getManipulator?.() ?? model.manipulator;
      return manipulator.handleEvent(e, model._apiSpecificRenderWindow).worldCoords;
    }
  
    // Update the bracket's center and radius.  Example:
    // handle.setCenterAndRadius([1,2,3], 10);
    publicAPI.setCenter = (newCenter)=>{
      centerHandle.setOrigin(newCenter);
      updateBracket();
      model._widgetManager.enablePicking();
    }
    // 定义一个变量来存储上一次左键按下的时间
    let lastLeftButtonDownTime = 0;
    let clickState;

    // 修改 handleLeftButtonPress 函数来支持双击检测
    publicAPI.handleLeftButtonPress = e => {
      const currentTime = new Date().getTime();
      const timeDiff = currentTime - lastLeftButtonDownTime;

      // 检查双击
      if (timeDiff < 300) { // 双击间隔设为300毫秒
          publicAPI.onLeftButtonDoubleClick(e);
          lastLeftButtonDownTime = 0; // 重置时间，防止连续误触
          return macro.VOID; // 中断后续事件处理
      }

      lastLeftButtonDownTime = currentTime; // 更新最后点击时间
      if (!isValidHandle(model.activeState)) {
          model.activeState = null;
          return macro.VOID;
      }
      clickState = model.activeState
      publicAPI.invokeStartInteractionEvent();
      return macro.VOID;
    };

    // 定义双击事件处理函数
    // 双击屏幕任意位置，都会触发所有托槽widget的双击函数
    // 所以即使是想选中某一个托槽，也会导致同一时间其他widget将CurrentSelectBracketName写成''
    // 因此后面修改CurrentSelectBracketName必须加一个延时，使其是最后一个修改
    publicAPI.onLeftButtonDoubleClick = e => {
        centerHandle.setColor3([234, 230, 140])
        // 执行双击时需要处理的逻辑
        if (!isValidHandle(clickState)) {
          store.dispatch("actorHandleState/updateCurrentSelectBracketName", '');
            model.activeState = null;
            return macro.VOID;
        }
        clickState.setColor3([204, 25, 25])
        clickState = null;
        setTimeout(() => {
          store.dispatch("actorHandleState/updateCurrentSelectBracketName", name);
        }, 10);
        
        model.activeState = null
        // 例如，可以在此处添加特殊的交互逻辑
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
    publicAPI.handleMouseMove = e => {
      if (!model._isDragging) {
        model.activeState = null;
        return macro.VOID;
      }
      if (!model.activeState) throw Error('no activestate');
      const worldCoords = currentWorldCoords(e);
      model.activeState.setOrigin(worldCoords);
      model.previousPosition = worldCoords;
      updateBracket();
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
  