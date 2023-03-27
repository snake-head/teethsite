import macro from "@kitware/vtk.js/macro";
import vtkAbstractWidget from "@kitware/vtk.js/Interaction/Widgets/AbstractWidget";
import vtkSphereLinkHandleRepresentation from "./SphereLinkHandleRepresentation";
import vtkHandleRepresentation from "@kitware/vtk.js/Interaction/Widgets/HandleRepresentation";
import Constants from "@kitware/vtk.js/Interaction/Widgets/HandleWidget/Constants";

const { VOID, EVENT_ABORT } = macro;
const { InteractionState } = vtkHandleRepresentation;
const { WidgetState } = Constants;

const { throttle } = macro;

// ----------------------------------------------------------------------------
// vtkHandleWidget methods
// ----------------------------------------------------------------------------
// 防抖/防止过于敏感, 等冷静之后再执行: 某个函数如果要执行, 那么在执行前会有一定冷却时间
// 冷却时间内再次操作, 那就重置冷却时间
// 比如电脑黑屏, 冷却30分钟, 如果用户30分钟内动了鼠标, 那重新计算30分钟
// 如果immediate参数为true, 则在前沿调用(第一次调用时立即执行)
// 如果immediate参数为false, 则在后沿调用(第一次调用时就开始等用户冷静下来之后再执行)
// 改进防抖, 可以设置前沿触发
function debounce(callback, wait, immediate = false) {
    let timeout; // 定时器标志, 用于清除定时器重开
    let argsToUse = null;
    function next() {
        // 清理定时器
        timeout = null;
        if (!immediate) {
            // 调用函数
            callback(...argsToUse);
        }
    }
    function wrapper(...args) {
        // 以最新参数为准
        argsToUse = args;
        // 如果设置成前沿触发, 那我们直接判断一下当前是否冷静(开了定时器), 冷静的话直接调用函数
        if (immediate && !timeout) {
            // 调用函数
            callback(...argsToUse);
        }
        // 清理定时器
        if (timeout) {
            clearTimeout(timeout);
        }
        // 新开/重开定时器(如果前沿触发, 此时next中不会调用回调函数, 只是清空定时器)
        timeout = setTimeout(next, wait);
    }
    // 在函数身上挂载cancel方法, 外部可以控制, 只要一cancel,
    // 定时器被清理, 函数触发被取消
    wrapper.cancel = () => clearTimeout(timeout);

    return wrapper;
}
function vtkHandleWidget(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkHandleWidget");

    // Overridden method
    publicAPI.createDefaultRepresentation = () => {
        if (!model.widgetRep) {
            model.widgetRep = vtkSphereLinkHandleRepresentation.newInstance({
                modifyLinkRatio: model.modifyLinkRatio,
            });
        }
    };

    publicAPI.handleMouseMove = throttle(
        (callData) => publicAPI.moveAction(callData),
        30
    );

    publicAPI.moveAction = (callData) => {
        // 鼠标移动事件
        const position = [callData.position.x, callData.position.y];
        // 读取当前representation状态
        let state = model.widgetRep.getInteractionState();
        if (model.widgetState === WidgetState.START) {
            // 如果当前状态为 START, 则不断更新representation状态
            model.widgetRep.computeInteractionState(position);
            let newState = model.widgetRep.getInteractionState(); // 移到上面切换为2, 在外面切换为0
            // 发现状态切换(选中-未选中, 此时颜色大小切换, 渲染窗口)
            if (state !== newState) {
                switch (newState) {
                    case InteractionState.OUTSIDE:
                        model.widgetRep.highlight(0);
                        break;
                    case InteractionState.SELECTING:
                        model.widgetRep.highlight(1);
                        break;
                    default:
                        break;
                }
                publicAPI.render();
            }
            return newState === InteractionState.OUTSIDE ? VOID : EVENT_ABORT;
        } else if (model.widgetState === WidgetState.ACTIVE && publicAPI.isDragable()) {
            // 如果当前状态为ACTIVE, 则鼠标移动可以开始交互, 此时不更新representation状态
            // 万一鼠标移到representation外依旧继续进入此处
            model.widgetRep.dragLengthInteraction(position);
            model.onAfterModifyLengthChange(model.widgetRep.getCenters());
            publicAPI.invokeInteractionEvent();
            publicAPI.render();
        }
        return EVENT_ABORT;
    };
    publicAPI.handleLeftButtonPress = (callData) => {
        // 如果鼠标左键按下时, 鼠标未落在目标上, 则不进行操作
        if (
            model.widgetRep.getInteractionState() === InteractionState.OUTSIDE
        ) {
            return VOID;
        }
        // 如果鼠标左键按下时, 鼠标落在目标上, 则可以开始改变目标的长度
        model.widgetRep.recordStartInteractionPosition([
            callData.position.x,
            callData.position.y,
        ]); // 记录初始位置
        // 切换 model.widgetState 为 [ACTIVE]
        model.widgetState = WidgetState.ACTIVE;
        // model.widgetRep.setInteractionState(InteractionState.SELECTING);
        // 开启高亮效果
        model.widgetRep.highlight(1);
        publicAPI.invokeStartInteractionEvent();
        // 渲染窗口
        publicAPI.render();
        return EVENT_ABORT;
    };
    model.onAfterModifyLengthChange = throttle(model.afterModifyLinkLength, 50);

    publicAPI.handleLeftButtonRelease = () => {
        if (model.widgetState !== WidgetState.ACTIVE) {
            return VOID;
        }
        // 鼠标左键释放, 如果model.widgetState为ACTIVE, 则重置为[START]
        model.widgetState = WidgetState.START;
        // 取消高亮效果
        model.widgetRep.highlight(0);
        publicAPI.invokeEndInteractionEvent();
        // 渲染窗口
        publicAPI.render();
        return EVENT_ABORT;
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    modifyLinkRatio: [0.3, 3.3],
    allowHandleResize: 1,
    widgetState: WidgetState.START,
    afterModifyLinkLength: () => {}, // 外部传入, 在改变长度后调用的回调, 用于触发重新计算牙弓线
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
