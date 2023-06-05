import macro from "@kitware/vtk.js/macro";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkCellPicker from "@kitware/vtk.js/Rendering/Core/CellPicker";
import vtkHandleRepresentation from "@kitware/vtk.js/Interaction/Widgets/HandleRepresentation";
import vtkInteractorObserver from "@kitware/vtk.js/Rendering/Core/InteractorObserver";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import * as vtkMath from "@kitware/vtk.js/Common/Core/Math";
import vtkProperty from "@kitware/vtk.js/Rendering/Core/Property";
import vtkSphereSource from "@kitware/vtk.js/Filters/Sources/SphereSource";
import { InteractionState } from "@kitware/vtk.js/Interaction/Widgets/HandleRepresentation/Constants";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";

// ----------------------------------------------------------------------------
// vtkSphereHandleRepresentation methods
// ----------------------------------------------------------------------------
// 1、去掉原来代码中通过计算在用户对屏幕缩放时能维持尺寸的问题(相机放大后, 球体会相对变小, 以保持用户眼中绝对大小不变)
// 2、降低球体选择时的容差, 必须更精确的点击在球体上面, 才能选中
// 3、可以改变默认颜色和选中颜色(在参数中传递)
// 4、球体随鼠标移动时, 球体的中心锁定在依赖点集中的某一点(计算出距离当前鼠标位置最近的点)

