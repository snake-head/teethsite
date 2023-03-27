import macro from "@kitware/vtk.js/macro";
import vtkAbstractWidget from "@kitware/vtk.js/Interaction/Widgets/AbstractWidget";
import vtkSphereHandleRepresentation from "@kitware/vtk.js/Interaction/Widgets/SphereHandleRepresentation";
import vtkHandleRepresentation from "@kitware/vtk.js/Interaction/Widgets/HandleRepresentation";
import Constants from "@kitware/vtk.js/Interaction/Widgets/HandleWidget/Constants";

const { VOID, EVENT_ABORT } = macro;
const { InteractionState } = vtkHandleRepresentation;
const { WidgetState } = Constants;

const { throttle } = macro;

// ----------------------------------------------------------------------------
// vtkHandleWidget methods
// ----------------------------------------------------------------------------

function vtkHandleWidget(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkHandleWidget");

    function genericAction() {
        publicAPI.setCursor(model.widgetRep.getInteractionState());
        model.widgetRep.highlight(1);
        // publicAPI.startInteraction();
        publicAPI.invokeStartInteractionEvent();
        publicAPI.render();
    }

    // Overridden method
    publicAPI.createDefaultRepresentation = () => {
        if (!model.widgetRep) {
            model.widgetRep = vtkSphereHandleRepresentation.newInstance();
        }
    };

    // publicAPI.handleMouseMove = (callData) => publicAPI.moveAction(callData);
    // 每次调用花费约100ms~200ms, 连续调用有时会卡死, 停30ms就好(也是连续调用)
    publicAPI.handleMouseMove = throttle(
        (callData) => publicAPI.moveAction(callData),
        30
    );

    publicAPI.handleLeftButtonPress = (callData) =>
        publicAPI.selectAction(callData);

    publicAPI.handleLeftButtonRelease = (callData) => {
        publicAPI.endSelectAction(callData);
    };

    publicAPI.handleMiddleButtonPress = (callData) =>
        publicAPI.translateAction(callData);

    publicAPI.handleMiddleButtonRelease = (callData) =>
        publicAPI.endSelectAction(callData);

    publicAPI.handleRightButtonPress = (callData) =>
        publicAPI.scaleAction(callData);

    publicAPI.handleRightButtonRelease = (callData) =>
        publicAPI.endSelectAction(callData);

    publicAPI.setCursor = (state) => {
        switch (state) {
            case InteractionState.OUTSIDE: {
                model.interactor.getView().setCursor("pointer");
                break;
            }
            default: {
                model.interactor.getView().setCursor("pointer"); // 鼠标在上方时样式不变
            }
        }
    };

    publicAPI.selectAction = (callData) => {
        const position = [callData.position.x, callData.position.y];
        model.widgetRep.computeInteractionState(position);
        if (
            model.widgetRep.getInteractionState() === InteractionState.OUTSIDE
        ) {
            return VOID;
        }
        model.widgetRep.startComplexWidgetInteraction(position);
        model.widgetState = WidgetState.ACTIVE;
        model.widgetRep.setInteractionState(InteractionState.SELECTING);
        genericAction();
        return EVENT_ABORT;
    };

    publicAPI.translateAction = (callData) => {
        const position = [callData.position.x, callData.position.y];
        model.widgetRep.computeInteractionState(position);
        if (
            model.widgetRep.getInteractionState() === InteractionState.OUTSIDE
        ) {
            return VOID;
        }
        model.widgetRep.startComplexWidgetInteraction(position);
        model.widgetState = WidgetState.ACTIVE;
        model.widgetRep.setInteractionState(InteractionState.TRANSLATING);
        genericAction();
        return EVENT_ABORT;
    };

    publicAPI.scaleAction = (callData) => {
        if (!model.allowHandleResize) {
            return VOID;
        }
        const position = [callData.position.x, callData.position.y];
        model.widgetRep.computeInteractionState(position);
        if (
            model.widgetRep.getInteractionState() === InteractionState.OUTSIDE
        ) {
            return VOID;
        }
        model.widgetRep.startComplexWidgetInteraction(position);
        model.widgetState = WidgetState.ACTIVE;
        model.widgetRep.setInteractionState(InteractionState.SCALING);
        genericAction();
        return EVENT_ABORT;
    };

    publicAPI.endSelectAction = () => {
        if (model.widgetState !== WidgetState.ACTIVE) {
            return VOID;
        }
        model.widgetState = WidgetState.START;
        model.widgetRep.highlight(0);
        publicAPI.invokeEndInteractionEvent();
        publicAPI.render();
        return EVENT_ABORT;
    };

    publicAPI.moveAction = (callData) => {
        const position = [callData.position.x, callData.position.y];

        let state = model.widgetRep.getInteractionState();

        if (model.widgetState === WidgetState.START) {
            model.widgetRep.computeInteractionState(position);
            state = model.widgetRep.getInteractionState();
            publicAPI.setCursor(state);
            if (
                model.widgetRep.getActiveRepresentation() &&
                state !== model.widgetRep.getInteractionState()
            ) {
                publicAPI.render();
            }

            return state === InteractionState.OUTSIDE ? VOID : EVENT_ABORT;
        }
        if (!publicAPI.isDragable()) {
            return VOID;
        }

        publicAPI.setCursor(state);
        model.widgetRep.complexWidgetInteraction(position);
        publicAPI.invokeInteractionEvent();
        publicAPI.render();
        return EVENT_ABORT;
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    allowHandleResize: 1,
    widgetState: WidgetState.START,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    // Inheritance
    vtkAbstractWidget.extend(publicAPI, model, initialValues);

    macro.setGet(publicAPI, model, ["allowHandleResize"]);

    // Object methods
    vtkHandleWidget(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, "vtkHandleWidget");

// ----------------------------------------------------------------------------

export default { newInstance, extend, ...Constants };
