import macro from "@kitware/vtk.js/macro";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import * as vtkMath from "@kitware/vtk.js/Common/Core/Math";
import { States } from "@kitware/vtk.js/Rendering/Core/InteractorStyle/Constants";

// ----------------------------------------------------------------------------
// vtkInteractorStyleImage methods
// ----------------------------------------------------------------------------

function vtkInteractorStyleImage(publicAPI, model) {
    // 继承vtkInteractorStyleTrackballCamera
    // 鼠标左键: 3D旋转
    // 鼠标左键 + Shift: 拖动
    // 鼠标左键 + Ctrl/Alt: 2D旋转
    // 鼠标左键 + Shift + Ctrl/Alt: 缩放
    // 鼠标滚轮: 缩放

    // 替换 -> 鼠标左键: window level
    // 增加 -> 鼠标右键: 拖动
    // 增加 -> 鼠标右键 + shift: slice

    // Set our className
    model.classHierarchy.push("vtkInteractorStyleImage");

    // Public API methods
    publicAPI.superHandleMouseMove = publicAPI.handleMouseMove;
    publicAPI.handleMouseMove = (callData) => {
        const pos = callData.position;
        const renderer = callData.pokedRenderer;

        switch (model.state) {
            case States.IS_WINDOW_LEVEL:
                publicAPI.windowLevel(renderer, pos);
                publicAPI.invokeInteractionEvent({ type: "InteractionEvent" });
                break;

            case States.IS_SLICE:
                publicAPI.slice(renderer, pos);
                publicAPI.invokeInteractionEvent({ type: "InteractionEvent" });
                break;

            default:
                break;
        }
        publicAPI.superHandleMouseMove(callData);
    };

    //----------------------------------------------------------------------------
    publicAPI.superHandleLeftButtonPress = publicAPI.handleLeftButtonPress;
    publicAPI.handleLeftButtonPress = (callData) => {
        const pos = callData.position;
        if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
            // 鼠标左键 -> windowLevel
            model.windowLevelStartPosition[0] = pos.x;
            model.windowLevelStartPosition[1] = pos.y;
            // Get the last (the topmost) image
            publicAPI.setCurrentImageNumber(model.currentImageNumber);
            const property = model.currentImageProperty;
            if (property) {
                model.windowLevelInitial[0] = property.getColorWindow();
                model.windowLevelInitial[1] = property.getColorLevel();
            }
            publicAPI.startWindowLevel();
        } else {
            // 保持不变
            publicAPI.superHandleLeftButtonPress(callData);
        }
    };

    //--------------------------------------------------------------------------
    publicAPI.superHandleLeftButtonRelease = publicAPI.handleLeftButtonRelease;
    publicAPI.handleLeftButtonRelease = () => {
        switch (model.state) {
            case States.IS_WINDOW_LEVEL:
                publicAPI.endWindowLevel();
                break;

            case States.IS_SLICE:
                publicAPI.endSlice();
                break;

            default:
                publicAPI.superHandleLeftButtonRelease();
                break;
        }
    };

    //----------------------------------------------------------------------------
    publicAPI.superHandleRightButtonPress = publicAPI.handleRightButtonPress;
    publicAPI.handleRightButtonPress = (callData) => {
        const pos = callData.position;
        if (!callData.shiftKey && !callData.controlKey && !callData.altKey) {
            // 鼠标右键 -> pan
            publicAPI.startPan();
        } else if (
            callData.shiftKey &&
            !callData.controlKey &&
            !callData.altKey
        ) {
            // 鼠标右键 + shift -> slice
            model.lastSlicePosition = pos.y;
            publicAPI.startSlice();
        }
    };

    //--------------------------------------------------------------------------
    publicAPI.handleRightButtonRelease = () => {
        switch (model.state) {
            case States.IS_PAN:
                publicAPI.endPan();
                break;
            case States.IS_SLICE:
                publicAPI.endSlice();
                break;
        }
    };

    //----------------------------------------------------------------------------
    publicAPI.windowLevel = (renderer, position) => {
        model.windowLevelCurrentPosition[0] = position.x;
        model.windowLevelCurrentPosition[1] = position.y;
        const rwi = model.interactor;

        if (model.currentImageProperty) {
            const size = rwi.getView().getViewportSize(renderer);

            const mWindow = model.windowLevelInitial[0];
            const level = model.windowLevelInitial[1];

            // Compute normalized delta
            let dx =
                ((model.windowLevelCurrentPosition[0] -
                    model.windowLevelStartPosition[0]) *
                    4.0) /
                size[0];
            let dy =
                ((model.windowLevelStartPosition[1] -
                    model.windowLevelCurrentPosition[1]) *
                    4.0) /
                size[1];

            // Scale by current values
            if (Math.abs(mWindow) > 0.01) {
                dx *= mWindow;
            } else {
                dx *= mWindow < 0 ? -0.01 : 0.01;
            }
            if (Math.abs(level) > 0.01) {
                dy *= level;
            } else {
                dy *= level < 0 ? -0.01 : 0.01;
            }

            // Abs so that direction does not flip
            if (mWindow < 0.0) {
                dx *= -1;
            }
            if (level < 0.0) {
                dy *= -1;
            }

            // Compute new mWindow level
            let newWindow = dx + mWindow;
            const newLevel = level - dy;

            if (newWindow < 0.01) {
                newWindow = 0.01;
            }

            model.currentImageProperty.setColorWindow(newWindow);
            model.currentImageProperty.setColorLevel(newLevel);
        }
    };

    //----------------------------------------------------------------------------
    publicAPI.slice = (renderer, position) => {
        const rwi = model.interactor;

        const dy = position.y - model.lastSlicePosition;

        const camera = renderer.getActiveCamera();
        const range = camera.getClippingRange();
        let distance = camera.getDistance();

        // scale the interaction by the height of the viewport
        let viewportHeight = 0.0;
        if (camera.getParallelProjection()) {
            viewportHeight = camera.getParallelScale();
        } else {
            const angle = vtkMath.radiansFromDegrees(camera.getViewAngle());
            viewportHeight = 2.0 * distance * Math.tan(0.5 * angle);
        }

        const size = rwi.getView().getViewportSize(renderer);
        const delta = (dy * viewportHeight) / size[1];
        distance += delta;

        // clamp the distance to the clipping range
        if (distance < range[0]) {
            distance = range[0] + viewportHeight * 1e-3;
        }
        if (distance > range[1]) {
            distance = range[1] - viewportHeight * 1e-3;
        }
        camera.setDistance(distance);

        model.lastSlicePosition = position.y;
    };

    //----------------------------------------------------------------------------
    // This is a way of dealing with images as if they were layers.
    // It looks through the renderer's list of props and sets the
    // interactor ivars from the Nth image that it finds.  You can
    // also use negative numbers, i.e. -1 will return the last image,
    // -2 will return the second-to-last image, etc.
    publicAPI.setCurrentImageNumber = (i) => {
        if (i === null) {
            return;
        }

        const renderer = model.interactor.getCurrentRenderer();
        if (!renderer) {
            return;
        }
        model.currentImageNumber = i;

        function propMatch(j, prop, targetIndex) {
            if (
                prop.isA("vtkImageSlice") &&
                j === targetIndex &&
                prop.getPickable()
            ) {
                return true;
            }
            return false;
        }

        const props = renderer.getViewProps();
        let targetIndex = i;
        if (i < 0) {
            targetIndex += props.length;
        }
        let imageProp = null;
        let foundImageProp = false;
        for (let j = 0; j < props.length && !foundImageProp; j++) {
            if (propMatch(j, props[j], targetIndex)) {
                foundImageProp = true;
                imageProp = props[j];
            }
        }

        if (imageProp) {
            publicAPI.setCurrentImageProperty(imageProp.getProperty());
        }
    };

    //----------------------------------------------------------------------------
    publicAPI.setCurrentImageProperty = (imageProperty) => {
        model.currentImageProperty = imageProperty;
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    windowLevelStartPosition: [0, 0],
    windowLevelCurrentPosition: [0, 0],
    lastSlicePosition: 0,
    windowLevelInitial: [1.0, 0.5],
    currentImageProperty: 0,
    currentImageNumber: -1,
    interactionMode: "IMAGE2D",
    xViewRightVector: [0, 1, 0],
    xViewUpVector: [0, 0, -1],
    yViewRightVector: [1, 0, 0],
    yViewUpVector: [0, 0, -1],
    zViewRightVector: [1, 0, 0],
    zViewUpVector: [0, 1, 0],
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    // Inheritance
    vtkInteractorStyleTrackballCamera.extend(publicAPI, model, initialValues);

    // Create get-set macros
    macro.setGet(publicAPI, model, ["interactionMode"]);

    // For more macro methods, see "Sources/macro.js"

    // Object specific methods
    vtkInteractorStyleImage(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, "vtkInteractorStyleImage");

// ----------------------------------------------------------------------------

export default { newInstance, extend };