function vtkConeHandleRepresentation(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkConeHandleRepresentation");

    const superClass = { ...publicAPI };

    publicAPI.getActors = () => [
        model.actorTop,
        model.actorBottom,
        model.actorRadius,
    ];
    publicAPI.getNestedProps = () => publicAPI.getActors();

    publicAPI.placeWidget = (...bounds) => {
        let boundsArray = [];

        if (Array.isArray(bounds[0])) {
            boundsArray = bounds[0];
        } else {
            for (let i = 0; i < bounds.length; i++) {
                boundsArray.push(bounds[i]);
            }
        }

        if (boundsArray.length !== 6) {
            return;
        }

        const newBounds = [];
        const center = [];
        publicAPI.adjustBounds(boundsArray, newBounds, center);
        publicAPI.setWorldPosition(center);
        for (let i = 0; i < 6; i++) {
            model.initialBounds[i] = newBounds[i];
        }
        model.initialLength = Math.sqrt(
            (newBounds[1] - newBounds[0]) * (newBounds[1] - newBounds[0]) +
                (newBounds[3] - newBounds[2]) * (newBounds[3] - newBounds[2]) +
                (newBounds[5] - newBounds[4]) * (newBounds[5] - newBounds[4])
        );
    };

    publicAPI.setSphereRadius = (radius) => {
        model.sphereTop.setRadius(radius);
        model.sphereBottom.setRadius(radius);
        model.sphereRadius.setRadius(radius);
        publicAPI.modified();
    };

    publicAPI.getSphereRadius = () => model.sphereTop.getRadius();

    publicAPI.getBounds = (modelSphere) => {
        const radius = modelSphere.getRadius();
        const center = modelSphere.getCenter();
        const bounds = [];
        bounds[0] = model.placeFactor * (center[0] - radius);
        bounds[1] = model.placeFactor * (center[0] + radius);
        bounds[2] = model.placeFactor * (center[1] - radius);
        bounds[3] = model.placeFactor * (center[1] + radius);
        bounds[4] = model.placeFactor * (center[2] - radius);
        bounds[5] = model.placeFactor * (center[2] + radius);
        return bounds;
    };

    publicAPI.setWorldPosition = (position) => {
        model.sphere.setCenter(position);
        superClass.setWorldPosition(model.sphere.getCenter());
    };

    publicAPI.setDisplayPosition = (position) => {
        superClass.setDisplayPosition(position);
        publicAPI.setWorldPosition(model.worldPosition.getValue());
    };

    publicAPI.computeInteractionState = (pos) => {
        // 得到position, 计算当前pos是否在该actor上
        model.visibility = 1;
        const pos3d = [pos[0], pos[1], 0.0];
        model.cursorPicker.pick(pos3d, model.renderer);
        const pickedActor = model.cursorPicker.getDataSet();
        if (pickedActor) {
            model.interactionState = InteractionState.SELECTING;
        } else {
            model.interactionState = InteractionState.OUTSIDE;
            if (model.activeRepresentation) {
                model.visibility = 0;
            }
        }
        return model.interactionState;
    };

    publicAPI.determineConstraintAxis = (constraint, x) => {
        // Look for trivial cases
        if (!model.constrained) {
            return -1;
        }

        if (constraint >= 0 && constraint < 3) {
            return constraint;
        }

        // Okay, figure out constraint. First see if the choice is
        // outside the hot spot
        if (!model.waitingForMotion) {
            const pickedPosition = model.cursorPicker.getPickPosition();
            const d2 = vtkMath.distance2BetweenPoints(
                pickedPosition,
                model.startEventPosition
            );
            const tol = model.hotSpotSize * model.initialLength;
            if (d2 > tol * tol) {
                model.waitingForMotion = 0;
                return model.cursorPicker.getCellId();
            }
            model.waitingForMotion = 1;
            model.waitCount = 0;
            return -1;
        }

        if (model.waitingForMotion && x) {
            model.waitingForMotion = 0;
            const v = [];
            v[0] = Math.abs(x[0] - model.startEventPosition[0]);
            v[1] = Math.abs(x[1] - model.startEventPosition[1]);
            v[2] = Math.abs(x[2] - model.startEventPosition[2]);
            if (v[0] > v[1]) {
                return v[0] > v[2] ? 0 : 2;
            }
            return v[1] > v[2] ? 1 : 2;
        }
        return -1;
    };

    publicAPI.startComplexWidgetInteraction = (startEventPos) => {
        // Record the current event position, and the rectilinear wipe position.
        model.startEventPosition[0] = startEventPos[0];
        model.startEventPosition[1] = startEventPos[1];
        model.startEventPosition[2] = 0.0;

        model.lastEventPosition[0] = startEventPos[0];
        model.lastEventPosition[1] = startEventPos[1];

        const pos = [startEventPos[0], startEventPos[1], 0];
        model.cursorPicker.pick(pos, model.renderer);
        const pickedActor = model.cursorPicker.getDataSet();
        if (pickedActor) {
            model.interactionState = InteractionState.SELECTING;
            model.constraintAxis = publicAPI.determineConstraintAxis(-1, null);
            model.lastPickPosition = model.cursorPicker.getPickPosition();
        } else {
            model.interactionState = InteractionState.OUTSIDE;
            model.constraintAxis = -1;
        }
    };

    publicAPI.displayToWorld = (eventPos, z) =>
        vtkInteractorObserver.computeDisplayToWorld(
            model.renderer,
            eventPos[0],
            eventPos[1],
            z
        );

    publicAPI.complexWidgetInteraction = (eventPos) => {
        const focalPoint = vtkInteractorObserver.computeWorldToDisplay(
            model.renderer,
            model.lastPickPosition[0],
            model.lastPickPosition[1],
            model.lastPickPosition[2]
        );

        const z = focalPoint[2];

        const prevPickPoint = publicAPI.displayToWorld(
            model.lastEventPosition,
            z
        );
        const pickPoint = publicAPI.displayToWorld(eventPos, z);

        if (
            model.interactionState === InteractionState.SELECTING ||
            model.interactionState === InteractionState.TRANSLATING
        ) {
            if (!model.waitingForMotion || model.waitCount++ > 3) {
                model.constraintAxis = publicAPI.determineConstraintAxis(
                    model.constraintAxis,
                    pickPoint
                );
                if (
                    model.interactionState === InteractionState.SELECTING &&
                    !model.translationMode
                ) {
                    publicAPI.moveFocus(prevPickPoint, pickPoint);
                } else {
                    // 进入此处
                    publicAPI.translate(prevPickPoint, pickPoint);
                }
            }
        }

        model.lastEventPosition[0] = eventPos[0];
        model.lastEventPosition[1] = eventPos[1];
        publicAPI.modified();
    };

    publicAPI.moveFocus = (p1, p2) => {
        // get the motion vector
        const v = [];
        v[0] = p2[0] - p1[0];
        v[1] = p2[1] - p1[1];
        v[2] = p2[2] - p1[2];

        const focus = model.sphere.getCenter();
        if (model.constraintAxis >= 0) {
            focus[model.constraintAxis] += v[model.constraintAxis];
        } else {
            focus[0] += v[0];
            focus[1] += v[1];
            focus[2] += v[2];
        }

        publicAPI.setWorldPosition(focus);
    };

    // 计算一点离依赖点集的最近点
    function calNearestPoint(p) {
        const sizeDependingPoints = model.dependingPoints.length;

        let nearestPoints = [
            model.dependingPoints[0],
            model.dependingPoints[1],
            model.dependingPoints[2],
        ];
        let minDist = vtkMath.distance2BetweenPoints(nearestPoints, p);
        for (let idx = 3; idx < sizeDependingPoints; idx += 3) {
            const pi = [
                model.dependingPoints[idx],
                model.dependingPoints[idx + 1],
                model.dependingPoints[idx + 2],
            ];
            const dist = vtkMath.distance2BetweenPoints(pi, p);
            if (dist < minDist) {
                minDist = dist;
                nearestPoints = pi;
            }
        }
        return nearestPoints;
    }
    // 移动函数: 移动到距离当前鼠标位置(p2)最近的依赖点集上的点
    // 在经过[模拟排牙]后, p2需要变回来
    publicAPI.translate = (p1, p2) => {
        // p1(prevPoint)->p2(pickPoint)

        // 该做法已废弃, 有时间把invMatrix2全部去掉, 外部的sphereReversrProj也可以全部去掉
        // 映射
        // 当前移动如果在其他模式下则分别把鼠标点映射到原位置
        // vtkMatrixBuilder
        //     .buildFromDegree()
        //     .setMatrix(model.invMatrix2)
        //     .apply(p1).apply(p2);
        
        // 用户希望的拖动向量
        const v = [];
        v[0] = p2[0] - p1[0];
        v[1] = p2[1] - p1[1];
        v[2] = p2[2] - p1[2];

        // 更新坐标
        const pos = model.sphere.getCenter();
        p2 = [
            pos[0] + v[0],
            pos[1] + v[1],
            pos[2] + v[2],
        ]
        
        // get the motion vector
        const newFocus = [];
        if (model.dependingPoints) {
            const nearestP = calNearestPoint(p2);
            // 中心移动
            for (let i = 0; i < 3; i++) {
                newFocus[i] = nearestP[i];
            }
        } else {
            const v = [];
            v[0] = p2[0] - p1[0];
            v[1] = p2[1] - p1[1];
            v[2] = p2[2] - p1[2];

            const pos = model.sphere.getCenter();
            if (model.constraintAxis >= 0) {
                // move along axis
                for (let i = 0; i < 3; i++) {
                    if (i !== model.constraintAxis) {
                        v[i] = 0.0;
                    }
                }
            }
            // 中心移动
            for (let i = 0; i < 3; i++) {
                newFocus[i] = pos[i] + v[i];
            }
        }
        publicAPI.setWorldPosition(newFocus);
        // vtkMatrixBuilder.buildFromDegree().setMatrix(model.invMatrix2).apply(newFocus)
        // 轴点变换时, 会同时重新生成坐标轴+距离线, 二者实际生成位置都在原牙齿上(然后通过userMatrix做显示位置调整),
        // 因此要将轴点反映射回原位, 以便生成原位的坐标轴+距离线
        model.updatePosFunc(
            [...newFocus],
            model.funcRenderer,
            model.funcRenderWindow
        );
    };

    publicAPI.highlight = (highlight) => {
        if (
            highlight ||
            model.interactionState === InteractionState.SELECTING
        ) {
            model.sphere.setRadius(0.325);
            publicAPI.applyProperty(model.selectProperty);
        } else {
            model.sphere.setRadius(0.25);
            publicAPI.applyProperty(model.property);
        }
    };

    publicAPI.buildRepresentation = () => {
        if (model.renderer) {
            if (!model.placed) {
                model.validPick = 1;
                model.placed = 1;
            }

            model.sphere.update();
            publicAPI.modified();
        }
    };

    publicAPI.applyProperty = (property) => {
        model.actor.setProperty(property);
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    sphereInitValue: {
        top:{
            center: [0, 0, 0],
            radius: 0.5,
        },
        bottom:{
            center: [0, 0, 0],
            radius: 0.5,
        },
        radius:{
            center: [0, 0, 0],
            radius: 0.5,
        },
    },
    cursorPicker: null,
    lastPickPosition: [0, 0, 0],
    lastEventPosition: [0, 0],
    constraintAxis: -1,
    translationMode: 1,
    property: null,
    selectProperty: null,
    placeFactor: 1,
    waitingForMotion: 0,
    hotSpotSize: 0.05,
    defaultColor: [0.2, 0.2, 0.8], // 默认颜色
    activeColor: [0.8, 0.2, 0.2], // 选中颜色

    updatePosFunc: () => {}, // 更新位置时使用的回调
    funcRenderer: null, // updatePosFunc需要的参数
    funcRenderWindow: null, // updatePosFunc需要的参数
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    // Inheritance
    vtkHandleRepresentation.extend(publicAPI, model, initialValues);
    macro.setGet(publicAPI, model, ["glyphResolution", "defaultScale"]);
    macro.setGet(publicAPI, model, [
        "translationMode",
        "property",
        "selectProperty",
    ]);

    macro.setGet(publicAPI, model, [
        "funcRenderer",
        "funcRenderWindow",
    ]);

    macro.get(publicAPI, model, ["actorTop", "sphereTop"]);

    model.sphereTop = vtkSphereSource.newInstance(model.sphereInitValue.top);
    model.sphereTop.setThetaResolution(16);
    model.sphereTop.setPhiResolution(8);
    model.mapperTop = vtkMapper.newInstance();
    model.mapperTop.setInputConnection(model.sphereTop.getOutputPort());
    model.actorTop = vtkActor.newInstance();
    model.actorTop.setMapper(model.mapperTop);

    model.sphereBottom = vtkSphereSource.newInstance(model.sphereInitValue.bottom);
    model.sphereBottom.setThetaResolution(16);
    model.sphereBottom.setPhiResolution(8);
    model.mapperBottom = vtkMapper.newInstance();
    model.mapperBottom.setInputConnection(model.sphereBottom.getOutputPort());
    model.actorBottom = vtkActor.newInstance();
    model.actorBottom.setMapper(model.mapperBottom);

    model.sphereRadius = vtkSphereSource.newInstance(model.sphereInitValue.radius);
    model.sphereRadius.setThetaResolution(16);
    model.sphereRadius.setPhiResolution(8);
    model.mapperRadius = vtkMapper.newInstance();
    model.mapperRadius.setInputConnection(model.sphereRadius.getOutputPort());
    model.actorRadius = vtkActor.newInstance();
    model.actorRadius.setMapper(model.mapperRadius);

    model.cursorPicker = vtkCellPicker.newInstance();
    model.cursorPicker.setPickFromList(1);
    model.cursorPicker.initializePickList();
    model.cursorPicker.addPickList(model.actorTop);
    model.cursorPicker.addPickList(model.actorBottom);
    model.cursorPicker.addPickList(model.actorRadius);
    model.cursorPicker.setTolerance(0.001);


    // 默认颜色
    model.property = vtkProperty.newInstance();
    model.property.setColor(...model.defaultColor);

    // 选中颜色
    model.selectProperty = vtkProperty.newInstance();
    model.selectProperty.setColor(...model.activeColor);

    model.actor.setProperty(model.property);

    // Object methods
    vtkConeHandleRepresentation(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
    extend,
    "vtkConeHandleRepresentation"
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
