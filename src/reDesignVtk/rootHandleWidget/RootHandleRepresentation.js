import macro from "@kitware/vtk.js/macro";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkCellPicker from "@kitware/vtk.js/Rendering/Core/CellPicker";
import vtkHandleRepresentation from "@kitware/vtk.js/Interaction/Widgets/HandleRepresentation";
import { STATIC } from "@kitware/vtk.js/Rendering/Core/InteractorObserver";
import {
    subtract,
} from "@kitware/vtk.js/Common/Core/Math";
import vtkProperty from "@kitware/vtk.js/Rendering/Core/Property";
import { InteractionState } from "./stateConstants";
import vtkRootSource from "./RootSource";
const { computeDisplayToWorld, computeWorldToDisplay } = STATIC;
const { throttle } = macro;

// ----------------------------------------------------------------------------
// vtkRootHandleRepresentation methods
// ----------------------------------------------------------------------------
function vtkRootHandleRepresentation(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkRootHandleRepresentation");

    model.root = vtkRootSource.newInstance(model.rootInitValue);
    model.mapper = vtkMapper.newInstance();
    model.mapper.setInputConnection(model.root.getOutputPort(0));
    model.mapperBottom = vtkMapper.newInstance();
    model.mapperBottom.setInputConnection(model.root.getOutputPort(1));
    model.mapperTop = vtkMapper.newInstance();
    model.mapperTop.setInputConnection(model.root.getOutputPort(2));
    model.mapperRadius = vtkMapper.newInstance();
    model.mapperRadius.setInputConnection(model.root.getOutputPort(3));
    model.mapperCone = vtkMapper.newInstance();
    model.mapperCone.setInputConnection(model.root.getOutputPort(4));

    model.actor = vtkActor.newInstance();
    model.actor.setMapper(model.mapper);
    model.actorBottom = vtkActor.newInstance();
    model.actorBottom.setMapper(model.mapperBottom);
    model.actorTop = vtkActor.newInstance();
    model.actorTop.setMapper(model.mapperTop);
    model.actorRadius = vtkActor.newInstance();
    model.actorRadius.setMapper(model.mapperRadius);
    model.actorCone = vtkActor.newInstance();
    model.actorCone.setMapper(model.mapperCone);

    model.cursorPicker = vtkCellPicker.newInstance();
    model.cursorPicker.setPickFromList(1);
    model.cursorPicker.initializePickList();
    // model.cursorPicker.addPickList(model.actor);
    model.cursorPicker.addPickList(model.actorBottom);
    model.cursorPicker.addPickList(model.actorTop);
    model.cursorPicker.addPickList(model.actorRadius);
    model.cursorPicker.setTolerance(0.001);

    // 默认颜色
    model.property = vtkProperty.newInstance();
    model.property.setColor(...model.defaultColor);

    // 选中颜色
    model.selectProperty = vtkProperty.newInstance();
    model.selectProperty.setColor(...model.activeColor);

    model.coneProperty = vtkProperty.newInstance();
    model.coneProperty.setColor(...model.coneColor);
    model.coneProperty.setOpacity(model.coneOpacity);

    model.actor.setProperty(model.property);
    model.actorBottom.setProperty(model.property);
    model.actorTop.setProperty(model.property);
    model.actorRadius.setProperty(model.property);
    model.actorCone.setProperty(model.coneProperty);

    publicAPI.getActors = () => [
        model.actor,
        model.actorBottom,
        model.actorTop,
        model.actorRadius,
        model.actorCone,
    ];
    publicAPI.getNestedProps = () => publicAPI.getActors();

    publicAPI.setCenters = (...args) => {
        model.root.setCenters(...args);
        model.root.setNewData(Date.now());
    };
    publicAPI.getCenters = model.root.getCenters;
    publicAPI.updateLinkByCurrentCenters =
        model.root.updateLinkByCurrentCenters;
    publicAPI.setNewData = model.root.setNewData;
    
    // 用于鼠标移动时查看鼠标是否在目标widget上, 是的话切换状态, 切换后可以激活一些操作
    publicAPI.computeInteractionState = (pos) => {
        // 得到position, 计算当前pos是否在该actor上
        const pos3d = [pos[0], pos[1], 0.0];
        model.cursorPicker.pick(pos3d, model.renderer);
        const pickedActor = model.cursorPicker.getActors()[0];
        if (pickedActor) {
            if (pickedActor === model.actorBottom) {
                model.interactionState = InteractionState.SELECTING_ACTOR_BOTTOM;
            } else if (pickedActor === model.actorTop) {
                model.interactionState = InteractionState.SELECTING_ACTOR_TOP;
            } else if (pickedActor === model.actorRadius) {
                model.interactionState = InteractionState.SELECTING_ACTOR_RADIUS;
            }
        } else {
            model.interactionState = InteractionState.OUTSIDE;
        }
        return model.interactionState;
    };
    

    model.lastPickPosition = [0, 0, 0];
    model.lastEventPosition = [0, 0];
    publicAPI.recordStartInteractionPosition = (pos) => {
        model.lastEventPosition = pos;
        model.lastPickPosition = model.cursorPicker.getPickPosition();
    };

    publicAPI.dragLengthInteraction = throttle((currentPosition) => {
        const focalPoint = computeWorldToDisplay(
            model.renderer,
            ...model.lastPickPosition
        );
        const prevPickPoint = computeDisplayToWorld(
            model.renderer,
            model.lastEventPosition[0],
            model.lastEventPosition[1],
            focalPoint[2]
        );
        const pickPoint = computeDisplayToWorld(
            model.renderer,
            currentPosition[0],
            currentPosition[1],
            focalPoint[2]
        );

        let sub = [0, 0, 0];
        subtract(pickPoint, prevPickPoint, sub);
        
        model.root.modifyLength(sub);
        // 强制触发模型更新数据
        model.root.setNewData(Date.now());
        // 更新记录点
        publicAPI.recordStartInteractionPosition(currentPosition);
    }, 5);

    publicAPI.rotateBottom = throttle((currentPosition) => {
        const focalPoint = computeWorldToDisplay(
            model.renderer,
            ...model.lastPickPosition
        );
        const pickPoint = computeDisplayToWorld(
            model.renderer,
            currentPosition[0],
            currentPosition[1],
            focalPoint[2]
        );
        
        model.root.modifyRotateBottom(pickPoint);
        // 强制触发模型更新数据
        model.root.setNewData(Date.now());
        // 更新记录点
        publicAPI.recordStartInteractionPosition(currentPosition);
    }, 5)

    publicAPI.rotateTop = throttle((currentPosition) => {
        const focalPoint = computeWorldToDisplay(
            model.renderer,
            ...model.lastPickPosition
        );
        const pickPoint = computeDisplayToWorld(
            model.renderer,
            currentPosition[0],
            currentPosition[1],
            focalPoint[2]
        );
        
        model.root.modifyRotateTop(pickPoint);
        // 强制触发模型更新数据
        model.root.setNewData(Date.now());
        // 更新记录点
        publicAPI.recordStartInteractionPosition(currentPosition);
    }, 5)
    
    publicAPI.getBounds = () => {
        const centers = model.root.getCenters();
        const radius = model.root.getSphereRadius();
        return [
            Math.min(centers[0][0] - radius, centers[1][0] - radius, centers[2][0] - radius),
            Math.max(centers[0][0] + radius, centers[1][0] + radius, centers[2][0] + radius),
            Math.min(centers[0][1] - radius, centers[1][1] - radius, centers[2][1] - radius),
            Math.max(centers[0][1] + radius, centers[1][1] + radius, centers[2][1] + radius),
            Math.min(centers[0][2] - radius, centers[1][2] - radius, centers[2][2] - radius),
            Math.max(centers[0][2] + radius, centers[1][2] - radius, centers[2][2] - radius),
        ];
    };

    publicAPI.highlight = (highlight) => {
        switch (highlight) {
            case InteractionState.OUTSIDE:
                publicAPI.applyProperty(model.property, model.actorBottom);
                publicAPI.applyProperty(model.property, model.actorTop);
                publicAPI.applyProperty(model.property, model.actorRadius);
                break;
            case InteractionState.SELECTING_ACTOR_BOTTOM:
                publicAPI.applyProperty(model.selectProperty, model.actorBottom);
                publicAPI.applyProperty(model.property, model.actorTop);
                publicAPI.applyProperty(model.property, model.actorRadius);
                break;
            case InteractionState.SELECTING_ACTOR_TOP:
                publicAPI.applyProperty(model.property, model.actorBottom);
                publicAPI.applyProperty(model.selectProperty, model.actorTop);
                publicAPI.applyProperty(model.property, model.actorRadius);
                break;
            case InteractionState.SELECTING_ACTOR_RADIUS:
                publicAPI.applyProperty(model.property, model.actorBottom);
                publicAPI.applyProperty(model.property, model.actorTop);
                publicAPI.applyProperty(model.selectProperty, model.actorRadius);
                break;
            default:
                break;
        }
        // if (
        //     highlight ||
        //     model.interactionState === InteractionState.SELECTING
        // ) {
        //     // model.root.setScale(model.activeScale);
        //     publicAPI.applyProperty(model.selectProperty);
        // } else {
        //     // model.root.setScale(1.0);
        //     publicAPI.applyProperty(model.property);
        // }
    };

    publicAPI.buildRepresentation = () => {
        if (model.renderer) {
            if (!model.placed) {
                model.validPick = 1;
                model.placed = 1;
            }
        }
    };

    publicAPI.applyProperty = (property, actor) => {
        actor.setProperty(property);
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    rootInitValue: {},
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
    coneOpacity: 0.2, //圆锥不透明度
    coneColor: [1, 0, 0],
    activeScale: 1.3,
    updatePosFunc: () => {}, // 更新位置时使用的回调
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    // Inheritance
    vtkHandleRepresentation.extend(publicAPI, model, initialValues);
    macro.setGet(publicAPI, model, [
        "translationMode",
        "property",
        "selectProperty",
        "activeScale",
    ]);

    macro.setGet(publicAPI, model, [
        "dependingPoints",
        "funcRenderer",
        "funcRenderWindow",
    ]);

    macro.get(publicAPI, model, ["actor", "sphere"]);

    // Object methods
    vtkRootHandleRepresentation(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
    extend,
    "vtkRootHandleRepresentation"
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
