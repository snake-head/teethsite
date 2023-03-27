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
import { InteractionState } from "@kitware/vtk.js/Interaction/Widgets/HandleRepresentation/Constants";
import vtkSphereLinkSource from "./SphereLinkSource";
const { computeDisplayToWorld, computeWorldToDisplay } = STATIC;
const { throttle } = macro;

// ----------------------------------------------------------------------------
// vtkSphereHandleRepresentation methods
// ----------------------------------------------------------------------------
function vtkSphereHandleRepresentation(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkSphereHandleRepresentation");

    model.sphereLink = vtkSphereLinkSource.newInstance(model.sphereLinkInitValue);
    model.mapper = vtkMapper.newInstance();
    model.mapper.setInputConnection(model.sphereLink.getOutputPort());

    model.actor = vtkActor.newInstance();
    model.actor.setMapper(model.mapper);

    model.cursorPicker = vtkCellPicker.newInstance();
    model.cursorPicker.setPickFromList(1);
    model.cursorPicker.initializePickList();
    model.cursorPicker.addPickList(model.actor);
    model.cursorPicker.setTolerance(0.001);

    // 默认颜色
    model.property = vtkProperty.newInstance();
    model.property.setColor(...model.defaultColor);

    // 选中颜色
    model.selectProperty = vtkProperty.newInstance();
    model.selectProperty.setColor(...model.activeColor);

    model.actor.setProperty(model.property);

    publicAPI.getActors = () => [model.actor];
    publicAPI.getNestedProps = () => publicAPI.getActors();

    publicAPI.setCenters = (...args) => {
        model.sphereLink.setCenters(...args);
        model.sphereLink.setNewData(Date.now());
    };
    publicAPI.getCenters = model.sphereLink.getCenters;
    publicAPI.updateLinkByCurrentCenters =
        model.sphereLink.updateLinkByCurrentCenters;
    publicAPI.setNewData = model.sphereLink.setNewData;
    
    // 用于鼠标移动时查看鼠标是否在目标widget上, 是的话切换状态, 切换后可以激活一些操作
    publicAPI.computeInteractionState = (pos) => {
        // 得到position, 计算当前pos是否在该actor上
        const pos3d = [pos[0], pos[1], 0.0];
        model.cursorPicker.pick(pos3d, model.renderer);
        const pickedActor = model.cursorPicker.getDataSet();
        if (pickedActor) {
            model.interactionState = InteractionState.SELECTING;
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
        
        model.sphereLink.modifyLength(sub);
        // 强制触发模型更新数据
        model.sphereLink.setNewData(Date.now());
        // 更新记录点
        publicAPI.recordStartInteractionPosition(currentPosition);
    }, 5);
    
    publicAPI.getBounds = () => {
        const centers = model.sphereLink.getCenters();
        const radius = model.sphereLink.getSphereRadius();
        return [
            Math.min(centers[0][0] - radius, centers[1][0] - radius),
            Math.max(centers[0][0] + radius, centers[1][0] + radius),
            Math.min(centers[0][1] - radius, centers[1][1] - radius),
            Math.max(centers[0][1] + radius, centers[1][1] + radius),
            Math.min(centers[0][2] - radius, centers[1][2] - radius),
            Math.max(centers[0][2] + radius, centers[1][2] - radius),
        ];
    };

    publicAPI.highlight = (highlight) => {
        if (
            highlight ||
            model.interactionState === InteractionState.SELECTING
        ) {
            model.sphereLink.setScale(model.activeScale);
            publicAPI.applyProperty(model.selectProperty);
        } else {
            model.sphereLink.setScale(1.0);
            publicAPI.applyProperty(model.property);
        }
    };

    publicAPI.buildRepresentation = () => {
        if (model.renderer) {
            if (!model.placed) {
                model.validPick = 1;
                model.placed = 1;
            }
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
    sphereLinkInitValue: {},
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
    vtkSphereHandleRepresentation(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
    extend,
    "vtkSphereHandleRepresentation"
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
