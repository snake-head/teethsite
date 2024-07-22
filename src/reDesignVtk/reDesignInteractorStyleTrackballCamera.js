/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2022-09-27 11:03:07
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2024-07-15 16:41:34
 */
import macro from "@kitware/vtk.js/macro";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import { States } from "@kitware/vtk.js/Rendering/Core/InteractorStyle/Constants";

function vtkInteractorStyleTrackballCameraNew(publicAPI, model) {
    // 继承vtkInteractorStyleTrackballCamera

    // 鼠标左键: 3D旋转
    // 鼠标左键 + Shift: 拖动
    // 鼠标左键 + Ctrl/Alt: 2D旋转
    // 鼠标左键 + Shift + Ctrl/Alt: 缩放
    // 鼠标滚轮: 缩放

    // 增加 -> 鼠标右键: 拖动

    // Set our className
    model.classHierarchy.push("vtkInteractorStyleTrackballCameraNew");

    // 鼠标右键：拖动
    publicAPI.handleRightButtonPress = (callData) => {
        if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
            // 鼠标右键 -> pan
            publicAPI.startPan();
        }
    };
    //--------------------------------------------------------------------------
    publicAPI.handleRightButtonRelease = () => {
        switch (model.state) {
            case States.IS_PAN:
                publicAPI.endPan();
                break;
        }
    };

    publicAPI.handleMouseRotate = (renderer, position) => {
        if (!model.previousPosition) {
          return;
        }
        const rwi = model._interactor;
        const dx = position.x - model.previousPosition.x;
        const dy = position.y - model.previousPosition.y;
        const size = rwi.getView().getViewportSize(renderer);
        let deltaElevation = -0.1;
        let deltaAzimuth = -0.1;
        if (size[0] && size[1]) {
          deltaElevation = -20.0 / size[1];
          deltaAzimuth = -20.0 / size[0];
        }
        const rxf = dx * deltaAzimuth * model.motionFactor;
        const ryf = dy * deltaElevation * model.motionFactor;
        const camera = renderer.getActiveCamera();
        if (!Number.isNaN(rxf) && !Number.isNaN(ryf)) {
          camera.azimuth(rxf);
          camera.elevation(ryf);
          camera.orthogonalizeViewUp();
        }
        if (model.autoAdjustCameraClippingRange) {
        //   renderer.resetCameraClippingRange();
        }
        if (rwi.getLightFollowCamera()) {
          renderer.updateLightsGeometryToFollowCamera();
        }
      };

      publicAPI.dollyByFactor = (renderer, factor) => {
        if (Number.isNaN(factor)) {
          return;
        }
        const camera = renderer.getActiveCamera();
        if (camera.getParallelProjection()) {
          camera.setParallelScale(camera.getParallelScale() / factor);
        } else {
          camera.dolly(factor);
          if (model.autoAdjustCameraClippingRange) {
            // renderer.resetCameraClippingRange();
          }
        }
        if (model._interactor.getLightFollowCamera()) {
          renderer.updateLightsGeometryToFollowCamera();
        }
      };
}

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    // Inheritance
    vtkInteractorStyleTrackballCamera.extend(publicAPI, model, initialValues);

    // For more macro methods, see "Sources/macro.js"

    // Object specific methods
    vtkInteractorStyleTrackballCameraNew(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
    extend,
    "vtkInteractorStyleTrackballCameraNew"
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
