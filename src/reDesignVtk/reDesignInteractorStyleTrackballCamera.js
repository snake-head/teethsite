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
