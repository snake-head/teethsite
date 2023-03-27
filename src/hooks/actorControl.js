import { reactive } from "vue";

const colorConfig = {
    teeth: [1.0, 1.0, 1.0],
    bracket: {
        default: [0.94, 0.9, 0.55],
        hover: [0.1, 0.8, 0.1],
        active: [0.8, 0.1, 0.1],
    },
};

export { colorConfig };

export default function(allActorList) {
    let currentSelectBracket = reactive({
        actor: null, // 当前操作托槽actor
        name: "", // 当前操作托槽名
    });

    let preActorInScene = {
        upper: {
            // 上颌牙
            gingiva: false, // 牙龈+牙齿
            tooth: false, // 牙齿
            bracket: false, // 托槽
            axis: false, // 坐标轴
            arch: false,
        },
        lower: {
            // 下颌牙
            gingiva: false, // 牙龈+牙齿
            tooth: false, // 牙齿
            bracket: false, // 托槽
            axis: false, // 坐标轴
            arch: false,
        },
    }; // 整体添加删除
    
    /**
     * @description 重置除当前双击选中托槽外的其它所有actor颜色
     */
    function resetActorsColor() {
        const { actor: currentSelectBracketActor } = currentSelectBracket;
        for (let teethType of ["upper", "lower"]) {
            allActorList[teethType].bracket.forEach((item) => {
                const { actor } = item;
                if (currentSelectBracketActor !== actor) {
                    actor.getProperty().setColor(colorConfig.bracket.default);
                }
            });
            // 长轴点球体颜色重置
            allActorList[teethType].distanceLine.forEach((item) => {
                item.startPointRep.highlight(0);
                item.endPointRep.highlight(0);
            });
        }
    }

    /**
     * @description 将鼠标当前位置下的actor高亮为绿色,但如果为当前操作托槽(红色),则不作颜色调整
     * @param selections 当前鼠标下的选择
     */
    function adjustColorForHover(selections) {
        // 所有actor(除当前选中托槽(红色))颜色重置
        resetActorsColor();

        // 如果鼠标下为背景(无actor), 则直接return
        if (!selections || selections.length === 0) {
            return;
        }
        // 如果鼠标下有actor
        const { prop } = selections[0].getProperties();

        // 如果鼠标下为当前操作托槽(红色), 则直接return
        if (currentSelectBracket.actor === prop) {
            return;
        }

        for (let teethType of ["upper", "lower"]) {
            // 如果鼠标下不是当前操作托槽, 则找到对应托槽actor并高亮
            // 遍历托槽actor找对应, 如果无对应则说明鼠标下是牙龈或者单牙齿actor, 则没有变更
            allActorList[teethType].bracket.forEach((item) => {
                const { actor } = item;
                if (actor === prop) {
                    prop.getProperty().setColor(colorConfig.bracket.hover);
                }
            });
            // 如果是长轴点球体也要变更
            allActorList[teethType].distanceLine.forEach((item) => {
                const { startPointRep, endPointRep } = item;
                if (startPointRep.getActor() === prop) {
                    startPointRep.highlight(1);
                }
                if (endPointRep.getActor() === prop) {
                    endPointRep.highlight(1);
                }
            });
        }
    }

    /**
     * @description 直接在右侧列表上点击, 选中托槽
     * @param bracketName 托槽名称
     */
    function updateClickOnListSelectedActor(bracketName) {
        updateSelectActorBySpecProps(bracketName, "name");
    }

    /**
     * @description 读取鼠标双击位置下的actor, 如果为空、牙龈、牙齿则重置颜色,
     * currentSelectBracket置为空, 如果为托槽, 则更新currentSelectBracket,
     * 将其高亮为红色
     * @param selections 当前鼠标双击下的选择
     */
    function updateDbClickSelectedActor(selections) {
        // 如果鼠标下为背景(无actor), 则将当前选中托槽置空并重置颜色
        if (!selections || selections.length === 0) {
            exitSelection();
            return;
        }
        // 如果鼠标下有actor
        const { prop } = selections[0].getProperties();
        updateSelectActorBySpecProps(prop, "actor");
    }

    /**
     * @description 根据selection寻找是否在allActorList中有对应托槽(属性名actor或者name对上就认为能找到)
     * 找到之后点亮对应托槽, 未找到置空选中托槽
     * @param selection 选中的actor或者name
     * @param propKey 需要对比的属性 name | actor
     */
    function updateSelectActorBySpecProps(selection, propKey) {
        // 如果鼠标下为当前操作托槽, 则不予变更
        if (currentSelectBracket[propKey] === selection) {
            return;
        }
        let findMatch = false;
        // 遍历托槽actor找对应, 如果无对应则说明鼠标双击下是牙龈或者单牙齿actor, 此时更新为null
        for (let teethType of ["upper", "lower"]) {
            allActorList[teethType].bracket.forEach((item) => {
                if (item[propKey] === selection) {
                    // 更新 currentSelectBracket
                    currentSelectBracket.actor = item.actor;
                    currentSelectBracket.name = item.name;
                    // 重置颜色
                    resetActorsColor();
                    item.actor
                        .getProperty()
                        .setColor(colorConfig.bracket.active);
                    // 选择新托槽
                    findMatch = true;
                }
            });
        }
        // 如果上述未找到托槽, 则当前选中置空并重置颜色
        if (!findMatch) {
            exitSelection();
        }
    }

    /**
     * @description 退出选择, 重置所有颜色及选中托槽
     */
    function exitSelection() {
        currentSelectBracket.actor = null;
        currentSelectBracket.name = "";
        resetActorsColor();
    }

    /**
     * @description 专门用于当前选中托槽切换时调用, 跟随切换坐标轴actors和distanceLineActor
     * 注：坐标轴显示必须为开启状态,否则屏幕中没有坐标轴actor
     * @param preSelectBracketName 之前选中托槽名称
     * @param currentSelectBracketName 当前选中托槽名称
     * @param isAxisShow 坐标轴 显示/隐藏
     */
    function axisActorShowStateUpdate(
        preSelectBracketName,
        currentSelectBracketName,
        isAxisShow
    ) {
        const addActorsList = []; // 根据状态对比(false->true),生成应该加入屏幕的actor列表
        const delActorsList = []; // 根据状态对比(true->false),生成应该移出屏幕的actor列表
        // 如果当前有选中托槽(此时必定有对应的上/下颌牙显示)则需要添加
        if (currentSelectBracketName !== "") {
            // 坐标轴actor
            if (isAxisShow) {
                // 坐标轴隐藏状态下, 此时不会有坐标轴actor在屏幕中, 不会有坐标轴actor变更
                findAxisMatchActors(currentSelectBracketName).forEach(
                    (actor) => {
                        addActorsList.push(actor);
                    }
                );
            }
            // 距离计算线actor
            const {
                actors: distActors,
                widgets: distWidgets,
            } = findDistanceLineMatchActors(currentSelectBracketName);
            distActors.forEach((actor) => {
                addActorsList.push(actor);
            });
            // 长轴点显示
            distWidgets.forEach((widget) => {
                widget.setEnabled(1);
            });
        }

        // 如果之前有选中托槽则可能需要移除(如果上颌牙隐藏,之前选中上颌牙托槽, 则没有actor需要移除)
        if (preSelectBracketName !== "") {
            // gingiva和tooth有一个为true说明此时对应颌牙显示, 否则隐藏, 此时没有需要移除的actor
            if (preSelectBracketName.startsWith("U")) {
                const { gingiva, tooth } = preActorInScene.upper;
                if ((gingiva || tooth) && isAxisShow) {
                    findAxisMatchActors(preSelectBracketName).forEach(
                        (actor) => {
                            delActorsList.push(actor);
                        }
                    );
                }
            } else {
                const { gingiva, tooth } = preActorInScene.lower;
                if ((gingiva || tooth) && isAxisShow) {
                    findAxisMatchActors(preSelectBracketName).forEach(
                        (actor) => {
                            delActorsList.push(actor);
                        }
                    );
                }
            }
            // 距离计算线actor
            const {
                actors: distActors,
                widgets: distWidgets,
            } = findDistanceLineMatchActors(preSelectBracketName);
            distActors.forEach((actor) => {
                // 如果存在actor需要移除, 其中包括textActor, 则需要清理canvas
                delActorsList.push(actor);
            });
            // 长轴点隐藏
            distWidgets.forEach((widget) => {
                widget.setEnabled(0);
            });
        }
        return { addActorsList, delActorsList };
    }
    function findAxisMatchActors(toothName, teethType) {
        if (teethType) {
            let teethTypeMatch = allActorList[teethType].toothAxis.filter(
                (item) => item.name === toothName
            );
            if (teethTypeMatch.length > 0) {
                return teethTypeMatch[0].actors;
            }
        } else {
            for (let teethType of ["upper", "lower"]) {
                let itemMatch = allActorList[teethType].toothAxis.filter(
                    (item) => item.name === toothName
                );
                if (itemMatch.length > 0) {
                    return itemMatch[0].actors;
                }
            }
        }

        return [];
    }
    function findDistanceLineMatchActors(toothName) {
        for (let teethType of ["upper", "lower"]) {
            let itemMatch = allActorList[teethType].distanceLine.filter(
                (item) => item.name === toothName
            );
            if (itemMatch.length > 0) {
                return {
                    actors: [
                        itemMatch[0].lineActorItem.lineActor,
                        itemMatch[0].lineActorItem.textActor,
                    ],
                    widgets: [
                        itemMatch[0].startPointWidget,
                        itemMatch[0].endPointWidget,
                    ],
                };
            }
        }
        return { actors: [], widgets: [] };
    }

    /**
     * @param state -
     upper: false, // 全上颌牙显示/隐藏
     lower: false, // 全下颌牙显示/隐藏
     bracket: false, // 托槽显示/隐藏
     gingiva: false, // 牙龈显示/隐藏
     axis: false, // 坐标轴显示/隐藏
     * @param isInSimulationMode 是否在[模拟排牙]模式下, 如果开启则对牙弓线操作显示/隐藏, 否则不操作牙弓线
     * @description 设置actor的状态, 根据state参数更新actor是否应该在屏幕中, 应用时机为页面上按钮切换
     * 在模拟排牙和普通模式下均调用该函数
     * state:
     * upper- 控制全部上颌牙actor
     * lower- 控制全部下颌牙actor
     * teethWithGingiva- 0-牙龈+牙齿 1-牙齿  2-牙龈 ---> 根据医生要求更改为 0-1切换
     * axis- 坐标轴
     * arch- 0-托槽+牙弓线 1-牙弓线 2-托槽 3-none
     */
    function actorShowStateUpdateFusion(state, isInSimulationMode) {
        let { upper, lower, teethWithGingiva, axis, arch } = state;

        let curActorInScene = {
            upper: {
                // 上颌牙
                gingiva: upper && teethWithGingiva !== 1, // 牙龈
                tooth: upper && teethWithGingiva !== 2, // 牙齿
                bracket: upper && arch % 2 === 0, // 托槽
                axis: upper && axis,
                arch: upper && arch <= 1, // 牙弓线
            },
            lower: {
                // 下颌牙
                gingiva: lower && teethWithGingiva !== 1, // 牙龈
                tooth: lower && teethWithGingiva !== 2, // 牙齿
                bracket: lower && arch % 2 === 0, // 托槽
                axis: lower && axis, // 坐标轴
                arch: lower && arch <= 1, // 牙弓线
            },
        };

        const addActorsList = []; // 根据状态对比(false->true),生成应该加入屏幕的actor列表
        const delActorsList = []; // 根据状态对比(true->false),生成应该移出屏幕的actor列表

        for (let teethType of ["upper", "lower"]) {
            if (!isInSimulationMode) {
                // 排牙模式下禁用牙龈显示/隐藏(统一为隐藏)
                if (
                    curActorInScene[teethType].gingiva &&
                    !preActorInScene[teethType].gingiva
                ) {
                    addActorsList.push(
                        allActorList[teethType].teethWithGingiva.actor
                    );
                }
                if (
                    !curActorInScene[teethType].gingiva &&
                    preActorInScene[teethType].gingiva
                ) {
                    delActorsList.push(
                        allActorList[teethType].teethWithGingiva.actor
                    );
                }
            }
            if (
                curActorInScene[teethType].tooth &&
                !preActorInScene[teethType].tooth
            ) {
                allActorList[teethType].tooth.forEach((item) => {
                    addActorsList.push(item.actor);
                });
            }
            if (
                !curActorInScene[teethType].tooth &&
                preActorInScene[teethType].tooth
            ) {
                allActorList[teethType].tooth.forEach((item) => {
                    delActorsList.push(item.actor);
                });
            }

            if (
                curActorInScene[teethType].bracket &&
                !preActorInScene[teethType].bracket
            ) {
                allActorList[teethType].bracket.forEach((item) => {
                    addActorsList.push(item.actor);
                });
            }
            if (
                !curActorInScene[teethType].bracket &&
                preActorInScene[teethType].bracket
            ) {
                allActorList[teethType].bracket.forEach((item) => {
                    delActorsList.push(item.actor);
                });
            }

            if (
                curActorInScene[teethType].axis &&
                !preActorInScene[teethType].axis
            ) {
                if (currentSelectBracket.name !== "") {
                    // 开启上/下颌牙坐标轴显示,则需要看当前是否有上/下颌牙托槽被选中,只有此时才应该有对应坐标轴actor加入窗口
                    findAxisMatchActors(
                        currentSelectBracket.name,
                        teethType
                    ).forEach((actor) => {
                        addActorsList.push(actor);
                    });
                }
            }
            if (
                !curActorInScene[teethType].axis &&
                preActorInScene[teethType].axis
            ) {
                if (currentSelectBracket.name !== "") {
                    // 隐藏上/下颌牙坐标轴显示,则需要看当前是否有上/下颌牙托槽被选中,只有此时才有坐标轴actor在屏幕中, 才需要移除
                    findAxisMatchActors(
                        currentSelectBracket.name,
                        teethType
                    ).forEach((actor) => {
                        delActorsList.push(actor);
                    });
                }
            }

            // [模拟排牙]模式下控制牙弓线
            if (isInSimulationMode) {
                if (
                    curActorInScene[teethType].arch &&
                    !preActorInScene[teethType].arch
                ) {
                    addActorsList.push(allActorList[teethType].arch.actor);
                }
                if (
                    !curActorInScene[teethType].arch &&
                    preActorInScene[teethType].arch
                ) {
                    delActorsList.push(allActorList[teethType].arch.actor);
                }
            }
        }

        // 更新pre状态为cur状态
        preActorInScene = curActorInScene;

        // 返回
        return { addActorsList, delActorsList };
    }

    /**
     * @description 进入(退出)细调模式时调用, 根据当前state决定牙弓线是否要加入(移除), 牙龈是否移除(加入)
     */
    function adjustActorWhenSwitchSimulationMode(switchType = "enter", state) {
        const addActorsList = [];
        const delActorsList = [];
        // 读取当前state牙龈、牙弓线状态
        let { upper, lower, teethWithGingiva, arch } = state;
        let curActorInScene = {
            upper: {
                // 上颌牙
                gingiva: upper && teethWithGingiva !== 1, // 牙龈
                tooth: upper && teethWithGingiva !== 2, // 牙齿
                arch: upper && arch <= 1,
            },
            lower: {
                // 下颌牙
                gingiva: upper && teethWithGingiva !== 1, // 牙龈
                tooth: upper && teethWithGingiva !== 2, // 牙齿
                arch: lower && arch <= 1,
            },
        };
        for (let teethType of ["upper", "lower"]) {
            // 不论牙龈是否在屏幕中, 都为其设置透明度(除非没有上颌牙或下颌牙)
            if (allActorList[teethType].teethWithGingiva.actor) {
                // 如果进入模拟排牙, 并且pre状态为true(牙龈在屏幕中),则移除
                // 如果退出模拟排牙, 并且pre状态为true(牙龈本来在屏幕中),则添加
                // 在模拟排牙模式下, 禁用显示隐藏牙龈的按钮
                if (
                    switchType === "enter" &&
                    preActorInScene[teethType].gingiva
                ) {
                    delActorsList.push(
                        allActorList[teethType].teethWithGingiva.actor
                    );
                }
                if (
                    switchType === "exit" &&
                    preActorInScene[teethType].gingiva
                ) {
                    addActorsList.push(
                        allActorList[teethType].teethWithGingiva.actor
                    );
                }
            }
            if (curActorInScene[teethType].arch) {
                // 进入[模拟排牙]时 如果当前牙弓线需要显示而不在屏幕中则添加
                // 退出[模拟排牙]时 如果当前牙弓线在屏幕中则移除
                (switchType === "enter" ? addActorsList : delActorsList).push(
                    allActorList[teethType].arch.actor
                );
            }
        }
        return { addActorsList, delActorsList };
    }

    function adjustActorOpacity(actorType, opacity) {
        for (let teethType of ["upper", "lower"]) {
            switch (actorType) {
                case "gingiva": {
                    // 不论牙龈是否在屏幕中, 都为其设置透明度(除非没有上颌牙或下颌牙)
                    if (allActorList[teethType].teethWithGingiva.actor) {
                        allActorList[teethType].teethWithGingiva.actor
                            .getProperty()
                            .setOpacity(opacity);
                    }
                    break;
                }
                case "tooth": {
                    allActorList[teethType].tooth.forEach((item) => {
                        item.actor.getProperty().setOpacity(opacity);
                    });
                    break;
                }
                case "bracket": {
                    allActorList[teethType].bracket.forEach((item) => {
                        item.actor.getProperty().setOpacity(opacity);
                    });
                    break;
                }
                case "arch": {
                    if (allActorList[teethType].arch.actor) {
                        allActorList[teethType].arch.actor
                            .getProperty()
                            .setOpacity(opacity);
                    }
                    break;
                }
            }
        }
    }

    return {
        allActorList,
        currentSelectBracket,
        adjustColorForHover,
        updateClickOnListSelectedActor,
        updateDbClickSelectedActor,
        exitSelection,
        actorShowStateUpdateFusion,
        axisActorShowStateUpdate,
        adjustActorWhenSwitchSimulationMode,
    };
}
